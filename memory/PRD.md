# وَثيق (Wathiq) — PRD

## Original problem statement
منصة المصانع — التحصيل والسداد والتكامل مع دفترة. Multi-tenant web SaaS (RTL/Arabic) that replaces scattered WhatsApp quotes/receipts with one transaction file: employee issues a quote → customer or their accountant uploads the transfer receipt → supervisor confirms money arrival → employee sees the result live → correct document posts to Daftra. Each factory lives in its own isolated environment. v1 = thin hardened pilot (sales/collection core). Hardened invariants: allocation ledger only source of confirmed money; uploads/GET never create payments; POST+CSRF+idempotency on money actions; no double-confirm; no duplicate bank movement; full tenant isolation; post-confirmation edits = new version + re-review; post-sync correction = reversal; Daftra failures → needs_reconciliation, never blind retry; QR is not ZATCA QR; quote vs invoice unmistakable. (Full text in first user message.)

## User choices
- Login: username + 6-digit PIN (agent advised: bcrypt, lockout 5 fails/15 min, weak PINs rejected)
- Email OTP: real email via Emergent-managed Resend (was mocked in v1)
- File storage: "local server" → implemented in MongoDB GridFS (pod disk is lost when deployed)
- Daftra: mocked connector behind interface until API key arrives
- Product name: وَثيق

## Architecture
- FastAPI modular monolith: core.py (tenant-scoped DAL `Scoped`, JWT cookies, CSRF double-submit, idempotency, SSE pub/sub, file sniff/scan), routes_auth, routes_tx, routes_review, routes_public, routes_manager, routes_admin, ledger.py, daftra.py (connector interface + Mock + outbox worker + reconcile), attachments.py (GridFS + signed 5-min URLs), seed.py (indexes + demo tenants)
- MongoDB standalone (no replica set) → atomic confirm = CAS claim on attachment version + compensating rollback; unique indexes (tenant+bank reference, tenant+tx+sha256, job idempotency key, daftra mapping)
- Money in integer halalas; VAT 15%
- React (JS) RTL, IBM Plex Sans Arabic self-hosted via @fontsource, shadcn, qrcode.react; SSE + polling fallback

## Personas
Employee (issues quotes), Supervisor (confirms money remotely), Factory manager (users/settings/audit), Super-admin (tenants/plans/integration health, no financial access), Customer & accountant (public link + OTP).

## Implemented (2026-10-11)
- PIN login for 4 roles, lockout, refresh, logout
- Quote/invoice issue (no approval), link + QR + print/PDF page, WhatsApp share, convert quote→invoice
- Public customer page: OTP (mocked), document, IBAN copy, upload receipt, status, accountant delegation (scoped to one tx)
- Supervisor review: confirm (amount, reference, date, split allocations across docs of same customer) / not seen / needs attention; partial / paid / overpaid / advance states; duplicate receipt & reference detection; stale version 409
- Live employee updates + notifications bell
- Edit → new version + re-review; movement reversal via negative allocations
- Daftra mock: posting matrix, jobs, Sync button, reconcile by reference; superadmin can simulate timeout/down/error
- Manager: users (add/deactivate/reset PIN), settings (IBAN validation), audit log, dashboard
- Super-admin: tenants create (temp manager PIN), suspend, plans, subscription period, integration health
- Testing: 33/33 backend tests passed, frontend smoke passed (iteration_1)

## Implemented (2026-10-12)
- Real email (Emergent-managed Resend, backend/mailer.py with safety gate + fixed Arabic RTL templates): customer link emailed automatically on issue (email_status sending/sent/failed shown in SharePanel + resend button with 60s cooldown), OTP code emailed (no longer returned in API), accountant delegation link emailed (max 5 per transaction, can't reuse customer email)
- Provider throttling (429) → 503 with Arabic message; background link email retries once after 30s
- Testing iteration_2: 37/40 passed; 3 failures were from the email provider's rate limit during the test run (now handled as 503), not app logic
- Env: EMERGENT_EMAIL_KEY, EMAIL_FROM_NAME=وثيق, PUBLIC_APP_URL (must be updated to the production domain on deploy)

## Backlog
- P0: Live Daftra API wiring + confirm posting matrix against real API
- P1: Replace scan stub with ClamAV, HEIC preview conversion, KSA in-Kingdom hosting, MongoDB replica set for true multi-doc transactions
- P2 (phase 2): purchasing/supplier cycle, OCR, bank statement matching, payment gateway, permanent customer portal, SMS/WhatsApp OTP

## Next tasks
- Collect Daftra API credentials; set PUBLIC_APP_URL to production domain at deploy
