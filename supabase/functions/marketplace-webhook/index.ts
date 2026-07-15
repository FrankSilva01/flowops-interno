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
  let activeJobId = "";
  try {
    const contentLength = Number(req.headers.get("content-length") || 0);
    if (contentLength > 64 * 1024) return json({ ok: false, error: "Payload excede o limite." }, { status: 413 });
    const url = new URL(req.url);
    if (!url.pathname.endsWith("/ml")) return json({ ok: true, message: "Webhook ativo." });

    const payload = await req.json().catch(() => ({}));
    const resource = String(payload.resource || "");
    const userId = String(payload.user_id || "");
    if (payload.topic !== "orders_v2" || !/^\/orders\/\d+$/i.test(resource) || !/^\d+$/.test(userId)) {
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
    const idempotencyKey = `${orderId}:${String(payload.sent || payload.attempts || "initial")}`;
    const { data: job, error: jobError } = await adminClient().from("integration_jobs").upsert({
      organization_id: account.organization_id,
      marketplace: "Mercado Livre",
      job_type: "order_webhook",
      idempotency_key: idempotencyKey,
      payload: { topic: payload.topic, resource: payload.resource, sent: payload.sent || null },
      status: "processing",
      attempts: 1,
      locked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "organization_id,marketplace,job_type,idempotency_key", ignoreDuplicates: true }).select("id,status").maybeSingle();
    if (jobError) throw jobError;
    if (!job) return json({ ok: true, ignored: true, reason: "Notificacao duplicada" });
    activeJobId = job.id;
    const { order, result, attempts } = await importMlOrderWithRetry(orderId, account);
    await adminClient().from("integration_jobs").update({ status: "completed", attempts, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", activeJobId);
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
    if (activeJobId) {
      const supabase = adminClient();
      const { data: current } = await supabase.from("integration_jobs").select("attempts,max_attempts").eq("id", activeJobId).maybeSingle();
      const attempts = Number(current?.attempts || 1);
      const terminal = attempts >= Number(current?.max_attempts || 5);
      await supabase.from("integration_jobs").update({
        status: terminal ? "dead_letter" : "retry",
        attempts,
        next_attempt_at: new Date(Date.now() + Math.min(3600, 30 * (2 ** attempts)) * 1000).toISOString(),
        last_error: String(error.message || error).slice(0, 1000),
        updated_at: new Date().toISOString(),
      }).eq("id", activeJobId).catch(() => {});
    }
    await logSync("Mercado Livre", "webhook", "error", error.message || String(error), {
      externalOrderId: activeOrderId || null,
      actorEmail: "Webhook Mercado Livre",
      rawPayload: { error: error.message || String(error), attempts: 3 },
    }).catch(() => {});
    return json({ ok: false, error: error.message || String(error) }, { status: 200 });
  }
});
