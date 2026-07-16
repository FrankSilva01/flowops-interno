import { state, saveData, normalizeOrderStatus } from "../core/state.js";
import { render } from "../core/router.js";
import { subscriptionFallbackFromOrganization } from "../features/subscription.js";
import { loadCalendarEvents } from "../features/calendar-persistence.js";
import {
  parseOrderMeta, serializeOrderMeta, deriveOrderCode, normalizeReferenceImageValue,
  isOwnReferenceImagePath,
} from "../features/orders.js";

export async function persist(kind, item) {
  if (!state.online || !state.supabase) return;
  const { error } = await state.supabase.from(tableName(kind)).upsert(toRemote(kind, item));
  if (error) throw error;
}

export async function removeRemote(kind, id) {
  if (!state.online || !state.supabase) return;
  const { error } = await state.supabase.from(tableName(kind)).delete().eq("id", id).eq("organization_id", state.organizationId);
  if (error) throw error;
}

export async function loadRemoteData() {
  const [orders, cashEntries, materials, inventoryItems, leads, auditEvents, notifications, storefrontEvents, customTags, leadFiles, backupRuns, marketplaceReviews, subscription, organizationInfo, subscriptionPlans, subscriptionPayments, supportTickets, announcements, changelog, orderLogistics, logisticsEvents, products, productListings, financialSettings, commercialSuggestions, privacyConsents, dataRequests, integrationJobs] = await Promise.all([
    state.supabase.from("orders").select("*").eq("organization_id", state.organizationId).order("id"),
    state.supabase.from("cash_entries").select("*").eq("organization_id", state.organizationId).order("date"),
    state.supabase.from("materials").select("*").eq("organization_id", state.organizationId).order("date"),
    state.supabase.from("inventory_items").select("*").eq("organization_id", state.organizationId).order("name"),
    state.supabase.from("crm_leads").select("*").eq("organization_id", state.organizationId).order("updated_at", { ascending: false }),
    state.supabase.from("audit_events").select("*").eq("organization_id", state.organizationId).order("created_at", { ascending: false }).limit(250),
    state.supabase.from("notifications").select("*").eq("organization_id", state.organizationId).order("created_at", { ascending: false }).limit(200),
    state.supabase.from("storefront_events").select("*").eq("organization_id", state.organizationId).order("created_at", { ascending: false }).limit(500),
    state.supabase.from("custom_tags").select("*").eq("organization_id", state.organizationId).order("name"),
    state.supabase.from("lead_files").select("*").eq("organization_id", state.organizationId).order("created_at", { ascending: false }),
    state.supabase.from("backup_runs").select("*").eq("organization_id", state.organizationId).order("started_at", { ascending: false }).limit(20),
    state.supabase.from("marketplace_reviews").select("*").eq("organization_id", state.organizationId).order("review_date", { ascending: false }).limit(200),
    state.supabase.from("organization_subscriptions").select("*").eq("organization_id", state.organizationId).maybeSingle(),
    state.supabase.from("organizations").select("id,name,slug,status,plan_code,trial_ends_at,owner_email").eq("id", state.organizationId).maybeSingle(),
    state.supabase.from("subscription_plans").select("*").order("price_monthly"),
    state.supabase.from("subscription_payments").select("*").eq("organization_id", state.organizationId).order("created_at", { ascending: false }).limit(100),
    state.supabase.from("saas_support_tickets").select("*").eq("organization_id", state.organizationId).order("created_at", { ascending: false }).limit(100),
    state.supabase.from("saas_announcements").select("*").order("published_at", { ascending: false }).limit(100),
    state.supabase.from("saas_changelog").select("*").order("published_at", { ascending: false }).limit(100),
    state.supabase.from("order_logistics").select("*").eq("organization_id", state.organizationId),
    state.supabase.from("logistics_events").select("*").eq("organization_id", state.organizationId).order("occurred_at", { ascending: false }).limit(500),
    state.supabase.from("products").select("*").eq("organization_id", state.organizationId),
    state.supabase.from("product_listings").select("*").eq("organization_id", state.organizationId),
    state.supabase.from("financial_settings").select("*").eq("organization_id", state.organizationId).maybeSingle(),
    state.supabase.from("commercial_suggestions").select("*").eq("organization_id", state.organizationId).order("created_at", { ascending: false }).limit(200),
    state.supabase.from("privacy_consents").select("*").eq("organization_id", state.organizationId).eq("user_email", state.activeUserEmail).order("accepted_at", { ascending: false }).limit(20),
    state.supabase.from("organization_data_requests").select("*").eq("organization_id", state.organizationId).order("created_at", { ascending: false }).limit(30),
    state.supabase.from("integration_jobs").select("id,marketplace,job_type,status,attempts,max_attempts,last_error,correlation_id,created_at").eq("organization_id", state.organizationId).order("created_at", { ascending: false }).limit(50)
  ]);

  if (orders.error) throw orders.error;
  if (cashEntries.error) throw cashEntries.error;
  if (materials.error) throw materials.error;
  if (inventoryItems.error) throw inventoryItems.error;
  if (leads.error) throw leads.error;
  if (auditEvents.error) throw auditEvents.error;
  if (notifications.error) throw notifications.error;
  if (storefrontEvents.error) throw storefrontEvents.error;

  state.data.orders = orders.data.map(fromRemoteOrder);
  await signOrderReferenceImages(state.data.orders);
  state.data.cash = cashEntries.data.map(fromRemoteCash);
  state.data.materials = materials.data.map(fromRemoteMaterial);
  state.inventoryItems = inventoryItems.data || [];
  state.leads = leads.data || [];
  state.auditEvents = auditEvents.data || [];
  state.notifications = notifications.data || [];
  state.storefrontEvents = storefrontEvents.data || [];
  state.customTags = customTags.error ? [] : customTags.data || [];
  state.leadFiles = leadFiles.error ? [] : leadFiles.data || [];
  state.backupRuns = backupRuns.error ? [] : backupRuns.data || [];
  state.marketplaceReviews = marketplaceReviews.error ? [] : marketplaceReviews.data || [];
  state.organizationInfo = organizationInfo.error ? null : organizationInfo.data || null;
  state.subscription = subscription.error ? null : subscription.data || subscriptionFallbackFromOrganization(state.organizationInfo);
  state.subscriptionPlans = subscriptionPlans.error ? [] : subscriptionPlans.data || [];
  state.subscriptionPayments = subscriptionPayments.error ? [] : subscriptionPayments.data || [];
  state.supportTickets = supportTickets.error ? [] : supportTickets.data || [];
  state.announcements = announcements.error ? [] : announcements.data || [];
  state.changelog = changelog.error ? [] : changelog.data || [];
  state.orderLogistics = orderLogistics.error ? [] : orderLogistics.data || [];
  state.logisticsEvents = logisticsEvents.error ? [] : logisticsEvents.data || [];
  state.products = products.error ? [] : products.data || [];
  state.productListings = productListings.error ? [] : productListings.data || [];
  state.financialSettings = financialSettings.error ? null : financialSettings.data || null;
  state.commercialSuggestions = commercialSuggestions.error ? [] : commercialSuggestions.data || [];
  state.privacyConsents = privacyConsents.error ? [] : privacyConsents.data || [];
  state.dataRequests = dataRequests.error ? [] : dataRequests.data || [];
  state.integrationJobs = integrationJobs.error ? [] : integrationJobs.data || [];
}

