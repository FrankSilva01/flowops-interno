import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import {
  createMercadoPagoSubscription,
  mercadoPagoRequest,
  syncMercadoPagoPlan,
  verifyMercadoPagoSignature,
} from "../_shared/mercado-pago.ts";
import {
  reconcileMercadoPagoSubscription,
  syncAuthorizedPayment,
  syncMercadoPagoPayment,
} from "../_shared/subscription-billing.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-signature, x-request-id",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const respond = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function adminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Configuracao Supabase ausente.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function createCheckoutResponse(
  admin: ReturnType<typeof createClient>,
  actor: { organizationId: string; email: string },
  planCodeInput: string,
) {
  const planCode = String(planCodeInput || "").trim();
  const { data: plan, error: planError } = await admin
    .from("subscription_plans")
    .select("*")
    .eq("code", planCode)
    .eq("active", true)
    .single();
  if (planError) throw planError;
  if (Number(plan.price_monthly || 0) <= 0) {
    throw new Error("Plano gratuito nao exige checkout.");
  }
  const { data: current } = await admin
    .from("organization_subscriptions")
    .select("plan_code,metadata,provider_subscription_id")
    .eq("organization_id", actor.organizationId)
    .maybeSingle();
  if (current?.plan_code === plan.code && current?.metadata?.init_point) {
    return respond({
      ok: true,
      checkout_url: current.metadata.init_point,
      subscription_id: current.provider_subscription_id || null,
    });
  }
  let mercadoPagoPlanId = plan.mercado_pago_plan_id;
  let planSync = null;
  if (!mercadoPagoPlanId) {
    planSync = await syncMercadoPagoPlan({
      code: plan.code,
      name: plan.name,
      amount: Number(plan.price_monthly),
      currency: plan.currency,
      active: plan.active,
    });
    mercadoPagoPlanId = planSync.id;
    await admin.from("subscription_plans").update({
      mercado_pago_plan_id: mercadoPagoPlanId,
      mercado_pago_init_point: planSync.init_point || null,
      mercado_pago_status: planSync.status || "active",
      mercado_pago_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("code", plan.code);
  }
  if (!mercadoPagoPlanId) throw new Error("Plano ainda nao sincronizado com o Mercado Pago.");
  const subscription = await createMercadoPagoSubscription({
    planId: mercadoPagoPlanId,
    organizationId: actor.organizationId,
    planCode: plan.code,
    payerEmail: actor.email,
    reason: `Assinatura FlowOps - ${plan.name}`,
  });
  const now = new Date().toISOString();
  const { error: subscriptionError } = await admin
    .from("organization_subscriptions")
    .upsert({
      organization_id: actor.organizationId,
      plan_code: plan.code,
      status: mapSubscriptionStatus(subscription.status),
      provider: "mercado_pago",
      provider_subscription_id: subscription.id,
      provider_payer_id: String(subscription.payer_id || ""),
      next_payment_at: subscription.next_payment_date || null,
      metadata: {
        init_point: subscription.init_point,
        mercado_pago_status: subscription.status,
      },
      updated_at: now,
    }, { onConflict: "organization_id" });
  if (subscriptionError) throw subscriptionError;
  return respond({
    ok: true,
    checkout_url: subscription.init_point,
    subscription_id: subscription.id,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = adminClient();
  try {
    const url = new URL(req.url);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = String(body.action || url.searchParams.get("action") || "");

    if (action === "create-checkout") {
      const actor = await requireMember(req, admin);
      return await createCheckoutResponse(admin, actor, String(body.plan_code || ""));
    }

    if (action === "update-payment-method") {
      const actor = await requireOrganizationAdmin(req, admin);
      const cardTokenId = String(body.card_token_id || "").trim();
      const { data: current, error: currentError } = await admin
        .from("organization_subscriptions")
        .select("*")
        .eq("organization_id", actor.organizationId)
        .single();
      if (currentError) throw currentError;
      if (!cardTokenId && current.metadata?.init_point) {
        return respond({
          ok: true,
          checkout_url: current.metadata.init_point,
          subscription_id: current.provider_subscription_id || null,
        });
      }
      if (!cardTokenId && !current.provider_subscription_id) {
        return await createCheckoutResponse(admin, actor, String(body.plan_code || current.plan_code || ""));
      }
      if (!cardTokenId) throw new Error("Token do cartao nao informado.");
      if (!current.provider_subscription_id) {
        throw new Error("A assinatura ainda nao possui cobranca ativa no Mercado Pago.");
      }
      const updated = await mercadoPagoRequest(
        `/preapproval/${encodeURIComponent(current.provider_subscription_id)}`,
        {
          method: "PUT",
          body: JSON.stringify({ card_token_id: cardTokenId }),
        },
      );
      await admin.from("organization_subscriptions").update({
        provider_payer_id: String(updated.payer_id || current.provider_payer_id || ""),
        next_payment_at: updated.next_payment_date || current.next_payment_at,
        metadata: {
          ...(current.metadata || {}),
          mercado_pago_status: updated.status,
          payment_method_updated_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      }).eq("organization_id", actor.organizationId);
      await admin.from("notifications").insert({
        organization_id: actor.organizationId,
        role_target: "admin",
        type: "subscription",
        title: "Forma de pagamento atualizada",
        message: "O novo cartao foi vinculado a assinatura.",
        related_entity: "subscription",
        related_entity_id: current.id,
        priority: "normal",
      });
      return respond({ ok: true, next_payment_at: updated.next_payment_date || null });
    }

    if (action === "schedule-downgrade") {
      const actor = await requireOrganizationAdmin(req, admin);
      const targetPlanCode = String(body.plan_code || "");
      const selectedUsers = Array.isArray(body.deactivate_users)
        ? [...new Set(body.deactivate_users.map((item: unknown) => String(item || "").trim().toLowerCase()).filter(Boolean))]
        : [];
      const [{ data: current, error: currentError }, { data: targetPlan, error: targetError }] = await Promise.all([
        admin.from("organization_subscriptions").select("*").eq("organization_id", actor.organizationId).single(),
        admin.from("subscription_plans").select("*").eq("code", targetPlanCode).eq("active", true).single(),
      ]);
      if (currentError) throw currentError;
      if (targetError) throw targetError;
      const { data: currentPlan, error: currentPlanError } = await admin
        .from("subscription_plans").select("*").eq("code", current.plan_code).single();
      if (currentPlanError) throw currentPlanError;
      if (targetPlan.code === current.plan_code) throw new Error("Este ja e o plano atual.");
      if (Number(targetPlan.price_monthly || 0) >= Number(currentPlan.price_monthly || 0)) {
        throw new Error("Use o fluxo de upgrade para este plano.");
      }
      const { data: members, error: membersError } = await admin
        .from("organization_members")
        .select("user_email,role,status")
        .eq("organization_id", actor.organizationId)
        .eq("status", "active");
      if (membersError) throw membersError;
      const usersLimit = Number(targetPlan.limits?.users || 0);
      const requiredRemoval = usersLimit > 0 ? Math.max((members || []).length - usersLimit, 0) : 0;
      if (selectedUsers.length < requiredRemoval) {
        throw new Error(`Selecione ${requiredRemoval} usuario(s) para desativar no fim do plano vigente.`);
      }
      if (selectedUsers.includes(actor.email)) {
        throw new Error("O administrador que solicitou o downgrade nao pode ser removido.");
      }
      const effectiveAt = current.current_period_end
        || current.next_payment_at
        || current.trial_end
        || new Date(Date.now() + 30 * 86400000).toISOString();
      if (current.provider_subscription_id && Number(targetPlan.price_monthly || 0) > 0) {
        await mercadoPagoRequest(`/preapproval/${encodeURIComponent(current.provider_subscription_id)}`, {
          method: "PUT",
          body: JSON.stringify({
            reason: `Assinatura FlowOps - ${targetPlan.name}`,
            auto_recurring: {
              transaction_amount: Number(targetPlan.price_monthly),
              currency_id: targetPlan.currency || "BRL",
            },
          }),
        });
      }
      const now = new Date().toISOString();
      const { data: requestRow, error: requestError } = await admin
        .from("subscription_change_requests")
        .insert({
          organization_id: actor.organizationId,
          requested_by: actor.email,
          current_plan_code: current.plan_code,
          requested_plan_code: targetPlan.code,
          status: "scheduled",
          change_type: "downgrade",
          effective_at: effectiveAt,
          validation_snapshot: {
            active_users: (members || []).length,
            target_limit: usersLimit,
            deactivate_users: selectedUsers,
            no_immediate_charge: true,
          },
        }).select().single();
      if (requestError) throw requestError;
      await admin.from("organization_subscriptions").update({
        pending_plan_code: targetPlan.code,
        pending_plan_effective_at: effectiveAt,
        pending_deactivate_users: selectedUsers,
        updated_at: now,
      }).eq("organization_id", actor.organizationId);
      await admin.from("notifications").insert({
        organization_id: actor.organizationId,
        role_target: "admin",
        type: "subscription",
        title: "Downgrade agendado",
        message: `${targetPlan.name} entrara em vigor em ${new Date(effectiveAt).toLocaleDateString("pt-BR")}. Nenhuma cobranca foi realizada agora.`,
        related_entity: "subscription",
        related_entity_id: current.id,
        priority: "normal",
      });
      return respond({ ok: true, request: requestRow, effective_at: effectiveAt });
    }

    if (action === "sync-plan") {
      await requirePlatformAdmin(req, admin);
      const code = String(body.plan_code || "");
      const { data: plan, error } = await admin
        .from("subscription_plans")
        .select("*")
        .eq("code", code)
        .single();
      if (error) throw error;
      const result = await syncMercadoPagoPlan({
        id: plan.mercado_pago_plan_id,
        code: plan.code,
        name: plan.name,
        amount: Number(plan.price_monthly),
        currency: plan.currency,
        active: plan.active,
      });
      await admin.from("subscription_plans").update({
        mercado_pago_plan_id: result.id || plan.mercado_pago_plan_id,
        mercado_pago_init_point: result.init_point || plan.mercado_pago_init_point,
        mercado_pago_status: result.status || "active",
        mercado_pago_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("code", code);
      return respond({ ok: true, plan: result });
    }

    if (action === "reconcile-billing") {
      const requestedOrganizationId = String(body.organization_id || "").trim();
      let organizationId = "";
      if (requestedOrganizationId) {
        await requirePlatformAdmin(req, admin);
        organizationId = requestedOrganizationId;
      } else {
        const actor = await requireOrganizationAdmin(req, admin);
        organizationId = actor.organizationId;
      }
      const { data: subscription, error } = await admin
        .from("organization_subscriptions")
        .select("*")
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (error) throw error;
      if (!subscription?.provider_subscription_id) {
        throw new Error("Esta empresa nao possui assinatura recorrente conectada ao Mercado Pago.");
      }
      const result = await reconcileMercadoPagoSubscription(admin, subscription);
      return respond({
        ok: true,
        message: "Cobranca e assinatura sincronizadas com o Mercado Pago.",
        result,
      });
    }

    const dataId = String(
      url.searchParams.get("data.id")
        || body?.data?.id
        || body?.id
        || "",
    );
    const type = String(url.searchParams.get("type") || body?.type || body?.topic || "");
    if (!dataId || !type) return respond({ ok: true, ignored: true });
    if (!(await verifyMercadoPagoSignature(req, dataId))) {
      return respond({ ok: false, error: "Assinatura Webhook invalida." }, 401);
    }
    const eventKey = String(body?.id || `${type}:${dataId}:${body?.action || "updated"}`);
    const { data: existing } = await admin
      .from("subscription_webhook_events")
      .select("id")
      .eq("provider", "mercado_pago")
      .eq("event_key", eventKey)
      .maybeSingle();
    if (existing) return respond({ ok: true, duplicate: true });
    await admin.from("subscription_webhook_events").insert({
      provider: "mercado_pago",
      event_key: eventKey,
      event_type: type,
      resource_id: dataId,
      payload: body,
      status: "processing",
    });
    try {
      if (type === "subscription_preapproval" || type === "preapproval") {
        await processSubscription(admin, dataId);
      } else if (type === "subscription_authorized_payment" || type === "authorized_payment") {
        await syncAuthorizedPayment(admin, dataId);
      } else if (type === "payment") {
        await processPayment(admin, dataId);
      }
      await admin.from("subscription_webhook_events").update({
        status: "processed",
        processed_at: new Date().toISOString(),
      }).eq("provider", "mercado_pago").eq("event_key", eventKey);
    } catch (error) {
      await admin.from("subscription_webhook_events").update({
        status: "error",
        error_message: error.message || String(error),
        processed_at: new Date().toISOString(),
      }).eq("provider", "mercado_pago").eq("event_key", eventKey);
      throw error;
    }
    return respond({ ok: true });
  } catch (error) {
    return respond({ ok: false, error: error.message || String(error) }, 500);
  }
});

async function requireMember(
  req: Request,
  admin: ReturnType<typeof createClient>,
) {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Autenticacao obrigatoria.");
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user?.email) throw new Error("Sessao invalida.");
  const email = data.user.email.toLowerCase();
  const { data: member } = await admin
    .from("organization_members")
    .select("organization_id,status")
    .eq("user_email", email)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (!member) throw new Error("Usuario sem empresa ativa.");
  return { email, organizationId: member.organization_id };
}

async function requirePlatformAdmin(
  req: Request,
  admin: ReturnType<typeof createClient>,
) {
  const actor = await requireMember(req, admin);
  const { data } = await admin
    .from("platform_admins")
    .select("role")
    .eq("user_email", actor.email)
    .maybeSingle();
  if (!data) throw new Error("Acesso restrito ao administrador da plataforma.");
  return actor;
}

async function requireOrganizationAdmin(
  req: Request,
  admin: ReturnType<typeof createClient>,
) {
  const actor = await requireMember(req, admin);
  const { data: member } = await admin
    .from("organization_members")
    .select("role")
    .eq("organization_id", actor.organizationId)
    .eq("user_email", actor.email)
    .eq("status", "active")
    .maybeSingle();
  if (!["administrador", "admin", "owner"].includes(String(member?.role || "").toLowerCase())) {
    throw new Error("Apenas um administrador pode alterar a assinatura.");
  }
  return actor;
}

async function processSubscription(
  admin: ReturnType<typeof createClient>,
  id: string,
) {
  const resource = await mercadoPagoRequest(`/preapproval/${encodeURIComponent(id)}`);
  const [organizationId, planCode] = String(resource.external_reference || "").split(":");
  if (!organizationId || !planCode) {
    const { data: existing } = await admin
      .from("organization_subscriptions")
      .select("organization_id,plan_code")
      .eq("provider_subscription_id", id)
      .maybeSingle();
    if (!existing) throw new Error("Assinatura sem referencia de empresa.");
    return await updateSubscription(admin, resource, existing.organization_id, existing.plan_code);
  }
  return await updateSubscription(admin, resource, organizationId, planCode);
}

async function updateSubscription(
  admin: ReturnType<typeof createClient>,
  resource: Record<string, any>,
  organizationId: string,
  planCode: string,
) {
  const status = mapSubscriptionStatus(resource.status);
  const now = new Date().toISOString();
  const { data: existing } = await admin
    .from("organization_subscriptions")
    .select("metadata,last_payment_status,last_payment_at")
    .eq("organization_id", organizationId)
    .maybeSingle();
  const { data: saved, error } = await admin
    .from("organization_subscriptions")
    .upsert({
      organization_id: organizationId,
      plan_code: planCode,
      status,
      provider: "mercado_pago",
      provider_subscription_id: resource.id,
      provider_payer_id: String(resource.payer_id || ""),
      next_payment_at: resource.next_payment_date || null,
      last_payment_status: existing?.last_payment_status || null,
      last_payment_at: existing?.last_payment_at || null,
      billing_reconciled_at: now,
      metadata: {
        ...(existing?.metadata || {}),
        init_point: resource.init_point,
        mercado_pago_status: resource.status,
      },
      updated_at: now,
    }, { onConflict: "organization_id" })
    .select("id")
    .single();
  if (error) throw error;
  const organizationStatus = ["cancelled", "suspended"].includes(status)
    ? "suspended"
    : status === "pending" || status === "past_due"
      ? "pending"
      : "active";
  await admin.from("organizations").update({
    plan_code: planCode,
    status: organizationStatus,
    updated_at: now,
  }).eq("id", organizationId);
  await admin.from("notifications").insert({
    organization_id: organizationId,
    role_target: "admin",
    type: status === "active" ? "subscription" : "error",
    title: status === "active" ? "Assinatura ativada" : "Assinatura atualizada",
    message: `Mercado Pago: ${status}`,
    related_entity: "subscription",
    related_entity_id: saved.id,
    priority: status === "active" ? "normal" : "high",
  });
}

async function processPayment(
  admin: ReturnType<typeof createClient>,
  id: string,
) {
  return await syncMercadoPagoPayment(admin, id);
}

function mapSubscriptionStatus(status: string) {
  return ({
    authorized: "active",
    pending: "pending",
    paused: "paused",
    cancelled: "cancelled",
    canceled: "cancelled",
  } as Record<string, string>)[String(status || "").toLowerCase()] || "pending";
}
