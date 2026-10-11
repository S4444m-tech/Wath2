import os
from core import db, new_id, iso, hash_secret, verify_secret


async def ensure_indexes():
    await db.users.create_index("username", unique=True)
    await db.users.create_index("tenant_id")
    await db.tenants.create_index("slug", unique=True)
    await db.transactions.create_index([("tenant_id", 1), ("id", 1)], unique=True)
    await db.transactions.create_index([("tenant_id", 1), ("number", 1)], unique=True)
    await db.attachments.create_index([("tenant_id", 1), ("id", 1)], unique=True)
    await db.attachments.create_index([("tenant_id", 1), ("transaction_id", 1), ("sha256", 1)], unique=True)
    await db.bank_movements.create_index([("tenant_id", 1), ("reference", 1)], unique=True)
    await db.allocations.create_index([("tenant_id", 1), ("transaction_id", 1)])
    await db.allocations.create_index([("tenant_id", 1), ("reversal_of", 1)], unique=True, partialFilterExpression={"kind": "reversal"})
    await db.public_links.create_index("token_hash", unique=True)
    await db.jobs.create_index([("tenant_id", 1), ("idempotency_key", 1)], unique=True)
    await db.jobs.create_index("status")
    await db.daftra_mappings.create_index([("tenant_id", 1), ("local_type", 1), ("local_id", 1)], unique=True)
    await db.idempotency.create_index([("tenant_id", 1), ("scope", 1), ("key", 1)], unique=True)
    await db.login_attempts.create_index("identifier")
    await db.audit_log.create_index([("tenant_id", 1), ("created_at", -1)])
    await db.counters.create_index([("tenant_id", 1), ("kind", 1)], unique=True)


async def _user(tenant_id, username, name, role, pin, email=""):
    u = await db.users.find_one({"username": username})
    if not u:
        await db.users.insert_one({"id": new_id(), "tenant_id": tenant_id, "username": username, "name": name, "role": role,
                                   "email": email, "pin_hash": hash_secret(pin), "active": True, "created_at": iso()})
    elif not verify_secret(pin, u["pin_hash"]):
        await db.users.update_one({"username": username}, {"$set": {"pin_hash": hash_secret(pin)}})


async def _tenant(slug, name, plan_id, iban, bank, vat, cr, address):
    t = await db.tenants.find_one({"slug": slug})
    if t:
        return t["id"]
    tid = new_id()
    await db.tenants.insert_one({"id": tid, "slug": slug, "name": name, "plan_id": plan_id, "status": "active",
                                 "subscription_status": "active", "period_end": "2027-12-31", "iban": iban, "bank_name": bank,
                                 "account_name": name, "vat_number": vat, "cr_number": cr, "address": address,
                                 "daftra_mode": "ok", "created_at": iso()})
    return tid


async def seed():
    if not await db.plans.find_one({}):
        await db.plans.insert_many([
            {"id": new_id(), "name": "تجريبية", "price": 0, "max_users": 5, "max_transactions": 100, "created_at": iso()},
            {"id": new_id(), "name": "أساسية", "price": 49900, "max_users": 15, "max_transactions": 1000, "created_at": iso()},
            {"id": new_id(), "name": "متقدمة", "price": 149900, "max_users": 50, "max_transactions": 10000, "created_at": iso()},
        ])
    plan = await db.plans.find_one({}, sort=[("price", -1)])
    await _user(None, os.environ["ADMIN_USERNAME"], "المشرف العام", "superadmin", os.environ["ADMIN_PIN"], os.environ["ADMIN_EMAIL"])
    a = await _tenant("riyadh-plastics", "مصنع الرياض للصناعات البلاستيكية", plan["id"], "SA0380000000608010167519",
                      "مصرف الراجحي", "300000000000003", "1010000000", "الرياض - المدينة الصناعية الثانية")
    b = await _tenant("jeddah-metals", "مصنع جدة للمعادن", plan["id"], "SA4420000001234567891234",
                      "البنك الأهلي السعودي", "311111111100003", "4030000000", "جدة - المنطقة الصناعية")
    await _user(a, "r.manager", "سارة القحطاني", "manager", "135791")
    await _user(a, "r.supervisor", "فهد العتيبي", "supervisor", "246802")
    await _user(a, "r.employee", "خالد الدوسري", "employee", "314159")
    await _user(b, "j.employee", "ماجد الحربي", "employee", "271828")
    await _user(b, "j.supervisor", "نورة الزهراني", "supervisor", "161803")
