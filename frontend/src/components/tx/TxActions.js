import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api, errMsg } from "@/lib/api";
import { money, fromHalalas, toHalalas } from "@/lib/format";
import { ItemsEditor, totalsOf } from "@/components/ItemsEditor";

const Btn = ({ children, ...p }) => (
  <button {...p} className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm font-medium text-[#123E52] hover:border-[#137C83] disabled:opacity-50">{children}</button>
);

export function TxActions({ tx, user, reload }) {
  const [edit, setEdit] = useState(false);
  const act = async (fn, ok) => {
    try {
      await fn();
      toast.success(ok);
      reload();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  return (
    <div className="flex flex-wrap gap-2">
      <Btn onClick={() => setEdit(true)} data-testid="edit-tx-btn">تعديل (نسخة جديدة)</Btn>
      {tx.doc_type === "quote" && <Btn onClick={() => act(() => api.post(`/transactions/${tx.id}/convert`), "تم التحويل إلى فاتورة")} data-testid="convert-invoice-btn">تحويل إلى فاتورة</Btn>}
      {tx.needs_rereview && ["supervisor", "manager"].includes(user.role) && (
        <Btn onClick={() => act(() => api.post(`/transactions/${tx.id}/rereview`), "تمت إعادة المراجعة")} data-testid="approve-rereview-btn">اعتماد إعادة المراجعة</Btn>
      )}
      {edit && <EditDialog tx={tx} onClose={() => setEdit(false)} reload={reload} />}
    </div>
  );
}

function EditDialog({ tx, onClose, reload }) {
  const [items, setItems] = useState(tx.items.map((i) => ({ description: i.description, qty: String(i.qty), price: fromHalalas(i.unit_price) })));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.put(`/transactions/${tx.id}`, { items: items.map((i) => ({ description: i.description, qty: parseInt(i.qty, 10), unit_price: toHalalas(i.price) })), notes: tx.notes, expected_version: tx.version, reason });
      toast.success("تم حفظ نسخة جديدة");
      reload();
      onClose();
    } catch (e2) {
      toast.error(errMsg(e2));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl bg-white" dir="rtl">
        <DialogHeader><DialogTitle>تعديل {tx.number}</DialogTitle></DialogHeader>
        <form onSubmit={save} className="space-y-4">
          {tx.confirmed > 0 && <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">يوجد مبالغ مؤكدة على هذا المستند. التعديل ينشئ نسخة جديدة ويتطلب إعادة مراجعة المشرف. النسخة السابقة تبقى محفوظة.</p>}
          <ItemsEditor items={items} setItems={setItems} />
          <div className="text-sm font-semibold">الإجمالي الجديد: <span className="tabular-nums">{money(totalsOf(items).total)}</span></div>
          <Input required minLength={2} placeholder="سبب التعديل *" value={reason} onChange={(e) => setReason(e.target.value)} data-testid="edit-reason-input" />
          <button disabled={busy} data-testid="save-edit-btn" className="h-11 w-full rounded-xl bg-[#123E52] font-semibold text-white disabled:opacity-60">حفظ كنسخة جديدة</button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
