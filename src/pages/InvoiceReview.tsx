import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Badge, Card, ErrorState, Loading, btnPrimary, btnSecondary, input } from '../components/ui';
import { approveInvoice, saveDraft } from '../data/db';
import { useSnapshot } from '../data/useSnapshot';
import { invoiceRef } from '../domain/ledger';
import { buildContext, reviewInvoice, type LineReview } from '../domain/review';
import type { LineDecision, StoredInvoice } from '../domain/state';
import type { InvoiceLine, MatchStatus, VatRate } from '../domain/types';
import { money, pct } from '../lib/format';

function NumField({ label, value, onChange, scale = 1, disabled }: { label: string; value?: number; onChange: (v?: number) => void; scale?: number; disabled?: boolean }) {
  const toText = (v?: number) => (v === undefined || !Number.isFinite(v) ? '' : String(Math.round((v / scale) * 10000) / 10000));
  const parse = (t: string) => { if (t.trim() === '' || Number.isNaN(parseFloat(t))) return undefined; const v = parseFloat(t) * scale; return scale === 1 ? v : Math.round(v); };
  const [text, setText] = useState(toText(value));
  useEffect(() => { if (parse(text) !== value) setText(toText(value)); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [value]);
  return (
    <label className="block text-xs font-medium text-slate-600">{label}
      <input className={`${input} mt-1`} inputMode="decimal" disabled={disabled} value={text}
        onChange={(e) => { setText(e.target.value); onChange(parse(e.target.value)); }} />
    </label>
  );
}

const statusBadge: Record<MatchStatus, { tone: 'green' | 'blue' | 'red' | 'amber'; label: string }> = {
  matched: { tone: 'green', label: 'Matched' }, suggested: { tone: 'blue', label: 'Suggested match' },
  missing: { tone: 'red', label: 'Missing product' }, needs_review: { tone: 'amber', label: 'Needs review' },
};

export default function InvoiceReview() {
  const { id } = useParams();
  const { snap, error, loading } = useSnapshot();
  const stored = snap?.invoices.find((i) => i.id === id);
  const [edited, setEdited] = useState<StoredInvoice | null>(null);
  const [notice, setNotice] = useState<{ tone: 'green' | 'red'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // Local edits overlay the stored invoice until saved; approved invoices always show stored data.
  const draft: StoredInvoice | null = stored ? (stored.status === 'draft' && edited?.id === stored.id ? edited : stored) : null;
  const setDraft = (d: StoredInvoice) => setEdited(d);
  const review = useMemo(() => (snap && draft ? reviewInvoice(draft, buildContext(snap), snap.invoices) : null), [snap, draft]);

  if (loading) return <Loading />;
  if (error || !snap) return <ErrorState message={error ?? 'Unknown error'} />;
  if (!stored) return <p className="text-sm">Invoice not found. <Link className="text-sky-700 underline" to="/invoices">Back to invoices</Link></p>;
  if (!draft || !review) return <Loading />;

  const supplier = snap.suppliers.find((s) => s.id === draft.supplierId)?.name ?? draft.supplierId;
  const readOnly = stored.status === 'approved';
  const dirty = !readOnly && JSON.stringify(draft) !== JSON.stringify(stored);
  const products = [...snap.products].sort((a, b) => a.name.localeCompare(b.name));
  const patchLine = (lid: string, p: Partial<InvoiceLine>) => setDraft({ ...draft, lines: draft.lines.map((l) => (l.id === lid ? { ...l, ...p } : l)) });
  const patchDecision = (lid: string, p: Partial<LineDecision>) => setDraft({ ...draft, decisions: { ...draft.decisions, [lid]: { ...draft.decisions[lid], ...p } } });

  const save = async () => { setBusy(true); const r = await saveDraft(draft); setBusy(false); setNotice(r.ok ? { tone: 'green', text: 'Draft saved.' } : { tone: 'red', text: r.reason }); };
  const approve = async () => {
    setBusy(true); const r = await approveInvoice(draft); setBusy(false);
    setNotice(r.ok ? { tone: 'green', text: `Approved. ${r.movementCount} stock movement(s) created.` } : { tone: 'red', text: r.reason });
  };

  const ref = invoiceRef(stored.supplierId, stored.invoiceNumber);
  const receipts = snap.movements.filter((m) => m.sourceRef.startsWith(`${ref}:`));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link className="text-xs text-sky-700 hover:underline" to="/invoices">← Invoices</Link>
          <h1 className="text-xl font-semibold">Invoice {draft.invoiceNumber} {readOnly ? <Badge tone="green">Approved</Badge> : <Badge tone="amber">Draft</Badge>}</h1>
          <p className="text-sm text-slate-600">{supplier}</p>
          <p className="text-xs text-slate-500">Source: {draft.sourceLabel}</p>
        </div>
        {!readOnly && (
          <div className="flex gap-2">
            <button className={btnSecondary} onClick={save} disabled={!dirty || busy}>Save draft</button>
            <button className={btnPrimary} onClick={approve} disabled={!review.canApprove || busy} title={review.canApprove ? '' : 'Resolve all blocking issues first'}>Approve &amp; receive stock</button>
          </div>
        )}
      </div>

      {notice && <p role="status" className={`rounded-md border p-2 text-sm ${notice.tone === 'green' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-red-200 bg-red-50 text-red-800'}`}>{notice.text} {notice.tone === 'green' && readOnly && <Link className="underline" to="/">View dashboard</Link>}</p>}
      {dirty && <p className="text-xs text-amber-800">Unsaved changes. Approving uses what is shown here.</p>}

      {review.invoiceErrors.length > 0 && !readOnly && (
        <ul role="alert" className="list-disc rounded-md border border-red-200 bg-red-50 p-3 pl-7 text-sm text-red-800">{review.invoiceErrors.map((e) => <li key={e}>{e}</li>)}</ul>)}

      <Card>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <label className="block text-xs font-medium text-slate-600">Invoice number<input className={`${input} mt-1`} disabled={readOnly} value={draft.invoiceNumber} onChange={(e) => setDraft({ ...draft, invoiceNumber: e.target.value })} /></label>
          <label className="block text-xs font-medium text-slate-600">Invoice date<input type="date" className={`${input} mt-1`} disabled={readOnly} value={draft.invoiceDate} onChange={(e) => setDraft({ ...draft, invoiceDate: e.target.value })} /></label>
          <Total label="Net (received)" v={review.netPence} /><Total label="VAT" v={review.vatPence} /><Total label="Gross" v={review.grossPence} />
        </div>
        <p className="mt-3 text-xs text-slate-600" data-testid="review-summary">
          {review.includedCount} of {draft.lines.length} lines included · {review.blockingLineCount} blocked · excluded value {money(review.excludedNetPence)} ex VAT (not received)
        </p>
      </Card>

      {readOnly ? (
        <Card title="Receipt result">
          <table className="w-full text-sm"><thead className="text-left text-xs text-slate-500"><tr><th>Line</th><th>Outcome</th><th className="text-right">Units received</th><th className="text-right">Unit cost</th><th className="text-right">Change</th></tr></thead>
            <tbody>{draft.lines.map((l) => {
              const mv = receipts.find((m) => m.id === `${ref}:${l.id}`); const c = snap.costHistory.find((x) => x.id === `${ref}:${l.id}`);
              return (<tr key={l.id} className="border-t border-slate-100"><td className="py-1.5">{l.description}</td>
                <td>{mv ? <Badge tone="green">Received</Badge> : <Badge>Excluded</Badge>}</td>
                <td className="text-right tabular-nums">{mv?.quantity ?? '–'}</td><td className="text-right tabular-nums">{money(c?.unitCostPence)}</td>
                <td className="text-right tabular-nums">{c?.changePct === undefined ? '–' : pct(c.changePct)}</td></tr>);
            })}</tbody></table>
          <p className="mt-3 text-xs text-slate-500">{receipts.length} movement(s) recorded. Approved invoices are immutable; see the audit trail on the dashboard.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {draft.lines.map((l, i) => (
            <LineCard key={l.id} n={i + 1} line={l} r={review.lines[i]} decision={draft.decisions[l.id] ?? {}}
              products={products} patchLine={patchLine} patchDecision={patchDecision} />
          ))}
        </div>
      )}
    </div>
  );
}

function Total({ label, v }: { label: string; v: number }) {
  return <div><p className="text-xs font-medium text-slate-600">{label}</p><p className="mt-1.5 text-lg font-semibold tabular-nums">{money(v)}</p></div>;
}

function LineCard({ n, line, r, decision, products, patchLine, patchDecision }: {
  n: number; line: InvoiceLine; r: LineReview; decision: LineDecision; products: { id: string; name: string }[];
  patchLine: (id: string, p: Partial<InvoiceLine>) => void; patchDecision: (id: string, p: Partial<LineDecision>) => void;
}) {
  const b = statusBadge[r.match.status];
  const a = r.analysis;
  const selected = decision.confirmedProductId ?? (r.match.status === 'matched' ? r.match.productId ?? '' : '');
  const blocked = !r.excluded && r.errors.length > 0;
  return (
    <section data-testid={`line-${line.id}`} className={`rounded-lg border bg-white p-4 shadow-sm ${r.excluded ? 'border-slate-200 opacity-70' : blocked ? 'border-red-300' : 'border-emerald-300'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Line {n}</h3>
        <div className="flex items-center gap-2">
          {r.excluded ? <Badge>Excluded</Badge> : blocked ? <Badge tone="red">{r.errors.length} blocking</Badge> : <Badge tone="green">Ready</Badge>}
          <label className="flex items-center gap-1 text-xs text-slate-700"><input type="checkbox" checked={r.excluded} onChange={(e) => patchDecision(line.id, { excluded: e.target.checked })} /> Exclude from receipt</label>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-6">
        <label className="col-span-2 block text-xs font-medium text-slate-600 md:col-span-3">Description<input className={`${input} mt-1`} value={line.description} onChange={(e) => patchLine(line.id, { description: e.target.value })} /></label>
        <label className="block text-xs font-medium text-slate-600">Supplier SKU<input className={`${input} mt-1`} value={line.supplierSku ?? ''} onChange={(e) => patchLine(line.id, { supplierSku: e.target.value || undefined })} /></label>
        <label className="block text-xs font-medium text-slate-600 md:col-span-2">Barcode<input className={`${input} mt-1`} value={line.barcode ?? ''} onChange={(e) => patchLine(line.id, { barcode: e.target.value || undefined })} /></label>
        <NumField label="Qty (packs)" value={line.quantityPacks} onChange={(v) => patchLine(line.id, { quantityPacks: v ?? 0 })} />
        <NumField label="Units per pack" value={line.packSize} onChange={(v) => patchLine(line.id, { packSize: v })} />
        <NumField label="Pack cost ex VAT (£)" value={line.packCostPence} scale={100} onChange={(v) => patchLine(line.id, { packCostPence: v ?? 0 })} />
        <label className="block text-xs font-medium text-slate-600">VAT rate
          <select className={`${input} mt-1`} aria-label={`VAT rate line ${n}`} value={line.vatRate === undefined ? '' : String(line.vatRate)}
            onChange={(e) => patchLine(line.id, { vatRate: e.target.value === '' ? undefined : (Number(e.target.value) as VatRate) })}>
            <option value="">Unknown</option><option value="0">0%</option><option value="0.05">5%</option><option value="0.2">20%</option></select></label>
        <NumField label="Line total ex VAT (£)" value={line.lineTotalPence} scale={100} onChange={(v) => patchLine(line.id, { lineTotalPence: v })} />
        <div className="flex items-end"><button className={`${btnSecondary} w-full !py-1.5 text-xs`} onClick={() => patchLine(line.id, { lineTotalPence: r.expectedLineTotalPence })}>Set total = qty × cost</button></div>
      </div>

      <div className="mt-3 rounded-md bg-slate-50 p-3 text-sm">
        <div className="flex flex-wrap items-center gap-2"><Badge tone={b.tone}>{b.label}</Badge><span className="text-xs text-slate-600">{r.match.reason}</span></div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select className={`${input} !w-72`} aria-label={`Product for line ${n}`} value={selected} onChange={(e) => patchDecision(line.id, { confirmedProductId: e.target.value || undefined })}>
            <option value="">Choose catalogue product…</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          {r.match.productId && r.match.status !== 'matched' && selected !== r.match.productId && (
            <button className={`${btnSecondary} !py-1.5 text-xs`} onClick={() => patchDecision(line.id, { confirmedProductId: r.match.productId })}>Confirm suggestion: {products.find((p) => p.id === r.match.productId)?.name}</button>)}
        </div>
        {a && !r.excluded && (
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs md:grid-cols-5">
            <Fact k="Normalised unit cost" v={money(a.newUnitCost)} /><Fact k="Previous unit cost" v={money(a.previousUnitCost)} />
            <Fact k="Change" v={a.changePct === undefined ? '–' : `${a.changePct >= 0 ? '+' : ''}${pct(a.changePct)}`} bad={(a.changePct ?? 0) >= 0.03} />
            <Fact k="Margin before → after" v={`${pct(a.previousMargin)} → ${pct(a.newMargin)}`} /><Fact k="Units received" v={String(r.unitsPerPack ? r.unitsPerPack * line.quantityPacks : '–')} />
          </dl>)}
      </div>

      {!r.excluded && r.errors.length > 0 && <ul role="alert" className="mt-2 list-disc pl-5 text-xs text-red-700">{r.errors.map((e) => <li key={e}>{e}</li>)}</ul>}
      {!r.excluded && r.warnings.length > 0 && <ul className="mt-2 list-disc pl-5 text-xs text-amber-800">{r.warnings.map((e) => <li key={e}>{e}</li>)}</ul>}
    </section>
  );
}

function Fact({ k, v, bad }: { k: string; v: string; bad?: boolean }) {
  return <div><dt className="text-slate-500">{k}</dt><dd className={`font-medium tabular-nums ${bad ? 'text-red-700' : ''}`}>{v}</dd></div>;
}
