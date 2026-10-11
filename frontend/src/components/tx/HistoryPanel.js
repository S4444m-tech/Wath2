import { Card } from "@/components/Layout";
import { money, dt } from "@/lib/format";

const DEC = { confirm: "تأكيد وصول", not_seen: "لم يظهر بعد", needs_attention: "يحتاج انتباه" };

export function HistoryPanel({ reviews, versions }) {
  if (!reviews.length && !versions.length) return null;
  return (
    <Card title="السجل" testid="history-panel">
      <ol className="space-y-3 border-r-2 border-[#E2E8F0] pr-4 text-xs">
        {reviews.map((r) => (
          <li key={r.id} className="relative">
            <span className="absolute -right-[21px] top-1 h-2.5 w-2.5 rounded-full bg-[#137C83]" />
            <div className="font-semibold text-[#172B36]">{DEC[r.decision]} {r.amount ? `· ${money(r.amount)}` : ""}</div>
            <div className="text-[#5A6E7F]">{r.by?.name} · {dt(r.created_at)} {r.reference && <span className="font-mono">· {r.reference}</span>}</div>
            {r.note && <div className="text-[#5A6E7F]">{r.note}</div>}
          </li>
        ))}
        {versions.map((v) => (
          <li key={v.id} className="relative">
            <span className="absolute -right-[21px] top-1 h-2.5 w-2.5 rounded-full bg-amber-500" />
            <div className="font-semibold text-[#172B36]">النسخة {v.version} (الإجمالي {money(v.total)})</div>
            <div className="text-[#5A6E7F]">عدّلها {v.by?.name} · {dt(v.created_at)} · السبب: {v.reason}</div>
          </li>
        ))}
      </ol>
    </Card>
  );
}
