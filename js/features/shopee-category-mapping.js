const CATEGORIES = {
  rpgMiniature: { id: "101386", path: "Hobbies e Coleções > Itens Colecionáveis > Estátuas e Esculturas" },
  actionFigure: { id: "101385", path: "Hobbies e Coleções > Itens Colecionáveis > Figuras de Ação" },
  makeupOrganizer: { id: "101650", path: "Beleza > Utensílios de Beleza > Acessórios de Maquiagem > Bolsas e Organizadores de Maquiagem" },
  bathroom: "Casa e Decoração > Banheiros",
  homeOrganizer: "Casa e Decoração > Organizadores para Casa",
  phoneHolder: "Celulares e Dispositivos > Acessórios > Suportes para Celular",
  vehicleAccessory: "Peças e Acessórios para Veículos > Acessórios Internos para Automóveis",
  homeImprovement: "Casa e Decoração > Ferramentas e Melhorias para a Casa",
};

function normalized(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function suggestShopeeCategory(listing) {
  const value = normalized(`${listing?.sku || ""} ${listing?.title || ""} ${listing?.category || ""}`);
  const sku = normalized(listing?.sku);

  if (/\b(min|miniatura|rpg|goblin|orc|mago|esqueleto|morto.?vivo|necromante|vampiro|fenrir|dragao)\b/.test(value) || sku.startsWith("min-")) {
    return { key: "rpgMiniature", ...CATEGORIES.rpgMiniature, confidence: "alta" };
  }
  if (/\b(action figure|figure|pokemon|mewtwo|umbreon|dragonite|street fighter|deadpool|garage kit)\b/.test(value) || sku.startsWith("dec-")) {
    return { key: "actionFigure", ...CATEGORIES.actionFigure, confidence: "alta" };
  }
  if (/\b(pincel|pinceis|paleta|maquiagem|algodao|cotonete)\b/.test(value)) {
    return { key: "makeupOrganizer", ...CATEGORIES.makeupOrganizer, confidence: "alta" };
  }
  if (/\b(banheiro|toalha)\b/.test(value)) {
    return { key: "bathroom", path: CATEGORIES.bathroom, confidence: "alta" };
  }
  if (/\b(celular|smartphone)\b/.test(value)) {
    return { key: "phoneHolder", path: CATEGORIES.phoneHolder, confidence: "alta" };
  }
  if (/\b(carro|veicular|porta bebidas)\b/.test(value)) {
    return { key: "vehicleAccessory", path: CATEGORIES.vehicleAccessory, confidence: "média" };
  }
  if (/\b(ar condicionado|ferramenta)\b/.test(value)) {
    return { key: "homeImprovement", path: CATEGORIES.homeImprovement, confidence: "média" };
  }
  if (/\b(organizador|gaveta|suporte|porta)\b/.test(value) || sku.startsWith("org-") || sku.startsWith("sup-")) {
    return { key: "homeOrganizer", path: CATEGORIES.homeOrganizer, confidence: "média" };
  }
  return { key: "unmapped", path: "Categoria pendente de revisão", confidence: "baixa" };
}

export function groupShopeeCategorySuggestions(listings = []) {
  const groups = new Map();
  listings.forEach((listing) => {
    const suggestion = suggestShopeeCategory(listing);
    const current = groups.get(suggestion.key) || { ...suggestion, count: 0 };
    current.count += 1;
    groups.set(suggestion.key, current);
  });
  return [...groups.values()].sort((a, b) => b.count - a.count || a.path.localeCompare(b.path));
}

export { CATEGORIES as SHOPEE_CATEGORY_PATHS };
