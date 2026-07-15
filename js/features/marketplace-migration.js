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

function generatedSku(listing) {
  const title = String(listing?.title || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const prefix = /miniatura|rpg|goblin|orc|esqueleto|mago|resina/.test(title)
    ? "MIN"
    : /organizador|porta |gaveta/.test(title)
      ? "ORG"
      : /suporte/.test(title) ? "SUP" : "PRD";
  const source = String(listing?.external_id || listing?.id || Date.now()).replace(/[^a-z0-9]/gi, "").slice(-10).toUpperCase();
  return `${prefix}-${source || "NOVO"}`;
}

function normalize(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function attributeMeasurement(payload, ids, targetUnit = "cm") {
  const expected = ids.map(normalize);
  const attribute = (Array.isArray(payload.attributes) ? payload.attributes : []).find((item) => expected.includes(normalize(item?.id)) || expected.includes(normalize(item?.name)));
  if (!attribute) return 0;
  const structured = Number(attribute?.value_struct?.number);
  const amount = Number.isFinite(structured) ? structured : Number(String(attribute.value_name || attribute.value_id || "").replace(",", ".").match(/[\d.]+/)?.[0]);
  if (!(amount > 0)) return 0;
  const unit = normalize(attribute?.value_struct?.unit || attribute?.value_name || "");
  if (targetUnit === "kg") return unit.includes("kg") ? amount : unit.includes("g") ? amount / 1000 : amount;
  if (unit.includes("mm")) return amount / 10;
  if (/\bm\b/.test(String(attribute?.value_struct?.unit || attribute?.value_name || "").toLowerCase())) return amount * 100;
  return amount;
}

function packageValue(payload, names, attributeIds, targetUnit = "cm") {
  const source = payload.shopee || payload.shipping_dimensions || payload.package_dimensions || payload.dimensions || {};
  const direct = names.map((name) => Number(source?.[name] ?? payload?.[name])).find((value) => value > 0);
  return direct || attributeMeasurement(payload, attributeIds, targetUnit);
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
  const allImages = imageUrls(listing);
  const images = target === "shopee"
    ? allImages.filter((url) => /\.(?:jpe?g|png)(?:\?|$)/i.test(url))
    : allImages;
  const sku = listing?.sku || payload.seller_custom_field || shopee.sku || generatedSku(listing);
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
      weight: Number(packageValue(payload, ["weight", "package_weight"], ["SELLER_PACKAGE_WEIGHT", "PACKAGE_WEIGHT", "WEIGHT", "Peso"], "kg") || 0),
      length: Number(packageValue(payload, ["length", "depth", "package_length", "package_depth"], ["SELLER_PACKAGE_LENGTH", "SELLER_PACKAGE_DEPTH", "PACKAGE_LENGTH", "PACKAGE_DEPTH", "LENGTH", "DEPTH", "Comprimento", "Profundidade"]) || 0),
      width: Number(packageValue(payload, ["width", "package_width"], ["SELLER_PACKAGE_WIDTH", "PACKAGE_WIDTH", "WIDTH", "Largura"]) || 0),
      height: Number(packageValue(payload, ["height", "package_height"], ["SELLER_PACKAGE_HEIGHT", "PACKAGE_HEIGHT", "HEIGHT", "Altura"]) || 0),
      brand: "Sem marca",
      daysToShip: Math.min(15, Math.max(3, Number(shopee.days_to_ship || 15))),
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

export function applyMarketplaceMigrationDefaults(migration, defaults = {}) {
  const draft = structuredClone(migration);
  if (draft.target === "shopee") {
    draft.shopee.categoryId = String(defaults.shopeeCategoryId || draft.shopee.categoryId || "").trim();
    draft.shopee.weight = Number(defaults.shopeeWeight || draft.shopee.weight || 0);
  } else {
    draft.ml.categoryId = String(defaults.mlCategoryId || draft.ml.categoryId || "").trim();
  }
  draft.missing = draft.missing.filter((field) => {
    if (field === "Categoria Shopee" && draft.shopee.categoryId) return false;
    if (field === "Peso" && draft.shopee.weight > 0) return false;
    if (field === "Categoria Mercado Livre" && draft.ml.categoryId) return false;
    return true;
  });
  draft.ready = draft.missing.length === 0;
  return draft;
}

export function buildMarketplaceMigrationBatch(listings, targetMarketplace, defaults = {}) {
  const sourceListings = Array.from(listings || []);
  if (!sourceListings.length) throw new Error("Selecione pelo menos um anuncio.");
  const sources = new Set(sourceListings.map((listing) => channel(listing?.marketplace)));
  if (sources.size !== 1) throw new Error("Selecione anuncios de apenas um marketplace por lote.");
  return sourceListings.map((listing) => applyMarketplaceMigrationDefaults(
    buildMarketplaceMigration(listing, targetMarketplace),
    defaults,
  ));
}
