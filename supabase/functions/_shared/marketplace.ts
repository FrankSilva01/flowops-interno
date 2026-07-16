import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeadersFor } from "./http.ts";
import { redactSecrets } from "./security.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Expose-Headers": "Content-Disposition, Content-Type, X-FlowOps-Document-Count, X-FlowOps-Document-Source",
};

export function applyCors(req: Request) {
  for (const key of Object.keys(corsHeaders)) delete (corsHeaders as Record<string, string>)[key];
  Object.assign(corsHeaders, corsHeadersFor(req));
}

export function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      ...corsHeaders,
      ...(init.headers || {}),
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

export function html(body: string, init: ResponseInit = {}) {
  return new Response(body, {
    ...init,
    headers: {
      ...corsHeaders,
      ...(init.headers || {}),
      "Content-Type": "text/html; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function adminClient() {
  // service_role is limited to server-side integration work after access checks.
  // Sensitive provider payloads must be redacted before they reach audit logs.
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function env(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Secret ausente: ${name}`);
  return value;
}

export function mlRedirectUri() {
  return Deno.env.get("ML_REDIRECT_URI") ||
    "https://djvrhvzjvnyensbobtby.functions.supabase.co/marketplace-auth/ml/callback";
}

export function appUrl() {
  return Deno.env.get("APP_URL") || "https://rainbow-lokum-1fad14.netlify.app/";
}

export function amazonRedirectUri() {
  return Deno.env.get("AMAZON_REDIRECT_URI") ||
    "https://djvrhvzjvnyensbobtby.functions.supabase.co/marketplace-auth/amazon/callback";
}

export function amazonMarketplaceId() {
  return Deno.env.get("AMAZON_MARKETPLACE_ID") || "A2Q3Y263D00KWC";
}

export function amazonEndpoint() {
  return Deno.env.get("AMAZON_SP_API_ENDPOINT") || "https://sellingpartnerapi-na.amazon.com";
}

export async function refreshMlTokenIfNeeded(account: Record<string, any>) {
  const expiresAt = account.token_expires_at ? new Date(account.token_expires_at).getTime() : 0;
  if (account.access_token && expiresAt > Date.now() + 5 * 60 * 1000) return account;
  if (!account.refresh_token) throw new Error("Conta Mercado Livre sem refresh_token.");

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: env("ML_CLIENT_ID"),
    client_secret: env("ML_CLIENT_SECRET"),
    refresh_token: account.refresh_token,
  });
  const response = await fetch("https://api.mercadolibre.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await response.json();
  if (!response.ok) {
    await logSync("Mercado Livre", "token-refresh", "error", "Falha ao renovar token do Mercado Livre", {
      organizationId: account.organization_id,
      actorEmail: "Sistema",
      rawPayload: redactSecrets(data),
    }).catch(() => {});
    throw new Error(`Falha ao renovar token ML: ${JSON.stringify(data)}`);
  }

  const next = {
    ...account,
    access_token: data.access_token,
    refresh_token: data.refresh_token || account.refresh_token,
    token_expires_at: new Date(Date.now() + Number(data.expires_in || 0) * 1000).toISOString(),
    raw_payload: redactSecrets(data),
    updated_at: new Date().toISOString(),
  };
  const supabase = adminClient();
  const { error } = await supabase
    .from("marketplace_accounts")
    .update({
      access_token: next.access_token,
      refresh_token: next.refresh_token,
      token_expires_at: next.token_expires_at,
      raw_payload: next.raw_payload,
      updated_at: next.updated_at,
    })
    .eq("id", account.id);
  if (error) throw error;
  await logSync("Mercado Livre", "token-refresh", "success", "Token do Mercado Livre renovado", {
    organizationId: account.organization_id,
    actorEmail: "Sistema",
    rawPayload: { expires_in: data.expires_in, user_id: data.user_id },
  }).catch(() => {});
  return next;
}

export async function getMlAccountByUserId(userId?: string | number, organizationId?: string) {
  const supabase = adminClient();
  let query = supabase
    .from("marketplace_accounts")
    .select("*")
    .eq("marketplace", "Mercado Livre")
    .order("updated_at", { ascending: false })
    .limit(1);
  if (userId) query = query.eq("external_seller_id", String(userId));
  if (organizationId) query = query.eq("organization_id", organizationId);
  const { data, error } = await query;
  if (error) throw error;
  if (!data?.length) throw new Error("Nenhuma conta Mercado Livre conectada.");
  return refreshMlTokenIfNeeded(data[0]);
}

export async function refreshAmazonToken(account: Record<string, any>) {
  const expiresAt = account.token_expires_at ? new Date(account.token_expires_at).getTime() : 0;
  if (account.access_token && expiresAt > Date.now() + 5 * 60 * 1000) return account;
  if (!account.refresh_token) throw new Error("Conta Amazon sem refresh token.");
  const response = await fetch("https://api.amazon.com/auth/o2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: account.refresh_token,
      client_id: env("AMAZON_LWA_CLIENT_ID"),
      client_secret: env("AMAZON_LWA_CLIENT_SECRET"),
    }),
  });
  const token = await response.json();
  if (!response.ok) throw new Error(`Falha ao renovar token Amazon: ${JSON.stringify(token)}`);
  const next = {
    ...account,
    access_token: token.access_token,
    token_expires_at: new Date(Date.now() + Number(token.expires_in || 3600) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  };
  const supabase = adminClient();
  const { error } = await supabase.from("marketplace_accounts").update({
    access_token: next.access_token,
    token_expires_at: next.token_expires_at,
    updated_at: next.updated_at,
  }).eq("id", account.id);
  if (error) throw error;
  await logSync("Amazon", "token-refresh", "success", "Token Amazon renovado", {
    organizationId: account.organization_id,
    actorEmail: "Sistema",
  });
  return next;
}

export async function getAmazonAccount(organizationId: string) {
  if (!organizationId) throw new Error("Empresa obrigatoria para conectar a Amazon.");
  const supabase = adminClient();
  const { data, error } = await supabase
    .from("marketplace_accounts")
    .select("*")
    .eq("marketplace", "Amazon")
    .eq("organization_id", organizationId)
    .order("updated_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  if (!data?.length) throw new Error("Nenhuma conta Amazon conectada.");
  return refreshAmazonToken(data[0]);
}

export async function fetchMlOrder(orderId: string, account: Record<string, any>) {
  const response = await fetch(`https://api.mercadolibre.com/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${account.access_token}` },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`Falha ao buscar pedido ML ${orderId}: ${JSON.stringify(data)}`);
  return data;
}

export async function importMlOrderWithRetry(
  orderId: string,
  account: Record<string, any>,
  maxAttempts = 3,
) {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const order = await fetchMlOrder(orderId, account);
      order.__organization_id = account.organization_id;
      const result = await upsertMlOrder(order);
      await ensureMlFiscalAlerts(order, account, result.internalOrderId).catch((error) => {
        console.warn("Falha ao verificar pendência fiscal do Mercado Livre", error);
      });
      return { order, result, attempts: attempt };
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 750));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError || "Falha ao importar venda."));
}

