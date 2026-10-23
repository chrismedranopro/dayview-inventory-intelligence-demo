import type { InvoiceLine, MatchResult, Product, SupplierSkuMapping } from './types';

const STOP = new Set(['the', 'and', 'of', 'pack', 'x']);

export function normalizeDescription(s: string): string {
  return s
    .toLowerCase()
    .replace(/(\d+(?:\.\d+)?)\s*(kilograms?|kgs?)\b/g, (_, n) => `${+n * 1000}g`)
    .replace(/(\d+(?:\.\d+)?)\s*(grams?|gms?|g)\b/g, (_, n) => `${+n}g`)
    .replace(/(\d+(?:\.\d+)?)\s*(litres?|ltrs?|l)\b/g, (_, n) => `${+n * 1000}ml`)
    .replace(/(\d+(?:\.\d+)?)\s*ml\b/g, (_, n) => `${+n}ml`)
    .replace(/[^a-z0-9. ]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !STOP.has(t))
    .sort()
    .join(' ');
}

function tokens(s: string): Set<string> {
  return new Set(normalizeDescription(s).split(' ').filter(Boolean));
}

/** Jaccard similarity of normalised token sets, 0..1. */
export function similarity(a: string, b: string): number {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  A.forEach((t) => B.has(t) && inter++);
  return inter / (A.size + B.size - inter);
}

export const SUGGEST_THRESHOLD = 0.5;

export function matchLine(
  line: InvoiceLine,
  supplierId: string,
  catalog: Product[],
  mappings: SupplierSkuMapping[],
): MatchResult {
  if (line.barcode) {
    const p = catalog.find((c) => c.barcode === line.barcode);
    if (p) return { status: 'matched', method: 'barcode', productId: p.id, confidence: 1, reason: 'Exact barcode match' };
  }
  if (line.supplierSku) {
    const m = mappings.find((x) => x.supplierId === supplierId && x.supplierSku === line.supplierSku);
    if (m) return { status: 'matched', method: 'supplier_sku', productId: m.productId, confidence: 0.98, reason: 'Mapped supplier SKU' };
  }
  const norm = normalizeDescription(line.description);
  const exact = catalog.filter((c) => normalizeDescription(c.name) === norm);
  if (exact.length === 1)
    return { status: 'suggested', method: 'description', productId: exact[0].id, confidence: 0.9, reason: 'Normalised description identical: confirm to save SKU mapping' };
  if (exact.length > 1)
    return { status: 'needs_review', method: 'description', confidence: 0.5, reason: 'Several catalogue products share this description' };

  const ranked = catalog
    .map((c) => ({ c, s: similarity(line.description, c.name) }))
    .sort((a, b) => b.s - a.s);
  const best = ranked[0];
  if (best && best.s >= SUGGEST_THRESHOLD)
    return { status: 'needs_review', method: 'fuzzy', productId: best.c.id, confidence: +best.s.toFixed(2), reason: `Fuzzy match to "${best.c.name}": human confirmation required` };
  return { status: 'missing', method: 'none', confidence: 0, reason: 'No catalogue product found' };
}
