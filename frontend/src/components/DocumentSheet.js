import { QRCodeSVG } from "qrcode.react";
import { money, d } from "@/lib/format";
import { CopyIban } from "@/components/CopyIban";

const Banner = ({ type }) =>
  type === "quote" ? (
    <div data-testid="doc-banner-quote" className="doc-banner border-2 border-dashed border-amber-400 bg-amber-50 px-4 py-3 text-amber-900">
      <div className="text-lg font-bold">عرض سعر — ليس فاتورة</div>
      <div className="text-xs">هذا المستند عرض سعر فقط ولا يُعد فاتورة ضريبية. أي دفعة عليه تُسجّل كدفعة مقدمة.</div>
    </div>
  ) : (
    <div data-testid="doc-banner-invoice" className="doc-banner border-2 border-emerald-600 bg-emerald-50 px-4 py-3 text-emerald-900">
      <div className="text-lg font-bold">فاتورة</div>
      <div className="text-xs">الفاتورة الضريبية المعتمدة تصدر من نظام دفترة بعد الترحيل.</div>
    </div>
  );

export function DocumentSheet({ tx, factory, link }) {
  return (
    <article data-testid="document-sheet" className="doc-sheet overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
      <Banner type={tx.doc_type} />
      <div className="grid gap-6 p-5 sm:grid-cols-[1fr_auto] sm:p-8">
        <div className="space-y-1">
          <div className="text-xl font-bold text-[#123E52]">{factory?.name}</div>
          <div className="text-xs text-[#5A6E7F]">{factory?.address}</div>
          <div className="text-xs text-[#5A6E7F]">الرقم الضريبي: {factory?.vat_number || "—"} · السجل التجاري: {factory?.cr_number || "—"}</div>
        </div>
        <div className="space-y-1 text-sm sm:text-left">
          <div className="font-mono text-lg font-bold text-[#172B36]" data-testid="doc-number">{tx.number}</div>
          {tx.quote_number && <div className="text-xs text-[#5A6E7F]">محوّلة من عرض السعر {tx.quote_number}</div>}
          <div className="text-xs text-[#5A6E7F]">تاريخ الإصدار: {d(tx.issued_at)}</div>
          {tx.due_date && <div className="text-xs text-[#5A6E7F]">تاريخ الاستحقاق: {d(tx.due_date)}</div>}
        </div>
      </div>
      <div className="mx-5 rounded-lg bg-[#F5F7FA] p-4 text-sm sm:mx-8">
        <div className="text-xs text-[#5A6E7F]">العميل</div>
        <div className="font-semibold">{tx.customer?.name}</div>
        {tx.customer?.vat_number && <div className="text-xs text-[#5A6E7F]">الرقم الضريبي: {tx.customer.vat_number}</div>}
      </div>
      <ItemsTable tx={tx} />
      <div className="grid gap-6 border-t border-[#E2E8F0] p-5 sm:grid-cols-2 sm:p-8">
        <div className="space-y-3">
          {factory?.iban && <CopyIban iban={factory.iban} bank={factory.bank_name} name={factory.account_name || factory.name} />}
          {tx.notes && <p className="text-xs text-[#5A6E7F]">ملاحظات: {tx.notes}</p>}
        </div>
        {link && (
          <div className="flex items-center gap-4 sm:justify-end">
            <QRCodeSVG value={link} size={104} fgColor="#123E52" data-testid="doc-qr" />
            <p className="max-w-[160px] text-[11px] leading-relaxed text-[#5A6E7F]">رمز QR هذا رابط لملف المعاملة فقط، وليس رمز ZATCA الضريبي.</p>
          </div>
        )}
      </div>
    </article>
  );
}

function ItemsTable({ tx }) {
  return (
    <div className="p-5 sm:p-8">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#E2E8F0] text-xs text-[#5A6E7F]">
              <th className="py-2 text-right font-medium">البيان</th>
              <th className="py-2 text-center font-medium">الكمية</th>
              <th className="py-2 text-left font-medium">سعر الوحدة</th>
              <th className="py-2 text-left font-medium">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {tx.items?.map((it, i) => (
              <tr key={i} className="border-b border-dashed border-[#E2E8F0]">
                <td className="py-2.5">{it.description}</td>
                <td className="py-2.5 text-center tabular-nums">{it.qty}</td>
                <td className="py-2.5 text-left tabular-nums">{money(it.unit_price)}</td>
                <td className="py-2.5 text-left tabular-nums">{money(it.qty * it.unit_price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="mr-auto mt-4 max-w-xs space-y-1.5 text-sm">
        <Row k="المجموع قبل الضريبة" v={money(tx.subtotal)} />
        <Row k="ضريبة القيمة المضافة 15%" v={money(tx.vat)} />
        <Row k="الإجمالي" v={money(tx.total)} bold testid="doc-total" />
      </dl>
    </div>
  );
}

const Row = ({ k, v, bold, testid }) => (
  <div className={`flex justify-between ${bold ? "border-t border-[#E2E8F0] pt-2 text-base font-bold text-[#123E52]" : "text-[#5A6E7F]"}`}>
    <dt>{k}</dt>
    <dd className="tabular-nums" data-testid={testid}>{v}</dd>
  </div>
);