// order-images e um bucket privado; o que fica salvo no pedido e so o caminho
// no storage (normalizeReferenceImageValue). Aqui resolvemos uma URL assinada
// (temporaria) para exibir a imagem nesta sessao, em um unico lote.
async function signOrderReferenceImages(orders) {
  if (!state.supabase) return;
  const targets = orders.filter((order) => isOwnReferenceImagePath(order.referenceImageUrl));
  if (!targets.length) return;
  const paths = targets.map((order) => order.referenceImageUrl);
  const { data, error } = await state.supabase.storage.from("order-images").createSignedUrls(paths, 3600);
  if (error || !data) return;
  data.forEach((result, index) => {
    if (result?.signedUrl) targets[index].referenceImageUrl = result.signedUrl;
  });
}

export function subscribeRemote() {
  if (state.subscribed || !state.supabase) return;
  state.subscribed = true;
  const ownOrganizationChanges = (table) => ({
    event: "*",
    schema: "public",
    table,
    filter: `organization_id=eq.${state.organizationId}`,
  });
  state.supabase
    .channel("printflow-3d-realtime")
    .on("postgres_changes", ownOrganizationChanges("orders"), scheduleRemoteRefresh)
    .on("postgres_changes", ownOrganizationChanges("cash_entries"), scheduleRemoteRefresh)
    .on("postgres_changes", ownOrganizationChanges("materials"), scheduleRemoteRefresh)
    .on("postgres_changes", ownOrganizationChanges("inventory_items"), scheduleRemoteRefresh)
    .on("postgres_changes", ownOrganizationChanges("crm_leads"), scheduleRemoteRefresh)
    .on("postgres_changes", ownOrganizationChanges("notifications"), scheduleRemoteRefresh)
    .on("postgres_changes", ownOrganizationChanges("order_logistics"), scheduleRemoteRefresh)
    .on("postgres_changes", ownOrganizationChanges("logistics_events"), scheduleRemoteRefresh)
    .on("postgres_changes", ownOrganizationChanges("products"), scheduleRemoteRefresh)
    .on("postgres_changes", ownOrganizationChanges("product_listings"), scheduleRemoteRefresh)
    .on("postgres_changes", ownOrganizationChanges("financial_settings"), scheduleRemoteRefresh)
    .on("postgres_changes", ownOrganizationChanges("commercial_suggestions"), scheduleRemoteRefresh)
    .on("postgres_changes", ownOrganizationChanges("calendar_events"), scheduleCalendarRefresh)
    .subscribe();
}

