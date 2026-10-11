import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { api, errMsg } from "@/lib/api";
import { dt } from "@/lib/format";
import { PageHeader, Loading } from "@/components/Layout";

const MODES = [["ok", "طبيعي"], ["timeout", "محاكاة انتهاء مهلة"], ["down", "محاكاة توقف الخدمة"], ["error", "محاكاة رفض"]];
const COLS = [["queued", "في الطابور"], ["done", "تم"], ["failed", "فشل"], ["needs_reconciliation", "يحتاج مطابقة"]];

export default function AdminHealth() {
  const [h, setH] = useState(null);
  const load = useCallback(() => api.get("/admin/health").then((r) => setH(r.data)), []);
  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);
  const setMode = async (t, mode) => {
    try {
      await api.patch(`/admin/tenants/${t.id}`, { daftra_mode: mode });
      toast.success("تم تغيير وضع الموصل التجريبي");
      load();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  return (
    <div className="fade-up">
      <PageHeader title="صحة التكامل مع دفترة" sub={h ? `الموصل الحالي: ${h.connector} (MOCKED)` : ""} testid="health-title" />
      {!h ? <Loading /> : (
        <div className="space-y-3" data-testid="health-list">
          {h.tenants.map((t) => (
            <div key={t.id} className="rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-sm" data-testid={`health-${t.id}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-semibold">{t.name}</div>
                <select value={t.daftra_mode || "ok"} onChange={(e) => setMode(t, e.target.value)} className="h-8 rounded-md border bg-white px-2 text-xs" data-testid={`daftra-mode-${t.id}`}>
                  {MODES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                {COLS.map(([k, l]) => (
                  <div key={k} className="rounded-lg bg-[#F5F7FA] p-2">
                    <div className="text-lg font-bold tabular-nums">{t.jobs[k]}</div>
                    <div className="text-[11px] text-[#5A6E7F]">{l}</div>
                  </div>
                ))}
              </div>
              {t.last_error && <div className="mt-2 text-xs text-rose-600" dir="ltr">{t.last_error.last_error} · {dt(t.last_error.updated_at)}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
