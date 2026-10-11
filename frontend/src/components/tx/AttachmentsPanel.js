import { FileImage, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, Empty } from "@/components/Layout";
import { StatusBadge } from "@/components/StatusBadge";
import { openAttachment } from "@/components/UploadBox";
import { dt } from "@/lib/format";

const WHO = { customer: "العميل", accountant: "المحاسب", user: "موظف" };

export function AttachmentsPanel({ atts, user }) {
  const reviewer = ["supervisor", "manager"].includes(user.role);
  return (
    <Card title={`إيصالات التحويل (${atts.length})`} testid="attachments-panel">
      {atts.length === 0 ? <Empty>لم يُرفع أي إيصال بعد</Empty> : (
        <ul className="divide-y divide-[#F1F5F9]">
          {atts.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3" data-testid={`attachment-${a.id}`}>
              <button onClick={() => openAttachment(a.id)} className="flex min-w-0 items-center gap-3 text-right" data-testid={`open-attachment-${a.id}`}>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#F5F7FA] text-[#137C83]"><FileImage size={18} /></span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium hover:underline">{a.filename}</span>
                  <span className="block text-xs text-[#5A6E7F]">{WHO[a.uploader.type] || a.uploader.type}: {a.uploader.name} · {dt(a.created_at)}</span>
                  {a.duplicate_of && <span className="mt-0.5 flex items-center gap-1 text-[11px] text-rose-600"><AlertTriangle size={12} /> نفس الملف مرفوع على {a.duplicate_of}</span>}
                  {a.review_note && <span className="block text-[11px] text-amber-700">ملاحظة المشرف: {a.review_note}</span>}
                </span>
              </button>
              <div className="flex items-center gap-2">
                <StatusBadge status={a.status} kind="att" testid={`attachment-status-${a.id}`} />
                {reviewer && ["pending_review", "not_seen", "needs_attention"].includes(a.status) && (
                  <Link to={`/app/reviews/${a.id}`} data-testid={`review-attachment-${a.id}`} className="rounded-lg bg-[#137C83] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0f6369]">مراجعة</Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
