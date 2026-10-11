import { useState } from "react";
import { CheckCircle2, Clock, AlertOctagon, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/Layout";
import { money, toHalalas, fromHalalas } from "@/lib/format";

const today = () => new Date().toISOString().slice(0, 10);

export function ConfirmForm({ tx, others, onDecide }) {
  const [amount, setAmount] = useState(fromHalalas(tx.remaining || tx.total));
  const [ref, setRef] = useState("");
  const [date, setDate] = useState(today());
  const [bank, setBank] = useState("");
  const [note, setNote] = useState("");
  const [extra, setExtra] = useState([]);
  const [busy, setBusy] = useState(false);

  const extraSum = extra.reduce((s, e) => s + toHalalas(e.amount), 0);
  const total = toHalalas(amount);
  const mainAlloc = total - extraSum;
  const avail = others.filter((o) => !extra.find((e) => e.id === o.id));

  const go = async (decision) => {
    setBusy(true);
    const payload = { decision, note };
    if (decision === "confirm") {
      payload.movement = { reference: ref, amount: total, date, bank_name: bank };
      payload.allocations = [{ transaction_id: tx.id, amount: mainAlloc }, ...extra.map((e) => ({ transaction_id: e.id, amount: toHalalas(e.amount) }))].filter((a) => a.amount > 0);
    }
    await onDecide(payload);
    setBusy(false);
  };
  const valid = ref.trim().length >= 3 && total > 0 && mainAlloc >= 0 && date;

  return (
    <Card title="قرار المشرف" testid="confirm-form">
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label className="text-xs">المبلغ الذي وصل فعلاً (ر.س) *</Label><Input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} data-testid="confirm-amount-input" className="text-lg font-bold" /></div>
          <div className="space-y-1.5"><Label className="text-xs">مرجع الحركة البنكية *</Label><Input dir="ltr" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="FT26..." data-testid="confirm-reference-input" /></div>
          <div className="space-y-1.5"><Label className="text-xs">تاريخ الحركة</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="confirm-date-input" /></div>
          <div className="space-y-1.5"><Label className="text-xs">البنك المرسل</Label><Input value={bank} onChange={(e) => setBank(e.target.value)} data-testid="confirm-bank-input" /></div>
        </div>
        <div className="rounded-lg border border-[#E2E8F0] p-3 text-sm">
          <div className="mb-2 text-xs font-semibold text-[#5A6E7F]">توزيع الحركة على المستندات</div>
          <div className="flex justify-between"><span className="font-mono">{tx.number}</span><span className={`tabular-nums font-semibold ${mainAlloc < 0 ? "text-rose-600" : ""}`} data-testid="alloc-main-amount">{money(mainAlloc)}</span></div>
          {mainAlloc > tx.remaining && <div className="mt-1 text-[11px] text-teal-700">المبلغ يتجاوز المتبقي بـ {money(mainAlloc - tx.remaining)} — سيُسجّل كرصيد دائن (زيادة)</div>}
          {mainAlloc > 0 && mainAlloc < tx.remaining && <div className="mt-1 text-[11px] text-indigo-700">دفعة جزئية — سيبقى {money(tx.remaining - mainAlloc)}</div>}
          {extra.map((e, i) => (
            <div key={e.id} className="mt-2 flex items-center gap-2">
              <span className="flex-1 font-mono text-xs">{e.number} <span className="text-[#5A6E7F]">(متبقي {money(e.remaining)})</span></span>
              <Input type="number" step="0.01" className="h-8 w-28" value={e.amount} onChange={(ev) => setExtra(extra.map((x, j) => (j === i ? { ...x, amount: ev.target.value } : x)))} data-testid={`alloc-extra-${e.number}`} />
              <button onClick={() => setExtra(extra.filter((_, j) => j !== i))} aria-label="إزالة"><X size={14} /></button>
            </div>
          ))}
          {avail.length > 0 && (
            <select className="mt-3 h-9 w-full rounded-lg border border-[#E2E8F0] bg-white px-2 text-xs" value="" data-testid="alloc-add-select"
              onChange={(e) => {
                const o = others.find((x) => x.id === e.target.value);
                if (o) setExtra([...extra, { id: o.id, number: o.number, remaining: o.remaining, amount: fromHalalas(o.remaining) }]);
              }}>
              <option value="">+ توزيع جزء من الحركة على مستند آخر لنفس العميل</option>
              {avail.map((o) => <option key={o.id} value={o.id}>{o.number} — متبقي {money(o.remaining)}</option>)}
            </select>
          )}
        </div>
        <div className="space-y-1.5"><Label className="text-xs">ملاحظة (إلزامية لـ "يحتاج انتباه")</Label><Textarea value={note} onChange={(e) => setNote(e.target.value)} data-testid="confirm-note-input" /></div>
        <button disabled={busy || !valid} onClick={() => go("confirm")} data-testid="decision-confirm-btn" className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"><CheckCircle2 size={18} /> تأكيد وصول {money(total)}</button>
        <div className="grid grid-cols-2 gap-2">
          <button disabled={busy} onClick={() => go("not_seen")} data-testid="decision-not-seen-btn" className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 text-sm font-semibold text-amber-900"><Clock size={16} /> لم يظهر بعد</button>
          <button disabled={busy || !note.trim()} onClick={() => go("needs_attention")} data-testid="decision-attention-btn" className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 text-sm font-semibold text-rose-700 disabled:opacity-50"><AlertOctagon size={16} /> يحتاج انتباه</button>
        </div>
      </div>
    </Card>
  );
}

