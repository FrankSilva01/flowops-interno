# FlowOps Full-System Hardening Design

## Objective

Close the security, data-consistency, integration-reliability, accessibility, and responsive-UX findings from the 2026-07-23 audit without replacing the existing architecture or breaking current Supabase and Netlify deployments.

## Approach

The implementation uses additive Supabase migrations, security-definer RPCs for multi-table or privileged mutations, and small client-side domain helpers. Existing UI modules remain in place; only responsibilities touched by the fixes are extracted where that directly reduces duplication or prevents inconsistent behavior.

## Security And Tenancy

- Tenant membership writes move behind administrator-only transactional RPCs.
- Subscription and payment records become read-only to browser clients; trusted service-role flows remain writable.
- Global system backups become platform-only. Tenant administrators cannot list or download them.
- Lead-file paths become `organization_id/lead_id/file`, and storage policies validate the first path segment against active membership.
- Support users may create and read organization tickets but cannot forge platform responses or privileged lifecycle fields.
- Public storefront analytics are accepted only through a validated RPC with organization/product ownership checks and bounded payloads.
- Operational localStorage is namespaced by authenticated user and organization and is erased on every session-loss path.

## Domain Consistency

- Order, logistics, production stage, received value, and generated cash rows are reconciled by one database transaction.
- Generated cash entries identify their source explicitly and cannot be edited as ordinary manual entries.
- Fiscal invoices retain `order_id` and are unique per organization/order.
- Dashboard and Reports use the same canonical revenue aggregation helper.
- Deletion and reopening flows preserve accounting evidence while reversing derived state deterministically.

## Marketplace Reliability

- Shipment synchronization gets a dedicated server action and a validated response contract.
- Listing publication uses a stable operation key and reconciliation state so retries cannot duplicate external listings.
- Mercado Livre orders and listings paginate to bounded checkpoints and report partial coverage honestly.
- Migration drafts are unique in the database, independent of the visible page.
- Every Edge Function called by the client is versioned under the repository's canonical Supabase functions directory.
- Webhook notifications require provider authenticity/replay validation supported by the official Mercado Livre contract; otherwise they are rejected before service-role work begins.

## Authorization And Exports

- All JSON, CSV, XLSX, and PDF export entry points require `export_data`.
- Formula-leading spreadsheet values are neutralized.
- Organization member rows are authoritative for role, status, and permissions.
- Role changes and removals update all compatibility tables in one RPC.
- Plan-change requests require organization administration or finance-management capability and are idempotent.

## UX And Accessibility

- Authenticated operational data stays hidden behind an `aria-busy` loading shell until remote loading succeeds; failures render a retry state without demo data.
- Mobile navigation shows five primary destinations and an accessible `Mais` drawer for the rest.
- Native dialogs receive accessible names and descriptions.
- Reports, Materials, and Marketplace tabs use roving focus, Arrow keys, Home/End, `aria-selected`, and panel relationships.
- Popup dismissal synchronizes `aria-expanded` and restores focus.
- History, notifications, billing, and support use server-side cursor/page loading instead of fixed invisible caps.

## Error Handling

Privileged mutations fail closed and return stable error codes. Multi-system marketplace operations persist an intermediate state before external calls and expose retry/reconciliation actions. Partial synchronization is never reported as complete. UI loaders retain existing data only when it belongs to the same authenticated tenant.

## Verification

- Unit tests cover permission checks, export sanitization, revenue reconciliation, lifecycle reversal, fiscal idempotency, cache namespacing, pagination, and marketplace contracts.
- RLS audit covers two-tenant table and Storage access plus forbidden mutations.
- Playwright runs locally with a valid ESM server and deterministic authenticated fixtures; desktop and mobile tests cover overflow, dialogs, tabs, popups, and navigation.
- Supabase migrations are dry-run reviewed before remote application. Edge Functions are deployed only after contract tests pass.
- Final verification runs `npm test`, release readiness, RLS audit, and responsive screenshots before GitHub push.

## Explicit Non-Goals

- No framework migration.
- No redesign of the approved visual language.
- No tenant access to platform-wide backups.
- No production authentication bypass for tests.
- No deletion of historical financial evidence merely to simplify order removal.
