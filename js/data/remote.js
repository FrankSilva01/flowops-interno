import { state, saveData, normalizeOrderStatus } from "../core/state.js";
import { render } from "../core/router.js";
import { subscriptionFallbackFromOrganization } from "../features/subscription.js";
import { parseOrderMeta, serializeOrderMeta, deriveOrderCode } from "../features/orders.js";

export async function persist(kind, item) {
  if (!state.online || !state.supabase) return;
  const { error } = await state.supabase.from(tableName(kind)).upsert(toRemote(kind, item));
  if (error) throw error;
}

export async function removeRemote(kind, id) {
  if (!state.online || !state.supabase) return;
  const { error } = await state.supabase.from(tableName(kind)).delete().eq("id", id);
  if (error) throw error;
}

export async function loadRemoteData() {
  const [orders, cashEntries, materials, inventoryItems, leads, auditEvents, notifications, storefrontEvents, customTags, leadFiles, backupRuns, marketplaceReviews, subscription, organizationInfo, subscriptionPlans, subscriptionPayments, supportTickets, announcements, changelog] = await Promise.all([
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
    state.supabase.from("saas_changelog").select("*").order("published_at", { ascending: false }).limit(100)
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
}

export function subscribeRemote() {
  if (state.subscribed || !state.supabase) return;
  state.subscribed = true;
  state.supabase
    .channel("printflow-3d-realtime")
    .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, refreshRemote)
    .on("postgres_changes", { event: "*", schema: "public", table: "cash_entries" }, refreshRemote)
    .on("postgres_changes", { event: "*", schema: "public", table: "materials" }, refreshRemote)
    .on("postgres_changes", { event: "*", schema: "public", table: "inventory_items" }, refreshRemote)
    .on("postgres_changes", { event: "*", schema: "public", table: "crm_leads" }, refreshRemote)
    .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, refreshRemote)
    .subscribe();
}

export async function refreshRemote() {
  await loadRemoteData();
  saveData();
  render();
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
      order_date: null,
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
    createdAt: item.created_at || item.order_date || "",
    updatedAt: item.updated_at || "",
    deliveryDate: item.delivery_date || "",
    status: normalizeOrderStatus(item.status),
    quantity: Math.max(Number(item.quantity || 1), 1),
    charged: Number(item.charged || 0),
    received: Number(item.received || 0),
    notes: meta.text,
    stlLink: meta.stlLink,
    referenceImageUrl: meta.referenceImageUrl,
    internalNotes: meta.internalNotes,
    tags: meta.tags,
    priority: meta.priority,
    productionStage: meta.productionStage,
    responsible: meta.responsible,
    quoteStage: meta.quoteStage,
    quoteUpdatedAt: meta.quoteUpdatedAt,
    source: meta.source,
    leadId: meta.leadId,
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
