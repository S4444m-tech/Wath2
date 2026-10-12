"""Core backend regression tests for Wathiq.

Covers: health, auth/login/lockout, CSRF, idempotency, tenant isolation, transactions,
public OTP + upload + delegation, supervisor review (confirm/not_seen/needs_attention),
duplicate reference, allocation ledger math, movement reversal, Daftra mock reconcile,
manager user admin, superadmin tenants/plans/suspend.
"""
import io
import time
import uuid
import struct
import zlib
import pytest
import requests
from conftest import BASE_URL, idem_key, _login, insert_known_otp


# ---------- helpers ----------

def _png_bytes(seed: int = 0):
    """Build a minimal valid PNG; different seed → different bytes/hash."""
    sig = b"\x89PNG\r\n\x1a\n"
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    ihdr = struct.pack(">IIBBBBB", 1 + (seed & 7), 1, 8, 2, 0, 0, 0)
    raw = b"\x00" + b"\xff\x00\x00" * (1 + (seed & 7))
    idat = zlib.compress(raw)
    return sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")


def _pdf_bytes():
    return b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"


# ---------- 1. Health ----------
class TestHealth:
    def test_root(self):
        last = None
        for _ in range(3):
            try:
                r = requests.get(f"{BASE_URL}/api/", timeout=30)
                assert r.status_code == 200 and r.json().get("ok") is True
                return
            except Exception as e:
                last = e
                time.sleep(2)
        raise last


# ---------- 2. Auth ----------
class TestAuth:
    def test_login_success_sets_cookies(self):
        s = requests.Session()
        r = s.post(f"{BASE_URL}/api/auth/login", json={"username": "r.employee", "pin": "314159"})
        assert r.status_code == 200
        data = r.json()
        assert data["username"] == "r.employee" and data["role"] == "employee"
        assert s.cookies.get("access_token") and s.cookies.get("refresh_token") and s.cookies.get("csrf_token")

    def test_wrong_pin_401(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"username": "r.employee", "pin": "000001"})
        assert r.status_code == 401

    def test_pin_format_400(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"username": "r.employee", "pin": "abc"})
        assert r.status_code == 400

    def test_me_and_logout(self, employee):
        r = employee.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 200 and r.json()["username"] == "r.employee"
        r = employee.post(f"{BASE_URL}/api/auth/logout")
        assert r.status_code == 200

    def test_lockout_after_5_fails(self):
        """Use a throwaway unique username so we don't lock seeded users."""
        throwaway = f"nouser_{uuid.uuid4().hex[:6]}"
        for i in range(5):
            r = requests.post(f"{BASE_URL}/api/auth/login", json={"username": throwaway, "pin": "000000"})
            assert r.status_code == 401
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"username": throwaway, "pin": "000000"})
        assert r.status_code == 429, f"expected lockout 429, got {r.status_code}"


