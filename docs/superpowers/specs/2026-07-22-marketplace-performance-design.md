# Marketplace Performance Redesign

## Objective

Reorganize `Marketplace > Performance` as an executive dashboard that supports daily decisions without removing the existing detailed financial and marketplace analyses.

The redesign must reduce visual noise, expose the highest-value information before scrolling, preserve all current calculations and integrations, and remain usable on desktop and mobile.

## Scope

This change covers only the Performance area of Marketplace. It reorganizes the current intelligence, profitability, analytics, reputation, intent, trend, and investment components.

It does not change:

- Supabase schemas or policies;
- Mercado Livre synchronization contracts;
- financial formulas, intent score, health score, or investment ranking rules;
- catalog, listings, sales, questions, integrations, logs, or backup workflows;
- subscription access rules.

## Information Architecture

The page will have two levels.

### Executive level

The first viewport contains:

1. A compact header with the page title, synchronization status, and `Atualizar métricas` action.
2. Four summary indicators: generated revenue, conversion rate, average margin, and listing health.
3. A performance visualization that connects visits, questions, and sales and includes recent evolution when historical points are available.
4. A `Prioridades de hoje` panel with at most four actionable recommendations, ordered by operational impact.

The executive level must answer:

- How is the channel performing?
- Where is revenue or conversion being lost?
- Which listing should the user act on first?

### Detailed level

Existing detailed information will be grouped into four named sections:

- `Rentabilidade`: financial summary, margin distribution, most profitable products, profitability table, costs, fees, and financial settings.
- `Anúncios`: consolidated performance table, purchase intent, category trends, and listing diagnostics.
- `Onde investir`: investment ranking and prioritized opportunities.
- `Reputação`: seller reputation and marketplace health indicators.

Only one detailed section is expanded at a time. The active section is retained during the current browser session. The default section is `Rentabilidade` when financial coverage exists, otherwise `Anúncios`.

## Components

### Header

The header shows:

- `Performance` as the primary title;
- the latest metrics synchronization timestamp;
- `Atualizar métricas` as the primary action;
- secondary actions inside an overflow menu: synchronize fees, register costs in bulk, and financial settings.

The update button uses the current `sync-analytics-full` action and must preserve its loading and error states.

### Executive indicators

The indicators reuse current state and calculation functions:

- generated revenue from filtered marketplace sales;
- portfolio conversion from synchronized listing analytics;
- average margin from listings with valid cost coverage;
- listing health from the existing health/score calculation.

Each indicator includes a short context label. Missing data is displayed as `Não disponível`, never as a misleading zero.

### Performance visualization

The visualization summarizes the relationship between visits, questions, and sales. It must not imply that these values share the same scale. When trend history is available, a compact line chart is shown alongside the funnel summary. Without history, the component shows the latest synchronized totals and a clear freshness label.

### Daily priorities

The panel displays at most four recommendations. Priority order is:

1. high purchase intent with no sale;
2. high traffic with low conversion;
3. listing at risk or with a blocking marketplace issue;
4. healthy listing with investment potential;
5. missing cost data that prevents reliable profitability analysis.

Each recommendation contains a severity, a short reason, the expected user action, and a direct action to open the listing drawer or relevant configuration.

Recommendations are derived from existing analytics, profitability, intent, reputation, and ranking functions. No new predictive claim is introduced.

### Detailed navigation

The four detailed sections use a segmented control or compact tabs. Switching sections does not reload remote data. Tables preserve their existing filters and sorting.

Large tables remain horizontally scrollable only inside their own table container on narrow screens. The page itself must not create horizontal scrolling.

## Data Flow

The existing Marketplace render cycle remains the source of truth:

1. Marketplace data loads into the shared application state.
2. Current pricing and analytics functions calculate financial and performance values.
3. A small presentation layer derives executive indicators and daily priorities from those results.
4. Executive and detailed components render from the same derived snapshot to avoid inconsistent values.
5. Synchronization refreshes the shared state and rerenders the complete Performance area.

The presentation layer must not call Supabase or marketplace APIs directly.

## Empty, Loading, and Error States

- Disconnected account: show a focused connection prompt and hide unsupported metrics.
- Never synchronized: show the available local financial data and request metrics synchronization for performance data.
- Missing costs: display margin as unavailable, show cost coverage, and provide the bulk cost action.
- Partial analytics: render available values and identify unavailable indicators individually.
- Synchronization in progress: disable the update action and preserve the current dashboard until fresh data arrives.
- Synchronization failure: preserve the last valid data and show the existing user-facing error message.

## Responsive Behavior

### Desktop

- Four summary indicators in one row.
- Performance visualization and priorities panel in a two-column grid.
- Detailed sections use the available width without nested cards.

### Tablet

- Summary indicators use two columns.
- Visualization and priorities stack vertically.
- Detailed tabs may scroll within their own navigation strip.

### Mobile

- Summary indicators use two compact columns, falling back to one column on very narrow screens.
- Visualization and priorities occupy full width.
- Primary actions remain visible; secondary actions move into the overflow menu.
- Tables remain contained and do not force page-level horizontal scrolling.

## Accessibility

- Detailed navigation follows tab semantics with visible selected and keyboard-focus states.
- Collapsible content exposes `aria-expanded` and correct labels.
- Status is communicated through text and icons, not color alone.
- Loading and synchronization results are announced through the existing application messaging system.
- Touch controls preserve a minimum practical hit area.

## Testing

### Unit tests

- executive indicator derivation with full, partial, and missing data;
- priority ordering and maximum of four items;
- unavailable metrics are not represented as zero;
- default detailed section selection;
- preservation of existing calculation results.

### Integration and E2E tests

- opening `Marketplace > Performance` displays the executive dashboard;
- updating metrics preserves loading, success, and failure behavior;
- each detailed section opens and retains its controls;
- recommendation actions open the expected listing or settings view;
- disconnected, unsynchronized, and missing-cost states render correctly;
- desktop and mobile navigation do not create page-level horizontal overflow.

### Visual verification

Verify desktop, tablet, and mobile screenshots for hierarchy, text fitting, table containment, and absence of overlapping controls.

## Acceptance Criteria

- Revenue, conversion, average margin, and listing health are visible before detailed analysis.
- The first viewport contains no more than four summary indicators and four daily priorities.
- All current detailed analyses remain accessible under the four defined sections.
- Existing synchronization, filters, sorting, listing drawer, and financial actions continue to work.
- Missing or stale data is explicit and not shown as a false zero.
- No page-level horizontal scrolling occurs at supported desktop or mobile widths.
- Automated tests and responsive visual checks pass before deployment.
