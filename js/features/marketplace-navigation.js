export const MARKETPLACE_AREAS = Object.freeze({
  operation: Object.freeze(["listings", "sales", "ml-questions"]),
  catalog: Object.freeze(["storefront"]),
  performance: Object.freeze(["intelligence"]),
  settings: Object.freeze(["integrations", "api-logs", "backup"]),
});

export const PERFORMANCE_SECTIONS = ["profitability", "listings", "investment", "reputation"];

export function marketplaceAreaForView(view) {
  return Object.entries(MARKETPLACE_AREAS).find(([, views]) => views.includes(view))?.[0] || "operation";
}

export function defaultMarketplaceViewForArea(area) {
  return MARKETPLACE_AREAS[area]?.[0] || "listings";
}
