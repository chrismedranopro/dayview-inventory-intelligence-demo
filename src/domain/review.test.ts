import { describe, expect, it } from 'vitest';
import { computeDashboard } from './dashboard';
import { buildContext, reviewInvoice } from './review';
import { barcodeOf, costHistory, mappings, movements, products, sampleInvoice, suppliers } from './seed';
import type { Snapshot, StoredInvoice } from './state';

const snap = (invoices: StoredInvoice[] = []): Snapshot => ({ suppliers, products, mappings, invoices, movements, costHistory, audit: [] });
const inv = () => sampleInvoice('2026-10-20T00:00:00Z');
const review = (i: StoredInvoice, all: StoredInvoice[] = [i]) => reviewInvoice(i, buildContext(snap()), all);

describe('sample invoice review', () => {
  it('classifies the five demo lines as designed', () => {
    const r = review(inv());
    expect(r.lines.map((l) => l.match.status)).toEqual(['matched', 'matched', 'missing', 'matched', 'needs_review']);
    expect(r.lines[0].errors).toEqual([]);                      // exact match, unchanged cost
    expect(r.lines[1].analysis?.changePct).toBeCloseTo(0.0952, 3); // price increase
    expect(r.lines[1].flags.priceIncrease).toBe(true);
    expect(r.lines[3].analysis?.newUnitCost).toBe(57);          // 1368 / 24
    expect(r.lines[4].flags).toMatchObject({ uncertain: true, unknownVat: true });
    expect(r.canApprove).toBe(false);
    expect(r.blockingLineCount).toBe(2);
  });
  it('blocks until uncertain match + VAT are resolved and missing line excluded', () => {
    const i = inv();
    i.decisions['3'] = { excluded: true };
    expect(review(i).canApprove).toBe(false);
    i.decisions['5'] = { confirmedProductId: 'p-chicken' };
    expect(review(i).canApprove).toBe(false);                   // VAT still unknown
    i.lines[4].vatRate = 0;
    const r = review(i);
    expect(r.canApprove).toBe(true);
    expect(r.includedCount).toBe(4);
    expect(r.netPence).toBe(8200 + 8280 + 6840 + 10400);
    expect(r.excludedNetPence).toBe(1960);
  });
  it('blocks unresolved pack size and line-total mismatch', () => {
    const i = inv(); i.decisions['3'] = { excluded: true }; i.decisions['5'] = { confirmedProductId: 'p-chicken' }; i.lines[4].vatRate = 0;
    i.lines[0].packSize = undefined;
    expect(review(i).lines[0].flags.packUnresolved).toBe(true);
    i.lines[0].packSize = 1; i.lines[0].quantityPacks = 11;
    expect(review(i).lines[0].errors[0]).toMatch(/Line total/);
  });
  it('flags duplicates per supplier', () => {
    const a = inv(); const b = { ...inv(), id: 'other' };
    expect(review(b, [a, b]).invoiceErrors.join()).toMatch(/Duplicate/);
  });
  it('barcodes are unique', () => {
    expect(new Set(products.map((p) => p.barcode)).size).toBe(products.length);
    expect(barcodeOf('p-rice-bas5')).toHaveLength(13);
  });
});

describe('dashboard', () => {
  it('derives exception counts from invoices', () => {
    const d = computeDashboard(snap([inv()]));
    expect(d.invoices).toEqual({ total: 1, draft: 1, approved: 0 });
    expect(d.exceptions).toMatchObject({ blockedLines: 2, missingProducts: 1, uncertainMatches: 1, unknownVat: 1, pendingPriceIncreases: 2 });
  });
  it('stock value = Σ stock × latest cost', () => {
    const d = computeDashboard(snap());
    const manual = d.stockRows.reduce((a, r) => a + r.stock * (r.unitCostPence ?? 0), 0);
    expect(d.stockValuePence).toBe(Math.round(manual));
    expect(d.stockRows.every((r) => r.stock >= 0)).toBe(true);
  });
});
