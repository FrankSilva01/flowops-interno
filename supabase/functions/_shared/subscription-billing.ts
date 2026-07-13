import { mercadoPagoRequest } from "./mercado-pago.ts";
import {
  derivePaymentTransition,
  normalizePaymentStatus,
} from "./subscription-lifecycle.mjs";

type AdminClient = any;
type JsonRecord = Record<string, any>;

const PAYMENT_REASONS: Record<string, string> = {
  accredited: "Pagamento aprovado.",
  cc_rejected_bad_filled_card_number: "Numero do cartao incorreto.",
  cc_rejected_bad_filled_date: "Data de validade incorreta.",
  cc_rejected_bad_filled_other: "Dados do cartao incompletos ou incorretos.",
  cc_rejected_bad_filled_security_code: "Codigo de seguranca incorreto.",
  cc_rejected_blacklist: "Pagamento recusado por validacao de seguranca.",
  cc_rejected_call_for_authorize: "O banco solicitou autorizacao do titular.",
  cc_rejected_card_disabled: "Cartao desabilitado. Entre em contato com o banco.",
  cc_rejected_duplicated_payment: "Pagamento duplicado.",
  cc_rejected_high_risk: "Pagamento recusado pela analise de seguranca.",
  cc_rejected_insufficient_amount: "Saldo ou limite insuficiente.",
  cc_rejected_invalid_installments: "Quantidade de parcelas nao permitida.",
  cc_rejected_max_attempts: "Limite de tentativas excedido.",
  cc_rejected_other_reason: "Pagamento recusado pelo emissor do cartao.",
  pending_card_payment: "Pagamento em processamento.",
  pending_contingency: "Pagamento em analise.",
  pending_review_manual: "Pagamento em revisao manual.",
};

export function friendlyPaymentReason(detail: unknown, fallback = "") {
  const code = String(detail || "").trim();
  if (!code) return fallback || "Sem detalhe informado pelo Mercado Pago.";
  return PAYMENT_REASONS[code] || fallback || code.replaceAll("_", " ");
}

function cardMetadata(payment: JsonRecord | null) {
  return {
    card_last_four: payment?.card?.last_four_digits || null,
    card_brand: payment?.payment_method_id || payment?.payment_type_id || null,
  };
}

