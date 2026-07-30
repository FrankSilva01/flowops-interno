function text(value, fallback) {
  return value == null || String(value).trim() === "" ? fallback : String(value).trim();
}

export function buildQualityPresentation(orders = []) {
  const queue = (Array.isArray(orders) ? orders : [])
    .filter((order) => order && order.productionStage === "Qualidade" && order.status !== "Entregue")
    .map((order) => ({
      id: order.id,
      order,
      orderCode: text(order.orderCode, text(order.id, "Sem código")),
      description: text(order.description, "Encomenda sem descrição"),
      client: text(order.client, "Cliente não informado"),
      material: text(order.material, "Material não informado"),
      quantityLabel: `${Number(order.quantity) || 1} ${Number(order.quantity) === 1 ? "unidade" : "unidades"}`,
      priority: text(order.priority, "Normal"),
      referenceImageUrl: order.referenceImageUrl || "",
    }));

  return {
    summary: {
      waiting: queue.length,
      approved: orders.filter((order) => order?.qualityStatus === "Aprovado").length,
      rework: orders.filter((order) => order?.qualityStatus === "Retrabalho").length,
      occurrences: orders.filter((order) => order?.qualityStatus === "Reprovado").length,
    },
    queue,
  };
}
