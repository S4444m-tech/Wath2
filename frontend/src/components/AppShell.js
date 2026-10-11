import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { FileText, PlusCircle, ShieldCheck, Landmark, Users, Settings, ScrollText, Building2, Package, Activity, LogOut, Menu, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { ROLE } from "@/lib/format";
import { Notifications } from "@/components/Notifications";

const NAV = {
  employee: [["/app/transactions", "معاملاتي", FileText], ["/app/transactions/new", "عرض سعر جديد", PlusCircle]],
  supervisor: [["/app/reviews", "المراجعات", ShieldCheck], ["/app/transactions", "المعاملات", FileText], ["/app/movements", "الحركات البنكية", Landmark]],
  manager: [["/app/transactions", "المعاملات", FileText], ["/app/transactions/new", "عرض سعر جديد", PlusCircle], ["/app/reviews", "المراجعات", ShieldCheck], ["/app/movements", "الحركات البنكية", Landmark], ["/app/users", "المستخدمون", Users], ["/app/settings", "إعدادات المصنع", Settings], ["/app/audit", "سجل التدقيق", ScrollText]],
  superadmin: [["/admin/tenants", "المصانع", Building2], ["/admin/plans", "الباقات", Package], ["/admin/health", "صحة التكامل", Activity]],
};

function NavItems({ role, onClick }) {
  return (
    <nav className="space-y-1">
      {(NAV[role] || []).map(([to, label, Icon]) => (
        <NavLink key={to} to={to} end onClick={onClick} data-testid={`nav-${to.split("/").filter(Boolean).join("-")}`}
          className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${isActive ? "bg-white/12 text-white" : "text-white/70 hover:bg-white/5 hover:text-white"}`}>
          <Icon size={18} strokeWidth={1.8} />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

export default function AppShell() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const out = async () => {
    await logout();
    nav("/login");
  };
  const Side = (
    <div className="flex h-full flex-col bg-[#123E52] p-4 text-white">
      <div className="mb-8 flex items-center gap-2 px-2 pt-2">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-[#137C83] text-lg font-bold">و</div>
        <div>
          <div className="text-lg font-bold leading-none">وَثيق</div>
          <div className="mt-1 text-[11px] text-white/60">{user.tenant?.name || "إدارة المنصة"}</div>
        </div>
      </div>
      <NavItems role={user.role} onClick={() => setOpen(false)} />
      <div className="mt-auto border-t border-white/10 pt-4">
        <div className="px-2 text-sm font-medium" data-testid="current-user-name">{user.name}</div>
        <div className="px-2 text-xs text-white/60" data-testid="current-user-role">{ROLE[user.role]}</div>
        <button onClick={out} data-testid="logout-btn" className="mt-3 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-white/70 hover:bg-white/5 hover:text-white">
          <LogOut size={16} /> تسجيل الخروج
        </button>
      </div>
    </div>
  );
  return (
    <div className="min-h-screen bg-[#F5F7FA] lg:grid lg:grid-cols-[250px_1fr]">
      <aside className="sticky top-0 hidden h-screen lg:block">{Side}</aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 right-0 w-72">{Side}</div>
        </div>
      )}
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-[#E2E8F0] bg-white/95 px-4 backdrop-blur sm:px-6">
          <button className="lg:hidden" onClick={() => setOpen(!open)} data-testid="mobile-menu-btn" aria-label="القائمة">
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
          <div className="text-sm font-semibold text-[#123E52] lg:hidden">وَثيق</div>
          <div className="hidden text-sm text-[#5A6E7F] lg:block">{user.tenant?.name}</div>
          {user.role !== "superadmin" ? <Notifications /> : <span />}
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
