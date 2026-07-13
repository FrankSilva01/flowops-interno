function channel(value) {
  const normalized = String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (["mercadolivre", "ml", "meli"].includes(normalized)) return "mercado-livre";
  if (normalized === "shopee") return "shopee";
  return normalized;
}

function imageUrls(listing) {
  const payload = listing?.raw_payload || {};
  const pictures = Array.isArray(payload.pictures) ? payload.pictures : [];
  return [...new Set([
    ...pictures.map((picture) => picture.secure_url || picture.url),
    ...(Array.isArray(payload.images) ? payload.images.map((image) => image.url || image.image_url || image) : []),
    listing?.thumbnail_url,
  ].filter(Boolean).map((url) => String(url).replace(/^http:/, "https:")))];
}

export function migrationTargetFor(sourceMarketplace) {
  return channel(sourceMarketplace) === "shopee" ? "mercado-livre" : "shopee";
}

export function buildMarketplaceMigration(listing, targetMarketplace = migrationTargetFor(listing?.marketplace)) {
  const source = channel(listing?.marketplace);
  const target = channel(targetMarketplace);
  if (!["mercado-livre", "shopee"].includes(source) || !["mercado-livre", "shopee"].includes(target) || source === target) {
    throw new Error("A replicacao inicial aceita apenas Mercado Livre e Shopee em canais diferentes.");
  }
  const payload = listing?.raw_payload || {};
  const shopee = payload.shopee || {};
  const images = imageUrls(listing);
  const sku = listing?.sku || payload.seller_custom_field || shopee.sku || "";
  const draft = {
    source,
    target,
    title: String(listing?.title || "").trim(),
    description: String(payload.description || payload.plain_text || "").trim(),
    price: Number(listing?.price || 0),
    stock: Number(payload.available_quantity ?? listing?.stock ?? listing?.available_quantity ?? 0),
    sku,
    images,
    ml: {
      categoryId: target === "mercado-livre" ? String(payload.ml_category_id || "") : String(payload.category_id || ""),
      listingTypeId: payload.listing_type_id || "gold_special",
      condition: payload.condition || "new",
      attributes: Array.isArray(payload.attributes) ? payload.attributes : [],
    },
    shopee: {
      categoryId: String(shopee.category_id || (source === "shopee" ? payload.category_id || "" : "")),
      weight: Number(shopee.weight || payload.weight || 0),
      daysToShip: Number(shopee.days_to_ship || 20),
      attributes: Array.isArray(shopee.attributes) ? shopee.attributes : [],
    },
  };
  const missing = [];
  if (!draft.title) missing.push("Titulo");
  if (!(draft.price > 0)) missing.push("Preco");
  if (!draft.sku) missing.push("SKU");
  if (draft.images.length < 3) missing.push(`Imagens (${draft.images.length}/3)`);
  if (target === "shopee") {
    if (!draft.shopee.categoryId) missing.push("Categoria Shopee");
    if (!(draft.shopee.weight > 0)) missing.push("Peso");
  } else if (!draft.ml.categoryId) {
    missing.push("Categoria Mercado Livre");
  }
  return { ...draft, missing, ready: missing.length === 0 };
}
