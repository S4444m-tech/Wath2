"""Super-admin: tenants, plans, subscriptions, integration health. No access to financial records."""
import secrets
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from core import db, roles, actor_of, audit, new_id, iso
from routes_manager import UserIn, create_user

router = APIRouter(prefix="/api/admin")
SA = roles("superadmin")


class TenantIn(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    slug: str = Field(pattern=r"^[a-z0-9-]{3,40}$")
    plan_id: str
    manager_name: str = Field(min_length=2)
    manager_username: str = Field(pattern=r"^[a-z0-9._-]{3,40}$")
    manager_email: str = ""


class PlanIn(BaseModel):
    name: str = Field(min_length=2)
    price: int = Field(ge=0)
    max_users: int = Field(gt=0)
    max_transactions: int = Field(gt=0)


class TenantPatch(BaseModel):
    status: str | None = Field(default=None, pattern="^(active|suspended)$")
    plan_id: str | None = None
    period_end: str | None = None
    daftra_mode: str | None = Field(default=None, pattern="^(ok|timeout|down|error)$")


@router.get("/plans")
async def plans(u=Depends(SA)):
    return await db.plans.find({}, {"_id": 0}).sort("price", 1).to_list(100)


@router.post("/plans")
async def add_plan(body: PlanIn, u=Depends(SA)):
    doc = {"id": new_id(), **body.model_dump(), "created_at": iso()}
    await db.plans.insert_one(dict(doc))
    await audit(None, actor_of(u), "plan_created", doc["id"], body.model_dump())
    return doc


@router.get("/tenants")
async def tenants(u=Depends(SA)):
    ts = await db.tenants.find({}, {"_id": 0, "iban": 0}).sort("created_at", -1).to_list(500)
    for t in ts:
        t["users"] = await db.users.count_documents({"tenant_id": t["id"]})
        t["transactions"] = await db.transactions.count_documents({"tenant_id": t["id"]})
    return ts


@router.post("/tenants")
async def add_tenant(body: TenantIn, u=Depends(SA)):
    if await db.tenants.find_one({"slug": body.slug}):
        raise HTTPException(409, "المعرّف مستخدم مسبقاً")
    if not await db.plans.find_one({"id": body.plan_id}):
        raise HTTPException(404, "الباقة غير موجودة")
    t = {"id": new_id(), "name": body.name, "slug": body.slug, "plan_id": body.plan_id, "status": "active",
         "subscription_status": "trial", "period_end": "", "iban": "", "bank_name": "", "vat_number": "", "cr_number": "",
         "address": "", "account_name": body.name, "daftra_mode": "ok", "created_at": iso()}
    await db.tenants.insert_one(dict(t))
    pin = f"{secrets.randbelow(900000) + 100000}"
    mgr = await create_user(t["id"], UserIn(username=body.manager_username, name=body.manager_name, role="manager", pin=pin, email=body.manager_email), actor_of(u))
    await audit(None, actor_of(u), "tenant_created", t["id"], {"name": body.name})
    return {"tenant": t, "manager": mgr, "temporary_pin": pin}


@router.patch("/tenants/{tenant_id}")
async def patch_tenant(tenant_id: str, body: TenantPatch, u=Depends(SA)):
    upd = {k: v for k, v in body.model_dump().items() if v is not None}
    if body.period_end is not None:
        upd["subscription_status"] = "active"
    t = await db.tenants.find_one_and_update({"id": tenant_id}, {"$set": upd}, projection={"_id": 0, "iban": 0}, return_document=True)
    if not t:
        raise HTTPException(404, "غير موجود")
    await audit(None, actor_of(u), "tenant_updated", tenant_id, upd)
    return t


@router.get("/health")
async def health(u=Depends(SA)):
    out = []
    for t in await db.tenants.find({}, {"_id": 0, "id": 1, "name": 1, "daftra_mode": 1}).to_list(500):
        counts = {}
        for s in ("queued", "running", "done", "failed", "needs_reconciliation"):
            counts[s] = await db.jobs.count_documents({"tenant_id": t["id"], "status": s})
        last = await db.jobs.find_one({"tenant_id": t["id"], "last_error": {"$ne": None}}, {"_id": 0, "last_error": 1, "updated_at": 1}, sort=[("updated_at", -1)])
        out.append({**t, "jobs": counts, "last_error": last})
    return {"connector": "MockDaftraConnector", "tenants": out}


@router.get("/audit")
async def admin_audit(u=Depends(SA)):
    return await db.audit_log.find({"tenant_id": None}, {"_id": 0}).sort("created_at", -1).to_list(200)
