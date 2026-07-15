const COLUMN_COUNT = 51;

function text(value, max = 5000) {
  return String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function imageUrls(listing) {
  const pictures = Array.isArray(listing?.raw_payload?.pictures) ? listing.raw_payload.pictures : [];
  return [...new Set([...pictures.map((item) => item?.secure_url || item?.url), listing?.thumbnail_url]
    .filter((url) => /^https:\/\//i.test(String(url || ""))))].slice(0, 9);
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
  row[26] = Number(listing?.raw_payload?.shopee?.weight || listing?.raw_payload?.weight || 0.25);
  row[30] = "Ligado";
  return row;
}

export function assertShopeeTemplate(workbook) {
  const sheetName = workbook.SheetNames.find((name) => String(name).toLowerCase() === "modelo") || workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const marker = String(sheet?.A1?.v || "").toLowerCase();
  if (!sheet || (!marker.includes("ps_category") && !sheet?.B3?.v)) throw new Error("Este arquivo não parece ser o modelo oficial de produtos da Shopee.");
  return sheet;
}
