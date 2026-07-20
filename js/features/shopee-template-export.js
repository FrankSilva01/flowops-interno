const COLUMN_COUNT = 51;

const DIRECT_TEMPLATE_COLUMNS = [
  { column: 0, marker: "ps_category", label: "ID da categoria", required: true },
  { column: 1, marker: "ps_product_name", label: "Nome do produto", required: true },
  { column: 2, marker: "ps_product_description", label: "Descricao do produto", required: true },
  { column: 3, marker: "ps_sku_parent_short", label: "SKU principal", required: true },
  { column: 10, marker: "ps_price", label: "Preco", required: true },
  { column: 11, marker: "ps_stock", label: "Estoque", required: true },
  { column: 12, marker: "ps_sku_short", label: "SKU da variacao", required: true },
  { column: 17, marker: "ps_item_cover_image", label: "Imagem de capa", required: true },
  ...Array.from({ length: 8 }, (_, index) => ({
    column: 18 + index,
    marker: `ps_item_image_${index + 1}`,
    label: `Imagem ${index + 2}`,
    required: index < 2,
  })),
  { column: 26, marker: "ps_weight", label: "Peso (kg)", required: true },
  { column: 27, marker: "ps_length", label: "Comprimento (cm)", required: true },
  { column: 28, marker: "ps_width", label: "Largura (cm)", required: true },
  { column: 29, marker: "ps_height", label: "Altura (cm)", required: true },
  { column: 30, marker: "channel_id.standard", label: "Canal de envio", required: true },
  { column: 31, marker: "ps_attribute_brand", label: "Marca", required: true },
  { column: 32, marker: "ps_product_pre_order_dts", label: "Prazo de postagem (dias)", required: true },
];

