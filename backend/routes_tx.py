import secrets
import asyncio
import json
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, Form
from fastapi.responses import StreamingResponse, Response
from pydantic import BaseModel, Field
from datetime import timedelta
from core import (db, Scoped, roles, get_user, actor_of, compute_totals, audit, iso, now, sha256, notify,
                  subscribe, unsubscribe, idempotent, save_idempotent)
from ledger import recompute
from attachments import store_upload, clean_att, signed_url, verify_file_sig, read_file
from urllib.parse import quote as urlquote
import daftra
import mailer

router = APIRouter(prefix="/api")
STAFF = ("employee", "supervisor", "manager")


class Item(BaseModel):
    description: str = Field(min_length=1, max_length=300)
    qty: int = Field(gt=0, le=1_000_000)
    unit_price: int = Field(ge=0, le=10_000_000_000)


class Customer(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    email: str = Field(min_length=3, max_length=200)
    phone: str = ""
    vat_number: str = ""


class TxIn(BaseModel):
    doc_type: str = Field(pattern="^(quote|invoice)$")
    customer: Customer
    items: List[Item] = Field(min_length=1, max_length=100)
    notes: str = ""
    due_date: str = ""


class TxEdit(BaseModel):
    items: List[Item] = Field(min_length=1, max_length=100)
    notes: str = ""
    expected_version: int
    reason: str = Field(min_length=2, max_length=300)


async def next_number(tid, doc_type):
    year = iso()[:4]
    c = await db.counters.find_one_and_update({"tenant_id": tid, "kind": f"{doc_type}:{year}"}, {"$inc": {"n": 1}}, upsert=True, return_document=True)
    prefix = "Q" if doc_type == "quote" else "INV"
    return f"{prefix}-{year}-{c['n']:04d}"


async def tx_view(s: Scoped, tx):
    link = await s.get("public_links", {"transaction_id": tx["id"], "role": "customer"})
    out = {k: v for k, v in tx.items() if k != "tenant_id"}
    out["public_token"] = link["token"] if link else None
    return out


@router.get("/transactions")
async def list_tx(status: Optional[str] = None, q: Optional[str] = None, u=Depends(roles(*STAFF))):
    s = Scoped(u["tenant_id"])
    query = {}
    if u["role"] == "employee":
        query["created_by.id"] = u["id"]
    if status:
        query["payment_status"] = status
    if q:
        query["$or"] = [{"number": {"$regex": q, "$options": "i"}}, {"customer.name": {"$regex": q, "$options": "i"}}]
    items = await s.find("transactions", query, sort=("created_at", -1))
    allq = {"created_by.id": u["id"]} if u["role"] == "employee" else {}
    counts = {}
    for t in await s.find("transactions", allq, limit=5000):
        counts[t["payment_status"]] = counts.get(t["payment_status"], 0) + 1
    return {"items": [{k: v for k, v in t.items() if k not in ("tenant_id", "items")} for t in items], "counts": counts}


@router.post("/transactions")
async def create_tx(body: TxIn, u=Depends(roles(*STAFF))):
    s = Scoped(u["tenant_id"])
    items = [i.model_dump() for i in body.items]
    sub, vat, total = compute_totals(items)
    number = await next_number(s.tid, body.doc_type)
    tx = await s.insert("transactions", {
        "number": number, "doc_type": body.doc_type, "customer": body.customer.model_dump(), "items": items,
        "notes": body.notes, "due_date": body.due_date, "subtotal": sub, "vat": vat, "total": total,
        "confirmed": 0, "remaining": total, "credit": 0, "payment_status": "issued", "has_pending": False,
        "is_advance": False, "version": 1, "needs_rereview": False, "daftra_status": "not_synced", "email_status": "sending",
        "created_by": actor_of(u), "issued_at": iso(),
    })
    token = secrets.token_urlsafe(32)
    await s.insert("public_links", {"transaction_id": tx["id"], "token": token, "token_hash": sha256(token.encode()),
                                     "role": "customer", "email": body.customer.email.lower(), "active": True})
    await audit(s.tid, actor_of(u), "transaction_issued", tx["id"], {"number": number, "total": total})
    tenant = await db.tenants.find_one({"id": s.tid}, {"_id": 0, "name": 1})
    asyncio.create_task(mailer.track_tx_link(s.tid, tx, token, tenant["name"]))
    return await tx_view(s, tx)


@router.post("/transactions/{tx_id}/send-link")
async def resend_link(tx_id: str, u=Depends(roles(*STAFF))):
    s = Scoped(u["tenant_id"])
    tx = await s.must("transactions", {"id": tx_id})
    if u["role"] == "employee" and tx["created_by"]["id"] != u["id"]:
        raise HTTPException(404, "غير موجود")
    if tx.get("email_sent_at", "") > iso(now() - timedelta(minutes=1)):
        raise HTTPException(429, "انتظر دقيقة قبل إعادة الإرسال")
    link = await s.must("public_links", {"transaction_id": tx_id, "role": "customer"})
    tenant = await db.tenants.find_one({"id": s.tid}, {"_id": 0, "name": 1})
    await s.update("transactions", {"id": tx_id}, {"$set": {"email_sent_at": iso(), "email_status": "sending"}})
    await mailer.track_tx_link(s.tid, tx, link["token"], tenant["name"])
    await audit(s.tid, actor_of(u), "customer_link_emailed", tx_id)
    return await tx_view(s, await s.must("transactions", {"id": tx_id}))


@router.get("/transactions/{tx_id}")
async def get_tx(tx_id: str, u=Depends(roles(*STAFF))):
    s = Scoped(u["tenant_id"])
    tx = await s.must("transactions", {"id": tx_id})
    if u["role"] == "employee" and tx["created_by"]["id"] != u["id"]:
        raise HTTPException(404, "غير موجود")
    atts = [clean_att(a) for a in await s.find("attachments", {"transaction_id": tx_id}, sort=("created_at", -1))]
    allocs = await s.find("allocations", {"transaction_id": tx_id}, sort=("created_at", 1))
    reviews = await s.find("reviews", {"transaction_id": tx_id}, sort=("created_at", -1))
    versions = await s.find("tx_versions", {"transaction_id": tx_id}, sort=("version", -1))
    jobs = await s.find("jobs", {"transaction_id": tx_id}, sort=("created_at", -1))
    maps = await s.find("daftra_mappings", {"local_id": {"$in": [tx_id] + [a["id"] for a in allocs] + [a.get("reversal_of") or "" for a in allocs]}})
    delegations = await s.find("public_links", {"transaction_id": tx_id, "role": "accountant"})
    tenant = await db.tenants.find_one({"id": s.tid}, {"_id": 0, "name": 1, "iban": 1, "bank_name": 1, "vat_number": 1, "cr_number": 1, "address": 1})
    return {"transaction": await tx_view(s, tx), "attachments": atts, "allocations": allocs, "reviews": reviews,
            "versions": versions, "jobs": jobs, "mappings": maps, "tenant": tenant,
            "delegations": [{"email": d["email"], "created_at": d["created_at"]} for d in delegations]}


@router.put("/transactions/{tx_id}")
async def edit_tx(tx_id: str, body: TxEdit, u=Depends(roles(*STAFF))):
    s = Scoped(u["tenant_id"])
    tx = await s.must("transactions", {"id": tx_id})
    if tx["daftra_status"] == "synced" and tx["confirmed"] > 0:
        raise HTTPException(409, "المعاملة مرحّلة إلى دفترة. التصحيح يتم عبر مسار العكس وليس التعديل")
    items = [i.model_dump() for i in body.items]
    sub, vat, total = compute_totals(items)
    snapshot = {k: tx[k] for k in ("items", "subtotal", "vat", "total", "notes", "version")}
    new = await s.update("transactions", {"id": tx_id, "version": body.expected_version}, {
        "$set": {"items": items, "subtotal": sub, "vat": vat, "total": total, "notes": body.notes,
                 "needs_rereview": tx["confirmed"] > 0}, "$inc": {"version": 1}})
    if not new:
        raise HTTPException(409, "تم تعديل المعاملة من شخص آخر. حدّث الصفحة")
    await s.insert("tx_versions", {"transaction_id": tx_id, **snapshot, "reason": body.reason, "by": actor_of(u)})
    await audit(s.tid, actor_of(u), "transaction_edited", tx_id, {"from_version": snapshot["version"], "reason": body.reason})
    if tx["confirmed"] > 0:
        await notify(s.tid, ["supervisor", "manager"], tx_id, f"تعديل بعد التأكيد يحتاج إعادة مراجعة - {tx['number']}")
    return await tx_view(s, await recompute(s, tx_id))


@router.post("/transactions/{tx_id}/rereview")
async def ack_rereview(tx_id: str, u=Depends(roles("supervisor", "manager"))):
    s = Scoped(u["tenant_id"])
    tx = await s.update("transactions", {"id": tx_id, "needs_rereview": True}, {"$set": {"needs_rereview": False}})
    if not tx:
        raise HTTPException(409, "لا توجد إعادة مراجعة معلقة")
    await audit(s.tid, actor_of(u), "rereview_approved", tx_id, {"version": tx["version"]})
    return await tx_view(s, await recompute(s, tx_id))


@router.post("/transactions/{tx_id}/convert")
async def convert_tx(tx_id: str, u=Depends(roles(*STAFF))):
    s = Scoped(u["tenant_id"])
    tx = await s.must("transactions", {"id": tx_id})
    if tx["doc_type"] != "quote":
        raise HTTPException(409, "المستند فاتورة بالفعل")
    number = await next_number(s.tid, "invoice")
    new = await s.update("transactions", {"id": tx_id, "doc_type": "quote"}, {
        "$set": {"doc_type": "invoice", "quote_number": tx["number"], "number": number, "converted_at": iso()}, "$inc": {"version": 1}})
    await audit(s.tid, actor_of(u), "quote_converted", tx_id, {"quote": tx["number"], "invoice": number})
    return await tx_view(s, await recompute(s, new["id"]))


@router.post("/transactions/{tx_id}/attachments")
async def staff_upload(tx_id: str, request: Request, file: UploadFile = File(...), note: str = Form(""), u=Depends(roles(*STAFF))):
    s = Scoped(u["tenant_id"])
    key, prev = await idempotent(request, s.tid, "upload")
    if prev:
        return prev
    tx = await s.must("transactions", {"id": tx_id})
    res = await store_upload(s, tx, file, actor_of(u), note)
    await save_idempotent(s.tid, "upload", key, res)
    return res


@router.post("/transactions/{tx_id}/sync")
async def sync_tx(tx_id: str, u=Depends(roles(*STAFF))):
    s = Scoped(u["tenant_id"])
    tx = await s.must("transactions", {"id": tx_id})
    await daftra.enqueue(s.tid, "sync_document", tx_id, f"{tx_id}:{tx['doc_type']}")
    await db.jobs.update_many({"tenant_id": s.tid, "transaction_id": tx_id, "status": "failed"}, {"$set": {"status": "queued", "attempts": 0}})
    await audit(s.tid, actor_of(u), "daftra_sync_requested", tx_id)
    await daftra.refresh_tx_sync(s.tid, tx_id)
    return {"ok": True}


@router.post("/jobs/{job_id}/reconcile")
async def reconcile_job(job_id: str, u=Depends(roles("supervisor", "manager"))):
    s = Scoped(u["tenant_id"])
    job = await s.must("jobs", {"id": job_id})
    if job["status"] not in ("needs_reconciliation", "failed"):
        raise HTTPException(409, "المهمة لا تحتاج مطابقة")
    status = await daftra.reconcile(job)
    await audit(s.tid, actor_of(u), "daftra_reconciled", job["transaction_id"], {"job": job_id, "result": status})
    return {"status": status}


@router.get("/attachments/{att_id}/url")
async def att_url(att_id: str, u=Depends(roles(*STAFF))):
    s = Scoped(u["tenant_id"])
    att = await db.attachments.find_one({"tenant_id": s.tid, "id": att_id}, {"_id": 0})
    if not att:
        raise HTTPException(404, "غير موجود")
    return {"url": signed_url(att)}


@router.get("/files/{att_id}")
async def serve_file(att_id: str, sig: str):
    tid = verify_file_sig(att_id, sig)
    att = await db.attachments.find_one({"tenant_id": tid, "id": att_id}, {"_id": 0})
    if not att:
        raise HTTPException(404, "غير موجود")
    data = await read_file(att)
    return Response(data, media_type=att["mime"], headers={
        "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
        "Content-Disposition": f"inline; filename*=UTF-8''{urlquote(att['filename'])}"})


@router.get("/notifications")
async def notifications(u=Depends(roles(*STAFF))):
    s = Scoped(u["tenant_id"])
    items = await s.find("notifications", {"roles": u["role"]}, sort=("created_at", -1), limit=30)
    if u["role"] == "employee":
        mine = {t["id"] for t in await s.find("transactions", {"created_by.id": u["id"]}, limit=5000)}
        items = [n for n in items if n["transaction_id"] in mine]
    return [{**{k: v for k, v in n.items() if k not in ("tenant_id", "read_by")}, "read": u["id"] in n["read_by"]} for n in items]


@router.post("/notifications/read")
async def notifications_read(u=Depends(roles(*STAFF))):
    await db.notifications.update_many({"tenant_id": u["tenant_id"], "roles": u["role"]}, {"$addToSet": {"read_by": u["id"]}})
    return {"ok": True}


@router.get("/events")
async def events(request: Request, transaction_id: Optional[str] = None, u=Depends(roles(*STAFF))):
    tid = u["tenant_id"]
    if transaction_id:
        await Scoped(tid).must("transactions", {"id": transaction_id})
    q = subscribe(tid)

    async def gen():
        try:
            yield "retry: 3000\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    ev = await asyncio.wait_for(q.get(), timeout=15)
                    if transaction_id and ev.get("transaction_id") != transaction_id:
                        continue
                    yield f"data: {json.dumps(ev)}\n\n"
                except asyncio.TimeoutError:
                    yield ": ping\n\n"
        finally:
            unsubscribe(tid, q)

    return StreamingResponse(gen(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
