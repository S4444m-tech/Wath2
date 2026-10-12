import { Card, Empty } from "@/components/Layout";
import { money, dt } from "@/lib/format";

const EMAIL_LABEL = { sending: "جارِ إبلاغ العميل…", sent: "أُبلغ العميل بالبريد", failed: "فشل إبلاغ العميل" };
const EMAIL_CLS = { sending: "text-sky-700", sent: "text-emerald-700", failed: "text-rose-600" };

export function LedgerPanel({ allocations }) {
  return (
    <Card title="دفتر التوزيع (المصدر الوحيد للمبالغ المؤكدة)" testid="ledger-panel">
      {allocations.length === 0 ? <Empty>لا توجد مبالغ مؤكدة بعد</Empty> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-[#5A6E7F]">
                <th className="py-2 text-right font-medium">المرجع البنكي</th>
                <th className="py-2 text-right font-medium">النوع</th>
                <th className="py-2 text-right font-medium">بواسطة</th>
                <th className="py-2 text-left font-medium">المبلغ</th>
              </tr>
            </thead>
            <tbody>
              {allocations.map((a) => (
                <tr key={a.id} className="border-b border-dashed" data-testid={`allocation-${a.id}`}>
                  <td className="py-2 font-mono text-xs">{a.movement_reference}</td>
                  <td className="py-2 text-xs">{a.kind === "reversal" ? <span className="text-rose-600">عكس: {a.reason}</span> : "دفعة"}{a.email_status && <span className={`mr-1 block text-[10px] ${EMAIL_CLS[a.email_status]}`} data-testid={`allocation-email-${a.id}`}>{EMAIL_LABEL[a.email_status]}</span>}</td>
                  <td className="py-2 text-xs text-[#5A6E7F]">{a.by?.name} · {dt(a.created_at)}</td>
                  <td className={`py-2 text-left font-semibold tabular-nums ${a.amount < 0 ? "text-rose-600" : "text-emerald-700"}`}>{money(a.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
