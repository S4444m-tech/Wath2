from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from pymongo.errors import DuplicateKeyError
from core import db, Scoped, roles, actor_of, audit, notify, idempotent, save_idempotent, new_id, iso
from ledger import recompute
from attachments import clean_att
import daftra

router = APIRouter(prefix="/api")
REVIEWERS = ("supervisor", "manager")


class AllocIn(BaseModel):
    transaction_id: str
    amount: int = Field(gt=0)


class MovementIn(BaseModel):
    reference: str = Field(min_length=3, max_length=80)
    amount: int = Field(gt=0)
    date: str = Field(min_length=8, max_length=10)
    bank_name: str = ""


class DecisionIn(BaseModel):
    decision: str = Field(pattern="^(confirm|not_seen|needs_attention)$")
    expected_version: int
    note: str = ""
    movement: Optional[MovementIn] = None
    allocations: List[AllocIn] = []


class ReverseIn(BaseModel):
    reason: str = Field(min_length=3, max_length=300)


def norm_ref(r: str) -> str:
    return "".join(r.split()).upper()


@router.get("/reviews")
async def list_reviews(status: str = "pending_review", u=Depends(roles(*REVIEWERS))):
    s = Scoped(u["tenant_id"])
    q = {} if status == "all" else {"status": status}
    atts = await s.find("attachments", q, sort=("created_at", -1))
    txs = {t["id"]: t for t in await s.find("transactions", {"id": {"$in": [a["transaction_id"] for a in atts]}})}
    out = []
    for a in atts:
        t = txs.get(a["transaction_id"], {})
        out.append({**clean_att(a), "transaction": {k: t.get(k) for k in ("id", "number", "doc_type", "customer", "total", "confirmed", "remaining", "payment_status")}})
    return out


@router.get("/reviews/{att_id}")
async def get_review(att_id: str, u=Depends(roles(*REVIEWERS))):
    s = Scoped(u["tenant_id"])
    att = await s.must("attachments", {"id": att_id})
    tx = await s.must("transactions", {"id": att["transaction_id"]})
    open_txs = await s.find("transactions", {"customer.email": tx["customer"]["email"], "id": {"$ne": tx["id"]},
                                             "payment_status": {"$nin": ["paid", "overpaid"]}})
    reviews = await s.find("reviews", {"attachment_id": att_id}, sort=("created_at", -1))
    strip = lambda t: {k: v for k, v in t.items() if k not in ("tenant_id",)}
    return {"attachment": clean_att(att), "transaction": strip(tx), "open_transactions": [strip(t) for t in open_txs], "reviews": reviews}


async def _confirm(s: Scoped, u, att, body: DecisionIn):
    mv = body.movement
    if not mv or not body.allocations:
        raise HTTPException(400, "بيانات الحركة البنكية والتوزيع مطلوبة")
    if sum(a.amount for a in body.allocations) != mv.amount:
        raise HTTPException(400, "مجموع التوزيع يجب أن يساوي مبلغ الحركة البنكية")
    ids = [a.transaction_id for a in body.allocations]
    if len(set(ids)) != len(ids):
        raise HTTPException(400, "لا يمكن تكرار نفس المستند في التوزيع")
    txs = {t["id"]: t for t in await s.find("transactions", {"id": {"$in": ids}})}
    if len(txs) != len(ids):
        raise HTTPException(404, "أحد المستندات غير موجود في هذا المصنع")
    claimed = await s.update("attachments", {"id": att["id"], "version": body.expected_version, "status": {"$in": ["pending_review", "not_seen", "needs_attention"]}},
                             {"$set": {"status": "confirming"}, "$inc": {"version": 1}})
    if not claimed:
        raise HTTPException(409, "تمت مراجعة هذا الإيصال بالفعل من مشرف آخر")
    created = []
    try:
        movement = await s.insert("bank_movements", {
            "reference": norm_ref(mv.reference), "reference_raw": mv.reference, "amount": mv.amount, "date": mv.date,
            "bank_name": mv.bank_name, "attachment_id": att["id"], "confirmed_by": actor_of(u), "reversed": False})
        created.append(("bank_movements", movement["id"]))
        allocs = []
        for a in body.allocations:
            doc = await s.insert("allocations", {"movement_id": movement["id"], "movement_reference": movement["reference"],
                                                 "transaction_id": a.transaction_id, "transaction_number": txs[a.transaction_id]["number"],
                                                 "attachment_id": att["id"], "amount": a.amount, "kind": "payment", "by": actor_of(u)})
            created.append(("allocations", doc["id"]))
            allocs.append(doc)
        review = await s.insert("reviews", {"attachment_id": att["id"], "transaction_id": att["transaction_id"], "decision": "confirm",
                                            "amount": mv.amount, "movement_id": movement["id"], "reference": movement["reference"],
                                            "note": body.note, "by": actor_of(u)})
        created.append(("reviews", review["id"]))
        await s.update("attachments", {"id": att["id"]}, {"$set": {"status": "confirmed", "movement_id": movement["id"]}})
    except DuplicateKeyError:
        await _rollback(s, created, att)
        raise HTTPException(409, "هذه الحركة البنكية مسجلة مسبقاً (رقم مرجع مكرر)")
    except Exception:
        await _rollback(s, created, att)
        raise
    for a in allocs:
        await daftra.enqueue(s.tid, "post_payment", a["transaction_id"], a["id"], {"amount": a["amount"], "reference": movement["reference"], "date": mv.date})
    for tid in ids:
        t = await recompute(s, tid)
        await notify(s.tid, ["employee", "supervisor", "manager"], tid, f"تم تأكيد وصول {txs[tid]['number']} - المتبقي {t['remaining'] / 100:.2f} ر.س")
    await audit(s.tid, actor_of(u), "payment_confirmed", att["transaction_id"], {"movement": movement["reference"], "amount": mv.amount, "allocations": [a.model_dump() for a in body.allocations]})
    return {"status": "confirmed", "movement_id": movement["id"]}


