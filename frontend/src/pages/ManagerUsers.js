import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { api, errMsg } from "@/lib/api";
import { ROLE } from "@/lib/format";
import { PageHeader, Loading } from "@/components/Layout";

export default function ManagerUsers() {
  const [users, setUsers] = useState(null);
  const [add, setAdd] = useState(false);
  const load = useCallback(() => api.get("/manager/users").then((r) => setUsers(r.data)), []);
  useEffect(() => {
    load();
  }, [load]);
  const patch = async (u, body, ok) => {
    try {
      await api.patch(`/manager/users/${u.id}`, body);
      toast.success(ok);
      load();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  const resetPin = async (u) => {
    const { data } = await api.get("/manager/invite-pin");
    await patch(u, { pin: data.pin }, `رمز PIN الجديد لـ ${u.name}: ${data.pin}`);
  };
  return (
    <div className="fade-up">
      <PageHeader title="المستخدمون" sub="كل مستخدم يدخل باسم مستخدم ورمز PIN من 6 أرقام" testid="users-title"
        actions={<button onClick={() => setAdd(true)} data-testid="add-user-btn" className="inline-flex items-center gap-2 rounded-xl bg-[#123E52] px-4 py-2.5 text-sm font-semibold text-white"><Plus size={16} /> مستخدم جديد</button>} />
      {!users ? <Loading /> : (
        <div className="overflow-x-auto rounded-xl border border-[#E2E8F0] bg-white">
          <table className="w-full text-sm" data-testid="users-table">
            <thead className="bg-[#F5F7FA] text-xs text-[#5A6E7F]"><tr><th className="p-3 text-right">الاسم</th><th className="p-3 text-right">اسم المستخدم</th><th className="p-3 text-right">الدور</th><th className="p-3 text-right">نشط</th><th className="p-3" /></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t" data-testid={`user-row-${u.username}`}>
                  <td className="p-3 font-medium">{u.name}</td>
                  <td className="p-3 font-mono text-xs" dir="ltr">{u.username}</td>
                  <td className="p-3">{ROLE[u.role]}</td>
                  <td className="p-3"><Switch checked={u.active} onCheckedChange={(v) => patch(u, { active: v }, v ? "تم التفعيل" : "تم الإيقاف")} data-testid={`user-active-${u.username}`} /></td>
                  <td className="p-3 text-left"><button onClick={() => resetPin(u)} data-testid={`reset-pin-${u.username}`} className="text-xs text-[#137C83] hover:underline">إعادة تعيين PIN</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {add && <AddUser onClose={() => setAdd(false)} reload={load} />}
    </div>
  );
}

function AddUser({ onClose, reload }) {
  const [f, setF] = useState({ name: "", username: "", role: "employee", pin: "", email: "" });
  useEffect(() => {
    api.get("/manager/invite-pin").then((r) => setF((x) => ({ ...x, pin: r.data.pin })));
  }, []);
  const save = async (e) => {
    e.preventDefault();
    try {
      await api.post("/manager/users", { ...f, username: f.username.toLowerCase() });
      toast.success(`تمت الإضافة — أبلغ المستخدم بالرمز ${f.pin}`);
      reload();
      onClose();
    } catch (e2) {
      toast.error(errMsg(e2));
    }
  };
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-white" dir="rtl">
        <DialogHeader><DialogTitle>إضافة مستخدم</DialogTitle></DialogHeader>
        <form onSubmit={save} className="space-y-3">
          <div className="space-y-1"><Label>الاسم</Label><Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} data-testid="new-user-name" /></div>
          <div className="space-y-1"><Label>اسم المستخدم (حروف إنجليزية وأرقام)</Label><Input required dir="ltr" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} data-testid="new-user-username" /></div>
          <div className="space-y-1"><Label>الدور</Label>
            <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} className="h-10 w-full rounded-md border bg-white px-2 text-sm" data-testid="new-user-role">
              <option value="employee">موظف</option><option value="supervisor">مشرف</option><option value="manager">مدير المصنع</option>
            </select>
          </div>
          <div className="space-y-1"><Label>رمز PIN (6 أرقام)</Label><Input required dir="ltr" pattern="\d{6}" maxLength={6} value={f.pin} onChange={(e) => setF({ ...f, pin: e.target.value })} data-testid="new-user-pin" /></div>
          <button className="h-11 w-full rounded-xl bg-[#123E52] font-semibold text-white" data-testid="save-user-btn">إضافة</button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
