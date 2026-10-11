from fastapi import HTTPException, UploadFile
from motor.motor_asyncio import AsyncIOMotorGridFSBucket
from core import db, Scoped, MAX_UPLOAD, sha256, sniff, scan_file, new_id, make_token, read_token, notify, audit
from ledger import recompute


async def store_upload(s: Scoped, tx: dict, file: UploadFile, uploader: dict, note: str = ""):
    data = await file.read(MAX_UPLOAD + 1)
    if len(data) > MAX_UPLOAD:
        raise HTTPException(413, "حجم الملف يتجاوز 10 ميغابايت")
    if not data:
        raise HTTPException(400, "الملف فارغ")
    mime = sniff(data)
    if not mime:
        raise HTTPException(415, "نوع الملف غير مدعوم. المسموح: PDF أو JPG أو PNG أو HEIC")
    digest = sha256(data)
    same = await s.get("attachments", {"transaction_id": tx["id"], "sha256": digest})
    if same:
        raise HTTPException(409, "هذا الإيصال مرفوع مسبقاً لهذه المعاملة")
    other = await s.get("attachments", {"sha256": digest})
    att_id = new_id()
    # quarantine: bytes are held in memory and only persisted after the scan passes
    if not scan_file(data):
        await audit(s.tid, uploader, "upload_rejected_scan", tx["id"])
        raise HTTPException(422, "تم رفض الملف بعد الفحص الأمني")
    file_id = await bucket().upload_from_stream(att_id, data, metadata={"tenant_id": s.tid, "mime": mime})
    doc = await s.insert("attachments", {
        "id": att_id, "transaction_id": tx["id"], "transaction_number": tx["number"],
        "filename": (file.filename or "receipt")[:120], "mime": mime, "size": len(data), "sha256": digest,
        "file_id": file_id, "status": "pending_review", "version": 1, "uploader": uploader, "note": note[:500],
        "duplicate_of": (other or {}).get("transaction_number"),
    })
    await audit(s.tid, uploader, "proof_uploaded", tx["id"], {"attachment_id": att_id, "dup": bool(other)})
    await recompute(s, tx["id"])
    await notify(s.tid, ["supervisor", "manager"], tx["id"], f"إيصال جديد بانتظار المراجعة - {tx['number']}")
    return clean_att(doc)


def clean_att(a):
    return {k: v for k, v in a.items() if k not in ("file_id", "tenant_id")}


def bucket():
    return AsyncIOMotorGridFSBucket(db, bucket_name="receipts")


async def read_file(att):
    stream = await bucket().open_download_stream(att["file_id"])
    return await stream.read()


def signed_url(att):
    sig = make_token({"att": att["id"], "tid": att["tenant_id"], "type": "file"}, 5)
    return f"/api/files/{att['id']}?sig={sig}"


def verify_file_sig(att_id, sig):
    p = read_token(sig)
    if p.get("type") != "file" or p.get("att") != att_id:
        raise HTTPException(403, "رابط غير صالح")
    return p["tid"]
