/** Entirely fictional, illustrative data. Not Dayview business information. */
import type { CostRecord, StoredInvoice, Supplier } from './state';
import type { Product, StockMovement, SupplierSkuMapping, VatRate } from './types';

export const DEMO_LABEL = 'Illustrative demo data: not actual Dayview business information.';

export const suppliers: Supplier[] = [
  { id: 's-bridgeway', name: 'Bridgeway Wholesale Ltd (fictional)' },
  { id: 's-northvale', name: 'Northvale Dairy & Chilled Ltd (fictional)' },
  { id: 's-redfield', name: 'Redfield Meats Ltd (fictional)' },
  { id: 's-arctic', name: 'Arctic Line Frozen Foods Ltd (fictional)' },
  { id: 's-greenfield', name: 'Greenfield Produce Ltd (fictional)' },
];

// id, name, category, unit, sell(inc VAT, pence), vat, opening, histPurchase, sales, oldCost, latestCost (ex VAT per unit, pence)
type Row = [string, string, string, string, number, VatRate, number, number, number, number, number];
const rows: Row[] = [
  ['p-rice-bas5', 'Basmati Rice 5kg', 'Rice & International', 'each', 1299, 0, 40, 20, 31, 790, 820],
  ['p-rice-long10', 'Long Grain Rice 10kg', 'Rice & International', 'each', 1899, 0, 25, 10, 18, 1380, 1420],
  ['p-noodles', 'Instant Noodles Chicken 5 Pack', 'Rice & International', 'each', 199, 0, 120, 60, 95, 98, 104],
  ['p-beans', 'Sunbeam Baked Beans 400g', 'Packaged Food', 'each', 89, 0, 150, 72, 120, 54, 55],
  ['p-tea', 'Black Tea Bags 80s', 'Packaged Food', 'each', 219, 0, 60, 24, 41, 112, 118],
  ['p-cola', 'Cola Fizz Drink 2L', 'Packaged Food', 'each', 195, 0.2, 90, 48, 77, 82, 84],
  ['p-milk2l', 'Whole Milk 2L', 'Chilled Dairy', 'each', 159, 0, 80, 48, 96, 102, 105],
  ['p-yoghurt', 'Natural Yoghurt 500g', 'Chilled Dairy', 'each', 119, 0, 40, 24, 38, 58, 60],
  ['p-cheddar', 'Mature Cheddar 350g', 'Chilled Dairy', 'each', 349, 0, 35, 20, 29, 215, 220],
  ['p-tomato', 'Vine Tomatoes 500g', 'Fresh Produce', 'each', 169, 0, 30, 40, 52, 95, 98],
  ['p-banana', 'Bananas Loose per kg', 'Fresh Produce', 'kg', 109, 0, 60, 80, 118, 62, 64],
  ['p-chicken', 'Chicken Breast Fillets 1kg', 'Meat', 'each', 699, 0, 30, 40, 61, 470, 480],
  ['p-lamb', 'Lamb Mince 500g', 'Meat', 'each', 449, 0, 18, 20, 31, 290, 298],
  ['p-peas', 'Garden Peas Frozen 1kg', 'Frozen', 'each', 229, 0, 45, 24, 40, 120, 125],
  ['p-fishfingers', 'Fish Fingers 10 Pack Frozen', 'Frozen', 'each', 249, 0, 36, 24, 33, 140, 146],
];

/** Fictional 13-digit barcodes. */
export const barcodeOf = (productId: string): string => {
  const i = rows.findIndex((r) => r[0] === productId);
  return `59000000${String(i + 1).padStart(5, '0')}`;
};

// Cola is standard-rated; the UK taxes carbonated soft drinks at 20%.
export const products: Product[] = rows.map((r) => ({
  id: r[0], barcode: barcodeOf(r[0]), name: r[1], category: r[2], unit: r[3], sellPricePence: r[4], vatRate: r[5],
}));

export const mappings: SupplierSkuMapping[] = [
  { supplierId: 's-bridgeway', supplierSku: 'BW-MILK-2L-6', productId: 'p-milk2l', unitsPerPack: 6 },
  { supplierId: 's-bridgeway', supplierSku: 'SB-BEANS-400-24', productId: 'p-beans', unitsPerPack: 24 },
];

export const costHistory: CostRecord[] = rows.flatMap((r) => [
  { id: `hist-a:${r[0]}`, productId: r[0], unitCostPence: r[9], effectiveDate: '2026-08-15', sourceRef: 'hist:2026-08' },
  {
    id: `hist-b:${r[0]}`, productId: r[0], unitCostPence: r[10], effectiveDate: '2026-09-18', sourceRef: 'hist:2026-09',
    previousUnitCostPence: r[9], changePct: Math.round(((r[10] - r[9]) / r[9]) * 10000) / 10000,
  },
]);

const waste: Record<string, number> = { 'p-yoghurt': 3, 'p-banana': 6 };

export const movements: StockMovement[] = rows.flatMap((r) => {
  const [id, , , , , , opening, hist, sales] = r;
  const out: StockMovement[] = [
    { id: `open:${id}`, productId: id, type: 'opening', quantity: opening, occurredAt: '2026-09-01T08:00:00.000Z', sourceRef: `open:${id}`, note: 'Opening balance' },
    { id: `hist-po:${id}`, productId: id, type: 'purchase_receipt', quantity: hist, occurredAt: '2026-09-18T09:00:00.000Z', sourceRef: `hist-po:${id}`, note: 'Historical receipt' },
    { id: `sales:${id}`, productId: id, type: 'sale', quantity: -sales, occurredAt: '2026-10-18T20:00:00.000Z', sourceRef: `sales:${id}`, note: 'Sales to 18 Oct (illustrative)' },
  ];
  if (waste[id]) out.push({ id: `waste:${id}`, productId: id, type: 'waste', quantity: -waste[id], occurredAt: '2026-10-12T18:00:00.000Z', sourceRef: `waste:${id}`, note: 'Past-date waste' });
  return out;
});

export const SAMPLE_INVOICE_ID = 'inv-sample-001';

/** Five lines covering: exact match, price increase, missing product, pack-size conversion, uncertain match. */
export function sampleInvoice(now: string): StoredInvoice {
  return {
    id: SAMPLE_INVOICE_ID,
    supplierId: 's-bridgeway',
    invoiceNumber: 'BW-INV-48213',
    invoiceDate: '2026-10-20',
    status: 'draft',
    decisions: {},
    createdAt: now,
    sourceLabel: 'Preloaded structured sample invoice (not extracted from a document)',
    lines: [
      { id: '1', description: 'Basmati Rice 5kg', barcode: barcodeOf('p-rice-bas5'), quantityPacks: 10, packSize: 1, packCostPence: 820, vatRate: 0, lineTotalPence: 8200 },
      { id: '2', description: 'Whole Milk 2L (case of 6)', supplierSku: 'BW-MILK-2L-6', quantityPacks: 12, packSize: 6, packCostPence: 690, vatRate: 0, lineTotalPence: 8280 },
      { id: '3', description: 'Red Dragon Fruit 500g Tray', quantityPacks: 8, packSize: 1, packCostPence: 245, vatRate: 0, lineTotalPence: 1960 },
      { id: '4', description: 'Sunbeam Baked Beans 400g Case of 24', supplierSku: 'SB-BEANS-400-24', quantityPacks: 5, packSize: 24, packCostPence: 1368, vatRate: 0, lineTotalPence: 6840 },
      { id: '5', description: 'Fresh Chicken Breast Fillets Tray 1kg', quantityPacks: 20, packSize: 1, packCostPence: 520, lineTotalPence: 10400 },
    ],
  };
}
