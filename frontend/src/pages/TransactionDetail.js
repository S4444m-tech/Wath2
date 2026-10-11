import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowRight, Radio } from "lucide-react";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import { useAuth } from "@/context/AuthContext";
import { useLive } from "@/hooks/useLive";
import { StatusBadge, DocChip } from "@/components/StatusBadge";
import { Card, Stat, Loading } from "@/components/Layout";
import { DocumentSheet } from "@/components/DocumentSheet";
import { UploadBox } from "@/components/UploadBox";
import { SharePanel } from "@/components/tx/SharePanel";
import { AttachmentsPanel } from "@/components/tx/AttachmentsPanel";
import { LedgerPanel } from "@/components/tx/LedgerPanel";
import { DaftraPanel } from "@/components/tx/DaftraPanel";
import { HistoryPanel } from "@/components/tx/HistoryPanel";
import { TxActions } from "@/components/tx/TxActions";

export default function TransactionDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [pulse, setPulse] = useState(false);
  const load = useCallback(() => api.get(`/transactions/${id}`).then((r) => setData(r.data)), [id]);
  useEffect(() => {
    load();
  }, [load]);
  useLive(() => {
    load();
    setPulse(true);
    setTimeout(() => setPulse(false), 1200);
  }, id);
  if (!data) return <Loading />;
  const tx = data.transaction;
  const link = tx.public_token ? `${window.location.origin}/p/${tx.public_token}` : null;

  return (
    <div className="fade-up space-y-5">
      <Link to="/app/transactions" className="inline-flex items-center gap-1 text-sm text-[#5A6E7F] hover:text-[#123E52]" data-testid="back-to-list"><ArrowRight size={16} /> رجوع</Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><DocChip type={tx.doc_type} /><h1 className="font-mono text-2xl font-bold" data-testid="tx-number">{tx.number}</h1></div>
          <p className="mt-1 text-sm text-[#5A6E7F]">{tx.customer.name} · أصدره {tx.created_by.name} · نسخة {tx.version}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 text-xs ${pulse ? "text-emerald-600" : "text-[#5A6E7F]"}`}><Radio size={13} className="live-dot" /> مباشر</span>
          <StatusBadge status={tx.payment_status} testid="tx-payment-status" />
          <StatusBadge status={tx.daftra_status} kind="sync" testid="tx-daftra-status" />
        </div>
      </div>
      {tx.needs_rereview && <div data-testid="rereview-banner" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">تم تعديل المستند بعد تأكيد مبالغ عليه — يحتاج إعادة مراجعة من المشرف.</div>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="الإجمالي" value={money(tx.total)} testid="tx-total" />
        <Stat label="المؤكد (من دفتر التوزيع)" value={money(tx.confirmed)} tone="text-emerald-700" testid="tx-confirmed" />
        <Stat label="المتبقي" value={money(tx.remaining)} tone={tx.remaining ? "text-amber-700" : "text-emerald-700"} testid="tx-remaining" />
        <Stat label={tx.is_advance ? "دفعة مقدمة / رصيد" : "رصيد دائن"} value={money(tx.credit)} tone="text-teal-700" testid="tx-credit" />
      </div>
      <TxActions tx={tx} user={user} reload={load} />
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          <AttachmentsPanel atts={data.attachments} user={user} />
          <LedgerPanel allocations={data.allocations} />
          <DocumentSheet tx={tx} factory={data.tenant} link={link} />
        </div>
        <div className="space-y-5">
          <SharePanel tx={tx} link={link} delegations={data.delegations} />
          <Card title="رفع إيصال نيابة عن العميل"><UploadBox url={`/transactions/${id}/attachments`} onDone={load} testid="staff-upload" /></Card>
          <DaftraPanel tx={tx} jobs={data.jobs} mappings={data.mappings} user={user} reload={load} />
          <HistoryPanel reviews={data.reviews} versions={data.versions} />
        </div>
      </div>
    </div>
  );
}
