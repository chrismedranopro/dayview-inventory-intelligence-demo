import type { Invoice, Product, StockMovement, SupplierSkuMapping } from './types';

export interface Supplier { id: string; name: string }

export interface LineDecision {
  /** Product the reviewer explicitly confirmed (required for anything but an exact barcode/SKU match). */
  confirmedProductId?: string;
  /** Line is left out of this receipt (e.g. product missing from the catalogue). */
  excluded?: boolean;
}

export interface StoredInvoice extends Invoice {
  status: 'draft' | 'approved';
  decisions: Record<string, LineDecision>;
  createdAt: string;
  approvedAt?: string;
  sourceLabel: string;
}

export interface CostRecord {
  id: string;
  productId: string;
  /** Ex-VAT cost per base unit, pence. */
  unitCostPence: number;
  effectiveDate: string;
  sourceRef: string;
  previousUnitCostPence?: number;
  changePct?: number;
  previousMargin?: number;
  newMargin?: number;
}

export interface AuditEvent {
  id?: number;
  at: string;
  type:
    | 'demo_reset'
    | 'invoice_loaded'
    | 'invoice_saved'
    | 'invoice_approved'
    | 'approval_blocked'
    | 'duplicate_blocked';
  invoiceId?: string;
  message: string;
}

export interface Snapshot {
  suppliers: Supplier[];
  products: Product[];
  mappings: SupplierSkuMapping[];
  invoices: StoredInvoice[];
  movements: StockMovement[];
  costHistory: CostRecord[];
  audit: AuditEvent[];
}
