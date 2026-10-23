import { matchLine } from './matching';
import { analysePrice, type PriceAnalysis, PRICE_INCREASE_REVIEW_THRESHOLD } from './pricing';
import { invoiceRef } from './ledger';
import type { CostRecord, Snapshot, StoredInvoice } from './state';
import type { InvoiceLine, MatchResult, Product, SupplierSkuMapping } from './types';

export interface ReviewContext {
  products: Product[];
  mappings: SupplierSkuMapping[];
  latestUnitCost: Map<string, number>;
}

export interface LineReview {
  lineId: string;
  match: MatchResult;
  excluded: boolean;
  productId?: string;
  unitsPerPack?: number;
  analysis?: PriceAnalysis;
  expectedLineTotalPence: number;
  /** Block approval of this line (ignored when the line is excluded). */
  errors: string[];
  warnings: string[];
  /** Individual flags used for exception counts. */
  flags: { missing: boolean; uncertain: boolean; unknownVat: boolean; packUnresolved: boolean; priceIncrease: boolean };
}

export interface InvoiceReview {
  lines: LineReview[];
  includedCount: number;
  netPence: number;
  vatPence: number;
  grossPence: number;
  excludedNetPence: number;
  blockingLineCount: number;
  invoiceErrors: string[];
  canApprove: boolean;
}

export function latestCostByProduct(history: CostRecord[]): Map<string, number> {
  const sorted = [...history].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate) || a.id.localeCompare(b.id));
  const out = new Map<string, number>();
  for (const r of sorted) out.set(r.productId, r.unitCostPence);
  return out;
}

export function buildContext(s: Pick<Snapshot, 'products' | 'mappings' | 'costHistory'>): ReviewContext {
  return { products: s.products, mappings: s.mappings, latestUnitCost: latestCostByProduct(s.costHistory) };
}

const validPositive = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

export function expectedLineTotal(line: InvoiceLine): number {
  return Math.round(line.quantityPacks * line.packCostPence);
}

export function reviewLine(inv: StoredInvoice, line: InvoiceLine, ctx: ReviewContext): LineReview {
  const decision = inv.decisions[line.id] ?? {};
  const excluded = !!decision.excluded;
  const match = matchLine(line, inv.supplierId, ctx.products, ctx.mappings);
  const confirmed = decision.confirmedProductId && ctx.products.some((p) => p.id === decision.confirmedProductId)
    ? decision.confirmedProductId : undefined;
  const productId = confirmed ?? (match.status === 'matched' ? match.productId : undefined);
  const product = productId ? ctx.products.find((p) => p.id === productId) : undefined;

  const errors: string[] = [];
  const warnings: string[] = [];
  const flags = { missing: match.status === 'missing', uncertain: false, unknownVat: false, packUnresolved: false, priceIncrease: false };

  if (!product) {
    if (match.status === 'missing') errors.push('Product is missing from the EPOS catalogue: exclude this line until it has been created in EPOS.');
    else { errors.push('Product match is not confirmed: confirm the suggestion or choose a product.'); flags.uncertain = true; }
  }
  if (!validPositive(line.packSize)) { errors.push('Pack size is unresolved: enter units per pack.'); flags.packUnresolved = true; }
  if (line.vatRate === undefined) { errors.push('VAT rate is unknown: select the VAT rate shown on the invoice.'); flags.unknownVat = true; }
  if (!validPositive(line.quantityPacks)) errors.push('Quantity must be greater than zero.');
  if (!validPositive(line.packCostPence)) errors.push('Pack cost must be greater than zero.');
  const expected = expectedLineTotal(line);
  if (line.lineTotalPence === undefined) errors.push('Line total is missing.');
  else if (Math.abs(line.lineTotalPence - expected) > 1)
    errors.push(`Line total £${(line.lineTotalPence / 100).toFixed(2)} does not equal quantity × pack cost (£${(expected / 100).toFixed(2)}).`);

  let analysis: PriceAnalysis | undefined;
  let unitsPerPack: number | undefined;
  if (product) {
    unitsPerPack = validPositive(line.packSize) ? line.packSize : undefined;
    analysis = analysePrice({
      previousUnitCostPence: ctx.latestUnitCost.get(product.id),
      newPackCostPence: line.packCostPence,
      packSize: unitsPerPack,
      sellIncVatPence: product.sellPricePence,
      vatRate: product.vatRate,
    });
    if (analysis.changePct !== undefined && analysis.changePct >= PRICE_INCREASE_REVIEW_THRESHOLD) {
      flags.priceIncrease = true;
      const m = analysis.previousMargin !== undefined && analysis.newMargin !== undefined
        ? `; margin ${(analysis.previousMargin * 100).toFixed(1)}% → ${(analysis.newMargin * 100).toFixed(1)}%` : '';
      warnings.push(`Supplier cost up ${(analysis.changePct * 100).toFixed(1)}%${m}: pricing review recommended.`);
    }
    const map = ctx.mappings.find((x) => x.supplierId === inv.supplierId && x.supplierSku === line.supplierSku);
    if (map && unitsPerPack !== undefined && map.unitsPerPack !== unitsPerPack)
      warnings.push(`Pack size ${unitsPerPack} differs from the saved mapping (${map.unitsPerPack}).`);
    if (line.vatRate !== undefined && line.vatRate !== product.vatRate)
      warnings.push(`Invoice VAT ${line.vatRate * 100}% differs from the catalogue VAT ${product.vatRate * 100}%.`);
  }
  return { lineId: line.id, match, excluded, productId, unitsPerPack, analysis, expectedLineTotalPence: expected, errors, warnings, flags };
}

export function reviewInvoice(inv: StoredInvoice, ctx: ReviewContext, allInvoices: StoredInvoice[]): InvoiceReview {
  const lines = inv.lines.map((l) => reviewLine(inv, l, ctx));
  const invoiceErrors: string[] = [];
  const ref = invoiceRef(inv.supplierId, inv.invoiceNumber);
  if (!inv.invoiceNumber.trim()) invoiceErrors.push('Invoice number is required.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inv.invoiceDate)) invoiceErrors.push('Invoice date is required.');
  if (allInvoices.some((o) => o.id !== inv.id && invoiceRef(o.supplierId, o.invoiceNumber) === ref))
    invoiceErrors.push('Duplicate invoice: this supplier invoice number already exists.');
  if (inv.status === 'approved') invoiceErrors.push('Invoice has already been approved.');

  let net = 0, vat = 0, excludedNet = 0, included = 0, blocking = 0;
  inv.lines.forEach((l, i) => {
    const r = lines[i];
    const lineNet = Math.round(l.quantityPacks * l.packCostPence) || 0;
    if (r.excluded) { excludedNet += lineNet; return; }
    included++;
    net += lineNet;
    vat += Math.round(lineNet * (l.vatRate ?? 0));
    if (r.errors.length) blocking++;
  });
  if (included === 0) invoiceErrors.push('No lines are included in the receipt.');
  return {
    lines, includedCount: included, netPence: net, vatPence: vat, grossPence: net + vat,
    excludedNetPence: excludedNet, blockingLineCount: blocking, invoiceErrors,
    canApprove: invoiceErrors.length === 0 && blocking === 0 && included > 0,
  };
}
