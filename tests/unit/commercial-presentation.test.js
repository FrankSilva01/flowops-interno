import test from "node:test";
import assert from "node:assert/strict";
import {
  LEAD_STATUSES,
  buildCustomersModel,
  buildLeadsPipeline,
  buildQuotesModel,
  buildConversationsModel,
  buildPortalPreview,
} from "../../js/features/commercial-presentation.js";

const LEADS = [
  { id: "l1", name: "Laura Mendes", status: "Cliente recorrente", origin: "Indicação", last_contact_at: "2026-07-25" },
  { id: "l2", name: "Amanda Silva", status: "Novo", origin: "Vitrine", last_contact_at: "2026-07-20" },
  { id: "l3", name: "Ricardo Costa", status: "Em negociação", origin: "Mercado Livre", last_contact_at: "2026-07-27" },
  { id: "l4", name: "Studio Aurora", status: "Convertido", origin: "Manual", last_contact_at: "2026-07-24" },
];
const ORDERS = [
  { id: "o1", orderCode: "PED-0258", client: "Laura Mendes", total: 780, quoteStage: "Aprovado" },
  { id: "o2", orderCode: "PED-0100", client: "Laura Mendes", total: 300, quoteStage: "" },
  { id: "o3", orderCode: "ORC-0185", client: "Empresa Orion", total: 1850, quoteStage: "Orçamento enviado" },
  { id: "o4", orderCode: "ORC-0182", client: "Ateliê Nuvem", total: 2400, quoteStage: "Aguardando cliente" },
];

test("LEAD_STATUSES são os status reais do CRM (sem inventar colunas do protótipo)", () => {
  assert.deepEqual(LEAD_STATUSES, ["Novo", "Em negociação", "Convertido", "Perdido", "Cliente recorrente"]);
});

test("buildCustomersModel deriva summary e lista de dados reais, sem mutar entrada", () => {
  const snapshot = structuredClone(LEADS);
  const model = buildCustomersModel(LEADS, ORDERS, {});
  assert.equal(model.summary.leadsEmAberto, 2); // Novo + Em negociação
  assert.equal(model.summary.orcamentosEmAberto, 2); // Orçamento enviado + Aguardando cliente
  assert.equal(model.list.length, 4);
  assert.deepEqual(LEADS, snapshot); // imutável
});

test("buildCustomersModel filtra por status/origem/busca", () => {
  assert.equal(buildCustomersModel(LEADS, ORDERS, { status: "Novo" }).list.length, 1);
  assert.equal(buildCustomersModel(LEADS, ORDERS, { origin: "Mercado Livre" }).list.length, 1);
  assert.equal(buildCustomersModel(LEADS, ORDERS, { search: "laura" }).list.length, 1);
});

test("buildLeadsPipeline agrupa por status real e exige now válido", () => {
  const model = buildLeadsPipeline(LEADS, { now: new Date("2026-07-28T00:00:00Z") });
  assert.deepEqual(model.columns.map((c) => c.stage), LEAD_STATUSES);
  const novo = model.columns.find((c) => c.stage === "Novo");
  assert.equal(novo.count, 1);
  assert.equal(novo.cards[0].name, "Amanda Silva");
  assert.equal(model.summary.total, 4);
  assert.throws(() => buildLeadsPipeline(LEADS, { now: "data-invalida" }), TypeError);
});

test("buildLeadsPipeline não muta os leads e é seguro com lista vazia", () => {
  const snapshot = structuredClone(LEADS);
  buildLeadsPipeline(LEADS, { now: new Date("2026-07-28") });
  assert.deepEqual(LEADS, snapshot);
  const vazio = buildLeadsPipeline([], { now: new Date("2026-07-28") });
  assert.equal(vazio.summary.total, 0);
  assert.equal(vazio.columns.every((c) => c.count === 0 && c.cards.length === 0), true);
});

test("buildQuotesModel usa só orders com quoteStage e formata linhas reais", () => {
  const snapshot = structuredClone(ORDERS);
  const model = buildQuotesModel(ORDERS, {});
  assert.equal(model.rows.length, 3); // exclui o de quoteStage ""
  assert.equal(model.rows.every((r) => r.orderCode && r.status), true);
  assert.equal(model.summary.emAberto >= 2, true);
  assert.deepEqual(ORDERS, snapshot);
});

test("buildConversationsModel devolve estado vazio sem dados (nunca fabrica)", () => {
  assert.deepEqual(buildConversationsModel(), { inbox: [], active: null });
  assert.deepEqual(buildConversationsModel([]), { inbox: [], active: null });
});

test("buildPortalPreview usa dados do pedido e fallback explícito quando ausente", () => {
  assert.equal(buildPortalPreview(null), null);
  const p = buildPortalPreview({ orderCode: "PED-0258", client: "Laura Mendes", productionStage: "Produzindo", total: 780, received: 300, description: "Lembranças" });
  assert.equal(p.etapaAtual, "Produzindo");
  assert.equal(p.pagamento.recebido, 300);
  assert.equal(p.pagamento.total, 780);
});
