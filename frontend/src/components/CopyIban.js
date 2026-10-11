import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";

export function CopyText({ value, label = "نسخ", testid }) {
  const [ok, setOk] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const t = document.createElement("textarea");
      t.value = value;
      document.body.appendChild(t);
      t.select();
      document.execCommand("copy");
      t.remove();
    }
    setOk(true);
    toast.success("تم النسخ");
    setTimeout(() => setOk(false), 1600);
  };
  return (
    <button type="button" onClick={copy} data-testid={testid} className="no-print inline-flex items-center gap-1.5 rounded-lg border border-[#137C83]/30 bg-white px-3 py-1.5 text-xs font-medium text-[#137C83] transition-colors hover:bg-[#137C83] hover:text-white">
      {ok ? <Check size={14} /> : <Copy size={14} />}
      {ok ? "تم" : label}
    </button>
  );
}

export function CopyIban({ iban, bank, name }) {
  const pretty = iban.replace(/(.{4})/g, "$1 ").trim();
  return (
    <div data-testid="iban-card" className="rounded-xl border border-[#137C83]/25 bg-[#137C83]/5 p-4">
      <div className="mb-1 text-xs text-[#5A6E7F]">التحويل البنكي — {bank}</div>
      <div className="text-xs text-[#5A6E7F]">باسم: {name}</div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span dir="ltr" className="font-mono text-sm font-semibold tracking-wide text-[#123E52]" data-testid="iban-value">{pretty}</span>
        <CopyText value={iban} label="نسخ الآيبان" testid="copy-iban-btn" />
      </div>
    </div>
  );
}
