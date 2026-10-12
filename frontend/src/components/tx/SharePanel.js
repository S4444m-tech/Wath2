import { QRCodeSVG } from "qrcode.react";
import { Link } from "react-router-dom";
import { useState } from "react";
import { Printer, ExternalLink, Mail, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "@/lib/api";
import { Card } from "@/components/Layout";
import { CopyText } from "@/components/CopyIban";
import { dt } from "@/lib/format";

const EMAIL = { sending: ["جارِ إرسال البريد…", "text-sky-700"], sent: ["تم إرسال الرابط بالبريد", "text-emerald-700"], failed: ["فشل إرسال البريد", "text-rose-600"] };

function EmailStatus({ tx, reload }) {
  const [busy, setBusy] = useState(false);
  const [label, cls] = EMAIL[tx.email_status] || ["لم يُرسل بالبريد", "text-[#5A6E7F]"];
  const resend = async () => {
    setBusy(true);
    try {
      await api.post(`/transactions/${tx.id}/send-link`);
      toast.success("تم إرسال الرابط إلى بريد العميل");
      reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#E2E8F0] pt-3 text-xs">
      <span className={cls} data-testid="email-status">{label}{tx.email_status === "failed" && tx.email_error ? ` — ${tx.email_error}` : ""}</span>
      <button onClick={resend} disabled={busy} data-testid="resend-link-btn" className="inline-flex items-center gap-1 rounded-lg border border-[#E2E8F0] px-3 py-1.5 hover:bg-[#F5F7FA] disabled:opacity-60">
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} />} إعادة الإرسال بالبريد
      </button>
    </div>
  );
}

export function SharePanel({ tx, link, delegations, reload }) {
  if (!link) return null;
  const wa = `https://wa.me/?text=${encodeURIComponent(`${tx.doc_type === "quote" ? "عرض السعر" : "الفاتورة"} ${tx.number}: ${link}`)}`;
  return (
    <Card title="رابط المعاملة للعميل" testid="share-panel">
      <div className="flex items-start gap-4">
        <QRCodeSVG value={link} size={112} fgColor="#123E52" data-testid="share-qr" />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-xs text-[#5A6E7F]">يفتح العميل الرابط ويتحقق برمز يُرسل إلى {tx.customer.email}</p>
          <div dir="ltr" className="truncate rounded-lg bg-[#F5F7FA] px-2 py-1.5 font-mono text-[11px] text-[#123E52]" data-testid="share-link">{link}</div>
          <div className="flex flex-wrap gap-2">
            <CopyText value={link} label="نسخ الرابط" testid="copy-link-btn" />
            <a href={wa} target="_blank" rel="noreferrer" data-testid="share-whatsapp-btn" className="inline-flex items-center gap-1 rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-xs hover:bg-[#F5F7FA]"><ExternalLink size={13} /> واتساب</a>
            <Link to={`/print/${tx.id}`} target="_blank" data-testid="print-pdf-btn" className="inline-flex items-center gap-1 rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-xs hover:bg-[#F5F7FA]"><Printer size={13} /> PDF / طباعة</Link>
          </div>
        </div>
      </div>
      <EmailStatus tx={tx} reload={reload} />
      {delegations?.length > 0 && (
        <div className="mt-4 border-t border-[#E2E8F0] pt-3 text-xs text-[#5A6E7F]">
          <div className="mb-1 font-semibold text-[#172B36]">محاسبون مفوّضون (لهذه المعاملة فقط)</div>
          {delegations.map((d, i) => <div key={i} data-testid={`delegation-${i}`}>{d.email} · {dt(d.created_at)}</div>)}
        </div>
      )}
    </Card>
  );
}