# ---------- 3. CSRF + Idempotency ----------
class TestCSRFIdempotency:
    def test_missing_csrf_header_blocks_post(self, employee):
        no_csrf = requests.Session()
        no_csrf.cookies.update(employee.cookies.get_dict())
        # intentionally no X-CSRF-Token header
        r = no_csrf.post(f"{BASE_URL}/api/transactions", json={
            "doc_type": "invoice",
            "customer": {"name": "TEST_x", "email": "x@x.com"},
            "items": [{"description": "a", "qty": 1, "unit_price": 100}],
        })
        assert r.status_code == 403

    def test_missing_idempotency_key_on_decide_400(self, supervisor, new_tx, employee):
        tx = new_tx(doc_type="invoice")
        # upload a receipt via staff endpoint - needs idempotency key though
        # instead test decide without key
        # Build a dummy att by uploading PNG first
        files = {"file": ("r.png", _png_bytes(1), "image/png")}
        hdrs = {"X-CSRF-Token": employee.cookies.get("csrf_token"), "Idempotency-Key": idem_key()}
        r = employee.post(f"{BASE_URL}/api/transactions/{tx['id']}/attachments", files=files,
                          headers={"X-CSRF-Token": employee.cookies.get("csrf_token"), "Idempotency-Key": idem_key()})
        assert r.status_code == 200, r.text
        att = r.json()
        # decide without Idempotency-Key
        r = supervisor.post(f"{BASE_URL}/api/reviews/{att['id']}/decide", json={
            "decision": "not_seen", "expected_version": att["version"]})
        assert r.status_code == 400

    def test_idempotent_replay_returns_same_result(self, supervisor, employee, new_tx):
        tx = new_tx()
        files = {"file": ("r.png", _png_bytes(2), "image/png")}
        r = employee.post(f"{BASE_URL}/api/transactions/{tx['id']}/attachments", files=files,
                          headers={"X-CSRF-Token": employee.cookies.get("csrf_token"), "Idempotency-Key": idem_key()})
        att = r.json()
        key = idem_key("decide")
        body = {"decision": "needs_attention", "expected_version": att["version"], "note": "تحقق"}
        r1 = supervisor.post(f"{BASE_URL}/api/reviews/{att['id']}/decide", json=body,
                             headers={"X-CSRF-Token": supervisor.cookies.get("csrf_token"), "Idempotency-Key": key})
        assert r1.status_code == 200, r1.text
        r2 = supervisor.post(f"{BASE_URL}/api/reviews/{att['id']}/decide", json=body,
                             headers={"X-CSRF-Token": supervisor.cookies.get("csrf_token"), "Idempotency-Key": key})
        assert r2.status_code == 200
        assert r1.json() == r2.json()


# ---------- 4. Transactions ----------
class TestTransactions:
    def test_create_quote_and_invoice_math(self, new_tx):
        tx = new_tx(doc_type="quote", items=[{"description": "x", "qty": 3, "unit_price": 10000}])
        assert tx["doc_type"] == "quote"
        assert tx["subtotal"] == 30000
        # VAT 15% banker rounding (sub*15+50)//100 = (4500+50)//100 = 45
        assert tx["vat"] == 4500
        assert tx["total"] == 34500
        assert tx["number"].startswith("Q-")
        assert tx["public_token"]

    def test_invoice_number_prefix(self, new_tx):
        tx = new_tx(doc_type="invoice")
        assert tx["number"].startswith("INV-")

    def test_convert_quote_to_invoice(self, employee, new_tx):
        q = new_tx(doc_type="quote")
        r = employee.post(f"{BASE_URL}/api/transactions/{q['id']}/convert")
        assert r.status_code == 200
        inv = r.json()
        assert inv["doc_type"] == "invoice"
        assert inv["number"].startswith("INV-")
        assert inv["quote_number"] == q["number"]

    def test_edit_tx_creates_version(self, employee, new_tx):
        tx = new_tx()
        r = employee.put(f"{BASE_URL}/api/transactions/{tx['id']}", json={
            "items": [{"description": "edited", "qty": 1, "unit_price": 5000}],
            "notes": "n",
            "expected_version": tx["version"],
            "reason": "fix typo",
        })
        assert r.status_code == 200
        d = employee.get(f"{BASE_URL}/api/transactions/{tx['id']}").json()
        assert len(d["versions"]) == 1
        assert d["transaction"]["total"] == 5750


