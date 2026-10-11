from core import Scoped, publish, iso

STATUS_AR = {
    "issued": "صادر - بانتظار الدفع",
    "pending_review": "بانتظار مراجعة المشرف",
    "not_seen": "المبلغ لم يظهر بعد",
    "needs_attention": "يحتاج انتباه",
    "partially_paid": "مدفوع جزئياً",
    "paid": "مدفوع بالكامل",
    "overpaid": "مدفوع بزيادة",
}


async def recompute(s: Scoped, tx_id: str):
    """Confirmed money comes ONLY from the allocation ledger, never from receipts."""
    tx = await s.must("transactions", {"id": tx_id})
    allocs = await s.find("allocations", {"transaction_id": tx_id}, limit=5000)
    confirmed = sum(a["amount"] for a in allocs)
    atts = await s.find("attachments", {"transaction_id": tx_id}, limit=1000)
    st = {a["status"] for a in atts}
    total = tx["total"]
    if confirmed <= 0:
        if "pending_review" in st:
            status = "pending_review"
        elif "needs_attention" in st:
            status = "needs_attention"
        elif "not_seen" in st:
            status = "not_seen"
        else:
            status = "issued"
    elif confirmed < total:
        status = "partially_paid"
    elif confirmed == total:
        status = "paid"
    else:
        status = "overpaid"
    upd = {
        "confirmed": confirmed,
        "remaining": max(total - confirmed, 0),
        "credit": max(confirmed - total, 0),
        "payment_status": status,
        "has_pending": "pending_review" in st,
        "is_advance": tx["doc_type"] == "quote" and confirmed > 0,
        "updated_at": iso(),
    }
    tx = await s.update("transactions", {"id": tx_id}, {"$set": upd})
    publish(s.tid, {"type": "tx_update", "transaction_id": tx_id, "payment_status": status})
    return tx
