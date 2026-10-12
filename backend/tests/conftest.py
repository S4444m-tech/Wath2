import os
import time
import uuid
import hashlib
import pytest
import requests
import bcrypt
from datetime import datetime, timezone, timedelta
from pymongo import MongoClient

MONGO_URL = os.environ.get("MONGO_URL") or "mongodb://localhost:27017"
DB_NAME = os.environ.get("DB_NAME") or "test_database"
_mongo = MongoClient(MONGO_URL)[DB_NAME]


def insert_known_otp(token: str, code: str = "135246") -> str:
    """Insert a bcrypt-hashed OTP directly in MongoDB for a public link token.

    Returns the inserted code. The latest unused OTP wins at verify time.
    """
    tok_hash = hashlib.sha256(token.encode()).hexdigest()
    link = _mongo.public_links.find_one({"token_hash": tok_hash})
    assert link, f"no public_link for token_hash {tok_hash}"
    now = datetime.now(timezone.utc)
    _mongo.otps.insert_one({
        "link_id": link["id"],
        "code_hash": bcrypt.hashpw(code.encode(), bcrypt.gensalt(rounds=10)).decode(),
        "attempts": 0,
        "used": False,
        "expires_at": (now + timedelta(minutes=10)).isoformat().replace("+00:00", "Z"),
        "created_at": now.isoformat().replace("+00:00", "Z"),
    })
    return code

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://sadad-flow.preview.emergentagent.com").rstrip("/")


def _login(username: str, pin: str) -> requests.Session:
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"username": username, "pin": pin}, timeout=30)
    assert r.status_code == 200, f"login {username} failed: {r.status_code} {r.text}"
    csrf = s.cookies.get("csrf_token")
    assert csrf, "csrf cookie missing after login"
    s.headers.update({"X-CSRF-Token": csrf})
    return s


def upload_file(session, url, file_tuple, extra_headers=None):
    """Multipart upload that bypasses any default session Content-Type."""
    headers = {"X-CSRF-Token": session.cookies.get("csrf_token"), "Idempotency-Key": idem_key()}
    if extra_headers:
        headers.update(extra_headers)
    return session.post(url, files={"file": file_tuple}, headers=headers)


def idem_key(prefix: str = "k") -> str:
    return f"{prefix}-{uuid.uuid4().hex[:16]}"


@pytest.fixture(scope="session")
def base_url():
    return BASE_URL


@pytest.fixture
def anon():
    return requests.Session()


@pytest.fixture
def employee():
    return _login("r.employee", "314159")


@pytest.fixture
def supervisor():
    return _login("r.supervisor", "246802")


@pytest.fixture
def manager():
    return _login("r.manager", "135791")


@pytest.fixture
def superadmin():
    return _login("admin", "246810")


@pytest.fixture
def employee_b():
    return _login("j.employee", "271828")


@pytest.fixture
def supervisor_b():
    return _login("j.supervisor", "161803")


@pytest.fixture
def new_tx(employee):
    """Create a fresh TEST_ invoice (default) and return its payload."""
    def _mk(doc_type="invoice", email=None, items=None, name_suffix=""):
        payload = {
            "doc_type": doc_type,
            "customer": {
                "name": f"TEST_شركة_{uuid.uuid4().hex[:6]}{name_suffix}",
                "email": email or f"test_{uuid.uuid4().hex[:6]}@example.com",
                "phone": "0500000000",
            },
            "items": items or [{"description": "منتج تجريبي", "qty": 2, "unit_price": 10000}],
            "notes": "",
            "due_date": "",
        }
        r = employee.post(f"{BASE_URL}/api/transactions", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        return r.json()
    return _mk
