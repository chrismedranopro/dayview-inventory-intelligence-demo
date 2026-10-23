import { describe, expect, it } from 'vitest';
import { analysePrice, grossMargin, percentChange, unitCostPence } from './pricing';
import { matchLine, normalizeDescription } from './matching';
import { buildPurchaseMovements, estimatedStock, isDuplicateInvoice } from './ledger';
import type { Invoice, Product, StockMovement } from './types';

const catalog: Product[] = [
  { id: 'p1', barcode: '5000000000011', name: 'Basmati Rice 5kg', unit: 'each', sellPricePence: 1299, vatRate: 0 },
  { id: 'p2', barcode: '5000000000028', name: 'Whole Milk 2L', unit: 'each', sellPricePence: 189, vatRate: 0 },
  { id: 'p3', barcode: '5000000000035', name: 'Sunflower Oil 1L', unit: 'each', sellPricePence: 240, vatRate: 0.2 },
];

describe('pricing', () => {
  it('normalises pack cost', () => {
    expect(unitCostPence(1200, 6)).toEqual({ ok: true, value: 200 });
    expect(unitCostPence(1200, undefined).ok).toBe(false);
    expect(unitCostPence(1200, 0).ok).toBe(false);
  });
  it('computes ex-VAT margin', () => {
    const m = grossMargin(240, 0.2, 150); // net 200 -> 25%
    expect(m).toEqual({ ok: true, value: 0.25 });
  });
  it('refuses margin when VAT unknown', () => {
    expect(grossMargin(240, undefined, 150).ok).toBe(false);
  });
  it('percent change', () => {
    expect(percentChange(100, 110)).toBe(0.1);
    expect(percentChange(0, 10)).toBeUndefined();
  });
  it('flags increases and reports margin drop', () => {
    const a = analysePrice({ previousUnitCostPence: 150, newPackCostPence: 1020, packSize: 6, sellIncVatPence: 240, vatRate: 0.2 });
    expect(a.newUnitCost).toBe(170);
    expect(a.changePct).toBeCloseTo(0.1333, 3);
    expect(a.previousMargin).toBe(0.25);
    expect(a.newMargin).toBe(0.15);
    expect(a.needsReview).toBe(true);
  });
  it('marks unknown pack size as needing review, no fake margin', () => {
    const a = analysePrice({ previousUnitCostPence: 150, newPackCostPence: 1020, sellIncVatPence: 240, vatRate: 0.2 });
    expect(a.newMargin).toBeUndefined();
    expect(a.needsReview).toBe(true);
  });
});

describe('matching', () => {
  const line = (o: object) => ({ id: 'l', description: 'x', quantityPacks: 1, packCostPence: 100, ...o });
  it('barcode wins', () => {
    const r = matchLine(line({ barcode: '5000000000011', description: 'junk' }), 's1', catalog, []);
    expect(r).toMatchObject({ status: 'matched', method: 'barcode', productId: 'p1' });
  });
  it('supplier SKU mapping', () => {
    const r = matchLine(line({ supplierSku: 'A1' }), 's1', catalog, [{ supplierId: 's1', supplierSku: 'A1', productId: 'p2', unitsPerPack: 6 }]);
    expect(r).toMatchObject({ status: 'matched', method: 'supplier_sku', productId: 'p2' });
  });
  it('SKU mapping is supplier-scoped', () => {
    const r = matchLine(line({ supplierSku: 'A1', description: 'zzz' }), 's2', catalog, [{ supplierId: 's1', supplierSku: 'A1', productId: 'p2', unitsPerPack: 6 }]);
    expect(r.status).toBe('missing');
  });
  it('normalised description is only a suggestion', () => {
    const r = matchLine(line({ description: 'rice basmati 5 KG' }), 's1', catalog, []);
    expect(r).toMatchObject({ status: 'suggested', productId: 'p1' });
  });
  it('fuzzy requires review, never auto-matched', () => {
    const r = matchLine(line({ description: 'Whole Milk Fresh 2L Bottle' }), 's1', catalog, []);
    expect(r.status).toBe('needs_review');
    expect(r.productId).toBe('p2');
  });
  it('unknown is missing', () => {
    expect(matchLine(line({ description: 'Dragon Fruit' }), 's1', catalog, []).status).toBe('missing');
  });
  it('normalises units', () => {
    expect(normalizeDescription('Rice 5 kg')).toBe(normalizeDescription('5000g rice'));
  });
});

describe('ledger', () => {
  const inv: Invoice = { id: 'i', supplierId: 's1', invoiceNumber: 'INV-1', invoiceDate: '2026-10-01', lines: [] };
  const line = { id: '1', description: 'Milk', quantityPacks: 4, packSize: 6, packCostPence: 900 };
  it('creates receipt in base units', () => {
    const r = buildPurchaseMovements(inv, [{ line, productId: 'p2', unitsPerPack: 6 }], [], 'now');
    expect(r.ok && r.movements[0].quantity).toBe(24);
  });
  it('cannot approve twice', () => {
    const first = buildPurchaseMovements(inv, [{ line, productId: 'p2', unitsPerPack: 6 }], [], 'now');
    if (!first.ok) throw new Error();
    const second = buildPurchaseMovements(inv, [{ line, productId: 'p2', unitsPerPack: 6 }], first.movements, 'later');
    expect(second.ok).toBe(false);
  });
  it('stock = sum of movements', () => {
    const mv: StockMovement[] = [
      { id: 'a', productId: 'p2', type: 'opening', quantity: 10, occurredAt: '', sourceRef: 'o' },
      { id: 'b', productId: 'p2', type: 'sale', quantity: -3, occurredAt: '', sourceRef: 's' },
      { id: 'c', productId: 'p1', type: 'opening', quantity: 99, occurredAt: '', sourceRef: 'o2' },
    ];
    expect(estimatedStock(mv, 'p2')).toBe(7);
  });
  it('detects duplicate invoice per supplier only', () => {
    expect(isDuplicateInvoice([inv], { supplierId: 's1', invoiceNumber: ' inv-1' })).toBe(true);
    expect(isDuplicateInvoice([inv], { supplierId: 's2', invoiceNumber: 'INV-1' })).toBe(false);
  });
});