function text(value, max = 5000) {
  return String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function imageUrls(listing) {
  const pictures = Array.isArray(listing?.raw_payload?.pictures) ? listing.raw_payload.pictures : [];
  return [...new Set([...pictures.map((item) => item?.secure_url || item?.url), listing?.thumbnail_url]
    .filter((url) => /^https:\/\//i.test(String(url || ""))))].slice(0, 9);
}

function mlAttribute(listing, ids = []) {
  const attributes = Array.isArray(listing?.raw_payload?.attributes) ? listing.raw_payload.attributes : [];
  const expected = ids.map((id) => normalize(id));
  return attributes.find((item) => expected.includes(normalize(item?.id)) || expected.includes(normalize(item?.name)));
}

function listingBrand(listing) {
  const attribute = mlAttribute(listing, ["BRAND", "MARCA", "Marca"]);
  return text(attribute?.value_name || attribute?.value_struct?.name || attribute?.value_id, 200);
}

function measurementNumber(attribute, targetUnit) {
  if (!attribute) return 0;
  const structuredNumber = Number(attribute?.value_struct?.number);
  const raw = Number.isFinite(structuredNumber) ? structuredNumber : Number(String(attribute?.value_name || attribute?.value_id || "").replace(",", ".").match(/[\d.]+/)?.[0]);
  if (!(raw > 0)) return 0;
  const unit = normalize(attribute?.value_struct?.unit || attribute?.value_name || "");
  if (targetUnit === "kg") return unit.includes("kg") ? raw : unit.includes("g") ? raw / 1000 : raw;
  if (unit.includes("mm")) return raw / 10;
  if (/\bm\b/.test(String(attribute?.value_struct?.unit || attribute?.value_name || "").toLowerCase())) return raw * 100;
  return raw;
}

export function marketplacePackageData(listing) {
  const payload = listing?.raw_payload || {};
  const channelData = payload.shopee || payload.shipping_dimensions || payload.package_dimensions || payload.dimensions || {};
  const direct = (names) => names.map((name) => Number(channelData?.[name] ?? payload?.[name])).find((value) => value > 0) || 0;
  return {
    weight: direct(["weight", "package_weight"]) || measurementNumber(mlAttribute(listing, ["SELLER_PACKAGE_WEIGHT", "PACKAGE_WEIGHT", "WEIGHT", "Peso"]), "kg"),
    length: direct(["length", "depth", "package_length", "package_depth"]) || measurementNumber(mlAttribute(listing, ["SELLER_PACKAGE_LENGTH", "SELLER_PACKAGE_DEPTH", "PACKAGE_LENGTH", "PACKAGE_DEPTH", "LENGTH", "DEPTH", "Comprimento", "Profundidade"]), "cm"),
    width: direct(["width", "package_width"]) || measurementNumber(mlAttribute(listing, ["SELLER_PACKAGE_WIDTH", "PACKAGE_WIDTH", "WIDTH", "Largura"]), "cm"),
    height: direct(["height", "package_height"]) || measurementNumber(mlAttribute(listing, ["SELLER_PACKAGE_HEIGHT", "PACKAGE_HEIGHT", "HEIGHT", "Altura"]), "cm"),
    brand: listingBrand(listing) || "Sem marca",
  };
}

export function shopeeSku(listing, index = 0) {
  const existing = text(listing?.sku || listing?.raw_payload?.seller_custom_field, 40);
  if (existing) return existing;
  const category = text(listing?.category || listing?.title, 16).toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "") || "PROD";
  const source = text(listing?.external_id, 16).toUpperCase().replace(/[^A-Z0-9]/g, "");
  return `${category.slice(0, 12)}-${source.slice(-10) || String(index + 1).padStart(4, "0")}`;
}

export function validateShopeeListing(listing) {
  const missing = [];
  if (text(listing?.title, 120).length < 3) missing.push("título");
  if (!(Number(listing?.price) > 0)) missing.push("preço");
  if (imageUrls(listing).length < 3) missing.push("mínimo de 3 imagens");
  return missing;
}

export function buildShopeeTemplateRow(listing, index = 0) {
  const row = Array(COLUMN_COUNT).fill("");
  const sku = shopeeSku(listing, index);
  const images = imageUrls(listing);
  row[1] = text(listing?.title, 120);
  row[2] = text(listing?.description || listing?.raw_payload?.description || listing?.title, 5000);
  row[3] = sku;
  row[10] = Number(listing?.price || 0);
  row[11] = Math.max(0, Math.trunc(Number(listing?.raw_payload?.available_quantity ?? listing?.stock ?? 1)));
  row[12] = sku;
  row[17] = images[0] || "";
  images.slice(1).forEach((url, imageIndex) => { row[18 + imageIndex] = url; });
  row[26] = Number(listing?.raw_payload?.shopee?.weight || listing?.raw_payload?.weight || marketplacePackageData(listing).weight || 0);
  row[30] = "Ligado";
  return row;
}

function normalize(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

const CORE_MARKERS = new Set([
  "ps_category", "ps_product_name", "ps_product_description", "ps_sku_parent_short", "ps_price", "ps_stock",
  "ps_sku_short", "ps_item_cover_image", "ps_weight", "ps_length", "ps_width", "ps_height", "ps_product_pre_order_dts",
]);

const BASE_MARKER_INDEX = new Map([
  ["ps_product_name", 1], ["ps_product_description", 2], ["ps_sku_parent_short", 3], ["ps_price", 10],
  ["ps_stock", 11], ["ps_sku_short", 12], ["ps_item_cover_image", 17], ["ps_weight", 26],
  ...Array.from({ length: 8 }, (_, index) => [`ps_item_image_${index + 1}`, 18 + index]),
]);

export function readShopeeTemplateSchema(sheet, xlsx) {
  const range = xlsx.utils.decode_range(sheet["!ref"] || "A1:AY6");
  const columns = [];
  for (let column = range.s.c; column <= range.e.c; column += 1) {
    const markerParts = String(sheet[xlsx.utils.encode_cell({ r: 0, c: column })]?.v || "").split("|");
    const marker = markerParts[0];
    const label = String(sheet[xlsx.utils.encode_cell({ r: 2, c: column })]?.v || marker);
    const requirement = normalize(sheet[xlsx.utils.encode_cell({ r: 3, c: column })]?.v);
    if (marker) columns.push({ column, marker, label, required: requirement === "obrigatorio" || markerParts[1] === "1" });
  }
  const requiredAttributes = columns.filter((item) => item.required && !CORE_MARKERS.has(item.marker));
  return { columns, requiredAttributes, categorySpecific: requiredAttributes.length > 0 };
}

export function listingAttributeValue(listing, label) {
  const expected = normalize(label);
  if (expected === "marca" || expected.startsWith("marca")) return listingBrand(listing) || "Sem marca";
  const attributes = Array.isArray(listing?.raw_payload?.attributes) ? listing.raw_payload.attributes : [];
  const match = attributes.find((item) => [item?.name, item?.id].some((value) => normalize(value) === expected));
  return text(match?.value_name || match?.value_struct?.name || match?.value_id, 200);
}

export function applyShopeeTemplateRows(sheet, listings, schema, options, xlsx) {
  const rows = listings.map((listing, index) => {
    const base = buildShopeeTemplateRow(listing, index);
    const packageData = marketplacePackageData(listing);
    const row = Array(Math.max(51, ...schema.columns.map(({ column }) => column + 1))).fill("");
    schema.columns.forEach(({ column, marker, label }) => {
      if (marker === "ps_weight") row[column] = packageData.weight || Number(options.weight);
      else if (BASE_MARKER_INDEX.has(marker)) row[column] = base[BASE_MARKER_INDEX.get(marker)];
      else if (marker === "ps_category") row[column] = String(options.categoryId || "").trim();
      else if (marker === "ps_length") row[column] = packageData.length || Number(options.length);
      else if (marker === "ps_width") row[column] = packageData.width || Number(options.width);
      else if (marker === "ps_height") row[column] = packageData.height || Number(options.height);
      else if (marker === "ps_product_pre_order_dts") row[column] = Number(options.preOrderDays || 3);
      else if (marker.startsWith("channel_id.")) row[column] = "Ligado";
      else if (marker === "ps_attribute_brand") row[column] = packageData.brand || text(options.brand, 200) || "Sem marca";
      else if (!CORE_MARKERS.has(marker)) row[column] = listingAttributeValue(listing, label) || options.attributes?.[marker] || "";
    });
    return row;
  });
  xlsx.utils.sheet_add_aoa(sheet, rows, { origin: "A7" });
  return rows;
}

function directTemplateRows() {
  const markers = Array(COLUMN_COUNT).fill("");
  const labels = Array(COLUMN_COUNT).fill("");
  const requirements = Array(COLUMN_COUNT).fill("");
  DIRECT_TEMPLATE_COLUMNS.forEach(({ column, marker, label, required }) => {
    markers[column] = `${marker}|${required ? 1 : 0}|0`;
    labels[column] = label;
    requirements[column] = required ? "Obrigatorio" : "Opcional";
  });
  return [
    markers,
    Array(COLUMN_COUNT).fill(""),
    labels,
    requirements,
    Array(COLUMN_COUNT).fill(""),
    Array(COLUMN_COUNT).fill(""),
  ];
}

function resolvedPackageData(listing, options = {}) {
  const source = marketplacePackageData(listing);
  return {
    weight: source.weight || Number(options.weight) || 0,
    length: source.length || Number(options.length) || 0,
    width: source.width || Number(options.width) || 0,
    height: source.height || Number(options.height) || 0,
    brand: listingBrand(listing) || text(options.brand, 200) || "Sem marca",
  };
}

export function validateShopeeExport(listings, options = {}) {
  const issues = [];
  for (const listing of listings || []) {
    const title = text(listing?.title, 120) || listing?.external_id || "Produto";
    const missing = [];
    if (!String(options.categoryId || "").trim()) missing.push("categoria");
    const packageData = resolvedPackageData(listing, options);
    if (!(packageData.weight > 0)) missing.push("peso");
    if (!(packageData.length > 0)) missing.push("comprimento");
    if (!(packageData.width > 0)) missing.push("largura");
    if (!(packageData.height > 0)) missing.push("altura");
    if (missing.length) issues.push(`${title}: ${missing.join(", ").replace(/, ([^,]+)$/, " e $1")}`);
  }
  return issues;
}

export function buildShopeeWorkbook(listings, options = {}, xlsx = globalThis.XLSX) {
  if (!xlsx?.utils?.aoa_to_sheet || !xlsx?.utils?.book_new || !xlsx?.utils?.book_append_sheet) {
    throw new Error("Leitor XLSX indisponivel.");
  }
  const schema = { columns: DIRECT_TEMPLATE_COLUMNS };
  const dataRows = (listings || []).map((listing, index) => {
    const base = buildShopeeTemplateRow(listing, index);
    const packageData = resolvedPackageData(listing, options);
    const row = Array(COLUMN_COUNT).fill("");
    row[0] = String(options.categoryId || "").trim();
    BASE_MARKER_INDEX.forEach((baseColumn, marker) => {
      const target = DIRECT_TEMPLATE_COLUMNS.find((column) => column.marker === marker)?.column;
      if (target !== undefined) row[target] = base[baseColumn];
    });
    row[26] = packageData.weight;
    row[27] = packageData.length;
    row[28] = packageData.width;
    row[29] = packageData.height;
    row[30] = "Ligado";
    row[31] = packageData.brand;
    row[32] = Number(options.preOrderDays || 3);
    return row;
  });
  const sheet = xlsx.utils.aoa_to_sheet([...directTemplateRows(), ...dataRows]);
  sheet["!cols"] = DIRECT_TEMPLATE_COLUMNS.map(({ column }) => column).length
    ? Array.from({ length: COLUMN_COUNT }, (_, index) => ({ wch: [1, 2, 17].includes(index) ? 38 : 18 }))
    : [];
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, sheet, "Modelo");
  workbook.Props = { Title: "FlowOps - Importacao Shopee", Company: "FlowOps" };
  return workbook;
}

export function assertShopeeTemplate(workbook) {
  const sheetName = workbook.SheetNames.find((name) => String(name).toLowerCase() === "modelo") || workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const marker = String(sheet?.A1?.v || "").toLowerCase();
  if (!sheet || (!marker.includes("ps_category") && !sheet?.B3?.v)) throw new Error("Este arquivo não parece ser o modelo oficial de produtos da Shopee.");
  return sheet;
}
