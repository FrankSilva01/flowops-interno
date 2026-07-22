import { SUPABASE_CONFIG } from "./config.js";

const INITIAL_DATA = {
  orders: [
    order("ENC-001", "The Witcher/Red Dead", "Resina", "2026-06-12", 300, 0, "A preparar"),
    order("ENC-002", "Kush", "Resina", "", 180, 0, "A preparar", "Sem data definida"),
    order("ENC-003", "Cachorro", "Resina", "2026-06-12", 300, 0, "A preparar"),
    order("ENC-004", "Cabeça Oakley", "Filamento", "", 130, 130, "Entregue", "Valor recebido"),
    order("ENC-005", "Base controle Play", "Filamento", "", 0, 0, "A preparar", "Sem data e sem valor informado"),
    order("ENC-006", "Suporte Portal", "Filamento", "", 40, 40, "Entregue", "Valor recebido"),
    order("ENC-007", "Balrog", "Filamento", "", 100, 0, "A preparar", "Sem data definida"),
    order("ENC-008", "Goku e Buma", "Filamento", "", 100, 0, "A preparar", "Sem data definida"),
    order("ENC-009", "Saitama", "Resina", "", 0, 0, "A preparar", "Sem data e sem valor informado"),
    order("ENC-010", "Alfonse", "Resina", "", 600, 0, "A preparar", "Sem data definida"),
    order("ENC-011", "Carro Velozes", "Resina", "", 60, 0, "A preparar", "Sem data definida"),
    order("ENC-012", "Chaveiros", "Filamento", "", 0, 0, "A preparar", "Sem data e sem valor informado"),
    order("ENC-013", "Suporte Pote Cachorro", "Filamento", "", 80, 0, "A preparar", "Sem data definida"),
    order("ENC-014", "Jana", "Resina", "", 300, 0, "A preparar", "Sem data definida"),
    order("ENC-015", "Luffy Funko", "", "", 100, 0, "A preparar", "Material não informado"),
    order("ENC-016", "Dragão de monitor", "Resina", "", 30, 30, "Entregue", "Valor recebido"),
    order("ENC-017", "Touro e Urso", "Resina", "", 80, 80, "Entregue", "Valor recebido")
  ],
  cash: [
    cash("CX-001", "2026-06-05", "Entrada", "Venda", "Dragão de monitor entregue", 30),
    cash("CX-002", "2026-06-05", "Entrada", "Venda", "Suporte Portal entregue", 40),
    cash("CX-003", "2026-06-05", "Entrada", "Venda", "Cabeça Oakley entregue", 130),
    cash("CX-004", "2026-06-05", "Entrada", "Venda", "Touro e Urso entregue", 80)
  ],
  materials: []
};

export const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const DEFAULT_RESPONSIBLES = ["Franklin", "Ravena", "Anderson", "Dayane"];
export const PRODUCTION_STAGES = ["Em fila", "Imprimindo", "Pós-processo", "Pintando", "Pronto", "Entregue"];
export const PRIORITY_OPTIONS = ["", "Baixa", "Normal", "Alta", "Urgente"];
export const STATUS_OPTIONS = ["Orçamento", "A preparar", "Despachado", "A caminho", "Entregue"];
export const SUBSCRIPTION_DEFAULT_GRACE_DAYS = 5;

export function order(id, description, material, deliveryDate, charged, received, status, notes = "") {
  return {
    id,
    createdAt: "",
    quantity: 1,
    client: "",
    description,
    material,
    deliveryDate,
    status: normalizeOrderStatus(status),
    charged,
    received,
    notes,
    orderCode: "",
    marketplaceOrderCode: "",
    stlLink: "",
    referenceImageUrl: "",
    internalNotes: "",
    tags: [],
    priority: "",
    productionStage: "",
    responsible: "",
    quoteStage: "",
    quoteUpdatedAt: "",
    source: "",
    leadId: "",
    productId: "",
    checklist: defaultChecklist(),
    history: []
  };
}

function cash(id, date, type, category, description, amount) {
  return {
    id,
    date,
    type,
    category,
    description,
    method: "Não informado",
    income: type === "Entrada" ? amount : 0,
    expense: type === "Saída" ? amount : 0
  };
}

function loadStringArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function getInitialView() {
  const allowed = [
    "dashboard", "orders", "production", "logistics", "cash", "materials", "reports",
    "leads", "subscription", "calendar", "notifications", "support", "whatsnew",
    "marketplace", "logs", "fiscal", "settings", "approvals"
  ];
  const fromHash = getHashRoute();
  if (allowed.includes(fromHash)) return fromHash;
  const saved = localStorage.getItem("3daft-active-view");
  return allowed.includes(saved) ? saved : "dashboard";
}

export function getHashRoute() {
  return window.location.hash.replace("#", "").split("?")[0];
}

export function normalizeStage(value) {
  if (value === "Acabamento") return "Pós-processo";
  if (value === "Fatiado") return "Em fila";
  if (value === "Pronto" || value === "Entregue") return value;
  return PRODUCTION_STAGES.includes(value) ? value : "Em fila";
}

export function normalizeOrderStatus(value) {
  if (value === "Orçamento") return "Orçamento";
  if (value === "Entregue") return "Entregue";
  if (value === "Despachado") return "Despachado";
  if (value === "A caminho") return "A caminho";
  return "A preparar";
}

export function defaultChecklist() {
  return {
    fileOk: false,
    supportOk: false,
    clientApproved: false,
    packed: false
  };
}

