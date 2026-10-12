import secrets
from datetime import timedelta
from fastapi import APIRouter, HTTPException, Request, Response, UploadFile, File, Form, Depends
from pydantic import BaseModel, Field
from core import (db, Scoped, sha256, hash_secret, verify_secret, make_token, read_token, set_cookie, issue_csrf,
                  check_csrf, now, iso, audit, idempotent, save_idempotent)
from attachments import store_upload, clean_att, signed_url
import mailer

router = APIRouter(prefix="/api/public")
SESSION_MIN = 30


class OtpIn(BaseModel):
    code: str = Field(pattern=r"^\d{6}$")


class DelegateIn(BaseModel):
    email: str = Field(min_length=5, max_length=200)
    name: str = ""


def mask(email):
    user, _, dom = email.partition("@")
    return (user[:2] + "•" * max(len(user) - 2, 1)) + "@" + dom


async def link_by_token(token: str):
    link = await db.public_links.find_one({"token_hash": sha256(token.encode()), "active": True}, {"_id": 0})
    if not link:
        raise HTTPException(404, "الرابط غير صالح أو منتهي")
    return link


async def public_session(request: Request):
    tok = request.cookies.get("pub_session")
    if not tok:
        raise HTTPException(401, "يلزم التحقق برمز OTP")
    p = read_token(tok)
    if p.get("type") != "public":
        raise HTTPException(401, "جلسة غير صالحة")
    check_csrf(request)
    link = await db.public_links.find_one({"id": p["link"], "tenant_id": p["tid"], "active": True}, {"_id": 0})
    if not link:
        raise HTTPException(401, "انتهت صلاحية الرابط")
    return link


def actor(link):
    return {"type": link["role"], "id": link["id"], "name": link.get("name") or link["email"], "role": link["role"]}


@router.get("/links/{token}")
async def link_meta(token: str):
    link = await link_by_token(token)
    tenant = await db.tenants.find_one({"id": link["tenant_id"]}, {"_id": 0, "name": 1})
    tx = await db.transactions.find_one({"tenant_id": link["tenant_id"], "id": link["transaction_id"]}, {"_id": 0, "doc_type": 1, "number": 1})
    return {"factory": tenant["name"], "doc_type": tx["doc_type"], "number": tx["number"], "role": link["role"], "email_masked": mask(link["email"])}


@router.post("/links/{token}/otp")
async def request_otp(token: str):
    link = await link_by_token(token)
    since = iso(now() - timedelta(hours=1))
    if await db.otps.count_documents({"link_id": link["id"], "created_at": {"$gt": since}}) >= 5:
        raise HTTPException(429, "تم تجاوز عدد طلبات الرمز. حاول بعد ساعة")
    code = f"{secrets.randbelow(1_000_000):06d}"
    tenant = await db.tenants.find_one({"id": link["tenant_id"]}, {"_id": 0, "name": 1})
    tx = await db.transactions.find_one({"tenant_id": link["tenant_id"], "id": link["transaction_id"]}, {"_id": 0, "number": 1})
    res = await db.otps.insert_one({"link_id": link["id"], "code_hash": hash_secret(code), "attempts": 0, "used": False,
                                    "expires_at": iso(now() + timedelta(minutes=10)), "created_at": iso()})
    try:
        await mailer.send_otp(link["email"], tenant["name"], tx["number"], code)
    except HTTPException:
        await db.otps.update_one({"_id": res.inserted_id}, {"$set": {"used": True}})
        raise
    return {"sent_to": mask(link["email"]), "channel": "email"}


