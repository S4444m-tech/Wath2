import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api, errMsg, idemKey } from "@/lib/api";
import { money, dt } from "@/lib/format";
import { PageHeader, Empty, Loading } from "@/components/Layout";

export default function Movements() {
  const [items, setItems] = useState(null);
  const [rev, setRev] = useState(null);
  const load = useCallback(() => api.get("/movements").then((r) => setItems(r.data)), []);
  useEffect(() => {
    load();
  }, [load]);
  return (
    <div className="fade-up">
      <PageHeader title="الحركات البنكية المؤكدة" sub="كل حركة تُسجّل مرة واحدة فقط، وتُوزّع على مستند أو أكثر" testid="movements-title" />
      {!items ? <Loading /> : items.length === 0 ? <Empty>لا توجد حركات مؤكدة بعد</Empty> : (
        <div className="space-y-3" data-testid="movements-list">
          {items.map((m) => (
            <div key={m.id} className={`rounded-xl border bg-white p-4 shadow-sm ${m.reversed ? "border-zinc-300 opacity-70" : "border-[#E2E8F0]"}`} data-testid={`movement-${m.reference}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-mono text-sm font-bold">{m.reference}</div>
                  <div className="text-xs text-[#5A6E7F]">{m.date} · {m.bank_name || "—"} · أكّدها {m.confirmed_by?.name} · {dt(m.created_at)}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-lg font-bold tabular-nums text-emerald-700">{money(m.amount)}</span>
                  {m.reversed ? <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs">معكوسة: {m.reverse_reason}</span> : (
                    <button onClick={() => setRev(m)} data-testid={`reverse-movement-${m.reference}`} className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs text-rose-700 hover:bg-rose-50">عكس الحركة</button>
                  )}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {m.allocations.map((a) => (
                  <Link key={a.id} to={`/app/transactions/${a.transaction_id}`} className={`rounded-lg bg-[#F5F7FA] px-2.5 py-1 text-xs ${a.amount < 0 ? "text-rose-600" : ""}`}>
                    <span className="font-mono">{a.transaction_number}</span> · <span className="tabular-nums">{money(a.amount)}</span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {rev && <ReverseDialog m={rev} onClose={() => setRev(null)} reload={load} />}
    </div>
  );
}

function ReverseDialog({ m, onClose, reload }) {
  const [reason, setReason] = useState("");
  const [key] = useState(idemKey());
  const go = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/movements/${m.id}/reverse`, { reason }, { headers: { "Idempotency-Key": key } });
      toast.success("تم عكس الحركة بقيود عكسية — لم يُحذف شيء");
      reload();
      onClose();
    } catch (e2) {
      toast.error(errMsg(e2));
    }
  };
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-white" dir="rtl">
        <DialogHeader><DialogTitle>عكس الحركة {m.reference}</DialogTitle></DialogHeader>
        <form onSubmit={go} className="space-y-3">
          <p className="text-sm text-[#5A6E7F]">سيتم إنشاء قيود عكسية في دفتر التوزيع وترحيل استرداد لدفترة. السجل الأصلي يبقى كما هو.</p>
          <Input required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="سبب العكس *" data-testid="reverse-reason-input" />
          <button className="h-11 w-full rounded-xl bg-rose-700 font-semibold text-white" data-testid="reverse-confirm-btn">تأكيد العكس</button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