# ---------- 5. Public portal: OTP + upload + delegate ----------
class TestPublic:
    def _otp_session(self, token, code="135246"):
        s = requests.Session()
        r = s.get(f"{BASE_URL}/api/public/links/{token}")
        assert r.status_code == 200, r.text
        # Insert a known OTP directly in MongoDB (real email is sent; we don't rely on demo_code).
        insert_known_otp(token, code)
        r = s.post(f"{BASE_URL}/api/public/links/{token}/verify", json={"code": code})
        assert r.status_code == 200, r.text
        s.headers.update({"X-CSRF-Token": s.cookies.get("csrf_token")})
        return s

    def test_otp_and_session_view(self, new_tx):
        tx = new_tx()
        s = self._otp_session(tx["public_token"])
        r = s.get(f"{BASE_URL}/api/public/session")
        assert r.status_code == 200
        data = r.json()
        assert data["role"] == "customer"
        assert data["transaction"]["id"] == tx["id"]

    def test_otp_wrong_code_rejected(self, new_tx):
        tx = new_tx()
        s = requests.Session()
        insert_known_otp(tx["public_token"], "135246")
        r = s.post(f"{BASE_URL}/api/public/links/{tx['public_token']}/verify", json={"code": "000001"})
        assert r.status_code in (400, 429)

    def test_public_upload_duplicate_and_bad_type(self, new_tx):
        tx = new_tx()
        s = self._otp_session(tx["public_token"])
        png = _png_bytes(3)
        files = {"file": ("rec.png", png, "image/png")}
        r = s.post(f"{BASE_URL}/api/public/session/upload", files=files,
                   headers={"X-CSRF-Token": s.cookies.get("csrf_token"), "Idempotency-Key": idem_key()})
        assert r.status_code == 200, r.text
        # Duplicate same bytes - new idem key to not short-circuit
        r2 = s.post(f"{BASE_URL}/api/public/session/upload",
                    files={"file": ("rec.png", png, "image/png")},
                    headers={"X-CSRF-Token": s.cookies.get("csrf_token"), "Idempotency-Key": idem_key()})
        assert r2.status_code == 409, f"expected 409 duplicate, got {r2.status_code}: {r2.text}"
        # txt renamed .png (bad magic)
        r3 = s.post(f"{BASE_URL}/api/public/session/upload",
                    files={"file": ("fake.png", b"this is not an image", "image/png")},
                    headers={"X-CSRF-Token": s.cookies.get("csrf_token"), "Idempotency-Key": idem_key()})
        assert r3.status_code == 415

    def test_delegate_accountant(self, new_tx):
        tx = new_tx(email="delivered@resend.dev")
        s = self._otp_session(tx["public_token"])
        acc_email = f"delivered+acc_{uuid.uuid4().hex[:6]}@resend.dev"
        r = s.post(f"{BASE_URL}/api/public/session/delegate",
                   json={"email": acc_email, "name": "Accountant"},
                   headers={"X-CSRF-Token": s.cookies.get("csrf_token")})
        assert r.status_code == 200, r.text
        data = r.json()
        assert "sent_to" in data and "token" not in data, f"delegate must only return masked sent_to; got {data}"
        # Resolve accountant token from DB (not returned in response)
        from conftest import _mongo
        acc_link = _mongo.public_links.find_one({"transaction_id": tx["id"], "role": "accountant", "email": acc_email})
        assert acc_link, "accountant public_link not created"
        acc_token = acc_link["token"]
        s2 = self._otp_session(acc_token)
        r = s2.get(f"{BASE_URL}/api/public/session")
        assert r.status_code == 200 and r.json()["role"] == "accountant"
        # Accountant cannot delegate further
        r = s2.post(f"{BASE_URL}/api/public/session/delegate", json={"email": "delivered+acc2@resend.dev"},
                    headers={"X-CSRF-Token": s2.cookies.get("csrf_token")})
        assert r.status_code == 403

    def test_delegate_same_email_as_customer_400(self, new_tx):
        tx = new_tx(email="delivered@resend.dev")
        s = self._otp_session(tx["public_token"])
        r = s.post(f"{BASE_URL}/api/public/session/delegate",
                   json={"email": "delivered@resend.dev"},
                   headers={"X-CSRF-Token": s.cookies.get("csrf_token")})
        assert r.status_code == 400, r.text


