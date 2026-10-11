import re
import secrets
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from core import db, Scoped, roles, actor_of, audit, hash_secret, new_id, iso

router = APIRouter(prefix="/api")
USER_FIELDS = {"_id": 0, "pin_hash": 0}


class UserIn(BaseModel):
    username: str = Field(pattern=r"^[a-z0-9._-]{3,40}$")
    name: str = Field(min_length=2, max_length=100)
    role: str = Field(pattern="^(employee|supervisor|manager)$")
    pin: str = Field(pattern=r"^\d{6}$")
    email: str = ""


class UserPatch(BaseModel):
    active: Optional[bool] = None
    pin: Optional[str] = Field(default=None, pattern=r"^\d{6}$")
    role: Optional[str] = Field(default=None, pattern="^(employee|supervisor|manager)$")


class SettingsIn(BaseModel):
    name: str = Field(min_length=2)
    iban: str = Field(pattern=r"^SA\d{22}$")
    bank_name: str
    account_name: str = ""
    vat_number: str = ""
    cr_number: str = ""
    address: str = ""


WEAK = {"000000", "111111", "123456", "654321", "121212", "222222", "999999"}


def check_pin(pin):
    if pin in WEAK or re.fullmatch(r"(\d)\1{5}", pin):
        raise HTTPException(400, "رمز PIN ضعيف جداً، اختر رمزاً آخر")


async def create_user(tenant_id, body: UserIn, by):
    check_pin(body.pin)
    if await db.users.find_one({"username": body.username}):
        raise HTTPException(409, "اسم المستخدم مستخدم مسبقاً")
    doc = {"id": new_id(), "tenant_id": tenant_id, "username": body.username, "name": body.name, "role": body.role,
           "email": body.email, "pin_hash": hash_secret(body.pin), "active": True, "created_at": iso()}
    await db.users.insert_one(dict(doc))
    await audit(tenant_id, by, "user_created", doc["id"], {"username": body.username, "role": body.role})
    return {k: v for k, v in doc.items() if k not in ("pin_hash", "_id")}


@router.get("/manager/users")
async def list_users(u=Depends(roles("manager"))):
    return await db.users.find({"tenant_id": u["tenant_id"]}, USER_FIELDS).sort("created_at", 1).to_list(500)


@router.post("/manager/users")
async def add_user(body: UserIn, u=Depends(roles("manager"))):
    return await create_user(u["tenant_id"], body, actor_of(u))


@router.patch("/manager/users/{user_id}")
async def patch_user(user_id: str, body: UserPatch, u=Depends(roles("manager"))):
    if user_id == u["id"] and body.active is False:
        raise HTTPException(400, "لا يمكنك إيقاف حسابك")
    upd = {}
    if body.active is not None:
        upd["active"] = body.active
    if body.role:
        upd["role"] = body.role
    if body.pin:
        check_pin(body.pin)
        upd["pin_hash"] = hash_secret(body.pin)
    res = await db.users.find_one_and_update({"tenant_id": u["tenant_id"], "id": user_id}, {"$set": upd}, projection=USER_FIELDS, return_document=True)
    if not res:
        raise HTTPException(404, "غير موجود")
    await audit(u["tenant_id"], actor_of(u), "user_updated", user_id, {k: v for k, v in upd.items() if k != "pin_hash"} | ({"pin_reset": True} if body.pin else {}))
    return res


@router.get("/manager/settings")
async def get_settings(u=Depends(roles("manager", "supervisor", "employee"))):
    t = await db.tenants.find_one({"id": u["tenant_id"]}, {"_id": 0})
    plan = await db.plans.find_one({"id": t.get("plan_id")}, {"_id": 0})
    return {**t, "plan": plan}


@router.put("/manager/settings")
async def put_settings(body: SettingsIn, u=Depends(roles("manager"))):
    t = await db.tenants.find_one_and_update({"id": u["tenant_id"]}, {"$set": body.model_dump()}, projection={"_id": 0}, return_document=True)
    await audit(u["tenant_id"], actor_of(u), "settings_updated", u["tenant_id"], {"iban_last4": body.iban[-4:]})
    return t


@router.get("/manager/audit")
async def audit_log(u=Depends(roles("manager"))):
    return await Scoped(u["tenant_id"]).find("audit_log", {}, sort=("created_at", -1), limit=300)


@router.get("/manager/dashboard")
async def dashboard(u=Depends(roles("manager", "supervisor"))):
    s = Scoped(u["tenant_id"])
    txs = await s.find("transactions", {}, limit=10000)
    return {
        "total_issued": sum(t["total"] for t in txs),
        "total_confirmed": sum(t["confirmed"] for t in txs),
        "pending_reviews": await s.count("attachments", {"status": "pending_review"}),
        "needs_reconciliation": await s.count("jobs", {"status": {"$in": ["needs_reconciliation", "failed"]}}),
        "count": len(txs),
    }


@router.get("/manager/invite-pin")
async def suggest_pin(u=Depends(roles("manager"))):
    while True:
        pin = f"{secrets.randbelow(1_000_000):06d}"
        if pin not in WEAK:
            return {"pin": pin}
