import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, errMsg } from "@/lib/api";
import { d } from "@/lib/format";
import { PageHeader, Loading } from "@/components/Layout";

export default function AdminTenants() {
  const [items, setItems] = useState(null);
  const [plans, setPlans] = useState([]);
  const [add, setAdd] = useState(false);
  const load = useCallback(() => api.get("/admin/tenants").then((r) => setItems(r.data)), []);
  useEffect(() => {
    load();
    api.get("/admin/plans").then((r) => setPlans(r.data));
  }, [load]);
  const patch = async (t, body) => {
    try {
      await api.patch(`/admin/tenants/${t.id}`, body);
      toast.success("تم التحديث");
      load();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  return (
    <div className="fade-up">
      <PageHeader title="المصانع (البيئات المعزولة)" sub="لا يملك المشرف العام وصولاً إلى المعاملات أو المبالغ" testid="tenants-title"
        actions={<button onClick={() => setAdd(true)} data-testid="add-tenant-btn" className="inline-flex items-center gap-2 rounded-xl bg-[#123E52] px-4 py-2.5 text-sm font-semibold text-white"><Plus size={16} /> مصنع جديد</button>} />
      {!items ? <Loading /> : (
        <div className="grid gap-3 md:grid-cols-2" data-testid="tenants-list">
          {items.map((t) => (
            <div key={t.id} className="rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-sm" data-testid={`tenant-${t.slug}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">{t.name}</div>
                  <div className="font-mono text-xs text-[#5A6E7F]" dir="ltr">{t.slug}</div>
                </div>
                <span className={`rounded-full px-2 py-1 text-xs ${t.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`} data-testid={`tenant-status-${t.slug}`}>{t.status === "active" ? "نشط" : "موقوف"}</span>
              </div>
              <div className="mt-2 text-xs text-[#5A6E7F]">{t.users} مستخدم · {t.transactions} معاملة · الاشتراك: {t.subscription_status} · ينتهي {t.period_end ? d(t.period_end) : "—"}</div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <select value={t.plan_id} onChange={(e) => patch(t, { plan_id: e.target.value })} className="h-8 rounded-md border bg-white px-2 text-xs" data-testid={`tenant-plan-${t.slug}`}>
                  {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <input type="date" defaultValue={t.period_end} onBlur={(e) => e.target.value && e.target.value !== t.period_end && patch(t, { period_end: e.target.value })} className="h-8 rounded-md border px-2 text-xs" data-testid={`tenant-period-${t.slug}`} />
                <button onClick={() => patch(t, { status: t.status === "active" ? "suspended" : "active" })} data-testid={`tenant-toggle-${t.slug}`} className="rounded-md border px-2 py-1 text-xs">{t.status === "active" ? "إيقاف" : "تفعيل"}</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {add && <AddTenant plans={plans} onClose={() => setAdd(false)} reload={load} />}
    </div>
  );
}

function AddTenant({ plans, onClose, reload }) {
  const [f, setF] = useState({ name: "", slug: "", plan_id: plans[0]?.id || "", manager_name: "", manager_username: "", manager_email: "" });
  const [res, setRes] = useState(null);
  const save = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.post("/admin/tenants", f);
      setRes(data);
      reload();
    } catch (e2) {
      toast.error(errMsg(e2));
    }
  };
  const F = (k, l, dir) => <div className="space-y-1"><Label className="text-xs">{l}</Label><Input required={k !== "manager_email"} dir={dir} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} data-testid={`tenant-form-${k}`} /></div>;
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-white" dir="rtl">
        <DialogHeader><DialogTitle>إنشاء بيئة مصنع جديدة</DialogTitle></DialogHeader>
        {res ? (
          <div className="space-y-3 text-sm" data-testid="tenant-created-result">
            <p>تم إنشاء <b>{res.tenant.name}</b> ودعوة المدير.</p>
            <div className="rounded-lg bg-[#F5F7FA] p-3">اسم المستخدم: <b dir="ltr" className="font-mono">{res.manager.username}</b><br />رمز PIN المؤقت: <b className="font-mono" data-testid="tenant-temp-pin">{res.temporary_pin}</b></div>
            <p className="text-xs text-amber-700">يظهر الرمز مرة واحدة فقط. أرسله للمدير بشكل آمن.</p>
            <button onClick={onClose} className="h-10 w-full rounded-xl bg-[#123E52] text-white">تم</button>
          </div>
        ) : (
          <form onSubmit={save} className="space-y-3">
            {F("name", "اسم المصنع")}
            {F("slug", "المعرّف (إنجليزي)", "ltr")}
            <div className="space-y-1"><Label className="text-xs">الباقة</Label>
              <select value={f.plan_id} onChange={(e) => setF({ ...f, plan_id: e.target.value })} className="h-10 w-full rounded-md border bg-white px-2 text-sm" data-testid="tenant-form-plan">{plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            </div>
            {F("manager_name", "اسم مدير المصنع")}
            {F("manager_username", "اسم مستخدم المدير", "ltr")}
            {F("manager_email", "بريد المدير (اختياري)", "ltr")}
            <button className="h-11 w-full rounded-xl bg-[#123E52] font-semibold text-white" data-testid="save-tenant-btn">إنشاء</button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
