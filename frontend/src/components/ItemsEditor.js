import { Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toHalalas } from "@/lib/format";

export const totalsOf = (items) => {
  const sub = items.reduce((s, i) => s + (parseInt(i.qty, 10) || 0) * toHalalas(i.price), 0);
  const vat = Math.floor((sub * 15 + 50) / 100);
  return { sub, vat, total: sub + vat };
};

export function ItemsEditor({ items, setItems }) {
  const set = (i, k, v) => setItems(items.map((it, j) => (j === i ? { ...it, [k]: v } : it)));
  return (
    <div className="space-y-3" data-testid="items-editor">
      {items.map((it, i) => (
        <div key={i} className="grid grid-cols-[1fr_80px_120px_36px] gap-2 max-sm:grid-cols-[1fr_1fr_36px]">
          <Input required placeholder="وصف البند" value={it.description} onChange={(e) => set(i, "description", e.target.value)} className="max-sm:col-span-3" data-testid={`item-desc-${i}`} />
          <Input required type="number" min="1" placeholder="الكمية" value={it.qty} onChange={(e) => set(i, "qty", e.target.value)} data-testid={`item-qty-${i}`} />
          <Input required type="number" min="0" step="0.01" placeholder="سعر الوحدة ر.س" value={it.price} onChange={(e) => set(i, "price", e.target.value)} data-testid={`item-price-${i}`} />
          <button type="button" aria-label="حذف البند" disabled={items.length === 1} onClick={() => setItems(items.filter((_, j) => j !== i))} data-testid={`item-remove-${i}`} className="grid place-items-center rounded-lg text-[#5A6E7F] hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30">
            <Trash2 size={16} />
          </button>
        </div>
      ))}
      <button type="button" onClick={() => setItems([...items, { description: "", qty: "1", price: "" }])} data-testid="add-item-btn" className="inline-flex items-center gap-1.5 text-sm font-medium text-[#137C83] hover:underline">
        <Plus size={16} /> إضافة بند
      </button>
    </div>
  );
}
