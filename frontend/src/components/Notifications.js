import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { Bell } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { api } from "@/lib/api";
import { dt } from "@/lib/format";
import { useLive } from "@/hooks/useLive";

export function Notifications() {
  const [items, setItems] = useState([]);
  const load = useCallback(() => api.get("/notifications").then((r) => setItems(r.data)).catch(() => {}), []);
  useEffect(() => {
    load();
  }, [load]);
  useLive(load, null, 20000);
  const unread = items.filter((n) => !n.read).length;
  const markRead = () => unread && api.post("/notifications/read").then(load);
  return (
    <Popover onOpenChange={(o) => o && markRead()}>
      <PopoverTrigger asChild>
        <button data-testid="notifications-btn" className="relative rounded-full p-2 text-[#123E52] hover:bg-[#F5F7FA]" aria-label="الإشعارات">
          <Bell size={20} />
          {unread > 0 && (
            <span data-testid="notifications-count" className="absolute -left-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-[#DC2626] px-1 text-[10px] font-bold text-white">{unread}</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 bg-white p-0" dir="rtl">
        <div className="border-b border-[#E2E8F0] px-4 py-3 text-sm font-semibold">الإشعارات</div>
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 && <div className="p-6 text-center text-sm text-[#5A6E7F]">لا توجد إشعارات</div>}
          {items.map((n) => (
            <Link key={n.id} to={`/app/transactions/${n.transaction_id}`} data-testid={`notification-${n.id}`} className={`block border-b border-[#F1F5F9] px-4 py-3 text-sm hover:bg-[#F5F7FA] ${n.read ? "" : "bg-sky-50/50"}`}>
              <div className="text-[#172B36]">{n.text}</div>
              <div className="mt-1 text-[11px] text-[#5A6E7F]">{dt(n.created_at)}</div>
            </Link>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
