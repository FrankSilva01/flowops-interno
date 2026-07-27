# Marketplace Reliability and Operational Safety Design

## Objective

Make product registration resilient, restore the operational controls identified by the audit, and ensure the interface reports the real state of persistence and publication. A product must remain safely registered in the master catalog even when a marketplace publication cannot proceed.

## Scope

This delivery covers five bounded areas:

1. Product registration and Mercado Livre publication state.
2. Authenticated marketplace regression coverage.
3. Tenant authorization and schema alignment in `ai-web-search`.
4. Offline write reliability and logout cleanup.
5. Scheduled backup authentication and operational verification.

Unrelated visual redesigns, new marketplace providers, and broad refactors are outside this delivery.

## Product Registration Model

Catalog persistence and marketplace publication are separate outcomes. Submitting the product form first validates the fields required by the master catalog and persists the product. Marketplace-specific validation then determines whether each selected channel can be published immediately.

An invalid Mercado Livre title, missing category, insufficient images, or disconnected account must not block the catalog write. The saved product receives a publication result with one of these states:

- `published`: the remote listing was created successfully.
- `pending`: the product is saved but one or more publication requirements are missing.
- `failed`: publication was attempted and the provider returned an error.
- `not_selected`: no publication was requested for that channel.

The existing listing/link records remain the source of truth for published advertisements. Pending requirements are derived from the current product, images, account connection, and form selection rather than duplicating secrets or provider data.

The UI closes the form only after catalog persistence succeeds. It then displays an explicit receipt such as `Produto salvo no catálogo. Publicação no Mercado Livre pendente: informe uma categoria.` Catalog rows expose the current channel status and an action to reopen the form at the marketplace step.

## Error Handling and User Feedback

Messages must distinguish:

- catalog persistence failure, which keeps the form open;
- successful catalog save with publication pending;
- successful catalog save with remote publication failure;
- complete catalog and marketplace success;
- offline write queued versus remotely synchronized.

Marketplace validation remains visible inline while typing but becomes blocking only for the remote publication attempt. The save button is disabled during submission to prevent duplicate writes and restored in a `finally` path.

## Authenticated Quality Coverage

The authenticated smoke test must select `Marketplace`, activate the `Catálogo` area, open the product drawer, and verify that a catalog-only product can be saved with a short name. A separate assertion verifies that selecting Mercado Livre with incomplete data produces a pending publication result without losing the product.

Tests must use unique SKU/name values and clean up their own records when credentials permit. Navigation helpers should wait for the catalog view instead of clicking hidden elements.

## AI Web Search Tenant Security

`ai-web-search` must treat the bearer JWT as the identity source. Before any organization-scoped query, it resolves the authenticated user and verifies an active membership in the requested organization. Requests without a valid JWT or membership return `401` or `403` and never query marketplace accounts.

The marketplace account lookup uses the live `connection_status` column. The service-role client remains server-side and is used only after authorization. Tests cover missing token, invalid membership, valid membership, and schema field selection.

## Offline Queue Reliability

Queue storage writes return a result and propagate quota/serialization failures. Callers may only report `queued` when the entry was actually stored.

Flushing processes entries independently. Permanent failures move to a local dead-letter collection with an error summary while later writes continue. Transient failures remain queued for retry. The interface shows queued and failed counts and offers a retry action.

Logout removes organization-scoped pending and dead-letter data after the session has been terminated. Sensitive payloads must not remain available to the next user on a shared browser.

## Backup Scheduling

The scheduled database request must authenticate without embedding a service-role credential in a migration or repository. The preferred design stores the invocation credential in Supabase Vault and builds the `Authorization` header at runtime. `system-maintenance` continues to enforce operator authorization.

Deployment requires applying the migration/configuration, deploying the function where needed, triggering a manual production backup, checking the persisted `backup_runs` result, and running the staging restore drill before declaring the control restored.

## Release and Rollback

Changes are implemented in isolated commits by subsystem. Static application changes deploy through the connected repository/Netlify flow only after local checks and authenticated tests pass. Supabase functions and migrations are deployed explicitly and verified before the frontend publication.

Rollback consists of reverting the release commits and redeploying the previous Edge Function versions. Database changes are additive and must not delete existing product, marketplace, queue, or backup data.

## Acceptance Criteria

- A short-name product selected for Mercado Livre is saved in the catalog and reported as pending rather than rejected.
- A catalog persistence error keeps the form open and shows the database error.
- Valid Mercado Livre data can still publish normally.
- Authenticated desktop and mobile smoke tests reach the catalog form without hidden-element timeouts.
- Cross-organization `ai-web-search` access is rejected before marketplace credentials are read.
- Offline queue storage failure cannot be reported as queued or synchronized.
- One invalid queued item does not block later valid writes.
- Logout clears tenant-scoped queued payloads.
- A fresh production backup is recorded and the staging restore drill passes.
- JavaScript checks, unit tests, dependency audit, E2E tests, and private GitHub workflows are green before production completion is claimed.