async def _rollback(s, created, att):
    for coll, _id in reversed(created):
        await s.delete(coll, {"id": _id})
    await s.update("attachments", {"id": att["id"]}, {"$set": {"status": att["status"]}})


@router.post("/reviews/{att_id}/decide")
async def decide(att_id: str, body: DecisionIn, request: Request, u=Depends(roles(*REVIEWERS))):
    s = Scoped(u["tenant_id"])
    key, prev = await idempotent(request, s.tid, "decide")
    if prev:
        return prev
    att = await s.must("attachments", {"id": att_id})
    if body.decision == "confirm":
        res = await _confirm(s, u, att, body)
    else:
        if body.decision == "needs_attention" and not body.note.strip():
            raise HTTPException(400, "اكتب ملاحظة توضح المشكلة")
        upd = await s.update("attachments", {"id": att_id, "version": body.expected_version, "status": {"$in": ["pending_review", "not_seen"]}},
                             {"$set": {"status": body.decision, "review_note": body.note}, "$inc": {"version": 1}})
        if not upd:
            raise HTTPException(409, "تمت مراجعة هذا الإيصال بالفعل من مشرف آخر")
        await s.insert("reviews", {"attachment_id": att_id, "transaction_id": att["transaction_id"], "decision": body.decision, "note": body.note, "by": actor_of(u)})
        tx = await recompute(s, att["transaction_id"])
        label = "المبلغ لم يظهر بعد في الحساب" if body.decision == "not_seen" else "يحتاج انتباه"
        await notify(s.tid, ["employee", "manager"], tx["id"], f"{tx['number']}: {label}")
        await audit(s.tid, actor_of(u), f"review_{body.decision}", tx["id"], {"note": body.note})
        res = {"status": body.decision}
    await save_idempotent(s.tid, "decide", key, res)
    return res


@router.get("/movements")
async def list_movements(u=Depends(roles(*REVIEWERS))):
    s = Scoped(u["tenant_id"])
    mvs = await s.find("bank_movements", {}, sort=("created_at", -1))
    allocs = await s.find("allocations", {"movement_id": {"$in": [m["id"] for m in mvs]}}, limit=5000)
    for m in mvs:
        m["allocations"] = [a for a in allocs if a["movement_id"] == m["id"]]
        m.pop("tenant_id", None)
    return mvs


@router.post("/movements/{mv_id}/reverse")
async def reverse_movement(mv_id: str, body: ReverseIn, request: Request, u=Depends(roles(*REVIEWERS))):
    s = Scoped(u["tenant_id"])
    key, prev = await idempotent(request, s.tid, "reverse")
    if prev:
        return prev
    mv = await s.update("bank_movements", {"id": mv_id, "reversed": False}, {"$set": {"reversed": True, "reversed_at": iso(), "reverse_reason": body.reason, "reversed_by": actor_of(u)}})
    if not mv:
        raise HTTPException(409, "الحركة معكوسة مسبقاً أو غير موجودة")
    originals = await s.find("allocations", {"movement_id": mv_id, "kind": "payment"})
    tx_ids = set()
    for a in originals:
        rev = await s.insert("allocations", {"movement_id": mv_id, "movement_reference": a["movement_reference"], "transaction_id": a["transaction_id"],
                                             "transaction_number": a["transaction_number"], "attachment_id": a["attachment_id"],
                                             "amount": -a["amount"], "kind": "reversal", "reversal_of": a["id"], "reason": body.reason, "by": actor_of(u)})
        tx_ids.add(a["transaction_id"])
        await daftra.enqueue(s.tid, "post_reversal", a["transaction_id"], rev["id"], {"amount": a["amount"], "reverses": a["id"], "reason": body.reason})
    await s.update("attachments", {"id": mv["attachment_id"]}, {"$set": {"status": "reversed"}})
    for tid in tx_ids:
        await recompute(s, tid)
    await audit(s.tid, actor_of(u), "movement_reversed", mv["attachment_id"], {"movement": mv["reference"], "reason": body.reason})
    res = {"status": "reversed"}
    await save_idempotent(s.tid, "reverse", key, res)
    return res
