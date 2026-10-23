import type { ReactNode } from 'react';

const tones = {
  green: 'bg-emerald-50 text-emerald-800 ring-emerald-600/20',
  amber: 'bg-amber-50 text-amber-900 ring-amber-600/30',
  red: 'bg-red-50 text-red-800 ring-red-600/20',
  slate: 'bg-slate-100 text-slate-700 ring-slate-500/20',
  blue: 'bg-sky-50 text-sky-800 ring-sky-600/20',
} as const;

export function Badge({ tone = 'slate', children }: { tone?: keyof typeof tones; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tones[tone]}`}>{children}</span>;
}

export function Card({ title, action, children, className = '' }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-slate-200 bg-white shadow-sm ${className}`}>
      {title && <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><h2 className="text-sm font-semibold text-slate-800">{title}</h2>{action}</header>}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Kpi({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: string; tone?: 'red' | 'amber' }) {
  const c = tone === 'red' ? 'text-red-700' : tone === 'amber' ? 'text-amber-700' : 'text-slate-900';
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${c}`} data-testid={`kpi-${label}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export const btn = 'inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 disabled:cursor-not-allowed disabled:opacity-50';
export const btnPrimary = `${btn} bg-slate-900 text-white hover:bg-slate-700`;
export const btnSecondary = `${btn} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50`;
export const input = 'w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-sky-600 focus:outline-none focus:ring-1 focus:ring-sky-600 disabled:bg-slate-100';

export function Loading() { return <p role="status" className="p-6 text-sm text-slate-500">Loading demo data…</p>; }
export function ErrorState({ message }: { message: string }) {
  return <div role="alert" className="m-6 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800"><strong>Could not load local demo data.</strong> {message}<br />IndexedDB may be unavailable (private browsing or blocked storage).</div>;
}
