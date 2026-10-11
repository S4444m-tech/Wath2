import { PAY_STATUS, ATT_STATUS, SYNC_STATUS } from "@/lib/format";

const MAPS = { pay: PAY_STATUS, att: ATT_STATUS, sync: SYNC_STATUS };

export const StatusBadge = ({ status, kind = "pay", testid }) => {
  const m = MAPS[kind][status] || { label: status, cls: "bg-slate-50 text-slate-700 border-slate-200" };
  return (
    <span data-testid={testid} className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium ${m.cls}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {m.label}
    </span>
  );
};

export const DocChip = ({ type }) =>
  type === "quote" ? (
    <span className="rounded-md border border-amber-300 bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">عرض سعر</span>
  ) : (
    <span className="rounded-md border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-900">فاتورة</span>
  );
