export const MARKETPLACE_AREAS = Object.freeze({
  operation: Object.freeze(["listings", "sales", "ml-questions"]),
  catalog: Object.freeze(["storefront"]),
  performance: Object.freeze(["intelligence"]),
  settings: Object.freeze(["integrations", "api-logs", "backup"]),
});

export const PERFORMANCE_SECTIONS = ["profitability", "listings", "investment", "reputation"];

export function performanceSectionForKey(currentSection, key) {
  const currentIndex = PERFORMANCE_SECTIONS.indexOf(currentSection);
  const index = currentIndex === -1 ? 0 : currentIndex;
  if (key === "Home") return PERFORMANCE_SECTIONS[0];
  if (key === "End") return PERFORMANCE_SECTIONS.at(-1);
  if (key === "ArrowRight") return PERFORMANCE_SECTIONS[(index + 1) % PERFORMANCE_SECTIONS.length];
  if (key === "ArrowLeft") return PERFORMANCE_SECTIONS[(index - 1 + PERFORMANCE_SECTIONS.length) % PERFORMANCE_SECTIONS.length];
  return null;
}

export function marketplaceAreaForView(view) {
  return Object.entries(MARKETPLACE_AREAS).find(([, views]) => views.includes(view))?.[0] || "operation";
}

export function defaultMarketplaceViewForArea(area) {
  return MARKETPLACE_AREAS[area]?.[0] || "listings";
}

export function isOperationalMarketplaceListing(listing) {
  return String(listing?.marketplace || "").trim().toLowerCase() !== "vitrine";
}

export function operationalMarketplaceListings(listings = []) {
  return listings.filter(isOperationalMarketplaceListing);
}

export function productListingLinks(product, productListings = [], marketplaceListings = []) {
  return productListings
    .filter((link) => link.product_id === product?.id)
    .map((link) => ({
      link,
      listing: marketplaceListings.find((item) =>
        item.marketplace === link.marketplace && item.external_id === link.external_id
      ) || null,
    }));
}
