export const MARKETPLACE_CHANNELS = Object.freeze([
  { id: "mercado-livre", label: "Mercado Livre" },
  { id: "shopee", label: "Shopee" },
  { id: "amazon", label: "Amazon" },
  { id: "tiktok-shop", label: "TikTok Shop" },
]);

export function normalizeMarketplaceChannel(value) {
  const normalized = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  if (["mercadolivre", "ml", "meli"].includes(normalized)) return "mercado-livre";
  if (normalized === "shopee") return "shopee";
  if (normalized === "amazon") return "amazon";
  if (["tiktokshop", "tiktok"].includes(normalized)) return "tiktok-shop";
  return normalized || "mercado-livre";
}

export function marketplaceDisplayName(value) {
  const channel = MARKETPLACE_CHANNELS.find((item) => item.id === normalizeMarketplaceChannel(value));
  return channel?.label || value || "Marketplace";
}
