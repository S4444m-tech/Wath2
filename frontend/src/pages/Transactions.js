import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { Plus, Search, ChevronLeft } from "lucide-react";
import { api } from "@/lib/api";
import { money, d, PAY_STATUS } from "@/lib/format";
import { useAuth } from "@/context/AuthContext";
import { useLive } from "@/hooks/useLive";
import { StatusBadge, DocChip } from "@/components/StatusBadge";
import { PageHeader, Empty, Loading, Stat } from "@/components/Layout";

function Dashboard() {
  const [s, setS] = useState(null);
  useEffect(() => {
    api.get("/manager/dashboard").then((r) => setS(r.data)).catch(() => {});
  }, []);
  if (!s) return null;
  return (
    <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat label="إجمالي المستندات" value={money(s.total_issued)} testid="stat-total-issued" />
      <Stat label="المؤكد من الحركات البنكية" value={money(s.total_confirmed)} tone="text-emerald-700" testid="stat-total-confirmed" />
      <Stat label="إيصالات بانتظار المراجعة" value={s.pending_reviews} tone="text-sky-700" testid="stat-pending-reviews" />
      <Stat label="مهام دفترة تحتاج تدخل" value={s.needs_reconciliation} tone="text-amber-700" testid="stat-needs-reconciliation" />
    </div>
  );
}

export default function Transactions() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const load = useCallback(() => {
    api.get("/transactions", { params: { status: status || undefined, q: q || undefined } }).then((r) => setData(r.data));
  }, [status, q]);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);
  useLive(load);
  const canCreate = ["employee", "manager"].includes(user.role);

  return (
    <div className="fade-up">
      <PageHeader title={user.role === "employee" ? "معاملاتي" : "المعاملات"} sub="الحالة تتحدث مباشرة عند تأكيد المشرف" testid="transactions-title"
        actions={canCreate && (
          <Link to="/app/transactions/new" data-testid="new-transaction-btn" className="inline-flex items-center gap-2 rounded-xl bg-[#123E52] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0e3141]">
            <Plus size={16} /> عرض سعر جديد
          </Link>
        )} />
      {user.role !== "employee" && <Dashboard />}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative sm:w-72">
          <Search className="absolute right-3 top-3 text-[#5A6E7F]" size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث برقم المستند أو العميل" data-testid="transactions-search-input" className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-white pr-9 text-sm outline-none focus:border-[#137C83]" />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <Chip active={!status} onClick={() => setStatus("")} testid="filter-all">الكل</Chip>
          {Object.entries(PAY_STATUS).map(([k, v]) => (
            <Chip key={k} active={status === k} onClick={() => setStatus(k)} testid={`filter-${k}`}>
              {v.label} {data?.counts?.[k] ? <span className="opacity-70">({data.counts[k]})</span> : null}
            </Chip>
          ))}
        </div>
      </div>
      {!data ? <Loading /> : data.items.length === 0 ? <Empty>لا توجد معاملات بعد</Empty> : (
        <div className="space-y-2" data-testid="transactions-list">
          {data.items.map((t) => <Row key={t.id} t={t} />)}
        </div>
      )}
    </div>
  );
}

const Chip = ({ active, children, onClick, testid }) => (
  <button onClick={onClick} data-testid={testid} className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${active ? "border-[#123E52] bg-[#123E52] text-white" : "border-[#E2E8F0] bg-white text-[#5A6E7F] hover:border-[#137C83]"}`}>
    {children}
  </button>
);

function Row({ t }) {
  return (
    <Link to={`/app/transactions/${t.id}`} data-testid={`transaction-row-${t.number}`} className="group grid grid-cols-[1fr_auto] items-center gap-3 rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-sm transition-colors hover:border-[#137C83] sm:grid-cols-[1.3fr_1fr_1fr_auto]">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <DocChip type={t.doc_type} />
          <span className="font-mono text-sm font-semibold">{t.number}</span>
        </div>
        <div className="mt-1 truncate text-sm text-[#5A6E7F]">{t.customer?.name} · {d(t.issued_at)}</div>
      </div>
      <div className="hidden text-sm sm:block">
        <div className="tabular-nums font-semibold">{money(t.total)}</div>
        <div className="text-xs text-[#5A6E7F]">المتبقي: <span className="tabular-nums">{money(t.remaining)}</span></div>
      </div>
      <div className="flex flex-col items-end gap-1 sm:items-start">
        <StatusBadge status={t.payment_status} testid={`transaction-status-${t.number}`} />
        {t.has_pending && t.payment_status !== "pending_review" && <span className="text-[11px] text-sky-700">+ إيصال بانتظار المراجعة</span>}
      </div>
      <ChevronLeft className="hidden text-[#CBD5E1] transition-transform group-hover:-translate-x-1 sm:block" size={18} />
    </Link>
  );
}
