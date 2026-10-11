import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Printer } from "lucide-react";
import { api } from "@/lib/api";
import { DocumentSheet } from "@/components/DocumentSheet";
import { Loading } from "@/components/Layout";

export default function PrintDoc() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  useEffect(() => {
    api.get(`/transactions/${id}`).then((r) => setData(r.data));
  }, [id]);
  if (!data) return <div className="p-8"><Loading /></div>;
  const tx = data.transaction;
  document.title = `${tx.doc_type === "quote" ? "عرض سعر" : "فاتورة"} ${tx.number}`;
  return (
    <div className="min-h-screen bg-[#F5F7FA] p-4 print:bg-white print:p-0 sm:p-10">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="no-print flex items-center justify-between">
          <span className="text-sm text-[#5A6E7F]">اختر "حفظ كـ PDF" من نافذة الطباعة</span>
          <button onClick={() => window.print()} data-testid="print-btn" className="inline-flex items-center gap-2 rounded-xl bg-[#123E52] px-5 py-2.5 text-sm font-semibold text-white"><Printer size={16} /> طباعة / PDF</button>
        </div>
        <DocumentSheet tx={tx} factory={data.tenant} link={tx.public_token ? `${window.location.origin}/p/${tx.public_token}` : null} />
      </div>
    </div>
  );
}