# ---------- 6. Review decisions ----------
class TestReview:
    def _upload(self, employee, tx_id, seed=10):
        files = {"file": ("r.png", _png_bytes(seed), "image/png")}
        r = employee.post(f"{BASE_URL}/api/transactions/{tx_id}/attachments", files=files,
                          headers={"X-CSRF-Token": employee.cookies.get("csrf_token"), "Idempotency-Key": idem_key()})
        assert r.status_code == 200, r.text
        return r.json()

    def test_confirm_partial_then_paid(self, employee, supervisor, new_tx):
        tx = new_tx(items=[{"description": "x", "qty": 1, "unit_price": 100000}])  # total 115000 (1150.00 SAR)
        total = tx["total"]
        att = self._upload(employee, tx["id"], seed=20)
        ref = f"REF{uuid.uuid4().hex[:8].upper()}"
        half = total // 2
        body = {"decision": "confirm", "expected_version": att["version"], "note": "",
                "movement": {"reference": ref, "amount": half, "date": "2026-01-15", "bank_name": "AlRajhi"},
                "allocations": [{"transaction_id": tx["id"], "amount": half}]}
        r = supervisor.post(f"{BASE_URL}/api/reviews/{att['id']}/decide", json=body,
                            headers={"X-CSRF-Token": supervisor.cookies.get("csrf_token"), "Idempotency-Key": idem_key()})
        assert r.status_code == 200, r.text
        d = employee.get(f"{BASE_URL}/api/transactions/{tx['id']}").json()["transaction"]
        assert d["payment_status"] == "partially_paid"
        assert d["confirmed"] == half and d["remaining"] == total - half
        # Second receipt pays rest
        att2 = self._upload(employee, tx["id"], seed=21)
        ref2 = f"REF{uuid.uuid4().hex[:8].upper()}"
        body2 = {"decision": "confirm", "expected_version": att2["version"], "note": "",
                 "movement": {"reference": ref2, "amount": total - half, "date": "2026-01-16", "bank_name": "AlRajhi"},
                 "allocations": [{"transaction_id": tx["id"], "amount": total - half}]}
        r = supervisor.post(f"{BASE_URL}/api/reviews/{att2['id']}/decide", json=body2,
                            headers={"X-CSRF-Token": supervisor.cookies.get("csrf_token"), "Idempotency-Key": idem_key()})
        assert r.status_code == 200, r.text
        d = employee.get(f"{BASE_URL}/api/transactions/{tx['id']}").json()["transaction"]
        assert d["payment_status"] == "paid"
        assert d["remaining"] == 0

    def test_overpay_credit(self, employee, supervisor, new_tx):
        tx = new_tx(items=[{"description": "x", "qty": 1, "unit_price": 10000}])
        total = tx["total"]
        att = self._upload(employee, tx["id"], seed=30)
        ref = f"OVR{uuid.uuid4().hex[:8].upper()}"
        body = {"decision": "confirm", "expected_version": att["version"], "note": "",
                "movement": {"reference": ref, "amount": total + 500, "date": "2026-01-15"},
                "allocations": [{"transaction_id": tx["id"], "amount": total + 500}]}
        r = supervisor.post(f"{BASE_URL}/api/reviews/{att['id']}/decide", json=body,
                            headers={"X-CSRF-Token": supervisor.cookies.get("csrf_token"), "Idempotency-Key": idem_key()})
        assert r.status_code == 200
        d = employee.get(f"{BASE_URL}/api/transactions/{tx['id']}").json()["transaction"]
        assert d["payment_status"] == "overpaid" and d["credit"] == 500

    def test_duplicate_reference_409_case_space_insensitive(self, employee, supervisor, new_tx):
        tx1 = new_tx(items=[{"description": "x", "qty": 1, "unit_price": 10000}])
        tx2 = new_tx(items=[{"description": "x", "qty": 1, "unit_price": 10000}])
        a1 = self._upload(employee, tx1["id"], seed=40)
        a2 = self._upload(employee, tx2["id"], seed=41)
        ref = f"DUP{uuid.uuid4().hex[:6].upper()}"
        body1 = {"decision": "confirm", "expected_version": a1["version"], "note": "",
                 "movement": {"reference": ref, "amount": tx1["total"], "date": "2026-01-15"},
                 "allocations": [{"transaction_id": tx1["id"], "amount": tx1["total"]}]}
        r = supervisor.post(f"{BASE_URL}/api/reviews/{a1['id']}/decide", json=body1,
                            headers={"X-CSRF-Token": supervisor.cookies.get("csrf_token"), "Idempotency-Key": idem_key()})
        assert r.status_code == 200
        # Same ref with spaces + lowercase
        dup_ref = f"  {ref.lower()}  "
        body2 = {"decision": "confirm", "expected_version": a2["version"], "note": "",
                 "movement": {"reference": dup_ref, "amount": tx2["total"], "date": "2026-01-15"},
                 "allocations": [{"transaction_id": tx2["id"], "amount": tx2["total"]}]}
        r = supervisor.post(f"{BASE_URL}/api/reviews/{a2['id']}/decide", json=body2,
                            headers={"X-CSRF-Token": supervisor.cookies.get("csrf_token"), "Idempotency-Key": idem_key()})
        assert r.status_code == 409

    def test_not_seen_and_needs_attention(self, employee, supervisor, new_tx):
        tx = new_tx()
        att = self._upload(employee, tx["id"], seed=50)
        # needs_attention without note -> 400
        r = supervisor.post(f"{BASE_URL}/api/reviews/{att['id']}/decide",
                            json={"decision": "needs_attention", "expected_version": att["version"], "note": ""},
                            headers={"X-CSRF-Token": supervisor.cookies.get("csrf_token"), "Idempotency-Key": idem_key()})
        assert r.status_code == 400
        # not_seen succeeds
        r = supervisor.post(f"{BASE_URL}/api/reviews/{att['id']}/decide",
                            json={"decision": "not_seen", "expected_version": att["version"], "note": ""},
                            headers={"X-CSRF-Token": supervisor.cookies.get("csrf_token"), "Idempotency-Key": idem_key()})
        assert r.status_code == 200
        d = employee.get(f"{BASE_URL}/api/transactions/{tx['id']}").json()["transaction"]
        assert d["payment_status"] == "not_seen"

    def test_stale_version_409(self, employee, supervisor, new_tx):
        tx = new_tx()
        att = self._upload(employee, tx["id"], seed=60)
        # First decision bumps version
        r = supervisor.post(f"{BASE_URL}/api/reviews/{att['id']}/decide",
                            json={"decision": "not_seen", "expected_version": att["version"], "note": ""},
                            headers={"X-CSRF-Token": supervisor.cookies.get("csrf_token"), "Idempotency-Key": idem_key()})
        assert r.status_code == 200
        # Second with stale version
        r = supervisor.post(f"{BASE_URL}/api/reviews/{att['id']}/decide",
                            json={"decision": "needs_attention", "expected_version": att["version"], "note": "x"},
                            headers={"X-CSRF-Token": supervisor.cookies.get("csrf_token"), "Idempotency-Key": idem_key()})
        assert r.status_code == 409


