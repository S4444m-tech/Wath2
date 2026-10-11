import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { ShieldCheck, Loader2, Mail, UserPlus, FileImage } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { api, errMsg } from "@/lib/api";
import { money, dt } from "@/lib/format";
import { PinInput } from "@/components/PinInput";
import { DocumentSheet } from "@/components/DocumentSheet";
import { UploadBox } from "@/components/UploadBox";
import { StatusBadge } from "@/components/StatusBadge";
import { CopyText } from "@/components/CopyIban";
import { Card } from "@/components/Layout";

const Frame = ({ children, factory }) => (
  <div className="min-h-screen bg-[#F5F7FA]">
    <header className="border-b border-[#E2E8F0] bg-white">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
        <div className="text-sm font-semibold text-[#123E52]">{factory}</div>
        <div className="flex items-center gap-1.5 text-xs text-[#5A6E7F]"><span className="grid h-6 w-6 place-items-center rounded-md bg-[#123E52] text-xs font-bold text-white">و</span> عبر وَثيق</div>
      </div>
    </header>
    <main className="mx-auto max-w-4xl px-4 py-6 sm:py-10">{children}</main>
  </div>
);

function OtpStep({ token, meta, onVerified }) {
  const [sent, setSent] = useState(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const request = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/public/links/${token}/otp`);
      setSent(data);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  const verify = async () => {
    setBusy(true);
    try {
      await api.post(`/public/links/${token}/verify`, { code });
      onVerified();
    } catch (e) {
      toast.error(errMsg(e));
      setCode("");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="fade-up mx-auto max-w-md rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-sm sm:p-8" data-testid="otp-step">
      <ShieldCheck className="text-[#137C83]" size={34} />
      <h1 className="mt-3 text-2xl font-bold">{meta.doc_type === "quote" ? "عرض سعر" : "فاتورة"} {meta.number}</h1>
      <p className="mt-2 text-sm text-[#5A6E7F]">{meta.role === "accountant" ? "تم تفويضك كمحاسب لهذه المعاملة فقط." : "لحماية بياناتك"} سنرسل رمز تحقق إلى <span dir="ltr" className="font-mono">{meta.email_masked}</span></p>
      {!sent ? (
        <button onClick={request} disabled={busy} data-testid="otp-request-btn" className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#123E52] font-semibold text-white disabled:opacity-60">
          {busy ? <Loader2 className="animate-spin" size={18} /> : <Mail size={18} />} أرسل رمز التحقق
        </button>
      ) : (
        <div className="mt-6 space-y-4">
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900" data-testid="otp-demo-banner">نسخة تجريبية (MOCKED): البريد غير مفعّل بعد. الرمز: <b className="font-mono text-base" data-testid="otp-demo-code">{sent.demo_code}</b></div>
          <PinInput value={code} onChange={setCode} testid="otp-input" autoFocus />
          <button onClick={verify} disabled={busy || code.length !== 6} data-testid="otp-verify-btn" className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#123E52] font-semibold text-white disabled:opacity-50">
            {busy && <Loader2 className="animate-spin" size={18} />} تحقق وافتح المستند
          </button>
          <button onClick={request} className="w-full text-xs text-[#137C83] hover:underline" data-testid="otp-resend-btn">إعادة إرسال الرمز</button>
        </div>
      )}
    </div>
  );
}

function StatusCard({ tx }) {
  return (
    <Card testid="public-status-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs text-[#5A6E7F]">حالة الدفع</div>
          <div className="mt-1"><StatusBadge status={tx.payment_status} testid="public-payment-status" /></div>
        </div>
        <div className="grid grid-cols-3 gap-4 text-center text-sm">
          <div><div className="text-xs text-[#5A6E7F]">الإجمالي</div><div className="font-bold tabular-nums">{money(tx.total)}</div></div>
          <div><div className="text-xs text-[#5A6E7F]">المؤكد</div><div className="font-bold tabular-nums text-emerald-700" data-testid="public-confirmed">{money(tx.confirmed)}</div></div>
          <div><div className="text-xs text-[#5A6E7F]">المتبقي</div><div className="font-bold tabular-nums text-amber-700" data-testid="public-remaining">{money(tx.remaining)}</div></div>
        </div>
      </div>
      {tx.has_pending && <p className="mt-3 text-xs text-sky-700">يوجد إيصال قيد المراجعة لدى المصنع.</p>}
    </Card>
  );
}

function Delegate() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [link, setLink] = useState(null);
  const go = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.post("/public/session/delegate", { email, name });
      setLink(`${window.location.origin}/p/${data.token}`);
    } catch (e2) {
      toast.error(errMsg(e2));
    }
  };
  return (
    <Card title="تفويض المحاسب" testid="delegate-card">
      <p className="mb-3 text-xs text-[#5A6E7F]">يحصل المحاسب على صلاحية رفع الإيصال لهذه المعاملة فقط — دون الاطلاع على أي معاملات أخرى.</p>
      {link ? (
        <div className="space-y-2" data-testid="delegate-result">
          <p className="text-xs text-amber-800">نسخة تجريبية (MOCKED): في الإصدار النهائي يُرسل الرابط إلى بريد المحاسب.</p>
          <div dir="ltr" className="truncate rounded-lg bg-[#F5F7FA] p-2 font-mono text-[11px]" data-testid="delegate-link">{link}</div>
          <CopyText value={link} label="نسخ رابط المحاسب" testid="copy-delegate-link" />
        </div>
      ) : (
        <form onSubmit={go} className="space-y-2">
          <Input placeholder="اسم المحاسب" value={name} onChange={(e) => setName(e.target.value)} data-testid="delegate-name-input" />
          <Input required type="email" dir="ltr" placeholder="accountant@company.sa" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="delegate-email-input" />
          <button className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-[#137C83] text-sm font-semibold text-[#137C83] hover:bg-[#137C83] hover:text-white" data-testid="delegate-submit-btn"><UserPlus size={16} /> تفويض</button>
        </form>
      )}
    </Card>
  );
}

export default function PublicPortal() {
  const { token } = useParams();
  const [meta, setMeta] = useState(null);
  const [err, setErr] = useState("");
  const [s, setS] = useState(null);

  const loadSession = useCallback(async (m) => {
    try {
      const { data } = await api.get("/public/session");
      if (data.transaction.number === m.number && data.role === m.role) return setS(data);
    } catch {}
    setS(false);
  }, []);

  useEffect(() => {
    api.get(`/public/links/${token}`).then((r) => {
      setMeta(r.data);
      loadSession(r.data);
    }).catch((e) => setErr(errMsg(e)));
  }, [token, loadSession]);

  useEffect(() => {
    if (!s || !meta) return;
    const t = setInterval(() => loadSession(meta), 10000);
    return () => clearInterval(t);
  }, [s, meta, loadSession]);

  if (err) return <Frame><div className="rounded-xl border border-rose-200 bg-white p-8 text-center text-rose-700" data-testid="public-error">{err}</div></Frame>;
  if (!meta || s === null) return <Frame><div className="h-40 animate-pulse rounded-xl bg-white" /></Frame>;
  if (!s) return <Frame factory={meta.factory}><OtpStep token={token} meta={meta} onVerified={() => loadSession(meta)} /></Frame>;

  const tx = s.transaction;
  return (
    <Frame factory={meta.factory}>
      <div className="fade-up space-y-5" data-testid="public-session">
        <StatusCard tx={tx} />
        <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
          <DocumentSheet tx={tx} factory={s.factory} />
          <div className="space-y-5">
            <Card title="رفع إيصال التحويل"><UploadBox url="/public/session/upload" onDone={() => loadSession(meta)} testid="public-upload" /></Card>
            {s.attachments.length > 0 && (
              <Card title="الإيصالات المرفوعة">
                <ul className="space-y-2">
                  {s.attachments.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-2 text-sm" data-testid={`public-attachment-${a.id}`}>
                      <a href={`${process.env.REACT_APP_BACKEND_URL}${a.url}`} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-2 hover:underline"><FileImage size={16} className="shrink-0 text-[#137C83]" /><span className="truncate">{a.filename}</span></a>
                      <StatusBadge status={a.status} kind="att" />
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[11px] text-[#5A6E7F]">آخر تحديث {dt(new Date().toISOString())}</p>
              </Card>
            )}
            {s.role === "customer" && <Delegate />}
          </div>
        </div>
      </div>
    </Frame>
  );
}
