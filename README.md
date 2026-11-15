# Kontrora — Staff Engineer Assignment (Revenue & Billing)

===========================================================


# Estimates (Revenue & Billing) — Submission Notes

Estimates scoped to accounts: draft → sent → accepted | rejected. Money in integer minor units, no hard deletes, server-side list/filter, idempotent create, UI for list, draft create/edit and a line-item editor.

## What's in the PR-less fork

| Area | Files |
| --- | --- |
| Schema | `supabase/estimates.sql` (run after `schema.sql`) |
| RBAC | `lib/permissions.ts` (`view_estimates`, `manage_estimates`), `lib/estimates.ts` (`getEstimateAccess`) |
| API | `app/api/accounts/[accountId]/estimates/` (list, create, get, patch, `transition`) |
| UI | `app/accounts/[accountId]/estimates/` + `components/estimates/` |
| Tests | `__tests__/money.test.ts`, `estimates-schema.test.ts`, `estimates-access.test.ts` |
tsc --noEmit reports 40 pre-existing errors in files I didn’t touch (e.g. missing apiFetch imports); none in the Estimates files.

## Architecture decisions

- **Account-bound everywhere.** `estimates` and `estimate_line_items` both carry `account_id`. Line items use a composite FK `(estimate_id, account_id)`, and an estimate's project uses `(project_id, account_id)`. A line item or project from another account cannot be attached, even if app code has a bug.
- **Money.** `BIGINT` minor units (same as `escrows`). `line_total_minor` is a generated column and `estimates.total_minor` is kept in sync by trigger, so clients never send totals. The UI parses decimal strings with a regex (no float math) and formats only at the edge.
- **Lifecycle in the database.** A trigger allows only `draft→sent` and `sent→accepted|rejected`, blocks `DELETE`, makes `account_id` immutable, and freezes content (and line items) after `draft`. The API does a compare-and-set (`UPDATE ... WHERE status = <expected>`), so two concurrent transitions cannot both win.
- **Idempotency.** `Idempotency-Key` is required on create. A partial unique index on `(account_id, idempotency_key)` plus a stored request hash gives: same key + same body → replay (200, same estimate), same key + different body → 409. Create and line items run in one SQL function, so there are no half-created estimates.
- **List/filter is server-side**: status, project, title search, stable ordering (`created_at, id`), pagination with a capped limit.
- **Thin routes.** Built on the existing `withApiRoute`; validation with zod; one shared access function.

## Security / tenancy review

- Every estimates route and page calls `getEstimateAccess(user, accountId)` first. Order: account membership → permission. Staff must be a superadmin, a `VIEW_ALL_ACCOUNTS` holder, the account manager, or an active `account_members` row. Clients may only touch `client_account_id`, are read-only, can respond to *sent* estimates, and never see drafts.
- Not in the account → **404** (not 403), so ids can't be probed across tenants. In the account but missing permission → 403.
- Estimates tables have RLS enabled with a `service_role`-only policy. The API uses the admin client only **after** the checks above, and every query also filters by `account_id` (defence in depth, not just trust in the check).
- **Finding in the existing schema:** the policies on every existing table are `USING (TRUE) WITH CHECK (TRUE)` with no `TO service_role`, which means the anon/authenticated roles can read and write them via PostgREST. I did not change existing tables (out of scope) but this should be fixed first: add `TO service_role`, then add real per-user policies.
- Inputs: zod on every body/query, string and array caps, LIKE-wildcard escaping in search, no money from the client except unit price in minor units.
- Not done: rate limiting on write endpoints (Upstash is already a dependency), audit log of status changes.

## Running tests

```bash
npm install
npm test            # vitest: money parsing, schema validation, tenancy/permission matrix
npx tsc --noEmit
npm run lint
```

The unit tests mock the DB. The SQL triggers and the idempotency function are **not** covered by Vitest. I checked them manually (see below); the proper fix is pgTAP or an integration suite against a Supabase test project.

Manual checks: create twice with the same key → 201 then 200 with the same id; same key with a different body → 409; edit a sent estimate → 409; request another account's estimate → 404; log in as a client → no drafts, no edit buttons.

## What I'd ship next

1. **Stripe**: payment link/checkout when an estimate is accepted, webhook handler (signature-verified, idempotent by event id), invoice record created from the accepted estimate.
2. **Reconciliation**: ledger table of payments, nightly job that compares Stripe balance transactions to invoices and flags mismatches.
3. **Status history table** (who/when/from/to) and audit log; email notification on send/accept/reject.
4. **Currency exponents** (JPY, KWD) instead of assuming 2 decimals; tax/discount lines; estimate expiry and revisions (new version instead of editing).
5. **Real RLS** per user on all tables, then drop the admin client from read paths; rate limiting; pgTAP tests; Playwright flow for the UI.

## Assumptions

- Pages live under `app/accounts/[accountId]/`. Staff are scoped by `account_members` / `account_manager_id`.
- The demo roles Account Manager and Project Manager get `manage_estimates`; Executive Director and Client get `view_estimates` (see end of `estimates.sql`).

=========================================================================

PSA platform (Next.js App Router + Supabase). Ship one revenue slice end-to-end in **2–3 hours**. Quality over completeness.

## Setup  

Node.js **20.9+**, free [Supabase](https://supabase.com) project.

```bash    
npm install
cp .env.local.template .env.local   # fill Supabase URL + keys
# Run supabase/schema.sql in the Supabase SQL Editor
npm run dev                        # http://localhost:3000
```

## Task   
   
Implement **Estimates** scoped to accounts:

1. Schema: estimates + line items — account-bound, amounts in minor units, optional project link
2. Lifecycle: draft → sent → accepted | rejected; no hard deletes
3. RBAC: extend permissions for financial data; enforce account boundaries on every route
4. API: server-side list/filter, create with `Idempotency-Key`, get by id
5. UI under account context: list, create draft, line-item editor

## Evaluation     

Schema & tenancy · Money-touching API correctness · RBAC · Code judgment · Fork README
    
## Submission

Share your fork URL (no PRs). Fork README must cover architecture decisions, security/tenancy review, how to run tests, and what you'd ship next (e.g. Stripe, reconciliation).