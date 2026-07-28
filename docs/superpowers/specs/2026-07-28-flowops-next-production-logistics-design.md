# FlowOps Next Production and Logistics Design

## Objective

Migrate the Production and Logistics modules to the approved FlowOps Next interface while preserving every existing operational contract: real orders, production stages, permissions, marketplace shipment synchronization, automatic logistics updates, public tracking, realtime refresh and tenant isolation.

## Scope

This phase changes presentation and focused presentation models only. It does not add database migrations, rename persisted fields, change Edge Function contracts or replace current synchronization flows.

Included:

- Production summary, filters, full-width kanban and production drawer.
- Logistics summary, attention board, responsive operational list and logistics drawer.
- Desktop and mobile responsive behavior.
- Contract and release evidence for production transitions, logistics automation, public tracking and realtime.

Excluded:

- New production stages or logistics statuses.
- New carrier or marketplace integrations.
- Changes to billing, marketplace catalog, fiscal documents or normalized reference storage.
- Demo or fallback records in authenticated screens.

## Preserved Data and Contracts

- Production continues to consume `state.data.orders` and the persisted `productionStage` field.
- Logistics continues to consume `state.orderLogistics` and `state.logisticsEvents`, loaded from `order_logistics` and `logistics_events`.
- `js/data/remote.js` remains responsible for organization-scoped loading and realtime subscriptions.
- Existing form IDs, element IDs and `data-action` values remain stable unless the matching handler and tests are updated together.
- Existing Mercado Livre shipment synchronization and automatic refresh behavior remain unchanged.
- Public tracking continues to use the existing token, Edge Function and `tracking.html` contract.
- External marketplace IDs, tracking codes and order links remain untouched.

## Architecture

Add pure presentation helpers that transform existing state into display-safe production and logistics models. Renderers consume these models but mutations continue through the current handlers and Supabase operations.

The helpers must not mutate orders, logistics rows or events. Missing information produces explicit empty states such as `Sem responsavel`, `Sem previsao` or `Sem codigo`, never invented values.

CSS for this phase extends the consolidated FlowOps stylesheet. Layout selectors are scoped to Production and Logistics so the phase can be reviewed or reverted independently.

## Production Experience

### Summary and Filters

A compact horizontal summary appears above the board, adjacent to the existing filters. It reports counts derived from real filtered orders: queued, producing, awaiting review, ready and late. No circular chart or permanent left summary column is used.

Filters retain existing material, status, marketplace, responsible and priority behavior. On small screens they collapse into a compact control without causing page-level horizontal scrolling.

### Kanban

The kanban uses the full available content width. Columns have stable responsive dimensions and the board owns any necessary horizontal scrolling; the page itself must not overflow horizontally.

Each card displays, when available:

- Reference image or safe visual fallback.
- Order code, client and item description.
- Delivery date and lateness state.
- Priority, progress and responsible person.
- Current production stage.

Empty columns remain visible with a concise empty state. Existing stage transitions, edit actions and permissions remain connected to current handlers.

### Production Drawer

Selecting a card opens a responsive drawer organized into:

- Overview.
- References and linked product assets.
- Production stage, progress, responsible person and priority.
- Operational checklist when existing data supports it.
- Logistics shortcut and history.

The drawer reorganizes existing controls and information. It does not introduce new persisted checklist data in this phase.

## Logistics Experience

### Summary and Attention Board

The horizontal summary reports waiting shipment, moving, late, problem and delivered counts from real logistics data. The attention board prioritizes late deliveries, missing tracking codes, synchronization gaps and delivery problems.

Each item explains its next action using the existing logistics decision logic. Synchronization feedback shows loading, last successful refresh and recoverable failure without blocking access to persisted information.

### Operational List

Desktop uses a compact table with order, client, linked product, carrier, tracking code, estimate, status and next action. Mobile changes to stacked operational rows with the primary action visible and no page-level horizontal scrolling.

Search and status filters keep their current state and handlers. Opening an item uses the existing `open-logistics` action.

### Logistics Drawer

The drawer retains:

- Carrier, tracking code, status and estimated delivery date.
- Mercado Livre shipment synchronization.
- Public tracking link.
- Manual event registration.
- Organization-scoped logistics timeline.

Automatic synchronization continues to use the current interval, eligibility checks and remote operation. Failures remain visible and retryable without deleting persisted tracking information.

## Error and Empty States

- Loading failures show a recoverable error state and never replace real data with samples.
- Missing references, products, tracking codes or estimates use explicit labels.
- Synchronization failures preserve the last persisted status and expose a retry action.
- Users without edit permission can inspect information but do not receive active mutation controls.

## Responsive Behavior

- Supported desktop, tablet and 390 px mobile widths must not create horizontal page overflow.
- Kanban scrolling is contained inside its board.
- Drawers use the available viewport height and keep their close and primary action controls reachable.
- Tables become stacked operational lists on narrow screens.
- Text, codes and actions wrap or truncate predictably without covering adjacent content.

## Testing and Release Evidence

- Unit tests for production and logistics presentation helpers.
- Contract tests for existing IDs, form names and `data-action` handlers.
- Playwright desktop and 390 px mobile checks for summaries, filters, kanban, lists and drawers.
- Authenticated transition test proving a production stage update persists and reaches a second session through realtime.
- Authenticated logistics test proving persisted `order_logistics` and `logistics_events` remain visible.
- Release evidence for Mercado Livre logistics synchronization, automatic update behavior and public tracking.
- Tenant-isolation and permission checks remain mandatory release gates.
- Service worker cache version must advance only when the complete release candidate is approved.

## Acceptance Criteria

- Production and Logistics use only current organization data.
- Existing stage transitions and logistics edits remain functional.
- Existing marketplace shipment synchronization and automatic refresh remain functional.
- Public tracking continues to return the matching order and logistics timeline without authentication.
- A production or logistics update reaches another authenticated session through realtime.
- Production cards and logistics rows remain usable at 390 px without page-level horizontal scrolling.
- Missing information is clearly represented without fabricated values.
- No marketplace, logistics, tracking, RLS or offline contract is weakened.