@router.post("/links/{token}/verify")
async def verify_otp(token: str, body: OtpIn, response: Response):
    link = await link_by_token(token)
    otp = await db.otps.find_one({"link_id": link["id"], "used": False, "expires_at": {"$gt": iso()}}, sort=[("created_at", -1)])
    if not otp:
        raise HTTPException(400, "الرمز منتهي. اطلب رمزاً جديداً")
    if otp["attempts"] >= 5:
        raise HTTPException(429, "محاولات كثيرة. اطلب رمزاً جديداً")
    if not verify_secret(body.code, otp["code_hash"]):
        await db.otps.update_one({"_id": otp["_id"]}, {"$inc": {"attempts": 1}})
        raise HTTPException(400, "الرمز غير صحيح")
    await db.otps.update_one({"_id": otp["_id"]}, {"$set": {"used": True}})
    set_cookie(response, "pub_session", make_token({"type": "public", "link": link["id"], "tid": link["tenant_id"]}, SESSION_MIN), SESSION_MIN * 60)
    issue_csrf(response)
    await audit(link["tenant_id"], actor(link), "public_session_opened", link["transaction_id"])
    return {"ok": True, "expires_in": SESSION_MIN * 60}


@router.get("/session")
async def session_view(link=Depends(public_session)):
    s = Scoped(link["tenant_id"])
    tx = await s.must("transactions", {"id": link["transaction_id"]})
    tenant = await db.tenants.find_one({"id": s.tid}, {"_id": 0, "name": 1, "iban": 1, "bank_name": 1, "vat_number": 1, "cr_number": 1, "address": 1, "account_name": 1})
    atts = await s.find("attachments", {"transaction_id": tx["id"]}, sort=("created_at", -1))
    keep = ("id", "number", "doc_type", "customer", "items", "subtotal", "vat", "total", "confirmed", "remaining", "credit",
            "payment_status", "has_pending", "is_advance", "issued_at", "due_date", "notes", "quote_number")
    return {"role": link["role"], "transaction": {k: tx.get(k) for k in keep}, "factory": tenant,
            "attachments": [{k: a[k] for k in ("id", "filename", "status", "created_at", "mime")} | {"url": signed_url(a), "uploader": a["uploader"]["type"]} for a in atts]}


@router.post("/session/upload")
async def session_upload(request: Request, file: UploadFile = File(...), note: str = Form(""), link=Depends(public_session)):
    s = Scoped(link["tenant_id"])
    key, prev = await idempotent(request, s.tid, f"pub_upload:{link['id']}")
    if prev:
        return prev
    tx = await s.must("transactions", {"id": link["transaction_id"]})
    res = await store_upload(s, tx, file, actor(link), note)
    res = {k: res[k] for k in ("id", "filename", "status", "created_at")}
    await save_idempotent(s.tid, f"pub_upload:{link['id']}", key, res)
    return res


@router.post("/session/delegate")
async def delegate(body: DelegateIn, request: Request, link=Depends(public_session)):
    if link["role"] != "customer":
        raise HTTPException(403, "التفويض متاح للعميل فقط")
    s = Scoped(link["tenant_id"])
    email = body.email.lower().strip()
    if "@" not in email or email == link["email"]:
        raise HTTPException(400, "بريد المحاسب غير صالح")
    if await s.count("public_links", {"transaction_id": link["transaction_id"], "role": "accountant"}) >= 5:
        raise HTTPException(429, "الحد الأقصى 5 محاسبين لكل معاملة")
    tx = await s.must("transactions", {"id": link["transaction_id"]})
    tenant = await db.tenants.find_one({"id": s.tid}, {"_id": 0, "name": 1})
    token = secrets.token_urlsafe(32)
    await mailer.send_delegation(email, tenant["name"], tx, token, tx["customer"]["name"])
    await s.insert("public_links", {"transaction_id": link["transaction_id"], "token": token, "token_hash": sha256(token.encode()),
                                     "role": "accountant", "email": email, "name": body.name, "active": True,
                                     "delegated_by": link["id"]})
    await audit(s.tid, actor(link), "accountant_delegated", link["transaction_id"], {"email": body.email})
    return {"sent_to": mask(email)}


@router.post("/session/logout")
async def public_logout(response: Response):
    response.delete_cookie("pub_session", path="/", secure=True, samesite="none")
    return {"ok": True}