# ---------- 7. Movement reversal ----------
class TestReversal:
    def test_reverse_movement(self, employee, supervisor, new_tx):
        tx = new_tx(items=[{"description": "x", "qty": 1, "unit_price": 10000}])
        total = tx["total"]
        files = {"file": ("r.png", _png_bytes(70), "image/png")}
        att = employee.post(f"{BASE_URL}/api/transactions/{tx['id']}/attachments", files=files,
                            headers={"X-CSRF-Token": employee.cookies.get("csrf_token"), "Idempotency-Key": idem_key()}).json()
        ref = f"REV{uuid.uuid4().hex[:8].upper()}"
        body = {"decision": "confirm", "expected_version": att["version"], "note": "",
                "movement": {"reference": ref, "amount": total, "date": "2026-01-15"},
                "allocations": [{"transaction_id": tx["id"], "amount": total}]}
        r = supervisor.post(f"{BASE_URL}/api/reviews/{att['id']}/decide", json=body,
                            headers={"X-CSRF-Token": supervisor.cookies.get("csrf_token"), "Idempotency-Key": idem_key()})
        assert r.status_code == 200
        mv_id = r.json()["movement_id"]
        # Reverse
        r = supervisor.post(f"{BASE_URL}/api/movements/{mv_id}/reverse", json={"reason": "خطأ في الحوالة"},
                            headers={"X-CSRF-Token": supervisor.cookies.get("csrf_token"), "Idempotency-Key": idem_key()})
        assert r.status_code == 200
        d = employee.get(f"{BASE_URL}/api/transactions/{tx['id']}").json()["transaction"]
        assert d["confirmed"] == 0 and d["payment_status"] in ("issued", "pending_review", "not_seen", "needs_attention")


