import os
import re
import asyncio
import ipaddress
import logging
import httpx
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlparse
from fastapi import HTTPException
from core import db

logger = logging.getLogger("mailer")

EMAIL_BASE_URL = "https://integrations.emergentagent.com"
EMAIL_KEY = os.environ["EMERGENT_EMAIL_KEY"]
EMAIL_FROM_NAME = os.environ["EMAIL_FROM_NAME"]
EMAIL_REPLY_TO = os.environ.get("EMAIL_REPLY_TO")
APP_URL = os.environ["PUBLIC_APP_URL"].rstrip("/")

_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "goo.gl", "rebrand.ly")
_CRED_ASK = ("reply with your password", "reply with the code", "send your password", "cvv",
             "send us your password", "enter your password below", "confirm your card number",
             "your full card number", "seed phrase", "recovery phrase", "verify your card",
             "social security number", "confirm your bank details")
_HOSTISH = re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", re.I)


def _host_ok(host: str) -> bool:
    if not host or "xn--" in host:
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)


def _same_site(shown: str, real: str) -> bool:
    return shown == real or real.endswith("." + shown) or shown.endswith("." + real)


class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls, self.anchors = set(), [], []
        self._href, self._text = None, []

    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]
        if tag.lower() == "a":
            self._href = dict((k.lower(), v) for k, v in attrs).get("href")
            self._text = []

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.anchors.append((self._href, "".join(self._text)))
            self._href, self._text = None, []


def _assert_safe_email(subject: str, html: str) -> None:
    scan = _EmailScan()
    scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms or input fields in email (G2)")
    body = f"{subject}\n{html}".lower()
    for p in _CRED_ASK:
        if p in body:
            raise ValueError(f"Email asks the recipient for credentials: {p!r} (G2)")
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")):
            continue
        if not low.startswith("https://"):
            raise ValueError(f"Email links/assets must be absolute https: {url!r} (G3)")
        host = urlparse(low).hostname or ""
        if not _host_ok(host) or urlparse(low).username is not None:
            raise ValueError(f"Shortened, numeric-host or credential-bearing URL: {url!r} (G3)")
    for href, text in scan.anchors:
        real = urlparse(href.strip().lower()).hostname or ""
        if not real:
            continue
        for m in _HOSTISH.finditer(text):
            if not _same_site(m.group(1).lower(), real):
                raise ValueError(f"Anchor text {m.group(1)!r} ≠ real link host {real!r} (G3)")


async def send_email(*, to: str, subject: str, html: str) -> str | None:
    _assert_safe_email(subject, html)
    payload = {"to": [to], "subject": subject, "html": html, "from_name": EMAIL_FROM_NAME}
    if EMAIL_REPLY_TO:
        payload["contact_email"] = EMAIL_REPLY_TO
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(f"{EMAIL_BASE_URL}/api/v1/email/send", headers={"X-Email-Key": EMAIL_KEY}, json=payload)
        resp.raise_for_status()
        return resp.json().get("id")
    except httpx.HTTPStatusError as e:
        try:
            code = e.response.json().get("code", "")
        except ValueError:
            code = ""
        if code == "rate_limited" or e.response.status_code == 429:
            logger.warning(f"Email throttled: {e.response.text}")
            raise HTTPException(503, "ضغط مؤقت على خدمة البريد، حاول بعد دقيقة")
        if code in ("insufficient_credits", "integration_disabled", "daily_limit_reached"):
            logger.warning(f"Email paused: {code} ({e.response.status_code}): {e.response.text}")
            raise HTTPException(503, "خدمة البريد غير متاحة مؤقتاً")
        logger.error(f"Email send failed: {e.response.status_code} {e.response.text}")
        raise HTTPException(502, "تعذّر إرسال البريد")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Email send error: {e}")
        raise HTTPException(500, "تعذّر إرسال البريد")


