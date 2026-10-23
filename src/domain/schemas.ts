import { z } from 'zod';

export const vatRateSchema = z.union([z.literal(0), z.literal(0.05), z.literal(0.2)]);

export const invoiceLineSchema = z.object({
  id: z.string().min(1),
  description: z.string(),
  supplierSku: z.string().optional(),
  barcode: z.string().optional(),
  quantityPacks: z.number().finite(),
  packSize: z.number().finite().optional(),
  packCostPence: z.number().finite(),
  vatRate: vatRateSchema.optional(),
  lineTotalPence: z.number().finite().optional(),
});

export const storedInvoiceSchema = z.object({
  id: z.string().min(1),
  supplierId: z.string().min(1),
  invoiceNumber: z.string(),
  invoiceDate: z.string(),
  lines: z.array(invoiceLineSchema).min(1),
  status: z.enum(['draft', 'approved']),
  decisions: z.record(z.string(), z.object({ confirmedProductId: z.string().optional(), excluded: z.boolean().optional() })),
  createdAt: z.string(),
  approvedAt: z.string().optional(),
  sourceLabel: z.string(),
});
