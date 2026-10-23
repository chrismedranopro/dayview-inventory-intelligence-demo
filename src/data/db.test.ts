import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { computeDashboard } from '../domain/dashboard';
import { stockByProduct } from '../domain/ledger';
import { SAMPLE_INVOICE_ID } from '../domain/seed';
import type { StoredInvoice } from '../domain/state';
import { approveInvoice, closeDb, loadSampleInvoice, loadSnapshot, resetDemo, saveDraft, useDatabaseName } from './db';

let n = 0;
beforeEach(async () => { await closeDb(); useDatabaseName(`test-${++n}`); });

const resolved = async (): Promise<StoredInvoice> => {
  await loadSampleInvoice();
  const inv = (await loadSnapshot()).invoices[0];
  inv.decisions['3'] = { excluded: true };
  inv.decisions['5'] = { confirmedProductId: 'p-chicken' };
  inv.lines[4].vatRate = 0;
  return inv;
};

describe('IndexedDB workflow', () => {
  it('seeds on first open', async () => {
    const s = await loadSnapshot();
    expect(s.products.length).toBe(15);
    expect(s.invoices).toHaveLength(0);
  });
  it('refuses to approve while blocked, writes no movements', async () => {
    await loadSampleInvoice();
    const before = (await loadSnapshot()).movements.length;
    const inv = (await loadSnapshot()).invoices[0];
    const r = await approveInvoice(inv);
    expect(r.ok).toBe(false);
    const after = await loadSnapshot();
    expect(after.movements.length).toBe(before);
    expect(after.invoices[0].status).toBe('draft');
  });
  it('approves once; stock, value and costs update consistently', async () => {
    const before = await loadSnapshot();
    const v0 = computeDashboard(before).stockValuePence;
    const inv = await resolved();
    const r = await approveInvoice(inv);
    expect(r).toMatchObject({ ok: true, movementCount: 4 });
    const s = await loadSnapshot();
    const stock = stockByProduct(s.movements);
    const was = stockByProduct(before.movements);
    expect(stock.get('p-rice-bas5')! - was.get('p-rice-bas5')!).toBe(10);
    expect(stock.get('p-milk2l')! - was.get('p-milk2l')!).toBe(72);   // 12 cases × 6
    expect(stock.get('p-beans')! - was.get('p-beans')!).toBe(120);    // 5 cases × 24
    expect(stock.get('p-chicken')! - was.get('p-chicken')!).toBe(20);
    // Excluded dragon fruit never received.
    expect(s.movements.some((m) => m.sourceRef.includes(':line:3'))).toBe(false);
    // Receipt value consistency: Σ units × normalised unit cost == invoice net (±1p/line rounding).
    const recv = s.movements.filter((m) => m.type === 'purchase_receipt' && m.sourceRef.startsWith('invoice:'));
    const value = recv.reduce((a, m) => a + m.quantity * s.costHistory.find((c) => c.id === m.id)!.unitCostPence, 0);
    expect(Math.abs(value - (8200 + 8280 + 6840 + 10400))).toBeLessThan(1);
    expect(computeDashboard(s).stockValuePence).toBeGreaterThan(v0);
    expect(s.invoices[0].status).toBe('approved');
    expect(computeDashboard(s).priceIncreases[0].productName).toBeTruthy();
  });
  it('cannot approve twice, even concurrently', async () => {
    const inv = await resolved();
    const results = await Promise.all([approveInvoice(inv), approveInvoice(inv), approveInvoice(inv)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const s = await loadSnapshot();
    expect(s.movements.filter((m) => m.sourceRef.startsWith('invoice:'))).toHaveLength(4);
    expect(computeDashboard(s).exceptions.duplicatesBlocked).toBe(2);
  });
  it('blocks loading the same invoice twice', async () => {
    expect((await loadSampleInvoice()).ok).toBe(true);
    expect((await loadSampleInvoice()).ok).toBe(false);
    expect((await loadSnapshot()).invoices).toHaveLength(1);
  });
  it('persists across closing and reopening the database', async () => {
    const inv = await resolved();
    expect((await saveDraft(inv)).ok).toBe(true);
    await closeDb();
    const s = await loadSnapshot();
    expect(s.invoices[0].decisions['5']?.confirmedProductId).toBe('p-chicken');
    expect(s.invoices[0].lines[4].vatRate).toBe(0);
  });
  it('rejects edits to an approved invoice', async () => {
    const inv = await resolved(); await approveInvoice(inv);
    expect((await saveDraft(inv)).ok).toBe(false);
  });
  it('reset restores the original state', async () => {
    const original = await loadSnapshot();
    const inv = await resolved(); await approveInvoice(inv);
    await resetDemo();
    const s = await loadSnapshot();
    expect(s.invoices).toHaveLength(0);
    expect(s.movements).toEqual(original.movements);
    expect(s.costHistory).toEqual(original.costHistory);
    expect(computeDashboard(s).stockValuePence).toBe(computeDashboard(original).stockValuePence);
    expect((await loadSampleInvoice()).ok).toBe(true);      // can run the demo again
    expect(SAMPLE_INVOICE_ID).toBe((await loadSnapshot()).invoices[0].id);
  });
});
