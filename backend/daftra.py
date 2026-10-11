"""Daftra connector behind an interface + outbox job worker. MOCKED until live API credentials exist.

Posting matrix (local -> Daftra):
- invoice (document)              -> POST /api2/invoices           (daftra_type=invoice)
- quote   (document)              -> POST /api2/estimates          (daftra_type=estimate)
- allocation on invoice           -> POST /api2/invoice_payments   (linked to invoice mapping)
- allocation on quote (advance)   -> POST /api2/client_payments    (client credit / advance)
- reversal of allocation          -> POST /api2/refund_receipts    (never delete)
"""
import asyncio
import logging
from abc import ABC, abstractmethod
from core import db, new_id, iso, publish

log = logging.getLogger("daftra")


class DaftraTimeout(Exception):
    pass


class DaftraUnavailable(Exception):
    pass


class DaftraRejected(Exception):
    pass


class DaftraConnector(ABC):
    @abstractmethod
    async def create(self, tenant, daftra_type: str, reference: str, payload: dict) -> str: ...

    @abstractmethod
    async def find_by_reference(self, tenant, daftra_type: str, reference: str): ...


class MockDaftraConnector(DaftraConnector):
    """Simulates Daftra in collection `daftra_mock`. tenant.daftra_mode: ok | timeout | down | error."""

    async def create(self, tenant, daftra_type, reference, payload):
        mode = tenant.get("daftra_mode", "ok")
        await asyncio.sleep(0.3)
        if mode == "down":
            raise DaftraUnavailable("connection refused")
        if mode == "error":
            raise DaftraRejected("422 validation error from Daftra")
        remote_id = f"DF-{daftra_type[:3].upper()}-{new_id()[:8]}"
        await db.daftra_mock.update_one(
            {"tenant_id": tenant["id"], "daftra_type": daftra_type, "reference": reference},
            {"$setOnInsert": {"remote_id": remote_id, "payload": payload, "created_at": iso()}}, upsert=True)
        if mode == "timeout":
            raise DaftraTimeout("request timed out after send (outcome unknown)")
        doc = await db.daftra_mock.find_one({"tenant_id": tenant["id"], "daftra_type": daftra_type, "reference": reference})
        return doc["remote_id"]

    async def find_by_reference(self, tenant, daftra_type, reference):
        doc = await db.daftra_mock.find_one({"tenant_id": tenant["id"], "daftra_type": daftra_type, "reference": reference})
        return doc["remote_id"] if doc else None


connector: DaftraConnector = MockDaftraConnector()


async def enqueue(tenant_id, kind, transaction_id, ref_id, payload=None):
    key = f"{kind}:{ref_id}"
    await db.jobs.update_one(
        {"tenant_id": tenant_id, "idempotency_key": key},
        {"$setOnInsert": {"id": new_id(), "tenant_id": tenant_id, "kind": kind, "transaction_id": transaction_id,
                          "ref_id": ref_id, "payload": payload or {}, "status": "queued", "attempts": 0,
                          "last_error": None, "created_at": iso(), "updated_at": iso()}}, upsert=True)
    await refresh_tx_sync(tenant_id, transaction_id)


DOC_TYPE = {"invoice": "invoice", "quote": "estimate"}


async def _mapping(tenant_id, local_type, local_id):
    return await db.daftra_mappings.find_one({"tenant_id": tenant_id, "local_type": local_type, "local_id": local_id}, {"_id": 0})


async def _save_mapping(tenant_id, local_type, local_id, daftra_type, remote_id):
    await db.daftra_mappings.update_one(
        {"tenant_id": tenant_id, "local_type": local_type, "local_id": local_id},
        {"$setOnInsert": {"id": new_id(), "daftra_type": daftra_type, "daftra_id": remote_id, "created_at": iso()}}, upsert=True)


async def _ensure_document(tenant, tx):
    local_type = f"doc_{tx['doc_type']}"
    m = await _mapping(tenant["id"], local_type, tx["id"])
    if m:
        return m["daftra_id"]
    dtype = DOC_TYPE[tx["doc_type"]]
    ref = f"{tx['id']}:{tx['doc_type']}"
    rid = await connector.create(tenant, dtype, ref, {"number": tx["number"], "total": tx["total"], "customer": tx["customer"]})
    await _save_mapping(tenant["id"], local_type, tx["id"], dtype, rid)
    return rid


