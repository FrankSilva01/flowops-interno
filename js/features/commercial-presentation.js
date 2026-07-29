// FlowOps Next — modelos de apresentação do módulo Comercial (puros, sem mutar estado).
// Consomem state.leads (crm_leads) e state.data.orders (quoteStage). Ausência vira
// rótulo explícito, nunca valor inventado.

export const LEAD_STATUSES = ["Novo", "Em negociação", "Convertido", "Perdido", "Cliente recorrente"];

// Estágios de orçamento considerados "em aberto" (fluxo comercial das encomendas).
export const QUOTE_OPEN_STAGES = ["Solicitado", "Em análise", "Orçamento enviado", "Aguardando cliente"];

function norm(value) {
  return String(value == null ? "" : value).toLowerCase();
}

function toValidDate(now) {
  const d = now instanceof Date ? now : new Date(now);
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) {
    throw new TypeError("now precisa ser uma data válida");
  }
  return d;
}

function leadStatus(lead) {
  return lead && lead.status ? lead.status : "Novo";
}

export function buildCustomersModel(leads = [], orders = [], filters = {}) {
  const status = filters.status && filters.status !== "all" ? filters.status : null;
  const origin = filters.origin && filters.origin !== "all" ? filters.origin : null;
  const search = norm(filters.search);

  const list = leads.filter((lead) => {
    const statusOk = !status || leadStatus(lead) === status;
    const originOk = !origin || lead.origin === origin;
    const searchOk = !search
      || norm(`${lead.name} ${lead.email} ${lead.whatsapp}`).includes(search);
    return statusOk && originOk && searchOk;
  });

  // recorrência = % de clientes (por nome) com 2+ pedidos.
  const porCliente = new Map();
  for (const order of orders) {
    const key = norm(order.client);
    if (!key) continue;
    porCliente.set(key, (porCliente.get(key) || 0) + 1);
  }
  const clientes = porCliente.size;
  const recorrentes = [...porCliente.values()].filter((n) => n >= 2).length;

  const summary = {
    ativos: leads.filter((l) => ["Convertido", "Cliente recorrente"].includes(leadStatus(l))).length,
    leadsEmAberto: leads.filter((l) => ["Novo", "Em negociação"].includes(leadStatus(l))).length,
    orcamentosEmAberto: orders.filter((o) => QUOTE_OPEN_STAGES.includes(o.quoteStage)).length,
    recorrencia: clientes ? Math.round((recorrentes / clientes) * 100) : 0,
  };

  const selected = filters.selectedId
    ? leads.find((l) => l.id === filters.selectedId) || null
    : null;

  return { summary, list, selected };
}

export function buildLeadsPipeline(leads = [], options = {}) {
  const now = toValidDate(options.now);
  const toCard = (lead) => {
    const last = lead.last_contact_at ? new Date(String(lead.last_contact_at).slice(0, 10)) : null;
    const ageDays = last && !Number.isNaN(last.getTime())
      ? Math.max(0, Math.floor((now - last) / 86400000))
      : null;
    return {
      id: lead.id,
      name: lead.name || "Sem nome",
      origin: lead.origin || "Sem origem",
      lastContact: lead.last_contact_at || null,
      ageDays,
    };
  };
  const columns = LEAD_STATUSES.map((stage) => {
    const cards = leads.filter((l) => leadStatus(l) === stage).map(toCard);
    return { stage, count: cards.length, cards };
  });
  const byStatus = Object.fromEntries(columns.map((c) => [c.stage, c.count]));
  return { columns, summary: { total: leads.length, byStatus } };
}

export function buildQuotesModel(orders = [], filters = {}) {
  const search = norm(filters.search);
  const rows = orders
    .filter((o) => o.quoteStage)
    .filter((o) => !search || norm(`${o.orderCode} ${o.client}`).includes(search))
    .map((o) => ({
      id: o.id,
      orderCode: o.orderCode || o.id || "—",
      client: o.client || "Sem cliente",
      version: o.quoteVersion || "—",
      validade: o.quoteValidUntil || o.dueDate || "—",
      valor: Number(o.total || 0),
      status: o.quoteStage,
    }));

  const quotes = orders.filter((o) => o.quoteStage);
  const abertos = quotes.filter((o) => QUOTE_OPEN_STAGES.includes(o.quoteStage));
  const aprovados = quotes.filter((o) => o.quoteStage === "Aprovado").length;
  const summary = {
    emAberto: abertos.length,
    emAbertoValor: abertos.reduce((sum, o) => sum + Number(o.total || 0), 0),
    aguardandoCliente: quotes.filter((o) => o.quoteStage === "Aguardando cliente").length,
    aprovadosPct: quotes.length ? Math.round((aprovados / quotes.length) * 100) : 0,
    prazoMedio: null, // sem campo de data de aprovação persistido -> exibir "—"
  };
  return { summary, rows };
}

export function buildConversationsModel(source) {
  if (!Array.isArray(source) || source.length === 0) {
    return { inbox: [], active: null };
  }
  const inbox = source.map((c) => ({
    id: c.id,
    client: c.client || c.nome || "Sem contato",
    channel: c.channel || c.canal || "—",
    preview: c.preview || c.ultima_mensagem || "",
    at: c.at || c.updated_at || null,
    messages: Array.isArray(c.messages) ? c.messages : [],
  }));
  return { inbox, active: inbox[0] || null };
}

export function buildPortalPreview(order) {
  if (!order) return null;
  const total = Number(order.total || 0);
  const recebido = Number(order.received || 0);
  return {
    titulo: order.description || order.orderCode || "Pedido",
    etapaAtual: order.productionStage || order.stage || "—",
    pagamento: { recebido, total },
    progresso: total > 0 ? Math.min(1, recebido / total) : 0,
    link: null, // gerado sob demanda pelo contrato de tracking.html
  };
}
