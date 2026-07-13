import {
  adminClient,
  applyCors,
  corsHeaders,
  getMlAccountByUserId,
  importMlOrderWithRetry,
  json,
  logSync,
} from "../_shared/marketplace.ts";
import { clientIp } from "../_shared/http.ts";
import { enforceRateLimit } from "../_shared/rate-limit.ts";

Deno.serve(async (req) => {
  applyCors(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let activeOrderId = "";
  try {
    const contentLength = Number(req.headers.get("content-length") || 0);
    if (contentLength > 64 * 1024) return json({ ok: false, error: "Payload excede o limite." }, { status: 413 });
    const url = new URL(req.url);
    if (!url.pathname.endsWith("/ml")) return json({ ok: true, message: "Webhook ativo." });

    const payload = await req.json().catch(() => ({}));
    const resource = String(payload.resource || "");
    const userId = String(payload.user_id || "");
    if (payload.topic !== "orders_v2" || !/^\/orders\/\d+$/i.test(resource) || !/^\d+$/.test(userId)) {
      await logSync("Mercado Livre", "webhook", "ignored", "Notificacao ignorada", {
        actorEmail: "Webhook Mercado Livre",
        rawPayload: payload,
      });
      return json({ ok: true, ignored: true });
    }

    const orderId = resource.split("/").filter(Boolean).pop();
    activeOrderId = orderId || "";
    if (!orderId) return json({ ok: true, ignored: true, reason: "Sem order id" });

    await enforceRateLimit(
      adminClient(),
      `ml-webhook:${clientIp(req)}:${userId}:${orderId}`,
      5,
      1,
    );

    const account = await getMlAccountByUserId(payload.user_id);
    const { order, result, attempts } = await importMlOrderWithRetry(orderId, account);
    await logSync("Mercado Livre", "order-import", result.created ? "success" : "ignored", result.created
      ? `Venda ${orderId} recebida por webhook e criada como ${result.orderCode}`
      : `Venda duplicada ignorada - ja vinculada ao ${result.orderCode}`, {
      externalOrderId: orderId,
      organizationId: account.organization_id,
      internalOrderId: result.internalOrderId,
      actorEmail: "Webhook Mercado Livre",
      rawPayload: { source: "webhook", notification: payload, order_status: order.status, attempts },
    });

    return json({
      ok: true,
      order_id: orderId,
      internal_order_id: result.internalOrderId,
      created: result.created,
      ignored: !result.created,
    });
  } catch (error) {
    await logSync("Mercado Livre", "webhook", "error", error.message || String(error), {
      externalOrderId: activeOrderId || null,
      actorEmail: "Webhook Mercado Livre",
      rawPayload: { error: error.message || String(error), attempts: 3 },
    }).catch(() => {});
    return json({ ok: false, error: error.message || String(error) }, { status: 200 });
  }
});
