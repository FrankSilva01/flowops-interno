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

export function marketplaceChannelFiltersVisible(area) {
  return area === "operation";
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

export function renderCatalogLinkedListing(link, listing = null) {
  const marketplace = html(marketplaceDisplayName(link?.marketplace));
  const externalId = html(link?.external_id || "-");
  const action = listing ? "open-listing-drawer" : "open-linked-listing";
  const label = listing ? "Ver anúncio" : "Resolver anúncio";
  const pending = listing ? "" : '<span class="badge queue">Pendente de associação</span>';
  return `<span class="catalog-linked-listing">${marketplace} · ${externalId} ${pending}<button class="secondary-btn" type="button" data-action="${action}" data-marketplace="${html(link?.marketplace)}" data-external-id="${externalId}">${label}</button></span>`;
}

export async function resolveLinkedMarketplaceListing(link, marketplaceListings = [], fetchListing) {
  const listing = marketplaceListings.find((item) =>
    item.marketplace === link?.marketplace && item.external_id === link?.external_id
  );
  return listing || fetchListing?.(link) || null;
}
function html(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[char]);
}
import { marketplaceDisplayName } from "./marketplace-channel.js";