async def _run(job):
    tenant = await db.tenants.find_one({"id": job["tenant_id"]}, {"_id": 0})
    tx = await db.transactions.find_one({"tenant_id": job["tenant_id"], "id": job["transaction_id"]}, {"_id": 0})
    doc_id = await _ensure_document(tenant, tx)
    if job["kind"] == "sync_document":
        return
    if job["kind"] == "post_payment":
        dtype = "invoice_payment" if tx["doc_type"] == "invoice" else "client_payment"
    else:
        dtype = "refund_receipt"
    if await _mapping(tenant["id"], job["kind"], job["ref_id"]):
        return
    rid = await connector.create(tenant, dtype, job["idempotency_key"], {"document": doc_id, **job["payload"]})
    await _save_mapping(tenant["id"], job["kind"], job["ref_id"], dtype, rid)


async def process(job):
    try:
        await _run(job)
        upd = {"status": "done", "last_error": None}
    except DaftraTimeout as e:
        upd = {"status": "needs_reconciliation", "last_error": str(e)}
    except DaftraUnavailable as e:
        upd = {"status": "queued" if job["attempts"] + 1 < 3 else "failed", "last_error": str(e)}
    except Exception as e:
        upd = {"status": "failed", "last_error": str(e)}
    await db.jobs.update_one({"id": job["id"]}, {"$set": {**upd, "updated_at": iso()}, "$inc": {"attempts": 1}})
    await refresh_tx_sync(job["tenant_id"], job["transaction_id"])


async def reconcile(job):
    """Never blind-retry creation: look up by our reference first."""
    tenant = await db.tenants.find_one({"id": job["tenant_id"]}, {"_id": 0})
    tx = await db.transactions.find_one({"tenant_id": job["tenant_id"], "id": job["transaction_id"]}, {"_id": 0})
    found_all = True
    doc_type = DOC_TYPE[tx["doc_type"]]
    rid = await connector.find_by_reference(tenant, doc_type, f"{tx['id']}:{tx['doc_type']}")
    if rid:
        await _save_mapping(tenant["id"], f"doc_{tx['doc_type']}", tx["id"], doc_type, rid)
    elif not await _mapping(tenant["id"], f"doc_{tx['doc_type']}", tx["id"]):
        found_all = False
    if job["kind"] != "sync_document":
        dtype = {"post_payment": "invoice_payment" if tx["doc_type"] == "invoice" else "client_payment"}.get(job["kind"], "refund_receipt")
        rid2 = await connector.find_by_reference(tenant, dtype, job["idempotency_key"])
        if rid2:
            await _save_mapping(tenant["id"], job["kind"], job["ref_id"], dtype, rid2)
        elif not await _mapping(tenant["id"], job["kind"], job["ref_id"]):
            found_all = False
    status = "done" if found_all else "queued"
    await db.jobs.update_one({"id": job["id"]}, {"$set": {"status": status, "last_error": None if found_all else "not found in Daftra; re-queued", "updated_at": iso()}})
    await refresh_tx_sync(job["tenant_id"], job["transaction_id"])
    return status


async def refresh_tx_sync(tenant_id, tx_id):
    jobs = await db.jobs.find({"tenant_id": tenant_id, "transaction_id": tx_id}, {"_id": 0, "status": 1}).to_list(500)
    st = {j["status"] for j in jobs}
    if not jobs:
        s = "not_synced"
    elif "needs_reconciliation" in st:
        s = "needs_reconciliation"
    elif "failed" in st:
        s = "failed"
    elif st & {"queued", "running"}:
        s = "queued"
    else:
        s = "synced"
    await db.transactions.update_one({"tenant_id": tenant_id, "id": tx_id}, {"$set": {"daftra_status": s}})
    publish(tenant_id, {"type": "tx_update", "transaction_id": tx_id, "daftra_status": s})


async def worker_loop():
    while True:
        try:
            job = await db.jobs.find_one_and_update(
                {"status": "queued"}, {"$set": {"status": "running", "updated_at": iso()}},
                projection={"_id": 0}, sort=[("created_at", 1)])
            if job:
                await process(job)
                continue
        except Exception as e:
            log.exception("worker error: %s", e)
        await asyncio.sleep(2)
