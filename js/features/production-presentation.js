const DEFAULT_STAGES = [
  { key: "queued", label: "Em fila" },
  { key: "printing", label: "Imprimindo" },
  { key: "review", label: "Pós-processo" },
  { key: "painting", label: "Pintando" },
  { key: "ready", label: "Pronto" },
  { key: "delivered", label: "Entregue" },
];

const APPROVED_QUOTE_STAGES = new Set(["Aprovado", "Convertido em encomenda"]);

function asText(value, fallback) {
  return value == null || String(value).trim() === "" ? fallback : String(value);
}

function normalizeStage(value) {
  const stage = asText(value, "Em fila").trim();
  if (stage === "Acabamento") return "Pós-processo";
  if (stage === "Fatiado") return "Em fila";
  return stage;
}

function normalizeStageDefinition(stage) {
  if (typeof stage === "string") return { key: stage, label: stage };
  return {
    key: asText(stage?.key, stage?.label || "stage"),
    label: asText(stage?.label, stage?.key || "Etapa"),
  };
}

function stageCategory(stage, configuredKey = "") {
  const value = `${stage} ${configuredKey}`.toLowerCase();
  if (value.includes("queued") || value.includes("fila")) return "queued";
  if (value.includes("producing") || value.includes("printing") || value.includes("imprim")
    || value.includes("painting") || value.includes("pint")) return "producing";
  if (value.includes("review") || value.includes("processo") || value.includes("acabamento")) return "review";
  if (value.includes("ready") || value.includes("pronto")) return "ready";
  return null;
}

function configuredCategory(key) {
  return ["queued", "producing", "review", "ready"].includes(key) ? key : null;
}

function dateOnly(value) {
  if (!value) return null;
  const match = String(value).match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : null;
}

function currentDateOnly(now) {
  const date = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  return date.toISOString().slice(0, 10);
}

function isLate(order, stage, now) {
  const deliveryDate = dateOnly(order.deliveryDate);
  return Boolean(
    deliveryDate
    && deliveryDate < currentDateOnly(now)
    && order.status !== "Entregue"
    && stage !== "Entregue",
  );
}

function isEligible(order) {
  return !order.quoteStage || APPROVED_QUOTE_STAGES.has(order.quoteStage);
}

function buildOrderItem(order, stage, stageDefinition, now) {
  const late = isLate(order, stage, now);
  return {
    order,
    id: asText(order.id, "Sem codigo"),
    orderCode: asText(order.orderCode, asText(order.id, "Sem codigo")),
    clientLabel: asText(order.client, "Sem cliente"),
    descriptionLabel: asText(order.description, "Sem descricao"),
    materialLabel: asText(order.material, "Sem material"),
    deliveryDate: dateOnly(order.deliveryDate),
    deliveryLabel: asText(dateOnly(order.deliveryDate), "Sem previsao"),
    priorityLabel: asText(order.priority, "Sem prioridade"),
    responsibleLabel: asText(order.responsible, "Sem responsavel"),
    stage: stageDefinition.key,
    stageLabel: stageDefinition.label,
    isLate: late,
  };
}

export function buildProductionPresentation(orders = [], options = {}) {
  const sourceOrders = Array.isArray(orders) ? orders : [];
  const configuredStages = Array.isArray(options.stages) && options.stages.length
    ? options.stages.map(normalizeStageDefinition)
    : DEFAULT_STAGES;
  const columns = configuredStages.map((stage) => ({
    key: stage.key,
    label: stage.label,
    orders: [],
  }));
  const summary = { total: 0, queued: 0, producing: 0, review: 0, ready: 0, late: 0 };

  sourceOrders.filter((order) => order && isEligible(order)).forEach((order) => {
    const normalizedStage = normalizeStage(order.productionStage || order.status);
    const column = columns.find((candidate) => (
      candidate.key === normalizedStage
      || candidate.label === normalizedStage
      || stageCategory(normalizedStage) === (configuredCategory(candidate.key) || stageCategory(candidate.label))
    ));
    if (!column) return;

    const stageDefinition = { key: column.key, label: column.label };
    const item = buildOrderItem(order, normalizedStage, stageDefinition, options.now);
    column.orders.push(item);
    summary.total += 1;
    const category = stageCategory(normalizedStage) || configuredCategory(column.key);
    if (category) summary[category] += 1;
    if (item.isLate) summary.late += 1;
  });

  return { summary, columns };
}
