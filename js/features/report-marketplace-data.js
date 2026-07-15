function channelKey(value) {
  const normalized = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  if (["mercadolivre", "ml", "meli"].includes(normalized)) return "mercado-livre";
  if (["tiktokshop", "tiktok"].includes(normalized)) return "tiktok-shop";
  return normalized || "mercado-livre";
}

export function marketplaceSalesForReport(salesRows = [], orderRows = []) {
  const ordersById = new Map(orderRows.map((order) => [String(order.id), order]));
  const unique = new Map();
  for (const sale of salesRows) {
    const marketplace = sale.marketplace || sale.channel || "Mercado Livre";
    const externalId = String(sale.external_order_id || sale.order_id || sale.id || "");
    const key = `${channelKey(marketplace)}:${externalId}`;
    const order = ordersById.get(String(sale.internal_order_id || ""));
    const payload = sale.raw_payload || {};
    const firstItem = payload.order_items?.[0]?.item || payload.items?.[0] || {};
    const amount = Number(
      sale.total_amount ?? sale.total ?? sale.amount ?? sale.price
      ?? payload.total_amount ?? payload.paid_amount ?? payload.order_total
      ?? order?.charged ?? order?.received ?? 0
    );
    const normalized = {
      ...sale,
      marketplace,
      external_order_id: externalId,
      title: sale.title || sale.item_title || sale.description || firstItem.title || order?.description || "-",
      report_amount: Number.isFinite(amount) ? amount : 0,
      status: sale.status || payload.status || order?.status || "-",
    };
    const current = unique.get(key);
    if (!current || normalized.report_amount > current.report_amount) unique.set(key, normalized);
  }
  for (const order of orderRows) {
    const externalId = String(order.marketplaceOrderCode || order.external_order_id || "");
    if (!externalId) continue;
    const declaredMarketplace = order.marketplace || order.source || "";
    const declaredChannel = channelKey(declaredMarketplace);
    const knownChannel = ["mercado-livre", "shopee", "amazon", "tiktok-shop"].includes(declaredChannel);
    const looksLikeMercadoLivreOrder = /^2000\d{12}$/.test(externalId);
    if (!knownChannel && !looksLikeMercadoLivreOrder) continue;
    const marketplace = looksLikeMercadoLivreOrder && !knownChannel ? "Mercado Livre" : declaredMarketplace;
    const key = `${channelKey(marketplace)}:${externalId}`;
    const alreadyLinked = [...unique.values()].some((sale) => String(sale.internal_order_id || "") === String(order.id));
    if (unique.has(key) || alreadyLinked) continue;
    unique.set(key, {
      marketplace,
      external_order_id: externalId,
      internal_order_id: order.id,
      title: order.description || "-",
      report_amount: Number(order.charged ?? order.received ?? 0) || 0,
      status: order.status || "-",
      created_at: order.createdAt || order.created_at || order.orderDate || order.order_date || order.deliveryDate || "",
      report_source: "linked-order",
    });
  }
  return [...unique.values()];
}

export function reportMarketplaceRows(orderRows = [], salesRows = []) {
  const map = new Map();
  const add = (label, value) => {
    const amount = Number(value || 0);
    if (amount > 0) map.set(label, (map.get(label) || 0) + amount);
  };

  orderRows.forEach((item) => add(item.source || item.marketplace || "Venda direta", item.charged || item.received || 0));
  salesRows.forEach((item) => add(
    item.marketplace || item.channel || "Mercado Livre",
    item.report_amount ?? item.total_amount ?? item.total ?? item.amount ?? item.price ?? item.raw_payload?.total_amount ?? 0,
  ));

  return [...map.entries()]
    .map(([label, value]) => ({ label, value }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);
}
