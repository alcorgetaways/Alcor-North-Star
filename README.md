# Monthly client payments

This change adds a Payments tab to each client profile. Authorized admin, management, BD and finance roles can create or edit a month with amount, paid/pending status, UTR, HTTPS evidence link, private image/PDF upload, and note. Payment evidence uploads to the existing client-files bucket under the client's payment-evidence folder. The migration creates a scoped ledger and audited save RPC, then seeds owner-confirmed paid months from the supplied tracker through July 2026 for the 21 listed onboarding clients. Amounts and receipts remain blank because the source did not provide them. The ambiguous Excel Hotels & Resorts row is excluded.

## Apply

From the project root, merge the included files. Then apply the Supabase migration through the project's normal migration workflow (for example, `supabase db push` after linking the intended project). The dashboard tab appears after the migration is applied. This workspace has no live database write connection, so the migration has not been applied to production.

The migration is present in both the Supabase history and Drizzle history. `drizzle/migrations/meta/_journal.json` is updated accordingly.

Validation: TypeScript `tsc --noEmit` passed. No application tests were run.
