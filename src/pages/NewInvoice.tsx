import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, btnPrimary, btnSecondary, input } from '../components/ui';
import { createInvoiceDraft } from '../data/db';
import { useSnapshot } from '../data/useSnapshot';
import { CSV_COLUMNS, guessMapping, makeDraft, parseCsv, validateRows, type CsvColumn } from '../domain/import';
import type { InvoiceLine } from '../domain/types';

const empty = (): InvoiceLine => ({id:crypto.randomUUID(),description:'',quantityPacks:1,packSize:1,packCostPence:0,vatRate:0});
export default function NewInvoice() {
  const {snap,loading,error} = useSnapshot(); const nav = useNavigate();
  const [mode,setMode] = useState<'manual'|'csv'>('manual');
  const [supplierId,setSupplierId] = useState('s-bridgeway'); const [number,setNumber] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [lines,setLines] = useState<InvoiceLine[]>([empty()]);
  const [headers,setHeaders] = useState<string[]>([]); const [rows,setRows] = useState<string[][]>([]);
  const [mapping,setMapping] = useState<Record<CsvColumn,string>>(guessMapping([]));
  const [fileName,setFileName] = useState(''); const [message,setMessage] = useState(''); const [busy,setBusy] = useState(false);
  const preview = validateRows(headers,rows,mapping);
  const patch = (id:string, change:Partial<InvoiceLine>) => setLines(old=>old.map(l=>l.id===id?{...l,...change}:l));
  const loadFile = async (file?:File) => { if(!file)return; setMessage(''); try {if(file.size>1024*1024)throw new Error('CSV exceeds 1MB limit'); const parsed=parseCsv(await file.text()); if(parsed.length<2)throw new Error('CSV must include a header and at least one data row'); const h=parsed[0]; if(new Set(h).size!==h.length)throw new Error('Duplicate CSV column headers'); setHeaders(h);setRows(parsed.slice(1));setMapping(guessMapping(h));setFileName(file.name);} catch(e){setHeaders([]);setRows([]);setMessage(e instanceof Error?e.message:String(e));} };
  const save = async () => {
    if(!number.trim()){setMessage('Enter an invoice number.');return;}
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))){setMessage('Enter a valid invoice date.');return;}
    const selected = mode==='csv'?preview.lines:lines;
    if(mode==='csv' && preview.errors.length){setMessage('Resolve all CSV validation errors before importing.');return;}
    if(!selected.length || selected.some(l=>!l.description.trim()||!Number.isFinite(l.quantityPacks)||l.quantityPacks<=0||!Number.isFinite(l.packCostPence)||l.packCostPence<0)){setMessage('Each line needs a description, positive quantity and valid pack cost.');return;}
    setBusy(true);const r=await createInvoiceDraft(makeDraft({supplierId,invoiceNumber:number.trim(),invoiceDate:date,sourceLabel:mode==='csv'?`CSV import: ${fileName}`:'Manual entry'},selected));setBusy(false);
    if(r.ok)nav(`/invoices/${r.id}`);else setMessage(r.reason);
  };
  if(loading)return <p>Loading…</p>;if(error||!snap)return <p role="alert">{error||'Unable to load data'}</p>;
  return <div className="space-y-5"><Link to="/invoices" className="text-sm text-sky-700">← Invoices</Link><h1 className="text-xl font-semibold">Create supplier invoice</h1>
    <Card title="Invoice details"><div className="grid gap-3 md:grid-cols-3">
      <label className="text-xs font-medium">Supplier<select className={`${input} mt-1`} value={supplierId} onChange={e=>setSupplierId(e.target.value)}>{snap.suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <label className="text-xs font-medium">Invoice number<input className={`${input} mt-1`} value={number} onChange={e=>setNumber(e.target.value)} placeholder="INV-1001" /></label>
      <label className="text-xs font-medium">Invoice date<input type="date" className={`${input} mt-1`} value={date} onChange={e=>setDate(e.target.value)} /></label>
    </div></Card>
    <Card title="Invoice lines"><div className="flex gap-2 mb-4"><button className={mode==='manual'?btnPrimary:btnSecondary} onClick={()=>setMode('manual')}>Manual entry</button><button className={mode==='csv'?btnPrimary:btnSecondary} onClick={()=>setMode('csv')}>CSV import</button></div>
    {mode==='manual'?<div className="space-y-3">{lines.map((l,i)=><div className="rounded-lg border p-3 space-y-2" key={l.id}><div className="flex justify-between"><strong className="text-sm">Line {i+1}</strong><button className="text-xs text-red-700" disabled={lines.length===1} onClick={()=>setLines(a=>a.filter(x=>x.id!==l.id))}>Remove</button></div><div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      <label className="text-xs col-span-2">Description<input className={input} value={l.description} onChange={e=>patch(l.id,{description:e.target.value})}/></label>
      <label className="text-xs">Supplier SKU<input className={input} value={l.supplierSku||''} onChange={e=>patch(l.id,{supplierSku:e.target.value||undefined})}/></label>
      <label className="text-xs">Barcode<input className={input} value={l.barcode||''} onChange={e=>patch(l.id,{barcode:e.target.value||undefined})}/></label>
      <label className="text-xs">Packs<input className={input} type="number" min="0.0001" step="any" value={l.quantityPacks} onChange={e=>patch(l.id,{quantityPacks:Number(e.target.value)})}/></label>
      <label className="text-xs">Units per pack<input className={input} type="number" min="0.0001" step="any" value={l.packSize??''} onChange={e=>patch(l.id,{packSize:e.target.value?Number(e.target.value):undefined})}/></label>
      <label className="text-xs">Pack cost ex VAT (£)<input className={input} type="number" min="0" step="0.01" value={(l.packCostPence/100).toFixed(2)} onChange={e=>patch(l.id,{packCostPence:Math.round(Number(e.target.value)*100)})}/></label>
      <label className="text-xs">VAT<select className={input} value={l.vatRate??''} onChange={e=>patch(l.id,{vatRate:e.target.value===''?undefined:Number(e.target.value) as 0|0.05|0.2})}><option value="">Unknown</option><option value="0">0%</option><option value="0.05">5%</option><option value="0.2">20%</option></select></label>
    </div></div>)}<button className={btnSecondary} onClick={()=>setLines(a=>[...a,empty()])}>+ Add line</button></div>:
    <div className="space-y-3"><p className="text-sm text-slate-600">Choose a CSV with a header row. Map the supplier columns, preview and validate before creating a draft.</p><a className="text-sm text-sky-700 underline" href="/sample-invoice.csv" download>Download fictional sample CSV</a><input type="file" accept=".csv,text/csv" onChange={e=>loadFile(e.target.files?.[0])} className="block text-sm"/>
      {headers.length>0&&<><p className="text-sm">{fileName} · {rows.length} rows</p><div className="grid grid-cols-2 md:grid-cols-4 gap-2">{CSV_COLUMNS.map(c=><label className="text-xs" key={c}>{c}<select className={input} value={mapping[c]} onChange={e=>setMapping(m=>({...m,[c]:e.target.value}))}><option value="">Not mapped</option>{headers.map(h=><option key={h} value={h}>{h}</option>)}</select></label>)}</div>
      {preview.errors.length>0&&<ul role="alert" className="bg-red-50 text-red-800 text-sm p-3 rounded-md list-disc pl-6">{preview.errors.map((e,i)=><li key={i}>{e}</li>)}</ul>}
      <div className="overflow-x-auto"><table className="min-w-[500px] w-full text-xs"><thead><tr><th className="text-left">Description</th><th>Qty</th><th>Pack</th><th>Cost</th><th>VAT</th></tr></thead><tbody>{preview.lines.map(l=><tr key={l.id} className="border-t"><td>{l.description}</td><td className="text-center">{l.quantityPacks}</td><td className="text-center">{l.packSize??'Review'}</td><td className="text-center">£{(l.packCostPence/100).toFixed(2)}</td><td className="text-center">{l.vatRate===undefined?'Review':`${l.vatRate*100}%`}</td></tr>)}</tbody></table></div><p className="text-xs text-slate-600">{preview.lines.length} valid row(s). Unknown VAT and pack size require review after import.</p></>}
    </div>}
    </Card>{message&&<p role="alert" className="bg-red-50 p-3 text-red-800 text-sm">{message}</p>}<button disabled={busy} onClick={save} className={btnPrimary}>{busy?'Saving…':'Create draft & review matches'}</button>
  </div>;
}
