function normalizeKey(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function valueFrom(row, aliases) {
  const entries = Object.entries(row || {});
  for (const alias of aliases) {
    const found = entries.find(([key]) => normalizeKey(key) === normalizeKey(alias));
    if (found && String(found[1] ?? "").trim()) return String(found[1]).trim();
  }
  return "";
}

function numeric(value) {
  const raw = String(value ?? "").trim().replace(/R\$|\s/g, "");
  if (!raw) return 0;
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function imageUrls(row) {
  const direct = valueFrom(row, ["Imagens", "Images", "URLs das imagens", "Image URLs"]);
  const numbered = Object.entries(row || {})
    .filter(([key, value]) => /^(imagem|image|foto|picture|urlimagem)\d*$/i.test(normalizeKey(key)) && String(value || "").trim())
    .map(([, value]) => String(value).trim());
  return [...new Set([...direct.split(/[|;\n]+/), ...numbered]
    .map((url) => url.trim().replace(/^http:/, "https:"))
    .filter((url) => /^https?:\/\//i.test(url)))];
}

export function normalizeMarketplaceImportRow(row, marketplace, index = 0) {
  const source = String(marketplace || "").toLowerCase().includes("shopee") ? "Shopee" : "Mercado Livre";
  const title = valueFrom(row, ["Nome do produto", "Titulo", "Título", "Title", "Product Name", "Nome"]);
  const sku = valueFrom(row, ["SKU principal", "SKU", "Seller SKU", "SKU do vendedor", "Código SKU"]);
  const externalId = valueFrom(row, ["ID do item", "ID do anuncio", "ID do anúncio", "Item ID", "Product ID", "MLB", "Codigo do anuncio", "Código do anúncio"])
    || `${source === "Shopee" ? "SHOPEE" : "ML"}-ARQUIVO-${index + 1}-${sku || "SEM-SKU"}`;
  const price = numeric(valueFrom(row, ["Preco", "Preço", "Price", "Preco original", "Preço original", "Valor"]));
  const stock = Math.max(0, Math.trunc(numeric(valueFrom(row, ["Estoque", "Stock", "Quantidade", "Available Quantity", "Qtd"]))));
  const categoryId = valueFrom(row, ["ID da categoria", "Category ID", "Categoria ID", "ID categoria"]);
  const category = valueFrom(row, ["Categoria", "Category", "Nome da categoria"]);
  const description = valueFrom(row, ["Descricao", "Descrição", "Description", "Descricao do produto", "Descrição do produto"]);
  const permalink = valueFrom(row, ["Link do anuncio", "Link do anúncio", "URL", "Permalink", "Product URL"]);
  const weight = numeric(valueFrom(row, ["Peso", "Weight", "Peso (kg)", "Peso do pacote"]));
  const status = valueFrom(row, ["Status", "Situacao", "Situação", "Estado"]) || "imported";
  const images = imageUrls(row);
  const missing = [];
  if (!title) missing.push("Titulo");
  if (!(price > 0)) missing.push("Preco");
  if (!sku) missing.push("SKU");
  return { marketplace: source, externalId, title, sku, price, stock, categoryId, category, description, permalink, weight, status, images, missing, valid: Boolean(title && price > 0) };
}

export function normalizeMarketplaceImportRows(rows, marketplace) {
  return Array.from(rows || []).map((row, index) => normalizeMarketplaceImportRow(row, marketplace, index))
    .filter((row) => row.title || row.sku || row.externalId);
}

export async function runMarketplaceImportBatch(rows, worker, concurrency = 4) {
  const source = Array.from(rows || []);
  const results = new Array(source.length);
  let cursor = 0;
  async function consume() {
    while (cursor < source.length) {
      const index = cursor;
      cursor += 1;
      try {
        results[index] = { status: "fulfilled", value: await worker(source[index], index) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }
  const workers = Math.max(1, Math.min(Number(concurrency) || 1, source.length || 1));
  await Promise.all(Array.from({ length: workers }, consume));
  return results;
}

export const MARKETPLACE_IMPORT_TEMPLATE = [
  "ID do item", "Nome do produto", "SKU", "Preco", "Estoque", "Categoria", "ID da categoria",
  "Descricao", "Peso (kg)", "Link do anuncio", "Imagens", "Status",
];
