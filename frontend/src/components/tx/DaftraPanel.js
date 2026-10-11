import { useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/Layout";
import { StatusBadge } from "@/components/StatusBadge";
import { api, errMsg } from "@/lib/api";
import { dt } from "@/lib/format";

const KIND = { sync_document: "ترحيل المستند", post_payment: "ترحيل دفعة", post_reversal: "ترحيل عكس/استرداد" };

export function DaftraPanel({ tx, jobs, mappings, user, reload }) {
  const [busy, setBusy] = useState(false);
  const canRecon = ["supervisor", "manager"].includes(user.role);
  const run = async (fn, ok) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title="التكامل مع دفترة" testid="daftra-panel"
      actions={<button disabled={busy} onClick={() => run(() => api.post(`/transactions/${tx.id}/sync`), "تمت إضافة مهمة الترحيل للطابور")} data-testid="daftra-sync-btn" className="inline-flex items-center gap-1 rounded-lg bg-[#137C83] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0f6369] disabled:opacity-60"><RefreshCw size={13} className={busy ? "animate-spin" : ""} /> مزامنة</button>}>
      <p className="mb-3 text-[11px] text-[#5A6E7F]">الموصل يعمل حالياً على بيئة دفترة تجريبية (MOCKED) حتى توفر مفتاح API. التأكيد لا يتأثر بتعطل دفترة.</p>
      {jobs.length === 0 ? <div className="text-sm text-[#5A6E7F]">لا توجد مهام ترحيل</div> : (
        <ul className="space-y-2">
          {jobs.map((j) => (
            <li key={j.id} className="rounded-lg border border-[#E2E8F0] p-3 text-xs" data-testid={`daftra-job-${j.id}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-[#172B36]">{KIND[j.kind]}</span>
                <StatusBadge status={j.status} kind="sync" testid={`daftra-job-status-${j.id}`} />
              </div>
              <div className="mt-1 text-[#5A6E7F]">محاولات: {j.attempts} · {dt(j.updated_at)}</div>
              {j.last_error && <div className="mt-1 text-rose-600" dir="ltr">{j.last_error}</div>}
              {canRecon && ["needs_reconciliation", "failed"].includes(j.status) && (
                <button disabled={busy} onClick={() => run(() => api.post(`/jobs/${j.id}/reconcile`), "تمت المطابقة")} data-testid={`reconcile-job-${j.id}`} className="mt-2 inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-amber-900"><Search size={12} /> مطابقة مع دفترة (بدون إعادة إنشاء)</button>
              )}
            </li>
          ))}
        </ul>
      )}
      {mappings.length > 0 && (
        <div className="mt-3 border-t pt-3 text-[11px] text-[#5A6E7F]">
          {mappings.map((m) => <div key={m.id} dir="ltr" className="font-mono">{m.daftra_type} → {m.daftra_id}</div>)}
        </div>
      )}
    </Card>
  );
}
