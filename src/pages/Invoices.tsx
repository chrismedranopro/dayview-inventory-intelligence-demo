import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Badge, Card, ErrorState, Loading, btnPrimary } from '../components/ui';
import { loadSampleInvoice } from '../data/db';
import { useSnapshot } from '../data/useSnapshot';
import { buildContext, reviewInvoice } from '../domain/review';
import { extractionAdapter } from '../extraction/adapter';
import { money } from '../lib/format';

export default function Invoices() {
  const { snap, error, loading } = useSnapshot();
  const nav = useNavigate();
  const [msg, setMsg] = useState<{ tone: 'red' | 'amber'; text: string } | null>(null);
  if (loading) return <Loading />;
  if (error || !snap) return <ErrorState message={error ?? 'Unknown error'} />;
  const ctx = buildContext(snap);
  const supplier = (id: string) => snap.suppliers.find((s) => s.id === id)?.name ?? id;
  const load = async () => {
    const r = await loadSampleInvoice();
    if (r.ok) nav(`/invoices/${r.id}`); else setMsg({ tone: 'red', text: r.reason });
  };
  const onFile = (f: File | undefined) => {
    if (!f) return;
    setMsg({ tone: 'amber', text: `“${f.name}” was not processed: ${extractionAdapter.configured ? '' : 'extraction service not configured.'} Load the preloaded sample invoice instead. Use New invoice / CSV import for structured entry.` });
  };
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2"><h1 className="text-xl font-semibold">Supplier invoices</h1><Link to="/invoices/new" className={btnPrimary}>+ New invoice / CSV import</Link></div>
      <Card title="Add an invoice">
        <div className="flex flex-wrap items-center gap-3">
          <button className={btnPrimary} onClick={load}>Load sample invoice</button>
          <label className="text-sm text-slate-700">Upload PDF / image
            <input type="file" accept="application/pdf,image/*" className="ml-2 text-sm" onChange={(e) => onFile(e.target.files?.[0])} /></label>
          <Badge tone="amber">Extraction service not configured</Badge>
        </div>
        <p className="mt-2 text-xs text-slate-500">Documents are never pretended to be processed. The sample invoice is structured data bundled with the demo.</p>
        {msg && <p role="alert" className={`mt-3 rounded-md border p-2 text-sm ${msg.tone === 'red' ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>{msg.text}</p>}
      </Card>
      <Card title="Invoices">
        {snap.invoices.length === 0 ? <p className="text-sm text-slate-500">No invoices yet. Load the sample invoice to begin.</p> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-sm">
            <thead className="text-left text-xs text-slate-500"><tr><th className="py-1">Invoice</th><th>Supplier</th><th>Date</th><th className="text-right">Net (included)</th><th>Status</th></tr></thead>
            <tbody>{snap.invoices.map((i) => {
              const r = reviewInvoice(i, ctx, snap.invoices);
              return (<tr key={i.id} className="border-t border-slate-100">
                <td className="py-2"><Link className="font-medium text-sky-700 hover:underline" to={`/invoices/${i.id}`}>{i.invoiceNumber}</Link></td>
                <td>{supplier(i.supplierId)}</td><td>{i.invoiceDate}</td><td className="text-right tabular-nums">{money(r.netPence)}</td>
                <td>{i.status === 'approved' ? <Badge tone="green">Approved</Badge> : <Badge tone={r.canApprove ? 'blue' : 'red'}>{r.canApprove ? 'Ready to approve' : `${r.blockingLineCount + r.invoiceErrors.length} issue(s)`}</Badge>}</td></tr>);
            })}</tbody></table></div>
        )}
      </Card>
    </div>
  );
}
