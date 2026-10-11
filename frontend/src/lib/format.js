const nf = new Intl.NumberFormat("ar-SA-u-nu-latn", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const money = (h) => `${nf.format((h || 0) / 100)} ر.س`;
export const toHalalas = (v) => Math.round(parseFloat(String(v || "0").replace(/,/g, "")) * 100) || 0;
export const fromHalalas = (h) => ((h || 0) / 100).toFixed(2);
export const dt = (s) => (s ? new Date(s).toLocaleString("ar-SA-u-nu-latn", { dateStyle: "medium", timeStyle: "short" }) : "—");
export const d = (s) => (s ? new Date(s).toLocaleDateString("ar-SA-u-nu-latn", { dateStyle: "medium" }) : "—");

export const PAY_STATUS = {
  issued: { label: "صادر — بانتظار الدفع", cls: "bg-slate-50 text-slate-700 border-slate-200" },
  pending_review: { label: "بانتظار مراجعة المشرف", cls: "bg-sky-50 text-sky-700 border-sky-200" },
  not_seen: { label: "المبلغ لم يظهر بعد", cls: "bg-amber-50 text-amber-800 border-amber-200" },
  needs_attention: { label: "يحتاج انتباه", cls: "bg-rose-50 text-rose-700 border-rose-200" },
  partially_paid: { label: "مدفوع جزئياً", cls: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  paid: { label: "مدفوع بالكامل", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  overpaid: { label: "مدفوع بزيادة", cls: "bg-teal-50 text-teal-700 border-teal-200" },
};

export const ATT_STATUS = {
  pending_review: { label: "بانتظار المراجعة", cls: "bg-sky-50 text-sky-700 border-sky-200" },
  confirming: { label: "جارِ التأكيد", cls: "bg-sky-50 text-sky-700 border-sky-200" },
  confirmed: { label: "تم تأكيد الوصول", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  not_seen: { label: "لم يظهر بعد", cls: "bg-amber-50 text-amber-800 border-amber-200" },
  needs_attention: { label: "يحتاج انتباه", cls: "bg-rose-50 text-rose-700 border-rose-200" },
  reversed: { label: "معكوس", cls: "bg-zinc-100 text-zinc-700 border-zinc-300" },
};

export const SYNC_STATUS = {
  not_synced: { label: "لم يُرحّل لدفترة", cls: "bg-slate-50 text-slate-600 border-slate-200" },
  queued: { label: "في طابور الترحيل", cls: "bg-sky-50 text-sky-700 border-sky-200" },
  synced: { label: "مُرحّل إلى دفترة", cls: "bg-teal-50 text-teal-700 border-teal-200" },
  failed: { label: "فشل الترحيل", cls: "bg-rose-50 text-rose-700 border-rose-200" },
  needs_reconciliation: { label: "يحتاج مطابقة", cls: "bg-amber-50 text-amber-800 border-amber-200" },
  done: { label: "تم", cls: "bg-teal-50 text-teal-700 border-teal-200" },
  running: { label: "قيد التنفيذ", cls: "bg-sky-50 text-sky-700 border-sky-200" },
};

export const ROLE = { employee: "موظف", supervisor: "مشرف", manager: "مدير المصنع", superadmin: "المشرف العام" };
export const DOC = { quote: "عرض سعر", invoice: "فاتورة" };
