import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { api } from "@/lib/api";
import { money, dt } from "@/lib/format";
import { useLive } from "@/hooks/useLive";
import { StatusBadge, DocChip } from "@/components/StatusBadge";
import { PageHeader, Empty, Loading } from "@/components/Layout";

const TABS = [["pending_review", "بانتظار المراجعة"], ["not_seen", "لم يظهر بعد"], ["needs_attention", "يحتاج انتباه"], ["all", "الكل"]];

export default function Reviews() {
  const [tab, setTab] = useState("pending_review");
  const [items, setItems] = useState(null);
  const load = useCallback(() => api.get("/reviews", { params: { status: tab } }).then((r) => setItems(r.data)), [tab]);
  useEffect(() => {
    setItems(null);
    load();
  }, [load]);
  useLive(load);
  return (
    <div className="fade-up">
      <PageHeader title="مراجعة الإيصالات" sub="تحقق من وصول المبلغ فعلياً في الحساب البنكي قبل التأكيد" testid="reviews-title" />
      <div className="mb-4 flex gap-2 overflow-x-auto">
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} data-testid={`reviews-tab-${k}`} className={`whitespace-nowrap rounded-full border px-4 py-1.5 text-sm ${tab === k ? "border-[#123E52] bg-[#123E52] text-white" : "border-[#E2E8F0] bg-white text-[#5A6E7F]"}`}>{l}</button>
        ))}
      </div>
      {!items ? <Loading /> : items.length === 0 ? <Empty>لا توجد إيصالات في هذه القائمة</Empty> : (
        <div className="grid gap-3 md:grid-cols-2" data-testid="reviews-list">
          {items.map((a) => (
            <Link key={a.id} to={["pending_review", "not_seen", "needs_attention"].includes(a.status) ? `/app/reviews/${a.id}` : `/app/transactions/${a.transaction.id}`} data-testid={`review-card-${a.id}`} className="rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-sm transition-colors hover:border-[#137C83]">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2"><DocChip type={a.transaction.doc_type} /><span className="font-mono text-sm font-semibold">{a.transaction.number}</span></div>
                <StatusBadge status={a.status} kind="att" />
              </div>
              <div className="mt-2 text-sm">{a.transaction.customer?.name}</div>
              <div className="mt-1 flex justify-between text-xs text-[#5A6E7F]">
                <span>المتبقي: <b className="tabular-nums text-[#172B36]">{money(a.transaction.remaining)}</b> من {money(a.transaction.total)}</span>
                <span>{dt(a.created_at)}</span>
              </div>
              <div className="mt-1 text-xs text-[#5A6E7F]">رفعه: {a.uploader.name}</div>
              {a.duplicate_of && <div className="mt-2 flex items-center gap-1 text-xs text-rose-600"><AlertTriangle size={13} /> نفس الملف مرفوع على {a.duplicate_of}</div>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
