import type { StoredInvoice } from './state';
import type { InvoiceLine, VatRate } from './types';

export const CSV_COLUMNS = ['description','supplier_sku','barcode','quantity_packs','pack_size','pack_cost_gbp','vat_rate','line_total_gbp'] as const;
export type CsvColumn = typeof CSV_COLUMNS[number];
export type ImportRow = Record<CsvColumn, string>;

/** RFC4180-style CSV parser with quoted fields, escaped quotes and embedded newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let field = ''; let quoted = false;
  const src = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') { if (field.length) throw new Error('Unexpected quote in CSV field'); quoted = true; }
    else if (c === ',') { row.push(field.trim()); field = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && src[i+1] === '\n') i++; row.push(field.trim()); if (row.some(Boolean)) rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (quoted) throw new Error('Unterminated quoted CSV field');
  row.push(field.trim()); if (row.some(Boolean)) rows.push(row);
  return rows;
}

export const normalizeHeader = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
export function guessMapping(headers: string[]): Record<CsvColumn, string> {
  const aliases: Record<CsvColumn,string[]> = {
    description:['description','product','product_name','item','item_description'],
    supplier_sku:['supplier_sku','sku','supplier_code','item_code'],
    barcode:['barcode','ean','ean13','gtin'],
    quantity_packs:['quantity_packs','quantity','qty','packs'],
    pack_size:['pack_size','units_per_pack','case_size'],
    pack_cost_gbp:['pack_cost_gbp','pack_cost','unit_cost','cost_gbp','price_ex_vat'],
    vat_rate:['vat_rate','vat','tax_rate'],
    line_total_gbp:['line_total_gbp','line_total','net_total','total_ex_vat'],
  };
  return Object.fromEntries(CSV_COLUMNS.map(c => [c,headers.find(h => aliases[c].includes(normalizeHeader(h))) ?? ''])) as Record<CsvColumn,string>;
}

function pounds(s: string): number | undefined {
  if (!s.trim()) return undefined;
  const clean = s.replace(/[£,\s]/g, '');
  if (!/^\d+(?:\.\d{1,2})?$/.test(clean)) return NaN;
  return Math.round(Number(clean) * 100);
}
export function validateRows(headers: string[], rows: string[][], mapping: Record<CsvColumn,string>): {lines: InvoiceLine[]; errors: string[]} {
  const errors: string[] = []; const lines: InvoiceLine[] = [];
  if (!mapping.description || !mapping.quantity_packs || !mapping.pack_cost_gbp) return { lines, errors:['Map description, quantity_packs and pack_cost_gbp columns before importing.'] };
  rows.forEach((row,i) => {
    const get = (c: CsvColumn) => { const ix = headers.indexOf(mapping[c]); return ix < 0 ? '' : (row[ix] ?? '').trim(); };
    const err: string[] = []; const description = get('description');
    if (!description) err.push('description required');
    const quantity = Number(get('quantity_packs')); if (!get('quantity_packs') || !Number.isFinite(quantity) || quantity <= 0) err.push('quantity must be positive');
    const packRaw = get('pack_size'); const pack = packRaw ? Number(packRaw) : undefined;
    if (packRaw && (!Number.isFinite(pack) || pack! <= 0)) err.push('pack size must be positive');
    const cost = pounds(get('pack_cost_gbp')); if (cost === undefined || !Number.isFinite(cost) || cost < 0) err.push('invalid pack cost GBP');
    const vatRaw = get('vat_rate').replace('%',''); let vat: VatRate | undefined;
    if (vatRaw) { const v = Number(vatRaw); const decimal = v > 1 ? v / 100 : v; if ([0,0.05,0.2].includes(decimal)) vat = decimal as VatRate; else err.push('VAT must be 0, 5 or 20 percent'); }
    const total = pounds(get('line_total_gbp')); if (total !== undefined && (!Number.isFinite(total) || total < 0)) err.push('invalid line total GBP');
    if (err.length) errors.push(`Row ${i+2}: ${err.join('; ')}`);
    else lines.push({ id:`line-${i+1}`, description, supplierSku:get('supplier_sku') || undefined, barcode:get('barcode') || undefined, quantityPacks:quantity, packSize:pack, packCostPence:cost!, vatRate:vat, lineTotalPence:total });
  });
  if (!rows.length) errors.push('CSV contains no invoice lines.');
  return {lines,errors};
}
export function makeDraft(meta: {supplierId:string;invoiceNumber:string;invoiceDate:string;sourceLabel:string}, lines:InvoiceLine[]):StoredInvoice {
  return {id:crypto.randomUUID(), ...meta, lines, status:'draft', decisions:{}, createdAt:new Date().toISOString()};
}
