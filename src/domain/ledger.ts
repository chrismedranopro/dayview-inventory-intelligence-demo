import type { Invoice, InvoiceLine, StockMovement } from './types';

export function estimatedStock(movements: StockMovement[], productId: string): number {
  return movements.filter((m) => m.productId === productId).reduce((s, m) => s + m.quantity, 0);
}

export function stockByProduct(movements: StockMovement[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of movements) out.set(m.productId, (out.get(m.productId) ?? 0) + m.quantity);
  return out;
}

export interface ApprovedLine { line: InvoiceLine; productId: string; unitsPerPack: number }

export type ApprovalResult =
  | { ok: true; movements: StockMovement[] }
  | { ok: false; reason: string };

export const invoiceRef = (supplierId: string, invoiceNumber: string) => `invoice:${supplierId}:${invoiceNumber.trim().toUpperCase()}`;

/** Duplicate = same invoice number for the same supplier (case/space-insensitive). */
export function isDuplicateInvoice(existing: Pick<Invoice, 'supplierId' | 'invoiceNumber'>[], inv: Pick<Invoice, 'supplierId' | 'invoiceNumber'>): boolean {
  const ref = invoiceRef(inv.supplierId, inv.invoiceNumber);
  return existing.some((e) => invoiceRef(e.supplierId, e.invoiceNumber) === ref);
}

/**
 * Pure: builds purchase receipt movements. Idempotent because the caller
 * passes existing movements; if any carry this invoice's ref, approval is refused.
 */
export function buildPurchaseMovements(
  invoice: Invoice,
  approved: ApprovedLine[],
  existingMovements: StockMovement[],
  now: string,
): ApprovalResult {
  const ref = invoiceRef(invoice.supplierId, invoice.invoiceNumber);
  if (existingMovements.some((m) => m.sourceRef.startsWith(`${ref}:`)))
    return { ok: false, reason: 'Invoice already approved: stock movements exist' };
  for (const a of approved) {
    if (!(a.unitsPerPack > 0)) return { ok: false, reason: `Line "${a.line.description}" has no valid pack size` };
    if (!(a.line.quantityPacks > 0)) return { ok: false, reason: `Line "${a.line.description}" has no valid quantity` };
  }
  return {
    ok: true,
    movements: approved.map((a) => ({
      id: `${ref}:${a.line.id}`,
      productId: a.productId,
      type: 'purchase_receipt' as const,
      quantity: a.line.quantityPacks * a.unitsPerPack,
      occurredAt: now,
      sourceRef: `${ref}:line:${a.line.id}`,
    })),
  };
}
