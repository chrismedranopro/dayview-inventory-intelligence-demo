const gbp = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
export const money = (pence: number | undefined) => (pence === undefined || !Number.isFinite(pence) ? '–' : gbp.format(pence / 100));
export const pct = (f: number | undefined, dp = 1) => (f === undefined ? '–' : `${(f * 100).toFixed(dp)}%`);
export const num = (n: number) => new Intl.NumberFormat('en-GB').format(n);
export const dateTime = (iso: string) => new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
