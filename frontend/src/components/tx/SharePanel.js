import { QRCodeSVG } from "qrcode.react";
import { Link } from "react-router-dom";
import { Printer, ExternalLink } from "lucide-react";
import { Card } from "@/components/Layout";
import { CopyText } from "@/components/CopyIban";
import { dt } from "@/lib/format";

export function SharePanel({ tx, link, delegations }) {
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
      {delegations?.length > 0 && (
        <div className="mt-4 border-t border-[#E2E8F0] pt-3 text-xs text-[#5A6E7F]">
          <div className="mb-1 font-semibold text-[#172B36]">محاسبون مفوّضون (لهذه المعاملة فقط)</div>
          {delegations.map((d, i) => <div key={i} data-testid={`delegation-${i}`}>{d.email} · {dt(d.created_at)}</div>)}
        </div>
      )}
    </Card>
  );
}