let refreshTimer = null;
let calendarRefreshTimer = null;
let refreshInFlight = false;
let refreshQueued = false;

export function scheduleRemoteRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => refreshRemote().catch((error) => {
    console.error("Realtime refresh failed:", error);
  }), 180);
}

function scheduleCalendarRefresh() {
  clearTimeout(calendarRefreshTimer);
  calendarRefreshTimer = setTimeout(() => loadCalendarEvents().then(render).catch((error) => {
    console.error("Calendar realtime refresh failed:", error);
  }), 180);
}

export async function refreshRemote() {
  if (refreshInFlight) {
    refreshQueued = true;
    return;
  }
  refreshInFlight = true;
  try {
    await loadRemoteData();
    saveData();
    render();
  } finally {
    refreshInFlight = false;
    if (refreshQueued) {
      refreshQueued = false;
      scheduleRemoteRefresh();
    }
  }
}

export function tableName(kind) {
  return kind === "cash" ? "cash_entries" : kind;
}

export function toRemote(kind, item) {
  if (kind === "orders") {
    return {
      id: item.id,
      organization_id: state.organizationId,
      client: item.client || null,
      description: item.description,
      material: item.material || null,
      color: null,
      order_date: item.createdAt ? String(item.createdAt).slice(0, 10) : new Date().toISOString().slice(0, 10),
      delivery_date: item.deliveryDate || null,
      status: normalizeOrderStatus(item.status),
      quantity: Math.max(Number(item.quantity || 1), 1),
      charged: item.charged || 0,
      received: item.received || 0,
      notes: serializeOrderMeta(item),
      updated_at: new Date().toISOString()
    };
  }
  if (kind === "cash") {
    return {
      id: item.id,
      organization_id: state.organizationId,
      date: item.date,
      type: item.type,
      category: item.category,
      description: item.description,
      person: null,
      method: item.method || null,
      income: item.income || 0,
      expense: item.expense || 0,
      updated_at: new Date().toISOString()
    };
  }
  return {
    id: item.id,
    organization_id: state.organizationId,
    date: item.date,
    supplier: item.supplier,
    type: item.type,
    spec: item.spec || null,
    quantity: item.quantity || 0,
    unit_cost: item.unitCost || 0,
    updated_at: new Date().toISOString()
  };
}

export function fromRemoteOrder(item) {
  const meta = parseOrderMeta(item.notes);
  return {
    id: item.id,
    orderCode: meta.orderCode || deriveOrderCode(item.id),
    marketplaceOrderCode: meta.marketplaceOrderCode || "",
    client: item.client || "",
    description: item.description,
    material: item.material || "",
    createdAt: item.created_at || item.order_date || item.updated_at || "",
    updatedAt: item.updated_at || "",
    public_tracking_token: item.public_tracking_token || "",
    public_tracking_enabled: item.public_tracking_enabled !== false,
    deliveryDate: item.delivery_date || "",
    status: normalizeOrderStatus(item.status),
    quantity: Math.max(Number(item.quantity || 1), 1),
    charged: Number(item.charged || 0),
    received: Number(item.received || 0),
    notes: meta.text,
    stlLink: meta.stlLink,
    referenceImageUrl: normalizeReferenceImageValue(meta.referenceImageUrl),
    internalNotes: meta.internalNotes,
    tags: meta.tags,
    priority: meta.priority,
    productionStage: meta.productionStage,
    responsible: meta.responsible,
    quoteStage: meta.quoteStage,
    quoteUpdatedAt: meta.quoteUpdatedAt,
    source: meta.source,
    leadId: meta.leadId,
    productId: meta.productId,
    checklist: meta.checklist,
    history: meta.history
  };
}

export function fromRemoteCash(item) {
  return {
    id: item.id,
    date: item.date,
    type: item.type,
    category: item.category,
    description: item.description,
    method: item.method || "",
    income: Number(item.income || 0),
    expense: Number(item.expense || 0)
  };
}

export function fromRemoteMaterial(item) {
  return {
    id: item.id,
    date: item.date,
    supplier: item.supplier,
    type: item.type,
    spec: item.spec || "",
    quantity: Number(item.quantity || 0),
    unitCost: Number(item.unit_cost || 0)
  };
}
