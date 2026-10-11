import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { api, errMsg } from "@/lib/api";
import { money, toHalalas } from "@/lib/format";
import { PageHeader, Card } from "@/components/Layout";

export default function AdminPlans() {
  const [plans, setPlans] = useState([]);
  const [f, setF] = useState({ name: "", price: "", max_users: "10", max_transactions: "1000" });
  const load = useCallback(() => api.get("/admin/plans").then((r) => setPlans(r.data)), []);
  useEffect(() => {
    load();
  }, [load]);
  const save = async (e) => {
    e.preventDefault();
    try {
      await api.post("/admin/plans", { name: f.name, price: toHalalas(f.price), max_users: +f.max_users, max_transactions: +f.max_transactions });
      toast.success("تمت إضافة الباقة");
      setF({ ...f, name: "", price: "" });
      load();
    } catch (e2) {
      toast.error(errMsg(e2));
    }
  };
  return (
    <div className="fade-up space-y-5">
      <PageHeader title="الباقات والاشتراكات" testid="plans-title" />
      <div className="grid gap-3 md:grid-cols-3" data-testid="plans-list">
        {plans.map((p) => (
          <div key={p.id} className="rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-sm" data-testid={`plan-${p.name}`}>
            <div className="text-lg font-bold text-[#123E52]">{p.name}</div>
            <div className="mt-1 text-2xl font-bold tabular-nums">{money(p.price)}<span className="text-xs font-normal text-[#5A6E7F]"> / شهر</span></div>
            <div className="mt-2 text-xs text-[#5A6E7F]">{p.max_users} مستخدم · {p.max_transactions} معاملة</div>
          </div>
        ))}
      </div>
      <Card title="باقة جديدة">
        <form onSubmit={save} className="grid gap-3 sm:grid-cols-5">
          <Input required placeholder="الاسم" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} data-testid="plan-name-input" />
          <Input required type="number" step="0.01" placeholder="السعر ر.س" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} data-testid="plan-price-input" />
          <Input required type="number" placeholder="المستخدمون" value={f.max_users} onChange={(e) => setF({ ...f, max_users: e.target.value })} data-testid="plan-users-input" />
          <Input required type="number" placeholder="المعاملات" value={f.max_transactions} onChange={(e) => setF({ ...f, max_transactions: e.target.value })} data-testid="plan-tx-input" />
          <button className="h-10 rounded-lg bg-[#123E52] text-sm font-semibold text-white" data-testid="save-plan-btn">إضافة</button>
        </form>
      </Card>
    </div>
  );
}