# ---------- 8. Tenant isolation ----------
class TestTenantIsolation:
    def test_other_tenant_cannot_access(self, new_tx, employee_b):
        tx = new_tx()
        r = employee_b.get(f"{BASE_URL}/api/transactions/{tx['id']}")
        assert r.status_code == 404

    def test_superadmin_cannot_access_tenant_endpoint(self, superadmin):
        r = superadmin.get(f"{BASE_URL}/api/transactions")
        assert r.status_code == 403


# ---------- 9. Manager admin ----------
class TestManager:
    def test_weak_pin_rejected(self, manager):
        r = manager.post(f"{BASE_URL}/api/manager/users", json={
            "username": f"tst{uuid.uuid4().hex[:6]}", "name": "Test", "role": "employee", "pin": "123456"})
        assert r.status_code == 400

    def test_iban_validation(self, manager):
        r = manager.get(f"{BASE_URL}/api/manager/settings")
        assert r.status_code == 200
        cur = r.json()
        bad = manager.put(f"{BASE_URL}/api/manager/settings", json={
            "name": cur["name"], "iban": "SA123", "bank_name": cur.get("bank_name") or "x"})
        assert bad.status_code == 422
        good = manager.put(f"{BASE_URL}/api/manager/settings", json={
            "name": cur["name"], "iban": cur["iban"], "bank_name": cur.get("bank_name") or "x"})
        assert good.status_code == 200

    def test_audit_log(self, manager):
        r = manager.get(f"{BASE_URL}/api/manager/audit")
        assert r.status_code == 200 and isinstance(r.json(), list)


# ---------- 10. Superadmin ----------
class TestSuperadmin:
    def test_plans_and_tenants(self, superadmin):
        r = superadmin.get(f"{BASE_URL}/api/admin/plans")
        assert r.status_code == 200 and len(r.json()) >= 1
        r = superadmin.get(f"{BASE_URL}/api/admin/tenants")
        assert r.status_code == 200 and len(r.json()) >= 2

    def test_create_and_suspend_tenant(self, superadmin):
        plans = superadmin.get(f"{BASE_URL}/api/admin/plans").json()
        slug = f"test-{uuid.uuid4().hex[:6]}"
        uname = f"tmgr{uuid.uuid4().hex[:6]}"
        r = superadmin.post(f"{BASE_URL}/api/admin/tenants", json={
            "name": "TEST_Tenant", "slug": slug, "plan_id": plans[0]["id"],
            "manager_name": "Test Manager", "manager_username": uname, "manager_email": "m@x.com"})
        assert r.status_code == 200, r.text
        data = r.json()
        temp_pin = data["temporary_pin"]
        tid = data["tenant"]["id"]
        # Manager can log in
        s = requests.Session()
        rr = s.post(f"{BASE_URL}/api/auth/login", json={"username": uname, "pin": temp_pin})
        assert rr.status_code == 200
        # Suspend tenant
        r = superadmin.patch(f"{BASE_URL}/api/admin/tenants/{tid}", json={"status": "suspended"})
        assert r.status_code == 200
        # Manager now gets 403 on authed endpoint
        s.headers.update({"X-CSRF-Token": s.cookies.get("csrf_token")})
        rr = s.get(f"{BASE_URL}/api/auth/me")
        assert rr.status_code == 403

    def test_health_endpoint(self, superadmin):
        r = superadmin.get(f"{BASE_URL}/api/admin/health")
        assert r.status_code == 200
        data = r.json()
        assert data["connector"] == "MockDaftraConnector"
        assert isinstance(data["tenants"], list)


