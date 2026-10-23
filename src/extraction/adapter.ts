import type { Invoice } from '../domain/types';

export interface ExtractionResult {
  invoice: Invoice;
  /** Per-field confidence 0..1, keyed by "lineId.field" or "header.field". */
  confidence: Record<string, number>;
  warnings: string[];
}

/**
 * Server-side extraction contract (OCR / LLM). Implementations must return validated, structured data and
 * never fabricate output. A real implementation would sit behind an authenticated endpoint (e.g. an n8n webhook).
 */
export interface InvoiceExtractionAdapter {
  readonly id: string;
  readonly configured: boolean;
  extract(file: File): Promise<ExtractionResult>;
}

export class NotConfiguredExtractionAdapter implements InvoiceExtractionAdapter {
  readonly id = 'not-configured';
  readonly configured = false;
  async extract(): Promise<ExtractionResult> {
    throw new Error('Extraction service not configured. The file was not processed.');
  }
}

export const extractionAdapter: InvoiceExtractionAdapter = new NotConfiguredExtractionAdapter();
