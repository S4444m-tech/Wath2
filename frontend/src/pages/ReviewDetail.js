import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowRight, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg, idemKey } from "@/lib/api";
import { money, dt } from "@/lib/format";
import { Card, Loading } from "@/components/Layout";
import { StatusBadge, DocChip } from "@/components/StatusBadge";
import { ConfirmForm } from "@/components/ConfirmForm";

function Preview({ att }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    api.get(`/attachments/${att.id}/url`).then((r) => setUrl(`${process.env.REACT_APP_BACKEND_URL}${r.data.url}`));
  }, [att.id]);
  if (!url) return <div className="h-80 animate-pulse rounded-xl bg-[#F5F7FA]" />;
  if (att.mime === "application/pdf") return <iframe title="receipt" src={url} className="h-[520px] w-full rounded-xl border" data-testid="receipt-preview" />;
  if (att.mime === "image/heic") return <a href={url} target="_blank" rel="noreferrer" className="text-sm text-[#137C83] underline" data-testid="receipt-preview">ملف HEIC — اضغط للتحميل والعرض</a>;
  return <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="إيصال التحويل" className="max-h-[560px] w-full rounded-xl border object-contain" data-testid="receipt-preview" /></a>;
}

export default function ReviewDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const key = useRef(idemKey());
  const load = () => api.get(`/reviews/${id}`).then((r) => setData(r.data)).catch((e) => toast.error(errMsg(e)));
  useEffect(() => {
    load();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!data) return <Loading />;
  const { attachment: a, transaction: tx } = data;
  const open = ["pending_review", "not_seen", "needs_attention"].includes(a.status);

  const decide = async (payload) => {
    try {
      await api.post(`/reviews/${id}/decide`, { ...payload, expected_version: a.version }, { headers: { "Idempotency-Key": key.current } });
      toast.success(payload.decision === "confirm" ? "تم تأكيد وصول المبلغ — الموظف يرى النتيجة الآن" : "تم حفظ القرار وإبلاغ الموظف");
      nav("/app/reviews");
    } catch (e) {
      toast.error(errMsg(e));
      if (e.response?.status === 409) load();
      key.current = idemKey();
    }
  };

  return (
    <div className="fade-up space-y-5">
      <Link to="/app/reviews" className="inline-flex items-center gap-1 text-sm text-[#5A6E7F]" data-testid="back-to-reviews"><ArrowRight size={16} /> المراجعات</Link>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2"><DocChip type={tx.doc_type} /><h1 className="font-mono text-2xl font-bold">{tx.number}</h1><span className="text-sm text-[#5A6E7F]">{tx.customer.name}</span></div>
        <StatusBadge status={a.status} kind="att" testid="review-att-status" />
      </div>
      <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
        <Card title="الإيصال المرفوع">
          <Preview att={a} />
          <div className="mt-3 space-y-1 text-xs text-[#5A6E7F]">
            <div>رفعه: {a.uploader.name} · {dt(a.created_at)}</div>
            {a.note && <div>ملاحظة الرافع: {a.note}</div>}
            {a.duplicate_of && <div className="flex items-center gap-1 text-rose-600"><AlertTriangle size={13} /> تحذير: نفس الملف مرفوع على {a.duplicate_of}</div>}
            <div className="rounded-lg bg-amber-50 p-2 text-amber-900">الإيصال وحده ليس دليلاً على الدفع. أكّد فقط بعد رؤية الحركة في كشف البنك.</div>
          </div>
        </Card>
        <div className="space-y-5">
          <Card title="ملخص المستند">
            <dl className="grid grid-cols-3 gap-2 text-center text-sm">
              <div><dt className="text-xs text-[#5A6E7F]">الإجمالي</dt><dd className="font-bold tabular-nums">{money(tx.total)}</dd></div>
              <div><dt className="text-xs text-[#5A6E7F]">المؤكد</dt><dd className="font-bold tabular-nums text-emerald-700">{money(tx.confirmed)}</dd></div>
              <div><dt className="text-xs text-[#5A6E7F]">المتبقي</dt><dd className="font-bold tabular-nums text-amber-700" data-testid="review-remaining">{money(tx.remaining)}</dd></div>
            </dl>
          </Card>
          {open ? <ConfirmForm tx={tx} others={data.open_transactions} onDecide={decide} /> : <Card><p className="text-sm">تمت مراجعة هذا الإيصال.</p></Card>}
        </div>
      </div>
    </div>
  );
}
