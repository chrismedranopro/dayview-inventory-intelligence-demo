/** All money is integer-friendly pence (GBP). VAT rates are fractions (0, 0.05, 0.2). */
export type VatRate = 0 | 0.05 | 0.2;

export interface Product {
  id: string;
  barcode: string;
  name: string;
  category?: string;
  /** Units sold per EPOS stock unit, e.g. "each", "kg". */
  unit: string;
  /** Shelf price including VAT, in pence. */
  sellPricePence: number;
  vatRate: VatRate;
}

export interface SupplierSkuMapping {
  supplierId: string;
  supplierSku: string;
  productId: string;
  /** Base units contained in one supplier pack for this mapping. */
  unitsPerPack: number;
}

export interface InvoiceLine {
  id: string;
  description: string;
  supplierSku?: string;
  barcode?: string;
  /** Number of packs invoiced. */
  quantityPacks: number;
  /** Base units per pack; undefined when unknown. */
  packSize?: number;
  /** Cost of one pack, ex VAT, in pence. */
  packCostPence: number;
  vatRate?: VatRate;
  lineTotalPence?: number;
}

export interface Invoice {
  id: string;
  supplierId: string;
  invoiceNumber: string;
  invoiceDate: string; // ISO yyyy-mm-dd
  lines: InvoiceLine[];
}

export type MatchStatus = 'matched' | 'suggested' | 'missing' | 'needs_review';
export type MatchMethod = 'barcode' | 'supplier_sku' | 'description' | 'fuzzy' | 'none';

export interface MatchResult {
  status: MatchStatus;
  method: MatchMethod;
  productId?: string;
  /** 0..1 */
  confidence: number;
  reason: string;
}

export type MovementType =
  | 'opening'
  | 'purchase_receipt'
  | 'sale'
  | 'adjustment'
  | 'waste'
  | 'return'
  | 'count_correction';

export interface StockMovement {
  id: string;
  productId: string;
  type: MovementType;
  /** Signed base units: positive adds stock, negative removes. */
  quantity: number;
  occurredAt: string;
  /** Idempotency / traceability, e.g. "invoice:INV-1:line:2". */
  sourceRef: string;
  note?: string;
}
