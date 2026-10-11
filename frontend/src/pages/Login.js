import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Lock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/AuthContext";
import { errMsg } from "@/lib/api";
import { PinInput, PinPad } from "@/components/PinInput";
import { homeFor } from "@/App";

const BANNER = "https://images.unsplash.com/photo-1632653323756-a9b6966bc4d1?crop=entropy&cs=srgb&fm=jpg&q=80&w=1400";

export default function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) nav(homeFor(user), { replace: true });
  }, [user, nav]);

  const submit = async (e) => {
    e?.preventDefault();
    if (!username || pin.length !== 6) return setErr("أدخل اسم المستخدم ورمز PIN المكوّن من 6 أرقام");
    setBusy(true);
    setErr("");
    try {
      const u = await login(username.trim(), pin);
      nav(homeFor(u), { replace: true });
    } catch (e2) {
      setErr(errMsg(e2));
      setPin("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen bg-[#F5F7FA] lg:grid-cols-[1fr_1.1fr]">
      <div className="flex items-center justify-center px-5 py-10">
        <form onSubmit={submit} className="fade-up w-full max-w-sm space-y-6" data-testid="login-form">
          <div>
            <div className="mb-6 flex items-center gap-2">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#123E52] text-xl font-bold text-white">و</div>
              <span className="text-2xl font-bold text-[#123E52]">وَثيق</span>
            </div>
            <h1 className="text-3xl font-bold text-[#172B36]">دخول بوابة المصنع</h1>
            <p className="mt-2 text-sm text-[#5A6E7F]">ادخل باسم المستخدم ورمز PIN الخاص بك.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="username">اسم المستخدم</Label>
            <Input id="username" dir="ltr" autoComplete="username" autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} className="h-12 bg-white text-left" data-testid="login-username-input" />
          </div>
          <div className="space-y-3">
            <Label>رمز PIN (6 أرقام)</Label>
            <PinInput value={pin} onChange={setPin} testid="login-pin-input" />
            <PinPad value={pin} onChange={setPin} />
          </div>
          {err && <div role="alert" data-testid="login-error" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}
          <button type="submit" disabled={busy} data-testid="login-submit-button" className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#123E52] font-semibold text-white transition-colors hover:bg-[#0e3141] disabled:opacity-60">
            {busy ? <Loader2 className="animate-spin" size={18} /> : <Lock size={16} />}
            دخول
          </button>
          <p className="text-xs leading-relaxed text-[#5A6E7F]">بعد 5 محاولات خاطئة يُقفل الحساب مؤقتاً لمدة 15 دقيقة.</p>
        </form>
      </div>
      <div className="relative hidden overflow-hidden lg:block">
        <img src={BANNER} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-[#123E52]/80" />
        <div className="relative flex h-full flex-col justify-end p-14 text-white">
          <h2 className="max-w-md text-4xl font-bold leading-tight">ملف واحد لكل معاملة، من عرض السعر حتى تأكيد التحويل.</h2>
          <ul className="mt-8 space-y-3 text-sm text-white/80">
            <li>• يصدر الموظف عرض السعر مباشرة مع رابط و QR</li>
            <li>• العميل أو محاسبه يرفع إيصال التحويل</li>
            <li>• المشرف يؤكد وصول المبلغ من جواله</li>
            <li>• الموظف يرى النتيجة فوراً، والترحيل لدفترة تلقائي</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