# ---------- 11. Daftra reconcile flow ----------
class TestDaftra:
    def _set_mode(self, superadmin, tenant_slug, mode):
        tenants = superadmin.get(f"{BASE_URL}/api/admin/tenants").json()
        t = next(x for x in tenants if x["slug"] == tenant_slug)
        r = superadmin.patch(f"{BASE_URL}/api/admin/tenants/{t['id']}", json={"daftra_mode": mode})
        assert r.status_code == 200
        return t["id"]

    def test_timeout_mode_creates_needs_reconciliation(self, superadmin, employee, supervisor, new_tx):
        self._set_mode(superadmin, "riyadh-plastics", "timeout")
        try:
            tx = new_tx(items=[{"description": "x", "qty": 1, "unit_price": 10000}])
            files = {"file": ("r.png", _png_bytes(80), "image/png")}
            att = employee.post(f"{BASE_URL}/api/transactions/{tx['id']}/attachments", files=files,
                                headers={"X-CSRF-Token": employee.cookies.get("csrf_token"), "Idempotency-Key": idem_key()}).json()
            ref = f"TMO{uuid.uuid4().hex[:8].upper()}"
            body = {"decision": "confirm", "expected_version": att["version"], "note": "",
                    "movement": {"reference": ref, "amount": tx["total"], "date": "2026-01-15"},
                    "allocations": [{"transaction_id": tx["id"], "amount": tx["total"]}]}
            r = supervisor.post(f"{BASE_URL}/api/reviews/{att['id']}/decide", json=body,
                                headers={"X-CSRF-Token": supervisor.cookies.get("csrf_token"), "Idempotency-Key": idem_key()})
            assert r.status_code == 200
            # wait for worker
            time.sleep(5)
            d = employee.get(f"{BASE_URL}/api/transactions/{tx['id']}").json()
            jobs = d["jobs"]
            assert any(j["status"] == "needs_reconciliation" for j in jobs), f"expected needs_reconciliation; got {[j['status'] for j in jobs]}"
            # Reconcile
            nr_job = next(j for j in jobs if j["status"] == "needs_reconciliation")
            r = supervisor.post(f"{BASE_URL}/api/jobs/{nr_job['id']}/reconcile",
                                headers={"X-CSRF-Token": supervisor.cookies.get("csrf_token")})
            assert r.status_code == 200
            # In timeout mode, document mock was saved pre-timeout but payment create was not reached in _run.
            # Reconcile will find the document mapping; payment may need another cycle. Both outcomes are valid.
            assert r.json()["status"] in ("done", "queued")
        finally:
            self._set_mode(superadmin, "riyadh-plastics", "ok")


# ---------- 12. File signed URL cross-check ----------
class TestFileSig:
    def test_signed_url_scoped_to_att(self, employee, new_tx):
        tx = new_tx()
        files = {"file": ("r.png", _png_bytes(90), "image/png")}
        att = employee.post(f"{BASE_URL}/api/transactions/{tx['id']}/attachments", files=files,
                            headers={"X-CSRF-Token": employee.cookies.get("csrf_token"), "Idempotency-Key": idem_key()}).json()
        r = employee.get(f"{BASE_URL}/api/attachments/{att['id']}/url")
        assert r.status_code == 200
        url = r.json()["url"]
        # Full download works
        r = requests.get(f"{BASE_URL}{url}")
        assert r.status_code == 200
        # Second attachment on different tx
        tx2 = new_tx()
        files2 = {"file": ("r.png", _png_bytes(91), "image/png")}
        att2 = employee.post(f"{BASE_URL}/api/transactions/{tx2['id']}/attachments", files=files2,
                             headers={"X-CSRF-Token": employee.cookies.get("csrf_token"), "Idempotency-Key": idem_key()}).json()
        # Use first sig for second att's id
        sig = url.split("sig=")[1]
        r = requests.get(f"{BASE_URL}/api/files/{att2['id']}?sig={sig}")
        assert r.status_code == 403


