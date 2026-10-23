# Dayview Inventory Intelligence — Concept Demo

**Independent speculative prototype.** All supplier, product and invoice data is fictional. Not affiliated with Dayview or IKA EPOS. No live EPOS connection, no live supplier email ingestion, and no configured AI document extraction.

## Run

Requires Node.js 22+.

```bash
npm ci
npm run dev
```

Open the local URL printed by Vite. To verify:

```bash
npx vitest run
npm run lint
npm run build
```

## Demonstrate

1. Open **Invoices**, click **Load sample invoice** or **New invoice / CSV import**.
2. For CSV, download the fictional sample file, upload it, inspect column mappings and preview, and create a draft. For manual entry, fill invoice metadata and add lines.
3. In the invoice review screen, inspect barcode/SKU matching, missing products, cost changes and blocking validation. Confirm uncertain matches or exclude unresolved lines.
4. Approve to create inventory movements; open **Dashboard** to inspect updated values. Repeat approval is blocked.
5. Use **Reset demo** to restore fictional opening balances and clear all draft invoices.

## Architecture

- React, TypeScript, Vite, Tailwind CSS
- Domain modules in `src/domain` handle matching, review, cost calculations, stock ledger and CSV parsing.
- `src/data/db.ts` stores invoices, catalog, stock movements, cost history and audit entries in browser IndexedDB using `idb`.
- Invoice approval revalidates and writes inside a single IndexedDB transaction, with deterministic movement keys to prevent duplicate receipts.
- Manual entry and CSV import both create a draft that goes through the same existing review and approval logic.
- `src/extraction/adapter.ts` is a placeholder: PDF/image AI extraction is **not implemented**.

## Limitations

Browser-local demo, not a multi-user production database. No authorization, real EPOS API, live email, background processing, expiry tracking, stock count workflow or configured OCR/AI service. CSV import accepts supplier invoice lines, not arbitrary financial documents. A production rollout requires approved EPOS integration, PostgreSQL migrations, access control, audit/observability, and agreed reconciliation rules.

## Deploy

Push the project to GitHub and import into Vercel using the Vite framework. Build command: `npm run build`; output directory: `dist`. `vercel.json` handles client-side routing. No environment variables required for fictional local demo.
