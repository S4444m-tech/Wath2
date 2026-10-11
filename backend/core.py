import os
import uuid
import hashlib
import secrets
import asyncio
from datetime import datetime, timezone, timedelta
from typing import Optional

import bcrypt
import jwt
from fastapi import Request, HTTPException, Depends
from motor.motor_asyncio import AsyncIOMotorClient

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]

JWT_ALG = "HS256"
MAX_UPLOAD = 10 * 1024 * 1024
VAT_RATE = 15


def now():
    return datetime.now(timezone.utc)


def iso(dt=None):
    return (dt or now()).isoformat()


def new_id():
    return str(uuid.uuid4())


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def hash_secret(v: str) -> str:
    return bcrypt.hashpw(v.encode(), bcrypt.gensalt()).decode()


def verify_secret(v: str, h: str) -> bool:
    return bcrypt.checkpw(v.encode(), h.encode())


def make_token(payload: dict, minutes: int) -> str:
    payload = {**payload, "exp": now() + timedelta(minutes=minutes)}
    return jwt.encode(payload, os.environ["JWT_SECRET"], algorithm=JWT_ALG)


def read_token(token: str) -> dict:
    try:
        return jwt.decode(token, os.environ["JWT_SECRET"], algorithms=[JWT_ALG])
    except jwt.PyJWTError:
        raise HTTPException(401, "انتهت الجلسة، الرجاء الدخول مجدداً")


def set_cookie(response, key, value, max_age, httponly=True):
    response.set_cookie(key=key, value=value, httponly=httponly, secure=True, samesite="none", max_age=max_age, path="/")


def issue_csrf(response):
    token = secrets.token_urlsafe(24)
    set_cookie(response, "csrf_token", token, 60 * 60 * 12, httponly=False)
    return token


def check_csrf(request: Request):
    if request.method in ("POST", "PUT", "PATCH", "DELETE"):
        c = request.cookies.get("csrf_token")
        h = request.headers.get("X-CSRF-Token")
        if not c or not h or not secrets.compare_digest(c, h):
            raise HTTPException(403, "رمز الحماية CSRF غير صالح")


def compute_totals(items):
    subtotal = sum(int(i["qty"]) * int(i["unit_price"]) for i in items)
    vat = (subtotal * VAT_RATE + 50) // 100
    return subtotal, vat, subtotal + vat


class Scoped:
    """Tenant-scoped data access: every query is forced to the caller's tenant."""

    def __init__(self, tenant_id: str):
        if not tenant_id:
            raise HTTPException(403, "لا توجد بيئة مصنع لهذا الحساب")
        self.tid = tenant_id

    def _q(self, q):
        return {**(q or {}), "tenant_id": self.tid}

    async def find(self, coll, q=None, sort=None, limit=500):
        cur = db[coll].find(self._q(q), {"_id": 0})
        if sort:
            cur = cur.sort(*sort)
        return await cur.to_list(limit)

    async def get(self, coll, q):
        return await db[coll].find_one(self._q(q), {"_id": 0})

    async def must(self, coll, q):
        d = await self.get(coll, q)
        if not d:
            raise HTTPException(404, "غير موجود")
        return d

    async def insert(self, coll, doc):
        doc = {**doc, "tenant_id": self.tid}
        doc.setdefault("id", new_id())
        doc.setdefault("created_at", iso())
        await db[coll].insert_one(dict(doc))
        doc.pop("_id", None)
        return doc

    async def update(self, coll, q, upd):
        return await db[coll].find_one_and_update(self._q(q), upd, projection={"_id": 0}, return_document=True)

    async def count(self, coll, q=None):
        return await db[coll].count_documents(self._q(q))

    async def delete(self, coll, q):
        return await db[coll].delete_one(self._q(q))


async def audit(tenant_id, actor, action, target=None, data=None):
    await db.audit_log.insert_one({
        "id": new_id(), "tenant_id": tenant_id, "actor": actor, "action": action,
        "target": target, "data": data or {}, "created_at": iso(),
    })


async def get_user(request: Request):
    token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(401, "غير مسجل الدخول")
    p = read_token(token)
    if p.get("type") != "access":
        raise HTTPException(401, "رمز غير صالح")
    u = await db.users.find_one({"id": p["sub"], "active": True}, {"_id": 0, "pin_hash": 0})
    if not u:
        raise HTTPException(401, "الحساب غير موجود")
    check_csrf(request)
    if u.get("tenant_id"):
        t = await db.tenants.find_one({"id": u["tenant_id"]}, {"_id": 0, "status": 1})
        if not t or t.get("status") != "active":
            raise HTTPException(403, "بيئة المصنع موقوفة")
    return u


def roles(*allowed):
    async def dep(u=Depends(get_user)):
        if u["role"] not in allowed:
            raise HTTPException(403, "لا تملك صلاحية لهذا الإجراء")
        return u
    return dep


def actor_of(u):
    return {"type": "user", "id": u["id"], "name": u["name"], "role": u["role"]}


async def idempotent(request: Request, tenant_id: str, scope: str):
    key = request.headers.get("Idempotency-Key")
    if not key or len(key) < 8:
        raise HTTPException(400, "مفتاح عدم التكرار Idempotency-Key مطلوب")
    prev = await db.idempotency.find_one({"tenant_id": tenant_id, "scope": scope, "key": key}, {"_id": 0})
    return key, (prev or {}).get("response")


async def save_idempotent(tenant_id, scope, key, response):
    await db.idempotency.update_one(
        {"tenant_id": tenant_id, "scope": scope, "key": key},
        {"$setOnInsert": {"response": response, "created_at": iso()}}, upsert=True)


# --- realtime pub/sub (per tenant, filtered per transaction) ---
_subs: dict = {}


def subscribe(tenant_id):
    q = asyncio.Queue(maxsize=100)
    _subs.setdefault(tenant_id, set()).add(q)
    return q


def unsubscribe(tenant_id, q):
    _subs.get(tenant_id, set()).discard(q)


def publish(tenant_id, event: dict):
    for q in list(_subs.get(tenant_id, set())):
        try:
            q.put_nowait(event)
        except asyncio.QueueFull:
            pass


async def notify(tenant_id, roles_list, transaction_id, text):
    await db.notifications.insert_one({
        "id": new_id(), "tenant_id": tenant_id, "roles": roles_list, "transaction_id": transaction_id,
        "text": text, "read_by": [], "created_at": iso(),
    })
    publish(tenant_id, {"type": "notification", "transaction_id": transaction_id, "text": text})


def sniff(data: bytes) -> Optional[str]:
    if data[:4] == b"%PDF":
        return "application/pdf"
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[4:8] == b"ftyp" and data[8:12] in (b"heic", b"heix", b"mif1", b"msf1", b"hevc"):
        return "image/heic"
    return None


def scan_file(data: bytes) -> bool:
    """Minimal scanner stub: rejects embedded scripts/executables. Replace with ClamAV in production."""
    bad = [b"MZ\x90\x00", b"/JavaScript", b"/JS ", b"/Launch", b"<script"]
    return not any(b in data[:2_000_000] for b in bad)
