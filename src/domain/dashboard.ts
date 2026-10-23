import { stockByProduct } from './ledger';
import { PRICE_INCREASE_REVIEW_THRESHOLD } from './pricing';
import { buildContext, latestCostByProduct, reviewInvoice } from './review';
import type { AuditEvent, CostRecord, Snapshot } from './state';
import type { Product, StockMovement } from './types';

export interface StockRow { product: Product; stock: number; unitCostPence?: number; valuePence: number }
export interface ExceptionItem { invoiceId: string; invoiceNumber: string; lineId: string; description: string; messages: string[] }

export interface Dashboard {
  stockValuePence: number;
  stockUnits: number;
  stockRows: StockRow[];
  invoices: { total: number; draft: number; approved: number };
  exceptions: {
    blockedLines: number; missingProducts: number; uncertainMatches: number;
    unknownVat: number; unresolvedPackSizes: number; pendingPriceIncreases: number; duplicatesBlocked: number;
  };
  exceptionItems: ExceptionItem[];
  priceIncreases: Array<CostRecord & { productName: string }>;
  recentActivity: AuditEvent[];
  recentMovements: StockMovement[];
}

export function computeDashboard(s: Snapshot): Dashboard {
  const stock = stockByProduct(s.movements);
  const cost = latestCostByProduct(s.costHistory);
  const stockRows: StockRow[] = s.products.map((p) => {
    const qty = stock.get(p.id) ?? 0;
    const unitCostPence = cost.get(p.id);
    return { product: p, stock: qty, unitCostPence, valuePence: unitCostPence === undefined ? 0 : qty * unitCostPence };
  });
  const ctx = buildContext(s);
  const ex = { blockedLines: 0, missingProducts: 0, uncertainMatches: 0, unknownVat: 0, unresolvedPackSizes: 0, pendingPriceIncreases: 0, duplicatesBlocked: 0 };
  const exceptionItems: ExceptionItem[] = [];
  for (const inv of s.invoices) {
    const review = reviewInvoice(inv, ctx, s.invoices);
    review.lines.forEach((r, i) => {
      if (r.flags.missing) ex.missingProducts++;
      if (inv.status !== 'draft' || r.excluded) return;
      if (r.errors.length) ex.blockedLines++;
      if (r.flags.uncertain) ex.uncertainMatches++;
      if (r.flags.unknownVat) ex.unknownVat++;
      if (r.flags.packUnresolved) ex.unresolvedPackSizes++;
      if (r.flags.priceIncrease) ex.pendingPriceIncreases++;
      if (r.errors.length || r.warnings.length)
        exceptionItems.push({ invoiceId: inv.id, invoiceNumber: inv.invoiceNumber, lineId: r.lineId, description: inv.lines[i].description, messages: [...r.errors, ...r.warnings] });
    });
  }
  ex.duplicatesBlocked = s.audit.filter((a) => a.type === 'duplicate_blocked').length;
  const names = new Map(s.products.map((p) => [p.id, p.name]));
  return {
    stockValuePence: Math.round(stockRows.reduce((a, r) => a + r.valuePence, 0)),
    stockUnits: stockRows.reduce((a, r) => a + r.stock, 0),
    stockRows,
    invoices: { total: s.invoices.length, draft: s.invoices.filter((i) => i.status === 'draft').length, approved: s.invoices.filter((i) => i.status === 'approved').length },
    exceptions: ex,
    exceptionItems,
    priceIncreases: s.costHistory
      .filter((c) => (c.changePct ?? 0) >= PRICE_INCREASE_REVIEW_THRESHOLD)
      .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))
      .map((c) => ({ ...c, productName: names.get(c.productId) ?? c.productId })),
    recentActivity: [...s.audit].sort((a, b) => (b.id ?? 0) - (a.id ?? 0)).slice(0, 8),
    recentMovements: [...s.movements].filter((m) => m.type !== 'opening').sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, 8),
  };
}
