import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Card, ErrorState, Kpi, Loading, input } from '../components/ui';
import { useSnapshot } from '../data/useSnapshot';
import { computeDashboard } from '../domain/dashboard';
import { dateTime, money, num, pct } from '../lib/format';

export default function Dashboard() {
  const { snap, error, loading } = useSnapshot();
  const [q, setQ] = useState('');
  const d = useMemo(() => (snap ? computeDashboard(snap) : null), [snap]);
  if (loading) return <Loading />;
  if (error || !snap || !d) return <ErrorState message={error ?? 'Unknown error'} />;
  const x = d.exceptions;
  const rows = d.stockRows.filter((r) => r.product.name.toLowerCase().includes(q.toLowerCase()) || r.product.barcode.includes(q));
  const names = new Map(snap.products.map((p) => [p.id, p.name]));
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Executive inventory dashboard</h1>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Estimated stock value" value={money(d.stockValuePence)} hint="Σ stock × latest ex-VAT unit cost" />
        <Kpi label="Units in stock" value={num(d.stockUnits)} hint="From the movement ledger" />
        <Kpi label="Invoices awaiting approval" value={d.invoices.draft} hint={`${d.invoices.approved} approved · ${d.invoices.total} total`} tone={d.invoices.draft ? 'amber' : undefined} />
        <Kpi label="Blocked invoice lines" value={x.blockedLines} hint="Unresolved issues in draft invoices" tone={x.blockedLines ? 'red' : undefined} />
        <Kpi label="Missing from EPOS catalogue" value={x.missingProducts} tone={x.missingProducts ? 'amber' : undefined} />
        <Kpi label="Uncertain matches" value={x.uncertainMatches} tone={x.uncertainMatches ? 'amber' : undefined} />
        <Kpi label="Unknown VAT / pack size" value={`${x.unknownVat} / ${x.unresolvedPackSizes}`} tone={x.unknownVat + x.unresolvedPackSizes ? 'amber' : undefined} />
        <Kpi label="Duplicate attempts blocked" value={x.duplicatesBlocked} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Open exceptions in draft invoices">
          {d.exceptionItems.length === 0 ? <p className="text-sm text-slate-500">No open exceptions. Load the sample invoice from the Invoices page to see some.</p> : (
            <ul className="divide-y divide-slate-100">
              {d.exceptionItems.map((e) => (
                <li key={`${e.invoiceId}-${e.lineId}`} className="py-2 text-sm">
                  <Link className="font-medium text-sky-700 hover:underline" to={`/invoices/${e.invoiceId}`}>{e.invoiceNumber} · {e.description}</Link>
                  <ul className="mt-1 list-disc pl-5 text-xs text-slate-600">{e.messages.map((m) => <li key={m}>{m}</li>)}</ul>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Supplier price increases (≥ 3%)">
          {d.priceIncreases.length === 0 ? <p className="text-sm text-slate-500">None recorded.</p> : (
            <table className="w-full text-sm"><thead className="text-left text-xs text-slate-500"><tr><th>Product</th><th className="text-right">Was</th><th className="text-right">Now</th><th className="text-right">Change</th></tr></thead>
              <tbody>{d.priceIncreases.slice(0, 8).map((c) => (
                <tr key={c.id} className="border-t border-slate-100"><td className="py-1.5">{c.productName}</td>
                  <td className="text-right tabular-nums">{money(c.previousUnitCostPence)}</td><td className="text-right tabular-nums">{money(c.unitCostPence)}</td>
                  <td className="text-right tabular-nums text-red-700">+{pct(c.changePct)}</td></tr>))}</tbody></table>
          )}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Recent invoice activity">
          <ul className="space-y-2 text-sm" aria-label="Recent activity">
            {d.recentActivity.map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-3">
                <span>{a.invoiceId ? <Link className="text-sky-700 hover:underline" to={`/invoices/${a.invoiceId}`}>{a.message}</Link> : a.message}</span>
                <span className="shrink-0 text-xs text-slate-500">{dateTime(a.at)}</span>
              </li>))}
          </ul>
        </Card>
        <Card title="Latest stock movements">
          <ul className="space-y-1.5 text-sm">
            {d.recentMovements.map((m) => (
              <li key={m.id} className="flex justify-between gap-3"><span>{names.get(m.productId)} <Badge tone={m.quantity > 0 ? 'green' : 'slate'}>{m.type.replace('_', ' ')}</Badge></span>
                <span className={`tabular-nums ${m.quantity > 0 ? 'text-emerald-700' : 'text-slate-700'}`}>{m.quantity > 0 ? '+' : ''}{m.quantity}</span></li>))}
          </ul>
        </Card>
      </div>

      <Card title="Estimated stock by product" action={<input aria-label="Search products" className={`${input} !w-56`} placeholder="Search name or barcode" value={q} onChange={(e) => setQ(e.target.value)} />}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs text-slate-500"><tr><th className="py-1">Product</th><th>Category</th><th className="text-right">Stock</th><th className="text-right">Unit cost</th><th className="text-right">Value</th><th className="text-right">Margin</th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={6} className="py-4 text-center text-slate-500">No products match “{q}”.</td></tr>}
              {rows.map((r) => {
                const net = r.product.sellPricePence / (1 + r.product.vatRate);
                const margin = r.unitCostPence === undefined ? undefined : (net - r.unitCostPence) / net;
                return (
                  <tr key={r.product.id} className="border-t border-slate-100" data-testid={`stock-${r.product.id}`}>
                    <td className="py-1.5">{r.product.name}<span className="block text-xs text-slate-400">{r.product.barcode}</span></td>
                    <td className="text-slate-600">{r.product.category}</td>
                    <td className="text-right tabular-nums">{num(r.stock)} {r.product.unit === 'kg' ? 'kg' : ''}</td>
                    <td className="text-right tabular-nums">{money(r.unitCostPence)}</td><td className="text-right tabular-nums">{money(r.valuePence)}</td>
                    <td className="text-right tabular-nums">{pct(margin)}</td>
                  </tr>);
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