# --- fixed server-side templates (all interpolation escaped) ---
def _wrap(factory: str, inner: str) -> str:
    return (
        '<table role="presentation" width="100%" dir="rtl" style="background:#F5F7FA;padding:24px 0">'
        '<tr><td align="center"><table role="presentation" width="560" style="max-width:560px;background:#ffffff;'
        'border:1px solid #E2E8F0;border-radius:12px;font-family:Tahoma,Arial,sans-serif;color:#172B36;text-align:right">'
        f'<tr><td style="background:#123E52;color:#ffffff;padding:16px 24px;border-radius:12px 12px 0 0;font-size:16px;font-weight:bold">{escape(factory)}</td></tr>'
        f'<tr><td style="padding:24px;font-size:14px;line-height:1.8">{inner}</td></tr>'
        f'<tr><td style="padding:16px 24px;border-top:1px solid #E2E8F0;font-size:11px;color:#5A6E7F">أُرسلت عبر منصة {escape(EMAIL_FROM_NAME)}. '
        'لن نطلب منك أبداً كلمة مرور أو بيانات بطاقة عبر البريد. إذا لم تكن تتوقع هذه الرسالة يمكنك تجاهلها.</td></tr>'
        '</table></td></tr></table>'
    )


def _button(url: str, label: str) -> str:
    return (f'<p style="margin:24px 0"><a href="{escape(url)}" style="background:#137C83;color:#ffffff;padding:12px 24px;'
            f'border-radius:8px;text-decoration:none;font-weight:bold">{escape(label)}</a></p>')


def doc_label(doc_type):
    return "عرض السعر" if doc_type == "quote" else "الفاتورة"


async def send_otp(to, factory, number, code):
    inner = (f'<p>رمز التحقق لفتح {escape(number)}:</p>'
             f'<p style="font-size:30px;font-weight:bold;letter-spacing:8px;color:#123E52;direction:ltr;text-align:center">{escape(code)}</p>'
             '<p>أدخل الرمز في صفحة المعاملة. صلاحية الرمز 10 دقائق ويُستخدم مرة واحدة.</p>')
    return await send_email(to=to, subject=f"رمز التحقق {number} — {factory}", html=_wrap(factory, inner))


async def send_tx_link(to, factory, tx, token):
    url = f"{APP_URL}/p/{token}"
    inner = (f'<p>مرحباً {escape(tx["customer"]["name"])}،</p>'
             f'<p>أصدر {escape(factory)} {doc_label(tx["doc_type"])} رقم <strong>{escape(tx["number"])}</strong> '
             f'بإجمالي <strong>{tx["total"] / 100:,.2f} ر.س</strong>.</p>'
             '<p>من صفحة المعاملة يمكنك عرض المستند، نسخ رقم الآيبان، ورفع إيصال التحويل ومتابعة حالته.</p>'
             f'{_button(url, "فتح المعاملة")}'
             '<p style="font-size:12px;color:#5A6E7F">سيُطلب منك رمز تحقق يُرسل إلى بريدك عند فتح الرابط.</p>')
    return await send_email(to=to, subject=f"{doc_label(tx['doc_type'])} {tx['number']} من {factory}", html=_wrap(factory, inner))


async def send_delegation(to, factory, tx, token, customer_name):
    url = f"{APP_URL}/p/{token}"
    inner = (f'<p>قام {escape(customer_name)} بتفويضك لرفع إيصال التحويل الخاص بـ{doc_label(tx["doc_type"])} '
             f'<strong>{escape(tx["number"])}</strong> لدى {escape(factory)}.</p>'
             '<p>صلاحيتك محصورة في هذه المعاملة فقط.</p>'
             f'{_button(url, "فتح المعاملة")}')
    return await send_email(to=to, subject=f"تفويض لرفع إيصال {tx['number']} — {factory}", html=_wrap(factory, inner))


async def track_tx_link(tenant_id, tx, token, factory):
    """Send the customer link and record delivery status on the transaction."""
    try:
        try:
            eid = await send_tx_link(tx["customer"]["email"], factory, tx, token)
        except HTTPException as e:
            if e.status_code != 503:
                raise
            await asyncio.sleep(30)
            eid = await send_tx_link(tx["customer"]["email"], factory, tx, token)
        upd = {"email_status": "sent", "email_id": eid, "email_error": None}
    except HTTPException as e:
        upd = {"email_status": "failed", "email_error": e.detail}
    except Exception as e:
        logger.error(f"link email error: {e}")
        upd = {"email_status": "failed", "email_error": "تعذّر إرسال البريد"}
    await db.transactions.update_one({"tenant_id": tenant_id, "id": tx["id"]}, {"$set": upd})
