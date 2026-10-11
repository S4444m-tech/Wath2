import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, errMsg } from "@/lib/api";
import { money } from "@/lib/format";
import { PageHeader, Card, Loading } from "@/components/Layout";

const FIELDS = [["name", "اسم المصنع"], ["iban", "الآيبان (SA + 22 رقم)", "ltr"], ["bank_name", "اسم البنك"], ["account_name", "اسم صاحب الحساب"], ["vat_number", "الرقم الضريبي", "ltr"], ["cr_number", "السجل التجاري", "ltr"], ["address", "العنوان"]];

export default function ManagerSettings() {
  const [f, setF] = useState(null);
  useEffect(() => {
    api.get("/manager/settings").then((r) => setF(r.data));
  }, []);
  if (!f) return <Loading />;
  const save = async (e) => {
    e.preventDefault();
    try {
      const body = Object.fromEntries(FIELDS.map(([k]) => [k, (f[k] || "").trim()]));
      body.iban = body.iban.replace(/\s/g, "").toUpperCase();
      await api.put("/manager/settings", body);
      toast.success("تم حفظ الإعدادات");
    } catch (e2) {
      toast.error(errMsg(e2));
    }
  };
  return (
    <div className="fade-up space-y-5">
      <PageHeader title="إعدادات المصنع" testid="settings-title" />
      <Card title="الاشتراك">
        <div className="text-sm">الباقة: <b data-testid="plan-name">{f.plan?.name}</b> · {money(f.plan?.price)} شهرياً · حتى {f.plan?.max_users} مستخدم · ينتهي: {f.period_end || "—"}</div>
      </Card>
      <Card title="البيانات والحساب البنكي">
        <form onSubmit={save} className="grid gap-4 sm:grid-cols-2" data-testid="settings-form">
          {FIELDS.map(([k, l, dir]) => (
            <div key={k} className="space-y-1.5"><Label className="text-xs">{l}</Label><Input dir={dir} value={f[k] || ""} onChange={(e) => setF({ ...f, [k]: e.target.value })} data-testid={`settings-${k}`} /></div>
          ))}
          <button className="h-11 rounded-xl bg-[#123E52] font-semibold text-white sm:col-span-2 sm:w-48" data-testid="save-settings-btn">حفظ</button>
        </form>
      </Card>
    </div>
  );
}
