function validateMercadoLivreTitle(name) {
  const clean = String(name || "").trim().replace(/\s+/g, " ");
  const words = clean.split(" ").filter(Boolean);
  if (clean.length < 10 || words.length < 2) {
    return "use um nome mais completo com marca, modelo ou categoria";
  }
  return "";
}

export function getProductPublicationReadiness({
  channel,
  name,
  connected,
  categoryId,
  imageCount = 0,
  linked = false,
} = {}) {
  const normalizedChannel = String(channel || "");
  if (normalizedChannel !== "mercado-livre") {
    return { channel: normalizedChannel, status: "pending", blockers: ["publicação automática ainda não disponível"] };
  }

  const blockers = [];
  const titleBlocker = validateMercadoLivreTitle(name);
  if (titleBlocker) blockers.push(titleBlocker);
  if (!connected) blockers.push("conecte a conta do Mercado Livre");
  if (!categoryId) blockers.push("selecione a categoria");
  if (!linked && Number(imageCount || 0) < 3) {
    blockers.push(`adicione pelo menos 3 fotos (${Number(imageCount || 0)} de 3)`);
  }

  return {
    channel: normalizedChannel,
    status: blockers.length ? "pending" : "ready",
    blockers,
  };
}