async function resolveSubscription(admin: AdminClient, providerSubscriptionId: string) {
  const { data, error } = await admin
    .from("organization_subscriptions")
    .select("*")
    .eq("provider_subscription_id", providerSubscriptionId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Fatura recorrente sem assinatura identificavel.");
  return data;
}

async function queueBillingEmail(
  admin: AdminClient,
  subscription: JsonRecord,
  status: string,
  amount: number,
  reason: string,
) {
  const { data: organization } = await admin
    .from("organizations")
    .select("name,owner_email")
    .eq("id", subscription.organization_id)
    .maybeSingle();
  if (!organization?.owner_email) return;
  await admin.from("saas_email_outbox").insert({
    organization_id: subscription.organization_id,
    recipient_email: organization.owner_email,
    template_code: status === "approved" ? "payment_approved" : "payment_declined",
    variables: {
      company: organization.name || "",
      amount: `R$ ${amount.toFixed(2).replace(".", ",")}`,
      reason,
      login_url: Deno.env.get("INTERNAL_APP_URL") || Deno.env.get("APP_URL") || "",
    },
  });
}

export async function applyMercadoPagoAttempt(
  admin: AdminClient,
  input: {
    subscription: JsonRecord;
    providerAttemptId: string;
    providerInvoiceId?: string | null;
    providerPaymentId?: string | null;
    amount?: number;
    currency?: string;
    status?: string;
    statusDetail?: string;
    paymentMethod?: string;
    attemptedAt?: string;
    paidAt?: string | null;
    dueAt?: string | null;
    retryAttempt?: number;
    nextPaymentAt?: string | null;
    providerResource?: JsonRecord;
    paymentResource?: JsonRecord | null;
  },
) {
  const subscription = input.subscription;
  const status = normalizePaymentStatus(input.status);
  const attemptedAt = input.attemptedAt || new Date().toISOString();
  const paidAt = status === "approved" ? input.paidAt || attemptedAt : null;
  const reason = friendlyPaymentReason(input.statusDetail, status === "approved" ? "Pagamento aprovado." : "");
  const paymentMeta = cardMetadata(input.paymentResource || null);
  const paymentMethod = input.paymentMethod
    || input.paymentResource?.payment_method_id
    || input.paymentResource?.payment_type_id
    || "Mercado Pago";
  const amount = Number(input.amount || input.paymentResource?.transaction_amount || 0);

  const { data: previous } = await admin
    .from("subscription_payments")
    .select("id,status,metadata")
    .eq("provider", "mercado_pago")
    .eq("provider_payment_id", input.providerAttemptId)
    .maybeSingle();
  const changed = !previous
    || previous.status !== status
    || previous.metadata?.status_detail !== String(input.statusDetail || "");

  const { error: paymentError } = await admin.from("subscription_payments").upsert({
    organization_id: subscription.organization_id,
    subscription_id: subscription.id,
    provider: "mercado_pago",
    provider_payment_id: input.providerAttemptId,
    provider_invoice_id: input.providerInvoiceId || null,
    provider_charge_id: input.providerPaymentId || null,
    amount,
    currency: input.currency || input.paymentResource?.currency_id || "BRL",
    status,
    status_detail: String(input.statusDetail || ""),
    failure_reason: status === "approved" ? null : reason,
    attempt_number: Number(input.retryAttempt || 0),
    attempted_at: attemptedAt,
    payment_method: paymentMethod,
    paid_at: paidAt,
    due_at: input.dueAt || null,
    metadata: {
      ...(previous?.metadata || {}),
      provider_status: String(input.status || ""),
      status_detail: String(input.statusDetail || ""),
      reason,
      provider_invoice_id: input.providerInvoiceId || null,
      provider_charge_id: input.providerPaymentId || null,
      retry_attempt: Number(input.retryAttempt || 0),
      preapproval_id: subscription.provider_subscription_id,
      ...paymentMeta,
    },
    updated_at: new Date().toISOString(),
  }, { onConflict: "provider,provider_payment_id" });
  if (paymentError) throw paymentError;

  const update: JsonRecord = {
    last_payment_attempt_at: attemptedAt,
    last_payment_status: status,
    last_payment_reason: reason,
    last_payment_id: input.providerPaymentId || input.providerAttemptId,
    last_payment_status_detail: String(input.statusDetail || ""),
    billing_reconciled_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const transition = derivePaymentTransition({
    currentStatus: subscription.status,
    paymentStatus: status,
    attemptedAt,
    currentGraceEndsAt: subscription.grace_ends_at,
    nextPaymentAt: input.nextPaymentAt || input.providerResource?.next_payment_date || null,
  });
  let organizationStatus = transition.organizationStatus;
  if (status === "approved") {
    update.status = transition.subscriptionStatus;
    update.last_payment_at = paidAt;
    update.current_period_start = paidAt;
    update.current_period_end = input.nextPaymentAt || input.providerResource?.next_payment_date || null;
    update.next_payment_at = input.nextPaymentAt || input.providerResource?.next_payment_date || null;
    update.grace_ends_at = transition.graceEndsAt;
  } else if (status === "rejected" || status === "cancelled") {
    update.status = transition.subscriptionStatus;
    update.grace_ends_at = transition.graceEndsAt;
  } else {
    update.status = transition.subscriptionStatus;
  }
  if (paymentMeta.card_last_four) {
    update.metadata = {
      ...(subscription.metadata || {}),
      ...paymentMeta,
      payment_method_registered: true,
    };
  }
  const { error: subscriptionError } = await admin
    .from("organization_subscriptions")
    .update(update)
    .eq("id", subscription.id);
  if (subscriptionError) throw subscriptionError;
  await admin.from("organizations").update({
    status: organizationStatus,
    updated_at: new Date().toISOString(),
  }).eq("id", subscription.organization_id);

  if (changed && (status === "approved" || status === "rejected" || status === "cancelled")) {
    await Promise.all([
      ignoreFailure(admin.from("notifications").insert({
        organization_id: subscription.organization_id,
        role_target: "admin",
        type: status === "approved" ? "subscription" : "error",
        title: status === "approved" ? "Pagamento aprovado" : "Pagamento nao aprovado",
        message: status === "approved" ? `Pagamento de R$ ${amount.toFixed(2).replace(".", ",")} confirmado.` : reason,
        related_entity: "subscription",
        related_entity_id: subscription.id,
        priority: status === "approved" ? "normal" : "high",
      })),
      queueBillingEmail(admin, subscription, status, amount, reason).catch(() => null),
      ignoreFailure(admin.from("audit_events").insert({
        organization_id: subscription.organization_id,
        action: status === "approved" ? "subscription_payment_approved" : "subscription_payment_failed",
        entity_type: "subscription",
        entity_id: subscription.id,
        source: "mercado_pago",
        new_value: {
          status,
          amount,
          reason,
          provider_payment_id: input.providerPaymentId || null,
          provider_invoice_id: input.providerInvoiceId || null,
          attempted_at: attemptedAt,
        },
      })),
    ]);
  }
  return { status, reason, changed };
}

async function ignoreFailure(operation: PromiseLike<unknown>) {
  try {
    await operation;
  } catch {
    return null;
  }
}

export async function syncMercadoPagoPayment(admin: AdminClient, paymentId: string) {
  const payment = await mercadoPagoRequest(`/v1/payments/${encodeURIComponent(paymentId)}`);
  const providerSubscriptionId = String(
    payment.metadata?.preapproval_id
      || payment.metadata?.subscription_id
      || payment.point_of_interaction?.transaction_data?.subscription_id
      || "",
  );
  let subscription = providerSubscriptionId
    ? await resolveSubscription(admin, providerSubscriptionId)
    : null;
  if (!subscription && payment.external_reference) {
    const [organizationId] = String(payment.external_reference).split(":");
    const { data } = await admin.from("organization_subscriptions").select("*")
      .eq("organization_id", organizationId).maybeSingle();
    subscription = data;
  }
  if (!subscription) throw new Error("Pagamento sem assinatura identificavel.");
  let providerResource = null;
  if (subscription.provider_subscription_id) {
    providerResource = await mercadoPagoRequest(
      `/preapproval/${encodeURIComponent(subscription.provider_subscription_id)}`,
    ).catch(() => null);
  }
  return await applyMercadoPagoAttempt(admin, {
    subscription,
    providerAttemptId: String(payment.id),
    providerPaymentId: String(payment.id),
    amount: Number(payment.transaction_amount || 0),
    currency: payment.currency_id,
    status: payment.status,
    statusDetail: payment.status_detail,
    paymentMethod: payment.payment_method_id || payment.payment_type_id,
    attemptedAt: payment.date_last_updated || payment.date_created || new Date().toISOString(),
    paidAt: payment.date_approved || null,
    dueAt: payment.date_of_expiration || null,
    nextPaymentAt: providerResource?.next_payment_date || null,
    providerResource,
    paymentResource: payment,
  });
}

export async function syncAuthorizedPayment(admin: AdminClient, invoiceOrId: JsonRecord | string) {
  const invoice = typeof invoiceOrId === "string"
    ? await mercadoPagoRequest(`/authorized_payments/${encodeURIComponent(invoiceOrId)}`)
    : invoiceOrId;
  const providerSubscriptionId = String(invoice.preapproval_id || invoice.subscription_id || "");
  if (!providerSubscriptionId) throw new Error("Fatura autorizada sem assinatura identificavel.");
  const subscription = await resolveSubscription(admin, providerSubscriptionId);
  const providerResource = await mercadoPagoRequest(`/preapproval/${encodeURIComponent(providerSubscriptionId)}`);
  const paymentId = String(invoice.payment_id || invoice.payment?.id || "");
  const payment = paymentId
    ? await mercadoPagoRequest(`/v1/payments/${encodeURIComponent(paymentId)}`).catch(() => null)
    : null;
  const retryAttempt = Number(invoice.retry_attempt || invoice.retry_count || 0);
  const invoiceId = String(invoice.id || "");
  const providerAttemptId = paymentId
    ? paymentId
    : `authorized:${invoiceId}:retry:${retryAttempt}`;
  return await applyMercadoPagoAttempt(admin, {
    subscription,
    providerAttemptId,
    providerInvoiceId: invoiceId || null,
    providerPaymentId: paymentId || null,
    amount: Number(invoice.transaction_amount || invoice.amount || payment?.transaction_amount || 0),
    currency: invoice.currency_id || payment?.currency_id || "BRL",
    status: payment?.status || invoice.status,
    statusDetail: payment?.status_detail || invoice.status_detail,
    paymentMethod: payment?.payment_method_id || invoice.payment_method_id || invoice.payment_method,
    attemptedAt: payment?.date_last_updated || invoice.date_last_updated || invoice.debit_date || invoice.date_created,
    paidAt: payment?.date_approved || invoice.date_approved || null,
    dueAt: invoice.debit_date || invoice.scheduled_date || null,
    retryAttempt,
    nextPaymentAt: providerResource.next_payment_date || null,
    providerResource,
    paymentResource: payment,
  });
}

export async function reconcileMercadoPagoSubscription(admin: AdminClient, subscription: JsonRecord) {
  if (!subscription?.provider_subscription_id) {
    throw new Error("Assinatura sem identificador do Mercado Pago.");
  }
  const providerResource = await mercadoPagoRequest(
    `/preapproval/${encodeURIComponent(subscription.provider_subscription_id)}`,
  );
  let invoices: JsonRecord[] = [];
  let invoiceSearchWarning = "";
  try {
    const query = new URLSearchParams({
      preapproval_id: subscription.provider_subscription_id,
    });
    const search = await mercadoPagoRequest(`/authorized_payments/search?${query.toString()}`);
    invoices = Array.isArray(search.results) ? search.results : [];
  } catch (error) {
    invoiceSearchWarning = error instanceof Error ? error.message : String(error);
  }
  const results = [];
  for (const invoice of [...invoices].reverse()) {
    results.push(await syncAuthorizedPayment(admin, invoice));
  }
  const providerUpdate: JsonRecord = {
    next_payment_at: providerResource.next_payment_date || subscription.next_payment_at,
    billing_reconciled_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (!invoices.length) {
    providerUpdate.metadata = {
      ...(subscription.metadata || {}),
      mercado_pago_status: providerResource.status,
      invoice_search_warning: invoiceSearchWarning || null,
    };
  }
  await admin.from("organization_subscriptions").update(providerUpdate).eq("id", subscription.id);
  return {
    provider_status: providerResource.status,
    next_payment_at: providerResource.next_payment_date || null,
    invoices: invoices.length,
    attempts: results.length,
    invoice_search_warning: invoiceSearchWarning || null,
  };
}