# ---------- 13. Email delivery (real Emergent-managed Resend; test addresses only) ----------
class TestEmailDelivery:
    """Only uses @resend.dev test inbox. Keeps send volume modest."""

    def _wait_email_status(self, employee, tx_id, target=("sent", "failed"), timeout=25):
        for _ in range(timeout):
            d = employee.get(f"{BASE_URL}/api/transactions/{tx_id}").json()["transaction"]
            if d.get("email_status") in target:
                return d
            time.sleep(1)
        return employee.get(f"{BASE_URL}/api/transactions/{tx_id}").json()["transaction"]

    def test_create_tx_background_emails_customer_link(self, employee, new_tx):
        tx = new_tx(email="delivered@resend.dev")
        # Initial state should be 'sending' (set synchronously in create_tx)
        assert tx.get("email_status") == "sending"
        final = self._wait_email_status(employee, tx["id"])
        assert final["email_status"] == "sent", f"expected 'sent', got {final.get('email_status')} err={final.get('email_error')}"

    def test_otp_endpoint_returns_masked_no_demo(self, new_tx):
        tx = new_tx(email="delivered@resend.dev")
        s = requests.Session()
        r = s.post(f"{BASE_URL}/api/public/links/{tx['public_token']}/otp")
        assert r.status_code == 200, r.text
        body = r.json()
        assert "demo_code" not in body, f"demo_code must NOT be in response: {body}"
        assert body.get("channel") == "email"
        assert "@" in body.get("sent_to", "")
        assert body["sent_to"].startswith("de")  # masked 'delivered@resend.dev' → 'de•••••••@resend.dev'

    def test_otp_rate_limit_5_per_hour(self, new_tx):
        tx = new_tx(email="delivered@resend.dev")
        s = requests.Session()
        # 5 requests should succeed (also sends emails, but all to resend.dev test inbox)
        for i in range(5):
            r = s.post(f"{BASE_URL}/api/public/links/{tx['public_token']}/otp")
            assert r.status_code == 200, f"attempt {i+1}: {r.status_code} {r.text}"
        r = s.post(f"{BASE_URL}/api/public/links/{tx['public_token']}/otp")
        assert r.status_code == 429, f"expected 429 on 6th request, got {r.status_code}"

    def test_resend_link_cooldown_429(self, employee, new_tx):
        tx = new_tx(email="delivered@resend.dev")
        # wait for initial email to settle
        self._wait_email_status(employee, tx["id"])
        r1 = employee.post(f"{BASE_URL}/api/transactions/{tx['id']}/send-link")
        assert r1.status_code == 200, r1.text
        r2 = employee.post(f"{BASE_URL}/api/transactions/{tx['id']}/send-link")
        assert r2.status_code == 429, f"expected 429 cooldown, got {r2.status_code}"

    def test_resend_link_cross_tenant_404(self, new_tx, employee_b):
        tx = new_tx(email="delivered@resend.dev")
        r = employee_b.post(f"{BASE_URL}/api/transactions/{tx['id']}/send-link")
        assert r.status_code == 404

    def test_delegate_max_5_accountants_429(self, new_tx):
        tx = new_tx(email="delivered@resend.dev")
        from test_wathiq_api import TestPublic
        s = TestPublic()._otp_session(tx["public_token"])
        for i in range(5):
            r = s.post(f"{BASE_URL}/api/public/session/delegate",
                       json={"email": f"delivered+acc{i}_{uuid.uuid4().hex[:4]}@resend.dev"},
                       headers={"X-CSRF-Token": s.cookies.get("csrf_token")})
            assert r.status_code == 200, f"attempt {i+1}: {r.status_code} {r.text}"
            assert "token" not in r.json()
        r = s.post(f"{BASE_URL}/api/public/session/delegate",
                   json={"email": f"delivered+acc6_{uuid.uuid4().hex[:4]}@resend.dev"},
                   headers={"X-CSRF-Token": s.cookies.get("csrf_token")})
        assert r.status_code == 429, f"expected 429 on 6th accountant, got {r.status_code}"