export async function ensureMlFiscalAlerts(
  order: Record<string, any>,
  account: Record<string, any>,
  internalOrderId: string,
) {
  const shippingId = String(order.shipping?.id || "");
  if (!shippingId) return;
  const response = await fetch(`https://api.mercadolibre.com/shipments/${encodeURIComponent(shippingId)}`, {
    headers: {
      Authorization: `Bearer ${account.access_token}`,
      "x-format-new": "true",
    },
  });
  if (!response.ok) return;
  const shipment = await response.json();
  const substatus = String(shipment.substatus || "").toLowerCase();
  if (substatus !== "invoice_pending") return;

  const supabase = adminClient();
  const externalOrderId = String(order.id || "");
  const { data: organization } = await supabase.from("organizations").select("settings").eq("id", account.organization_id).maybeSingle();
  const fiscalProfile = String(organization?.settings?.fiscal_profile || "unknown");
  const createdAt = new Date(order.date_created || Date.now());
  const deadline = new Date(createdAt.getTime() + 3 * 24 * 60 * 60 * 1000);
  const daysRemaining = Math.ceil((deadline.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  const deadlineText = deadline.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const relatedId = `ml-dce:${externalOrderId}:invoice_pending`;

  await supabase.from("marketplace_documents").upsert({
    organization_id: account.organization_id,
    marketplace: "Mercado Livre",
    external_order_id: externalOrderId,
    internal_order_id: internalOrderId,
    document_type: "declaration",
    status: "pending",
    source: "mercado-livre",
    last_error: fiscalProfile === "contributor"
      ? `Documento fiscal pendente. Empresa configurada como contribuinte do ICMS; revise a emissão de NF-e até ${deadlineText}.`
      : `DC-e pendente. Prazo operacional informado: ${deadlineText}.`,
    raw_payload: { shipping_id: shippingId, status: shipment.status, substatus, deadline: deadline.toISOString() },
    updated_at: new Date().toISOString(),
  }, { onConflict: "organization_id,marketplace,external_order_id,document_type" });

  const { data: existing } = await supabase.from("notifications")
    .select("id")
    .eq("organization_id", account.organization_id)
    .eq("related_entity_id", relatedId)
    .maybeSingle();
  if (existing) return;
  const urgency = daysRemaining < 0
    ? "O prazo de 3 dias está vencido."
    : daysRemaining === 0
      ? "O prazo termina hoje."
      : `Restam ${daysRemaining} dia${daysRemaining === 1 ? "" : "s"}.`;
  await supabase.from("notifications").insert({
    organization_id: account.organization_id,
    role_target: "admin",
    type: "fiscal",
    title: fiscalProfile === "contributor" ? "Documento fiscal pendente no Mercado Livre" : "DC-e pendente no Mercado Livre",
    message: fiscalProfile === "contributor"
      ? `Pedido ${externalOrderId}: a empresa está configurada como contribuinte do ICMS. Revise a emissão de NF-e até ${deadlineText}. ${urgency}`
      : `Pedido ${externalOrderId}: emita a declaração de conteúdo até ${deadlineText}. ${urgency}`,
    related_entity: "marketplace_order",
    related_entity_id: relatedId,
    priority: daysRemaining <= 1 ? "high" : "normal",
    metadata: { external_order_id: externalOrderId, internal_order_id: internalOrderId, shipping_id: shippingId, deadline: deadline.toISOString(), substatus, fiscal_profile: fiscalProfile },
  });
}

export async function nextInternalOrderIds(organizationId: string) {
  const supabase = adminClient();
  const { data, error } = await supabase.from("orders").select("id,notes").eq("organization_id", organizationId);
  if (error) throw error;
  let encMax = 0;
  let pedMax = 0;
  for (const row of data || []) {
    const enc = String(row.id || "").match(/ENC-(\d+)/);
    if (enc) encMax = Math.max(encMax, Number(enc[1]));
    try {
      const parsed = JSON.parse(row.notes || "{}");
      const ped = String(parsed.orderCode || "").match(/PED-(\d+)/);
      if (ped) pedMax = Math.max(pedMax, Number(ped[1]));
    } catch {
      // Ignora notes antigos em texto livre.
    }
  }
  const next = Math.max(encMax, pedMax) + 1;
  const tenantCode = organizationId === "00000000-0000-0000-0000-000000000001"
    ? ""
    : organizationId.replaceAll("-", "").slice(0, 6).toUpperCase();
  return {
    id: tenantCode ? `ENC-${tenantCode}-${String(next).padStart(3, "0")}` : `ENC-${String(next).padStart(3, "0")}`,
    orderCode: `PED-${String(next).padStart(4, "0")}`,
  };
}

export function mapMlOrderToInternal(order: Record<string, any>, ids: { id: string; orderCode: string }) {
  const firstItem = order.order_items?.[0];
  const title = firstItem?.item?.title || `Pedido Mercado Livre ${order.id}`;
  const buyerName = [order.buyer?.first_name, order.buyer?.last_name].filter(Boolean).join(" ") ||
    order.buyer?.nickname ||
    "";
  const total = Number(order.total_amount || order.paid_amount || firstItem?.full_unit_price || 0);
  const quantity = Math.max(
    (order.order_items || []).reduce((sum: number, item: Record<string, any>) => sum + Number(item.quantity || 0), 0),
    1,
  );
  const meta = {
    text: "Importado do Mercado Livre",
    orderCode: ids.orderCode,
    marketplaceOrderCode: String(order.id || ""),
    stlLink: "",
    referenceImageUrl: firstItem?.item?.thumbnail || "",
    internalNotes: "",
    tags: ["Mercado Livre"],
    priority: "",
    productionStage: "Em fila",
    responsible: "",
    checklist: { sliced: false, printed: false, postProcessed: false, painted: false, packed: false },
    history: [{
      at: new Date().toISOString(),
      by: "Mercado Livre",
      changes: [{ field: "Pedido", from: "-", to: "Importado" }],
    }],
    marketplaceRaw: { id: order.id, status: order.status, date_created: order.date_created, shipping: order.shipping },
  };
  return {
    id: ids.id,
    client: buyerName,
    description: title,
    material: null,
    color: null,
    order_date: order.date_created ? String(order.date_created).slice(0, 10) : null,
    delivery_date: null,
    status: "A preparar",
    quantity,
    charged: total,
    received: order.paid_amount ? Number(order.paid_amount) : 0,
    notes: JSON.stringify(meta),
    updated_at: new Date().toISOString(),
  };
}

export async function upsertMlOrder(order: Record<string, any>) {
  const supabase = adminClient();
  const organizationId = String(order.__organization_id || "00000000-0000-0000-0000-000000000001");
  const externalId = String(order.id || "");
  if (!externalId) throw new Error("Pedido Mercado Livre sem id.");

  const { data: existingLink, error: linkError } = await supabase
    .from("marketplace_order_links")
    .select("internal_order_id")
    .eq("organization_id", organizationId)
    .eq("marketplace", "Mercado Livre")
    .eq("external_order_id", externalId)
    .maybeSingle();
  if (linkError) throw linkError;

  if (existingLink?.internal_order_id) {
    const { data: existingOrder, error: existingOrderError } = await supabase
      .from("orders")
      .select("*")
      .eq("id", existingLink.internal_order_id)
      .maybeSingle();
    if (existingOrderError) throw existingOrderError;
    let orderCode = existingLink.internal_order_id;
    try {
      orderCode = JSON.parse(existingOrder?.notes || "{}").orderCode || existingLink.internal_order_id;
    } catch {
      orderCode = existingLink.internal_order_id;
    }
    return {
      internalOrder: existingOrder || { id: existingLink.internal_order_id },
      internalOrderId: existingLink.internal_order_id,
      orderCode,
      created: false,
    };
  }

  await assertMarketplaceImportCapacity(organizationId);
  const ids = await nextInternalOrderIds(organizationId);
  const internalOrder = { ...mapMlOrderToInternal(order, ids), organization_id: organizationId };
  const { error: orderError } = await supabase.from("orders").upsert(internalOrder, { onConflict: "id" });
  if (orderError) throw orderError;

  const { error: linkUpsertError } = await supabase.from("marketplace_order_links").upsert({
    organization_id: organizationId,
    marketplace: "Mercado Livre",
    external_order_id: externalId,
    internal_order_id: internalOrder.id,
    raw_payload: order,
    updated_at: new Date().toISOString(),
  }, { onConflict: "organization_id,marketplace,external_order_id" });
  if (linkUpsertError) throw linkUpsertError;
  await Promise.all([
    supabase.from("notifications").insert({
      organization_id: organizationId,
      role_target: "editor",
      type: "marketplace",
      title: "Nova venda importada do Mercado Livre",
      message: `${externalId} vinculada ao ${ids.orderCode}`,
      related_entity: "order",
      related_entity_id: internalOrder.id,
      priority: "normal",
    }),
    supabase.from("audit_events").insert({
      organization_id: organizationId,
      action: "marketplace_import",
      entity_type: "order",
      entity_id: internalOrder.id,
      order_code: ids.orderCode,
      new_value: { marketplace: "Mercado Livre", external_order_id: externalId },
      source: "marketplace",
    }),
  ]);
  return {
    internalOrder,
    internalOrderId: internalOrder.id,
    orderCode: ids.orderCode,
    created: true,
  };
}

export async function assertMarketplaceImportCapacity(organizationId: string) {
  const supabase = adminClient();
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const nextMonth = new Date(monthStart);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  const [{ data: organization, error: organizationError }, { data: subscription }, { count, error: countError }] =
    await Promise.all([
      supabase.from("organizations").select("plan_code").eq("id", organizationId).single(),
      supabase.from("organization_subscriptions").select("plan_code,status").eq("organization_id", organizationId).maybeSingle(),
      supabase.from("marketplace_order_links")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .gte("created_at", monthStart.toISOString())
        .lt("created_at", nextMonth.toISOString()),
    ]);
  if (organizationError) throw organizationError;
  if (countError) throw countError;
  const planCode = subscription?.plan_code || organization.plan_code;
  const { data: plan, error: planError } = await supabase
    .from("subscription_plans")
    .select("limits")
    .eq("code", planCode)
    .single();
  if (planError) throw planError;
  const limit = Number(plan?.limits?.marketplace_sales_month ?? 0);
  if (limit >= 0 && Number(count || 0) >= limit) {
    throw new Error(`Limite mensal de vendas importadas atingido (${count} de ${limit}) no plano ${planCode}.`);
  }
}

export type MarketplaceLogDetails = {
  organizationId?: string | null;
  externalItemId?: string | null;
  externalOrderId?: string | null;
  internalOrderId?: string | null;
  actorEmail?: string | null;
  rawPayload?: unknown;
};

export async function logSync(
  marketplace: string,
  kind: string,
  status: string,
  message: string,
  details: MarketplaceLogDetails | unknown = {},
) {
  const structured = details && typeof details === "object" && (
    "rawPayload" in details ||
    "organizationId" in details ||
    "externalItemId" in details ||
    "externalOrderId" in details ||
    "internalOrderId" in details ||
    "actorEmail" in details
  )
    ? details as MarketplaceLogDetails
    : { rawPayload: details };
  const supabase = adminClient();
  await supabase.from("marketplace_sync_log").insert({
    organization_id: structured.organizationId || "00000000-0000-0000-0000-000000000001",
    marketplace,
    kind,
    status,
    message,
    external_item_id: structured.externalItemId || null,
    external_order_id: structured.externalOrderId || null,
    internal_order_id: structured.internalOrderId || null,
    actor_email: structured.actorEmail || null,
    raw_payload: redactSecrets(structured.rawPayload) || null,
  });
  if (status === "error") {
    await supabase.from("notifications").insert({
      organization_id: structured.organizationId || "00000000-0000-0000-0000-000000000001",
      role_target: "admin",
      type: "marketplace",
      title: `Erro na integração ${marketplace}`,
      message,
      related_entity: "marketplace_log",
      related_entity_id: structured.externalOrderId || structured.externalItemId || kind,
      priority: "high",
      metadata: { kind },
    });
  }
}
