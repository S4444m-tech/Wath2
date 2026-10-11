export const PageHeader = ({ title, sub, actions, testid }) => (
  <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
    <div>
      <h1 data-testid={testid} className="text-2xl font-bold text-[#172B36] sm:text-3xl">{title}</h1>
      {sub && <p className="mt-1 text-sm text-[#5A6E7F]">{sub}</p>}
    </div>
    {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
  </div>
);

export const Card = ({ title, children, className = "", actions, testid }) => (
  <section data-testid={testid} className={`rounded-xl border border-[#E2E8F0] bg-white shadow-sm ${className}`}>
    {title && (
      <div className="flex items-center justify-between gap-2 border-b border-[#E2E8F0] px-5 py-3.5">
        <h2 className="text-base font-semibold text-[#172B36]">{title}</h2>
        {actions}
      </div>
    )}
    <div className="p-5">{children}</div>
  </section>
);

export const Stat = ({ label, value, tone = "text-[#123E52]", testid }) => (
  <div className="rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-sm">
    <div className="text-xs text-[#5A6E7F]">{label}</div>
    <div data-testid={testid} className={`mt-1 text-xl font-bold tabular-nums sm:text-2xl ${tone}`}>{value}</div>
  </div>
);

export const Empty = ({ children }) => <div className="rounded-xl border border-dashed border-[#CBD5E1] bg-white p-10 text-center text-sm text-[#5A6E7F]">{children}</div>;

export const Loading = () => (
  <div className="space-y-3" data-testid="loading">
    {[0, 1, 2].map((i) => (
      <div key={i} className="h-16 animate-pulse rounded-xl bg-white" />
    ))}
  </div>
);
