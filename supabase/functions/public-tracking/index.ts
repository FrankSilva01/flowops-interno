import { adminClient } from "../_shared/marketplace.ts";
import { clientIp, corsHeadersFor, isAllowedOrigin } from "../_shared/http.ts";
import { enforceRateLimit } from "../_shared/rate-limit.ts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function respond(req: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeadersFor(req, "GET, OPTIONS"),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function notFound(req: Request) {
  return respond(req, { ok: false, error: "Rastreamento nao encontrado ou indisponivel." }, 404);
}

Deno.serve(async (req) => {
  if (!isAllowedOrigin(req.headers.get("Origin"))) {
    return respond(req, { ok: false, error: "Origem nao permitida." }, 403);
  }
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeadersFor(req, "GET, OPTIONS") });
  if (req.method !== "GET") return respond(req, { ok: false, error: "Use GET." }, 405);

  const token = new URL(req.url).searchParams.get("token")?.trim() || "";
  if (!UUID_PATTERN.test(token)) return notFound(req);

  const admin = adminClient();
  try {
    await enforceRateLimit(admin, `public-tracking:${clientIp(req)}`, 60, 10);
    await enforceRateLimit(admin, `public-tracking-token:${token}`, 120, 10);

    const { data: order, error: orderError } = await admin
      .from("orders")
      .select("id,description,status,order_date,delivery_date,updated_at,organization_id")
      .eq("public_tracking_token", token)
      .eq("public_tracking_enabled", true)
      .maybeSingle();
    if (orderError || !order) return notFound(req);

    const [{ data: logistics }, { data: events }] = await Promise.all([
      admin.from("order_logistics")
        .select("carrier,tracking_code,status,estimated_delivery_date,shipped_at,delivered_at,updated_at")
        .eq("organization_id", order.organization_id)
        .eq("order_id", order.id)
        .maybeSingle(),
      admin.from("logistics_events")
        .select("status,message,occurred_at,source")
        .eq("organization_id", order.organization_id)
        .eq("order_id", order.id)
        .order("occurred_at", { ascending: false })
        .limit(50),
    ]);

    return respond(req, {
      id: order.id,
      description: order.description,
      status: logistics?.status || order.status,
      created_at: order.order_date || order.updated_at,
      delivery_date: order.delivery_date,
      logistics: logistics ? {
        carrier: logistics.carrier,
        tracking_code: logistics.tracking_code,
        status: logistics.status,
        estimated_delivery_date: logistics.estimated_delivery_date,
        shipped_at: logistics.shipped_at,
        delivered_at: logistics.delivered_at,
      } : null,
      events: events || [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao consultar rastreamento.";
    if (message.includes("Muitas tentativas")) return respond(req, { ok: false, error: message }, 429);
    console.error("public-tracking", error);
    return respond(req, { ok: false, error: "Nao foi possivel consultar o rastreamento." }, 500);
  }
});

