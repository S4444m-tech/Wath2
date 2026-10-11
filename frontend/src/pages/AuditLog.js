import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { dt } from "@/lib/format";
import { PageHeader, Loading } from "@/components/Layout";

export default function AuditLog() {
  const [items, setItems] = useState(null);
  useEffect(() => {
    api.get("/manager/audit").then((r) => setItems(r.data));
  }, []);
  return (
    <div className="fade-up">
      <PageHeader title="سجل التدقيق" sub="سجل إلحاقي فقط — لا يمكن تعديله أو حذفه" testid="audit-title" />
      {!items ? <Loading /> : (
        <div className="overflow-x-auto rounded-xl border border-[#E2E8F0] bg-white">
          <table className="w-full text-sm" data-testid="audit-table">
            <thead className="bg-[#F5F7FA] text-xs text-[#5A6E7F]"><tr><th className="p-3 text-right">الوقت</th><th className="p-3 text-right">المنفّذ</th><th className="p-3 text-right">الإجراء</th><th className="p-3 text-right">التفاصيل</th></tr></thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id} className="border-t align-top">
                  <td className="whitespace-nowrap p-3 text-xs text-[#5A6E7F]">{dt(a.created_at)}</td>
                  <td className="p-3 text-xs">{a.actor?.name} <span className="text-[#5A6E7F]">({a.actor?.role})</span></td>
                  <td className="p-3 font-mono text-xs">{a.action}</td>
                  <td className="max-w-xs truncate p-3 font-mono text-[11px] text-[#5A6E7F]" dir="ltr">{JSON.stringify(a.data)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
