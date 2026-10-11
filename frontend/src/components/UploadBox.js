import { useRef, useState } from "react";
import { UploadCloud, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg, idemKey } from "@/lib/api";

const OK = ["application/pdf", "image/jpeg", "image/png", "image/heic", "image/heif"];

export function UploadBox({ url, onDone, testid = "upload-proof", hint }) {
  const ref = useRef();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const pick = async (file) => {
    if (!file) return;
    const heic = /\.hei[cf]$/i.test(file.name);
    if (!OK.includes(file.type) && !heic) return toast.error("المسموح: PDF أو JPG أو PNG أو HEIC");
    if (file.size > 10 * 1024 * 1024) return toast.error("الحد الأقصى 10 ميغابايت");
    const fd = new FormData();
    fd.append("file", file);
    fd.append("note", note);
    setBusy(true);
    try {
      await api.post(url, fd, { headers: { "Idempotency-Key": idemKey() } });
      toast.success("تم رفع الإيصال — بانتظار مراجعة المشرف");
      setNote("");
      onDone?.();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  };

  return (
    <div className="space-y-3">
      <label
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          pick(e.dataTransfer.files?.[0]);
        }}
        className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-[#137C83]/40 bg-[#137C83]/5 px-4 py-8 text-center transition-colors hover:bg-[#137C83]/10"
      >
        {busy ? <Loader2 className="animate-spin text-[#137C83]" /> : <UploadCloud className="text-[#137C83]" size={30} />}
        <span className="text-sm font-semibold text-[#123E52]">{busy ? "جارِ الرفع والفحص…" : "اختر صورة أو ملف إيصال التحويل"}</span>
        <span className="text-xs text-[#5A6E7F]">{hint || "PDF / JPG / PNG / HEIC — حتى 10 ميغابايت"}</span>
        <input ref={ref} type="file" accept=".pdf,.jpg,.jpeg,.png,.heic,.heif,application/pdf,image/*" className="sr-only" disabled={busy} onChange={(e) => pick(e.target.files?.[0])} data-testid={`${testid}-input`} />
      </label>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="ملاحظة اختيارية (مثلاً: دفعة أولى)" data-testid={`${testid}-note`} className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm outline-none focus:border-[#137C83]" />
      <p className="text-[11px] text-[#5A6E7F]">رفع الإيصال لا يعني أن المبلغ مدفوع — يتم التأكيد فقط بعد تحقق المشرف من وصول المبلغ للحساب البنكي.</p>
    </div>
  );
}

export async function openAttachment(id) {
  const w = window.open("", "_blank");
  try {
    const { data } = await api.get(`/attachments/${id}/url`);
    w.location = `${process.env.REACT_APP_BACKEND_URL}${data.url}`;
  } catch (e) {
    w && w.close();
    toast.error(errMsg(e));
  }
}
