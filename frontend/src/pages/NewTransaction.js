import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api, errMsg } from "@/lib/api";
import { money, toHalalas } from "@/lib/format";
import { PageHeader, Card } from "@/components/Layout";
import { ItemsEditor, totalsOf } from "@/components/ItemsEditor";

const F = ({ label, children }) => (
  <div className="space-y-1.5">
    <Label className="text-xs text-[#5A6E7F]">{label}</Label>
    {children}
  </div>
);

export default function NewTransaction() {
  const nav = useNavigate();
  const [docType, setDocType] = useState("quote");
  const [c, setC] = useState({ name: "", email: "", phone: "", vat_number: "" });
  const [items, setItems] = useState([{ description: "", qty: "1", price: "" }]);
  const [notes, setNotes] = useState("");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);
  const t = totalsOf(items);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post("/transactions", {
        doc_type: docType, customer: c, notes, due_date: due,
        items: items.map((i) => ({ description: i.description, qty: parseInt(i.qty, 10) || 0, unit_price: toHalalas(i.price) })),
      });
      toast.success(`تم إصدار ${data.number} — الرابط و QR جاهزان`);
      nav(`/app/transactions/${data.id}`);
    } catch (e2) {
      toast.error(errMsg(e2));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="fade-up space-y-5" data-testid="new-transaction-form">
      <PageHeader title="إصدار مستند جديد" sub="يصدر فوراً بدون انتظار موافقة — مع ملف PDF ورابط و QR" testid="new-transaction-title" />
      <div className="grid grid-cols-2 gap-3 sm:max-w-md">
        {[["quote", "عرض سعر", "border-amber-400 bg-amber-50 text-amber-900"], ["invoice", "فاتورة", "border-emerald-500 bg-emerald-50 text-emerald-900"]].map(([k, l, cls]) => (
          <button type="button" key={k} onClick={() => setDocType(k)} data-testid={`doc-type-${k}`} className={`rounded-xl border-2 p-4 text-right font-bold transition-colors ${docType === k ? cls : "border-[#E2E8F0] bg-white text-[#5A6E7F]"}`}>{l}</button>
        ))}
      </div>
      <Card title="بيانات العميل">
        <div className="grid gap-4 sm:grid-cols-2">
          <F label="اسم العميل / المنشأة *"><Input required value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} data-testid="customer-name-input" /></F>
          <F label="البريد الإلكتروني * (لإرسال رمز التحقق)"><Input required type="email" dir="ltr" value={c.email} onChange={(e) => setC({ ...c, email: e.target.value })} data-testid="customer-email-input" /></F>
          <F label="الجوال"><Input dir="ltr" value={c.phone} onChange={(e) => setC({ ...c, phone: e.target.value })} data-testid="customer-phone-input" /></F>
          <F label="الرقم الضريبي للعميل"><Input dir="ltr" value={c.vat_number} onChange={(e) => setC({ ...c, vat_number: e.target.value })} data-testid="customer-vat-input" /></F>
        </div>
      </Card>
      <Card title="البنود">
        <ItemsEditor items={items} setItems={setItems} />
        <div className="mr-auto mt-5 max-w-xs space-y-1 text-sm">
          <div className="flex justify-between text-[#5A6E7F]"><span>قبل الضريبة</span><span className="tabular-nums">{money(t.sub)}</span></div>
          <div className="flex justify-between text-[#5A6E7F]"><span>ضريبة 15%</span><span className="tabular-nums">{money(t.vat)}</span></div>
          <div className="flex justify-between border-t pt-2 text-base font-bold text-[#123E52]"><span>الإجمالي</span><span className="tabular-nums" data-testid="new-transaction-total">{money(t.total)}</span></div>
        </div>
      </Card>
      <Card title="تفاصيل إضافية">
        <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
          <F label="تاريخ الاستحقاق"><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} data-testid="due-date-input" /></F>
          <F label="ملاحظات"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} data-testid="notes-input" /></F>
        </div>
      </Card>
      <button disabled={busy} data-testid="issue-transaction-btn" className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#123E52] font-semibold text-white hover:bg-[#0e3141] disabled:opacity-60 sm:w-auto sm:px-10">
        {busy && <Loader2 size={16} className="animate-spin" />} إصدار {docType === "quote" ? "عرض السعر" : "الفاتورة"}
      </button>
    </form>
  );
}

