import { openDB, type DBSchema, type IDBPDatabase, type IDBPTransaction, type StoreNames } from 'idb';
import { buildPurchaseMovements, invoiceRef, isDuplicateInvoice } from '../domain/ledger';
import { buildContext, reviewInvoice } from '../domain/review';
import { storedInvoiceSchema } from '../domain/schemas';
import * as seed from '../domain/seed';
import type { AuditEvent, CostRecord, Snapshot, StoredInvoice, Supplier } from '../domain/state';
import type { Product, StockMovement, SupplierSkuMapping } from '../domain/types';

interface Schema extends DBSchema {
  suppliers: { key: string; value: Supplier };
  products: { key: string; value: Product };
  mappings: { key: [string, string]; value: SupplierSkuMapping };
  invoices: { key: string; value: StoredInvoice };
  movements: { key: string; value: StockMovement; indexes: { bySourceRef: string } };
  costHistory: { key: string; value: CostRecord };
  audit: { key: number; value: AuditEvent };
}

const STORES: StoreNames<Schema>[] = ['suppliers', 'products', 'mappings', 'invoices', 'movements', 'costHistory', 'audit'];
type Tx = IDBPTransaction<Schema, StoreNames<Schema>[], 'readwrite'>;

let dbName = 'dayview-inventory-demo';
let dbPromise: Promise<IDBPDatabase<Schema>> | null = null;
let initPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

export const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };
const notify = () => listeners.forEach((l) => l());

/** Test hook: use a separate database name. */
export function useDatabaseName(name: string) { dbName = name; }

export async function closeDb() {
  if (dbPromise) (await dbPromise).close();
  dbPromise = null; initPromise = null;
}

function getDb() {
  dbPromise ??= openDB<Schema>(dbName, 1, {
    upgrade(db) {
      db.createObjectStore('suppliers', { keyPath: 'id' });
      db.createObjectStore('products', { keyPath: 'id' });
      db.createObjectStore('mappings', { keyPath: ['supplierId', 'supplierSku'] });
      db.createObjectStore('invoices', { keyPath: 'id' });
      db.createObjectStore('movements', { keyPath: 'id' }).createIndex('bySourceRef', 'sourceRef');
      db.createObjectStore('costHistory', { keyPath: 'id' });
      db.createObjectStore('audit', { keyPath: 'id', autoIncrement: true });
    },
  });
  return dbPromise;
}

const audit = (tx: Tx, type: AuditEvent['type'], message: string, invoiceId?: string) =>
  tx.objectStore('audit').add({ at: new Date().toISOString(), type, message, invoiceId });

async function readSnapshot(tx: Pick<Tx, 'objectStore'>): Promise<Snapshot> {
  const [suppliers, products, mappings, invoices, movements, costHistory, auditRows] = await Promise.all([
    tx.objectStore('suppliers').getAll(), tx.objectStore('products').getAll(), tx.objectStore('mappings').getAll(),
    tx.objectStore('invoices').getAll(), tx.objectStore('movements').getAll(), tx.objectStore('costHistory').getAll(),
    tx.objectStore('audit').getAll(),
  ]);
  return { suppliers, products, mappings, invoices, movements, costHistory, audit: auditRows };
}

async function seedAll(db: IDBPDatabase<Schema>) {
  const tx = db.transaction(STORES, 'readwrite');
  await Promise.all(STORES.map((s) => tx.objectStore(s).clear()));
  for (const x of seed.suppliers) tx.objectStore('suppliers').put(x);
  for (const x of seed.products) tx.objectStore('products').put(x);
  for (const x of seed.mappings) tx.objectStore('mappings').put(x);
  for (const x of seed.movements) tx.objectStore('movements').put(x);
  for (const x of seed.costHistory) tx.objectStore('costHistory').put(x);
  audit(tx, 'demo_reset', 'Demo data loaded (illustrative, fictional)');
  await tx.done;
}

export function initDb(): Promise<void> {
  initPromise ??= (async () => {
    const db = await getDb();
    if ((await db.count('products')) === 0) await seedAll(db);
  })();
  return initPromise;
}

export async function loadSnapshot(): Promise<Snapshot> {
  await initDb();
  const db = await getDb();
  return readSnapshot(db.transaction(STORES, 'readonly') as unknown as Tx);
}

export async function resetDemo(): Promise<void> {
  await initDb();
  await seedAll(await getDb());
  notify();
}

export type Result<T = object> = ({ ok: true } & T) | { ok: false; reason: string };

export async function createInvoiceDraft(draft: StoredInvoice): Promise<Result<{ id: string }>> {
  await initDb();
  const parsed = storedInvoiceSchema.safeParse(draft);
  if (!parsed.success) return { ok: false, reason: `Invalid invoice: ${parsed.error.issues[0]?.message ?? 'unknown'}` };
  const db = await getDb();
  const tx = db.transaction(STORES, 'readwrite');
  const existing = await tx.objectStore('invoices').getAll();
  if (isDuplicateInvoice(existing, draft)) {
    const reason = `Duplicate invoice blocked: ${draft.invoiceNumber} already exists for this supplier.`;
    audit(tx, 'duplicate_blocked', reason); await tx.done; notify(); return {ok:false,reason};
  }
  if (!draft.invoiceNumber.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(draft.invoiceDate) || !draft.lines.length || !draft.lines.every(l=>l.description.trim() && l.quantityPacks>0 && l.packCostPence>=0)) {
    await tx.done; return {ok:false,reason:'Invoice number, valid date and valid invoice lines are required.'};
  }
  await tx.objectStore('invoices').add(parsed.data);
  audit(tx, 'invoice_loaded', `Created ${draft.sourceLabel}: ${draft.invoiceNumber}`, draft.id);
  await tx.done; notify(); return {ok:true,id:draft.id};
}

