import re
from datetime import timedelta
from fastapi import APIRouter, Request, Response, HTTPException, Depends
from pydantic import BaseModel
from core import db, make_token, read_token, set_cookie, issue_csrf, verify_secret, get_user, now, iso, audit

router = APIRouter(prefix="/api/auth")

MAX_FAILS = 5
LOCK_MIN = 15


class LoginIn(BaseModel):
    username: str
    pin: str


def _set_session(response: Response, user):
    set_cookie(response, "access_token", make_token({"sub": user["id"], "type": "access", "tid": user.get("tenant_id")}, 60), 3600)
    set_cookie(response, "refresh_token", make_token({"sub": user["id"], "type": "refresh"}, 60 * 24 * 7), 604800)
    issue_csrf(response)


async def public_user(u):
    t = None
    if u.get("tenant_id"):
        t = await db.tenants.find_one({"id": u["tenant_id"]}, {"_id": 0, "id": 1, "name": 1})
    return {k: u.get(k) for k in ("id", "username", "name", "role", "tenant_id", "email")} | {"tenant": t}


@router.post("/login")
async def login(body: LoginIn, request: Request, response: Response):
    username = body.username.strip().lower()
    if not re.fullmatch(r"\d{6}", body.pin):
        raise HTTPException(400, "رمز PIN يجب أن يكون 6 أرقام")
    ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "").split(",")[0].strip()
    ident = f"{ip}:{username}"
    att = await db.login_attempts.find_one({"identifier": ident})
    if att and att.get("locked_until") and att["locked_until"] > iso():
        raise HTTPException(429, "تم قفل الحساب مؤقتاً بسبب محاولات خاطئة. حاول بعد 15 دقيقة")
    user = await db.users.find_one({"username": username, "active": True}, {"_id": 0})
    if not user or not verify_secret(body.pin, user["pin_hash"]):
        fails = (att or {}).get("count", 0) + 1
        upd = {"count": fails}
        if fails >= MAX_FAILS:
            upd = {"count": 0, "locked_until": iso(now() + timedelta(minutes=LOCK_MIN))}
        await db.login_attempts.update_one({"identifier": ident}, {"$set": upd}, upsert=True)
        raise HTTPException(401, "اسم المستخدم أو رمز PIN غير صحيح")
    await db.login_attempts.delete_one({"identifier": ident})
    _set_session(response, user)
    await audit(user.get("tenant_id"), {"type": "user", "id": user["id"], "name": user["name"], "role": user["role"]}, "login")
    return await public_user(user)


@router.post("/refresh")
async def refresh(request: Request, response: Response):
    tok = request.cookies.get("refresh_token")
    if not tok:
        raise HTTPException(401, "لا توجد جلسة")
    p = read_token(tok)
    if p.get("type") != "refresh":
        raise HTTPException(401, "رمز غير صالح")
    user = await db.users.find_one({"id": p["sub"], "active": True}, {"_id": 0})
    if not user:
        raise HTTPException(401, "الحساب غير موجود")
    _set_session(response, user)
    return {"ok": True}


@router.post("/logout")
async def logout(response: Response):
    for k in ("access_token", "refresh_token", "csrf_token"):
        response.delete_cookie(k, path="/", secure=True, samesite="none")
    return {"ok": True}


@router.get("/me")
async def me(response: Response, request: Request, u=Depends(get_user)):
    if not request.cookies.get("csrf_token"):
        issue_csrf(response)
    return await public_user(u)
