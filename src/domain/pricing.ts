import type { VatRate } from './types';

export type Reviewable<T> = { ok: true; value: T } | { ok: false; reason: string };

const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp;

/** Cost of one base unit in pence, ex VAT. Needs a known pack size. */
export function unitCostPence(packCostPence: number, packSize?: number): Reviewable<number> {
  if (!Number.isFinite(packCostPence) || packCostPence < 0) return { ok: false, reason: 'Invalid pack cost' };
  if (packSize === undefined || !Number.isFinite(packSize) || packSize <= 0)
    return { ok: false, reason: 'Pack size unknown: cannot normalise cost' };
  return { ok: true, value: round(packCostPence / packSize, 4) };
}

export function netPricePence(sellIncVatPence: number, vatRate: VatRate | undefined): Reviewable<number> {
  if (vatRate === undefined) return { ok: false, reason: 'VAT treatment unknown' };
  return { ok: true, value: round(sellIncVatPence / (1 + vatRate), 4) };
}

/** Gross margin as a fraction (0.25 = 25%), computed entirely ex VAT. */
export function grossMargin(sellIncVatPence: number, vatRate: VatRate | undefined, costExVatPence: number): Reviewable<number> {
  const net = netPricePence(sellIncVatPence, vatRate);
  if (!net.ok) return net;
  if (net.value <= 0) return { ok: false, reason: 'Selling price is zero' };
  return { ok: true, value: round((net.value - costExVatPence) / net.value, 4) };
}

/** Fractional change from previous to current; undefined when there is no usable baseline. */
export function percentChange(previous: number, current: number): number | undefined {
  if (!Number.isFinite(previous) || previous <= 0) return undefined;
  return round((current - previous) / previous, 4);
}

export interface PriceAnalysis {
  previousUnitCost?: number;
  newUnitCost?: number;
  changePct?: number;
  previousMargin?: number;
  newMargin?: number;
  needsReview: boolean;
  reasons: string[];
}

export const PRICE_INCREASE_REVIEW_THRESHOLD = 0.03;

export function analysePrice(args: {
  previousUnitCostPence?: number;
  newPackCostPence: number;
  packSize?: number;
  sellIncVatPence: number;
  vatRate?: VatRate;
}): PriceAnalysis {
  const reasons: string[] = [];
  const nu = unitCostPence(args.newPackCostPence, args.packSize);
  if (!nu.ok) reasons.push(nu.reason);
  const newUnit = nu.ok ? nu.value : undefined;
  const prev = args.previousUnitCostPence;
  const changePct = newUnit !== undefined && prev !== undefined ? percentChange(prev, newUnit) : undefined;
  if (prev === undefined) reasons.push('No purchase history to compare');

  const pm = prev !== undefined ? grossMargin(args.sellIncVatPence, args.vatRate, prev) : undefined;
  const nm = newUnit !== undefined ? grossMargin(args.sellIncVatPence, args.vatRate, newUnit) : undefined;
  if (nm && !nm.ok) reasons.push(nm.reason);

  const increased = changePct !== undefined && changePct >= PRICE_INCREASE_REVIEW_THRESHOLD;
  if (increased) reasons.push(`Cost up ${(changePct! * 100).toFixed(1)}%`);
  const unverifiable = (newUnit === undefined) || (nm !== undefined && !nm.ok);
  return {
    previousUnitCost: prev,
    newUnitCost: newUnit,
    changePct,
    previousMargin: pm?.ok ? pm.value : undefined,
    newMargin: nm?.ok ? nm.value : undefined,
    needsReview: increased || unverifiable,
    reasons,
  };
}