export async function loadSampleInvoice(): Promise<Result<{ id: string }>> {
  await initDb();
  const db = await getDb();
  const tx = db.transaction(STORES, 'readwrite');
  const inv = seed.sampleInvoice(new Date().toISOString());
  const existing = await tx.objectStore('invoices').getAll();
  if (isDuplicateInvoice(existing, inv)) {
    const reason = `Duplicate invoice blocked: ${inv.invoiceNumber} already exists for this supplier.`;
    audit(tx, 'duplicate_blocked', reason);
    await tx.done; notify();
    return { ok: false, reason };
  }
  tx.objectStore('invoices').add(inv);
  audit(tx, 'invoice_loaded', `Loaded sample invoice ${inv.invoiceNumber}`, inv.id);
  await tx.done; notify();
  return { ok: true, id: inv.id };
}

export async function saveDraft(draft: StoredInvoice): Promise<Result> {
  await initDb();
  const parsed = storedInvoiceSchema.safeParse(draft);
  if (!parsed.success) return { ok: false, reason: `Invalid invoice data: ${parsed.error.issues[0]?.message ?? 'unknown'}` };
  const db = await getDb();
  const tx = db.transaction(STORES, 'readwrite');
  const stored = await tx.objectStore('invoices').get(draft.id);
  if (!stored) { await tx.done; return { ok: false, reason: 'Invoice not found.' }; }
  if (stored.status === 'approved') { await tx.done; return { ok: false, reason: 'Approved invoices cannot be edited.' }; }
  tx.objectStore('invoices').put({ ...parsed.data, status: 'draft', approvedAt: undefined });
  audit(tx, 'invoice_saved', `Saved edits to ${draft.invoiceNumber}`, draft.id);
  await tx.done; notify();
  return { ok: true };
}

/**
 * Approve atomically. Inside ONE readwrite transaction we re-read the stored invoice, re-run the review
 * rules against current catalogue/cost data, and write movements with deterministic primary keys (`add`
 * fails on a repeat, aborting the whole transaction). So a double-click, second tab or retry cannot create
 * stock movements twice.
 */
export async function approveInvoice(draft: StoredInvoice): Promise<Result<{ movementCount: number }>> {
  await initDb();
  const parsed = storedInvoiceSchema.safeParse(draft);
  if (!parsed.success) return { ok: false, reason: `Invalid invoice data: ${parsed.error.issues[0]?.message ?? 'unknown'}` };
  const db = await getDb();
  const tx = db.transaction(STORES, 'readwrite');
  const fail = async (type: AuditEvent['type'], reason: string): Promise<Result<{ movementCount: number }>> => {
    audit(tx, type, reason, draft.id);
    await tx.done; notify();
    return { ok: false, reason };
  };
  try {
    const stored = await tx.objectStore('invoices').get(draft.id);
    if (!stored) { await tx.done; return { ok: false, reason: 'Invoice not found.' }; }
    if (stored.status === 'approved') return await fail('duplicate_blocked', `Duplicate approval blocked: ${stored.invoiceNumber} is already approved.`);

    const snap = await readSnapshot(tx);
    const candidate: StoredInvoice = { ...parsed.data, status: 'draft', approvedAt: undefined };
    const ctx = buildContext(snap);
    const review = reviewInvoice(candidate, ctx, snap.invoices);
    if (!review.canApprove) return await fail('approval_blocked', `Approval blocked for ${candidate.invoiceNumber}: ${review.invoiceErrors.length + review.blockingLineCount} unresolved issue(s).`);

    const ref = invoiceRef(candidate.supplierId, candidate.invoiceNumber);
    const existing = await tx.objectStore('movements').index('bySourceRef').getAll(IDBKeyRange.bound(`${ref}:`, `${ref}:\uffff`));
    const included = candidate.lines.filter((_, i) => !review.lines[i].excluded);
    const approvedLines = included.map((line) => {
      const r = review.lines[candidate.lines.indexOf(line)];
      return { line, productId: r.productId!, unitsPerPack: r.unitsPerPack! };
    });
    const built = buildPurchaseMovements(candidate, approvedLines, existing, new Date().toISOString());
    if (!built.ok) return await fail('duplicate_blocked', built.reason);

    for (const m of built.movements) await tx.objectStore('movements').add(m);
    for (const l of included) {
      const r = review.lines[candidate.lines.indexOf(l)];
      tx.objectStore('costHistory').add({
        id: `${ref}:${l.id}`, productId: r.productId!, unitCostPence: r.analysis!.newUnitCost!, effectiveDate: candidate.invoiceDate,
        sourceRef: ref, previousUnitCostPence: r.analysis!.previousUnitCost, changePct: r.analysis!.changePct,
        previousMargin: r.analysis!.previousMargin, newMargin: r.analysis!.newMargin,
      });
      if (l.supplierSku)
        tx.objectStore('mappings').put({ supplierId: candidate.supplierId, supplierSku: l.supplierSku, productId: r.productId!, unitsPerPack: l.packSize! });
    }
    tx.objectStore('invoices').put({ ...candidate, status: 'approved', approvedAt: new Date().toISOString() });
    audit(tx, 'invoice_approved', `Approved ${candidate.invoiceNumber}: ${built.movements.length} receipt movement(s), £${(review.netPence / 100).toFixed(2)} ex VAT`, draft.id);
    await tx.done; notify();
    return { ok: true, movementCount: built.movements.length };
  } catch (e) {
    try { tx.abort(); } catch { /* already finished */ }
    return { ok: false, reason: `Approval aborted, nothing was written: ${e instanceof Error ? e.message : String(e)}` };
  }
}