function loadData() {
  try {
    return normalizeData(JSON.parse(localStorage.getItem("printflow-direct-data")) || JSON.parse(JSON.stringify(INITIAL_DATA)));
  } catch {
    return normalizeData(JSON.parse(JSON.stringify(INITIAL_DATA)));
  }
}

function normalizeData(data) {
  return {
    orders: (data.orders || []).map((item) => ({
      ...item,
      status: normalizeOrderStatus(item.status),
      marketplaceOrderCode: item.marketplaceOrderCode || ""
    })),
    cash: data.cash || [],
    materials: data.materials || []
  };
}

export function saveData() {
  localStorage.setItem("printflow-direct-data", JSON.stringify(state.data));
}

export const state = {
  view: getInitialView(),
  query: "",
  data: loadData(),
  supabase: null,
  online: false,
  // So vira true apos loadRemoteData() ter sucesso. Enquanto false, persist()/
  // removeRemote() nao escrevem, evitando gravar dados demo/nao-carregados no
  // banco do tenant caso o carregamento inicial falhe.
  remoteLoaded: false,
  subscribed: false,
  subscriptionWatcherBound: false,
  activeUserName: "Usuario local",
  activeUserEmail: "",
  activeUserRoleName: "",
  activePermissions: {},
  organizationId: "",
  organizationSlug: "",
  organizationName: SUPABASE_CONFIG?.COMPANY_NAME || "3D.AFT",
  organizationSettings: {},
  supportMode: false,
  isAdmin: false,
  canEdit: true,
  accessRequests: [],
  activeUsers: [],
  responsibles: DEFAULT_RESPONSIBLES.map((name, index) => ({ id: `RESP-${String(index + 1).padStart(3, "0")}`, name })),
  marketplaceAccounts: [],
  marketplaceListings: [],
  marketplaceSales: [],
  marketplaceDocuments: [],
  marketplaceDocumentVersions: [],
  marketplaceDocumentSearch: "",
  marketplaceDocumentFilter: "all",
  marketplaceSelectedSales: [],
  marketplaceLogs: [],
  marketplaceLogFilter: "all",
  marketplaceLogDateFrom: "",
  marketplaceLogDateTo: "",
  marketplaceLogLimit: 30,
  marketplaceLogsCleared: false,
  marketplaceChannelFilter: "all",
  marketplaceListingSearch: "",
  marketplaceListingsPage: 1,
  storefrontPage: 1,
  marketplaceListingFilters: {
    noSales: false, visits100: false, questions3: false, zeroStock: false,
    marginUnder20: false, intentHigh: false, intentVeryHigh: false,
  },
  marketplaceView: "listings",
  marketplacePerformanceSection: "profitability",
  leads: [],
  auditEvents: [],
  notifications: [],
  storefrontEvents: [],
  customTags: [],
  leadFiles: [],
  inventoryItems: [],
  backupRuns: [],
  marketplaceReviews: [],
  orderLogistics: [],
  logisticsEvents: [],
  logisticsSearch: "",
  logisticsStatusFilter: "all",
  products: [],
  productListings: [],
  financialSettings: null,
  commercialSuggestions: [],
  dismissedInsightKeys: [],
  listingAnalytics: {},
  sellerMetrics: null,
  analyticsSyncedAt: null,
  analyticsSyncing: false,
  listingFeeSync: {},
  feeSyncing: false,
  performanceTableSort: "score_desc",
  performanceTableHealthFilter: "all",
  productSearch: "",
  intelligenceTableLevelFilter: "all",
  intelligenceTableMarketplaceFilter: "all",
  intelligenceTableSort: "margin_desc",
  reportTab: "overview",
  reportPeriod: "30",
  reportCompare: "previous",
  reportGroup: "day",
  reportTablePage: 1,
  subscription: null,
  organizationInfo: null,
  subscriptionPlans: [],
  subscriptionPayments: [],
  supportTickets: [],
  privacyConsents: [],
  dataRequests: [],
  integrationJobs: [],
  announcements: [],
  changelog: [],
  leadSearch: "",
  leadStatusFilter: "all",
  leadOriginFilter: "all",
  selectedLeadId: null,
  notificationFilter: "all",
  notificationLimit: 20,
  topProductsPeriod: "30",
  theme: ["light", "dark"].includes(localStorage.getItem("3daft-theme")) ? localStorage.getItem("3daft-theme") : "dark",
  ordersViewMode: ["cards", "table"].includes(localStorage.getItem("3daft-orders-view-mode")) ? localStorage.getItem("3daft-orders-view-mode") : "cards",
  selectedOrderId: null,
  selectedOrderIds: [],
  dashboardHiddenCards: loadStringArray("3daft-dashboard-hidden"),
  historyDateFrom: "",
  historyDateTo: "",
  historyLimit: 40,
  historyCleared: false,
  draggedDashboardCard: null,
  draggedOrderId: null,
  pendingReferenceImageFile: null,
  pendingReferenceImagePreviewUrl: "",
  editingOrderId: null,
  editingCashId: null,
  editingMaterialId: null,
  editingInventoryId: null,
  filters: {
    cashType: "all",
    orderSort: "alpha",
    orderMaterial: "all",
    orderStatus: "all",
    orderMarketplace: "all",
    orderFocus: "all",
    orderQuote: "all",
    productionMaterial: "all",
    productionStatus: "all",
    productionMarketplace: "all",
    materialType: "all",
    materialSort: "date",
    materialSearch: "",
    materialSupplier: "",
    materialDateFrom: "",
    materialDateTo: "",
    inventorySearch: "",
    inventorySupplier: "",
    inventoryStatus: "all",
    logType: "all"
  }
};
