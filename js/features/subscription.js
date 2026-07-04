import { state, money, SUBSCRIPTION_DEFAULT_GRACE_DAYS } from "../core/state.js";
import { byId, html, formatDate, formatDateTime, flashActionMessage, showAppConfirm } from "../core/dom.js";
import { bindActions } from "../core/router.js";
import { loadRemoteData } from "../data/remote.js";
import { recordAudit } from "./logs.js";

export async function getSubscriptionAccessStatus() {
  try {
    const { data: subscription, error } = await state.supabase
      .from("organization_subscriptions")
      .select("status,trial_end,current_period_end,next_payment_at,grace_ends_at,plan_code,metadata")
      .eq("organization_id", state.organizationId)
      .maybeSingle();
    if (error) return { allowed: false, message: "Nao foi possivel validar a assinatura da empresa." };
    if (!subscription) return { allowed: false, message: "Assinatura da empresa nao encontrada." };
    const status = String(subscription.status || "").toLowerCase();
    if (subscription.plan_code === "free" || status === "free") return { allowed: true };
    const now = Date.now();
    const trialEnd = subscription.trial_end ? new Date(subscription.trial_end).getTime() : null;
    const renewalAt = subscription.next_payment_at || subscription.current_period_end;
    const renewalTime = renewalAt ? new Date(renewalAt).getTime() : null;
    const graceTime = subscription.grace_ends_at ?
       new Date(subscription.grace_ends_at).getTime()
      : renewalTime ?
         renewalTime + SUBSCRIPTION_DEFAULT_GRACE_DAYS * 86400000
        : null;
    if (status === "trial") {
      if (!trialEnd || trialEnd > now) return { allowed: true };
      return {
        allowed: false,
        message: "O periodo de teste desta empresa terminou. Cadastre uma forma de pagamento para reativar o acesso.",
      };
    }
    if (status === "active") {
      if (!renewalTime || renewalTime > now || (graceTime && graceTime > now)) return { allowed: true };
      return {
        allowed: false,
        message: "A assinatura desta empresa venceu e o periodo de tolerancia terminou. Regularize o pagamento para reativar o acesso.",
      };
    }
    if (status === "past_due" && graceTime && graceTime > now) {
      return { allowed: true };
    }
    if (status === "pending") {
      const until = subscription.current_period_end || subscription.trial_end || subscription.next_payment_at;
      if (until && new Date(until).getTime() > now) return { allowed: true };
    }
    return {
      allowed: false,
      message: "A assinatura desta empresa esta suspensa ou pendente. Regularize em Minha Assinatura para reativar o acesso.",
    };
  } catch {
    return { allowed: false, message: "Nao foi possivel validar a assinatura da empresa." };
  }
}

export function subscriptionFallbackFromOrganization(organization) {
  if (!organization?.plan_code) return null;
  const now = new Date().toISOString();
  return {
    organization_id: organization.id,
    plan_code: organization.plan_code,
    status: organization.status === "trial" ? "trial" : organization.status === "active" ? "active" : organization.status || "active",
    provider: "manual",
    trial_start: null,
    trial_end: organization.trial_ends_at || null,
    current_period_start: now,
    current_period_end: organization.trial_ends_at || null,
    next_payment_at: null,
    provider_subscription_id: null,
    metadata: { source: "organization_fallback" },
  };
}

export function getSubscriptionAlert() {
  const subscription = state.subscription;
  const plan = state.subscriptionPlans.find((item) => item.code === subscription?.plan_code);
  if (!subscription || !plan) return null;
  const latestPayment = state.subscriptionPayments[0];
  const metadata = subscription.metadata || {};
  const cardLastFour = metadata.card_last_four || metadata.last_four || latestPayment?.metadata?.card_last_four || latestPayment?.metadata?.last_four || "";
  const paymentMethod = cardLastFour ? `Cartão final ${cardLastFour}` : latestPayment?.payment_method || "";
  const now = Date.now();
  const renewalAt = subscription.status === "trial" ?
     subscription.trial_end
    : subscription.status === "active" && Number(plan.price_monthly || 0) > 0 ?
       subscription.next_payment_at || subscription.current_period_end
      : null;
  const renewalTime = renewalAt ? new Date(renewalAt).getTime() : null;
  const graceTime = subscription.grace_ends_at ?
     new Date(subscription.grace_ends_at).getTime()
    : renewalTime ?
       renewalTime + SUBSCRIPTION_DEFAULT_GRACE_DAYS * 86400000
      : null;
  if (subscription.status === "past_due") {
    return { level: "critical", title: "Pagamento da assinatura pendente", message: "Atualize o pagamento para evitar a suspensão do acesso." };
  }
  if (renewalTime && renewalTime <= now && graceTime && graceTime > now) {
    return { level: "critical", title: "Assinatura em período de tolerância", message: `Regularize o pagamento até ${formatDateTime(new Date(graceTime).toISOString())}.` };
  }
  if (renewalTime && graceTime && graceTime <= now && subscription.status === "active") {
    return { level: "critical", title: "Assinatura vencida", message: "O período de tolerância terminou. Regularize o pagamento para evitar bloqueio." };
  }
  if (!renewalAt) return null;
  const days = Math.max(0, Math.ceil((new Date(renewalAt).getTime() - now) / 86400000));
  if (days > 7) return null;
  const hasRegisteredPaymentMethod = Boolean(paymentMethod || subscription.provider_subscription_id || metadata.payment_method_registered);
  if (subscription.status === "trial" && !hasRegisteredPaymentMethod) {
    return { level: "critical", title: `Seu período de teste termina em ${days} dia${days === 1 ? "" : "s"}`, message: "Não encontramos um método de pagamento cadastrado." };
  }
  if (subscription.status === "active" && !hasRegisteredPaymentMethod) {
    return { level: "critical", title: "Método de pagamento não encontrado", message: "Seu plano vence em breve. Adicione um cartão para evitar a suspensão." };
  }
  return {
    level: days <= 1 ? "critical" : "normal",
    title: days === 1 ? "Seu plano será renovado amanhã" : `Seu plano será renovado em ${days} dias`,
    message: `${plan.name} • ${money.format(Number(plan.price_monthly || 0))} • ${paymentMethod || "Método não informado"}`,
  };
}

export function renderSubscriptionPortal() {
  const target = byId("subscriptionSummary");
  const table = byId("billingHistoryTable");
  if (!target || !table) return;
  const subscription = state.subscription;
  const plan = state.subscriptionPlans.find((item) => item.code === subscription?.plan_code);
  if (!subscription) {
    target.innerHTML = `<div class="panel"><div class="empty-chart">Assinatura não encontrada para esta empresa.</div></div>`;
    table.innerHTML = `<tr><td colspan="5">Nenhuma cobrança registrada.</td></tr>`;
    return;
  }
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const importedSales = state.marketplaceSales.filter((item) => new Date(item.created_at) >= monthStart).length;
  const users = state.activeUsers.length || 1;
  const latestPayment = state.subscriptionPayments[0];
  const paymentMetadata = subscription.metadata || {};
  const cardLastFour = paymentMetadata.card_last_four || paymentMetadata.last_four || latestPayment?.metadata?.card_last_four || latestPayment?.metadata?.last_four || "";
  const cardBrand = paymentMetadata.card_brand || latestPayment?.metadata?.card_brand || latestPayment?.payment_method || "";
  const hasRegisteredPaymentMethod = Boolean((paymentMetadata.payment_method_registered !== false) && (cardLastFour || paymentMetadata.payment_method_registered || subscription.provider_subscription_id || latestPayment?.payment_method));
  const paymentMethod = cardLastFour ? `${cardBrand ? `${cardBrand} ` : "Cartão "}final ${cardLastFour}` : hasRegisteredPaymentMethod ? "Cartão cadastrado no Mercado Pago" : "Não cadastrado";
  const renewalAt = subscription.next_payment_at || subscription.current_period_end;
  const grace = getSubscriptionGraceInfo(subscription, latestPayment);
  const renewalMissed = subscriptionRenewalMissed(subscription, latestPayment);
  const paymentDetail = subscription.last_payment_reason
    || latestPayment?.failure_reason
    || latestPayment?.status_detail
    || latestPayment?.metadata?.reason
    || latestPayment?.metadata?.status_detail
    || latestPayment?.metadata?.message
    || latestPayment?.metadata?.provider_status
    || "-";
  const lastPaymentAttemptAt = subscription.last_payment_attempt_at
    || latestPayment?.attempted_at
    || latestPayment?.created_at;
  const health = getCompanyHealth();
  const subscriptionPrice = getSubscriptionPrice(plan, subscription);
  const userLimit = Number(plan?.limits?.users || 0);
  const salesLimit = Number(plan?.limits?.marketplace_sales_month || 0);
  const connectedMarketplaces = state.marketplaceAccounts.map((item) => marketplaceDisplayName(item.marketplace));
  const usagePercent = (value, limit) => limit ? Math.min(100, Math.round((value / limit) * 100)) : 0;
  target.innerHTML = `
    <section class="subscription-premium-hero">
      <div class="subscription-plan-intro">
        <span>Seu plano atual</span>
        <div><strong>${html(plan?.name || subscription.plan_code)}</strong><span class="badge ${html(subscription.status)}">${html(subscriptionStatusText(subscription.status))}</span></div>
        <p>Todas as funcionalidades disponíveis para impulsionar sua operação.</p>
        <div class="inline-actions"><button class="secondary-btn" type="button" data-action="scroll-subscription-payment">Gerenciar assinatura</button><button class="secondary-btn" type="button" data-action="scroll-subscription-plans">Alterar plano</button></div>
      </div>
      <div class="subscription-renewal-timeline">
        <article><i></i><span>Renovação automática</span><strong>${renewalAt ? formatDate(renewalAt) : "Não agendada"}</strong></article>
        <article><i></i><span>Método de pagamento</span><strong>${html(paymentMethod)}</strong></article>
        <article><i></i><span>Valor da mensalidade</span><strong>${money.format(subscriptionPrice)} / mês</strong></article>
      </div>
      <div class="subscription-health-visual ${health.level}"><i></i><div><strong>${html(health.label)}</strong><span>${html(health.detail)}</span></div></div>
    </section>
    <section class="subscription-usage-panel panel">
      <div class="panel-head"><div><h3>Resumo do uso</h3><span>Acompanhe o consumo atual dos principais recursos do plano.</span></div></div>
      <div class="subscription-usage-grid">
        <article><span>Usuários</span><strong>${users} / ${userLimit || "-"}</strong><small>${usagePercent(users, userLimit)}% utilizado</small><i style="--usage:${usagePercent(users, userLimit)}%"></i><small>Limite de ${userLimit || "usuários ilimitados"}</small></article>
        <article><span>Vendas importadas</span><strong>${importedSales} / ${salesLimit || "-"}</strong><small>${usagePercent(importedSales, salesLimit)}% utilizado</small><i style="--usage:${usagePercent(importedSales, salesLimit)}%"></i><small>Limite de ${salesLimit || "vendas ilimitadas"} por mês</small></article>
        <article><span>Backup automático</span><strong>${plan?.features?.automatic_backup ? "Ativo" : "Não incluído"}</strong><small>${plan?.features?.automatic_backup ? "Proteção periódica habilitada" : "Disponível em planos superiores"}</small></article>
        <article><span>Marketplaces</span><strong>${connectedMarketplaces.length} ativo${connectedMarketplaces.length === 1 ? "" : "s"}</strong><small>${html(connectedMarketplaces.join(", ") || "Nenhuma conta conectada")}</small></article>
      </div>
    </section>
    <section id="subscriptionPaymentSection" class="subscription-payment-premium panel ${!hasRegisteredPaymentMethod ? "missing-payment" : ""}">
      <div><span>Método de pagamento</span><strong>${html(paymentMethod)}</strong><small>Próxima cobrança: ${subscription.next_payment_at ? formatDateTime(subscription.next_payment_at) : "Não agendada"} • Valor: ${money.format(subscriptionPrice)}</small><small id="subscriptionPaymentMessage" class="form-message"></small></div>
      ${hasRegisteredPaymentMethod ?
           `<div class="subscription-card-actions"><button class="primary-btn" type="button" data-payment-action="update-card">Trocar cartão</button><button class="secondary-btn" type="button" data-payment-action="activate">Adicionar novo cartão</button><button class="secondary-btn" type="button" data-payment-action="reconcile-billing">Atualizar cobrança</button><button class="secondary-btn danger" type="button" data-payment-action="remove-card">Excluir cartão</button></div>`
          : subscriptionPrice > 0 ?
             `<button class="primary-btn" type="button" data-payment-action="activate">Cadastrar forma de pagamento</button>`
            : ""}
    </section>
    ${subscription.pending_plan_code ? `<div class="scheduled-plan-change">
      <strong>Alteração agendada</strong>
      <span>O plano ${html(state.subscriptionPlans.find((item) => item.code === subscription.pending_plan_code)?.name || subscription.pending_plan_code)}
      entrará em vigor em ${formatDateTime(subscription.pending_plan_effective_at)}. Não haverá cobrança antes dessa data.</span>
    </div>` : ""}
    <div class="subscription-metrics subscription-renewal-details">
      ${subscriptionMetric("Próxima cobrança", subscription.next_payment_at ? formatDateTime(subscription.next_payment_at) : "Não agendada")}
      ${subscriptionMetric("Status da renovação", renewalMissed ? "Não renovada" : "Em dia")}
      ${subscriptionMetric("Período de tolerância", grace.detail)}
      ${subscriptionMetric("Método de pagamento", paymentMethod)}
      ${subscriptionMetric("Última tentativa", lastPaymentAttemptAt ? formatDateTime(lastPaymentAttemptAt) : "-")}
      ${subscriptionMetric("Último motivo", paymentDetail)}
    </div>`;
  table.innerHTML = state.subscriptionPayments.length ? state.subscriptionPayments.map((item) => {
    const meta = item.metadata || {};
    const rowCardLastFour = meta.card_last_four || meta.last_four || "";
    const rowCardBrand = meta.card_brand || item.payment_method || "";
    const detail = item.failure_reason || item.status_detail || meta.reason || meta.status_detail || meta.message || meta.provider_status || "-";
    return `<tr><td>${formatDateTime(item.attempted_at || item.paid_at || item.created_at)}</td><td>${money.format(Number(item.amount || 0))}</td><td><span class="badge ${html(item.status)}">${html(paymentStatusText(item.status))}</span></td><td>${html(item.payment_method || item.provider || "-")}</td><td>${rowCardLastFour ? html(`${rowCardBrand ? `${rowCardBrand} ` : ""}final ${rowCardLastFour}`) : "-"}</td><td>${html(detail)}</td></tr>`;
  }).join("") : `<tr><td colspan="6">Nenhuma cobrança registrada.</td></tr>`;
  renderSubscriptionPlanOptions(plan);
  bindActions();
}

export function getSubscriptionPrice(plan, subscription = state.subscription) {
  return Number(subscription?.metadata?.custom_price_monthly || plan?.price_monthly || 0);
}

export function addDays(dateValue, days) {
  if (!dateValue) return null;
  const time = new Date(dateValue).getTime();
  if (!Number.isFinite(time)) return null;
  return new Date(time + days * 86400000).toISOString();
}

export function subscriptionPaymentApproved(payment) {
  return ["approved", "paid", "authorized"].includes(String(payment?.status || "").toLowerCase());
}

export function subscriptionRenewalMissed(subscription, latestPayment) {
  if (!subscription || subscription.plan_code === "free" || String(subscription.status).toLowerCase() === "free") return false;
  const dueAt = subscription.next_payment_at || subscription.current_period_end;
  if (!dueAt) return false;
  const dueTime = new Date(dueAt).getTime();
  return Number.isFinite(dueTime) && dueTime <= Date.now() && !subscriptionPaymentApproved(latestPayment);
}

export function getSubscriptionGraceInfo(subscription, latestPayment) {
  if (!subscription || subscription.plan_code === "free" || String(subscription.status).toLowerCase() === "free") {
    return { level: "neutral", detail: "Não aplicável" };
  }
  const renewalAt = subscription.next_payment_at || subscription.current_period_end;
  const graceUntil = subscription.grace_ends_at || addDays(renewalAt, 5);
  const renewalTime = renewalAt ? new Date(renewalAt).getTime() : null;
  const graceTime = graceUntil ? new Date(graceUntil).getTime() : null;
  const now = Date.now();
  if (String(subscription.status).toLowerCase() === "past_due" || (renewalTime && renewalTime <= now && graceTime && graceTime > now && !subscriptionPaymentApproved(latestPayment))) {
    return { level: "warning", detail: `Em tolerância até ${formatDateTime(graceUntil)}` };
  }
  if (renewalTime && graceTime && graceTime <= now && !subscriptionPaymentApproved(latestPayment)) {
    return { level: "danger", detail: `Tolerância encerrada em ${formatDateTime(graceUntil)}` };
  }
  return { level: "success", detail: graceUntil ? `Tolerância prevista até ${formatDateTime(graceUntil)}` : "-" };
}

export function renderSubscriptionPlanOptions(currentPlan) {
  const target = byId("subscriptionPlanOptions");
  if (!target) return;
  const currentPrice = Number(currentPlan?.price_monthly || 0);
  const activeUsers = state.activeUsers.length || 1;
  const orderedPlans = state.subscriptionPlans
    .filter((plan) => plan.active !== false)
    .sort((a, b) => Number(a.limits?.users || 0) - Number(b.limits?.users || 0));
  const columns = orderedPlans.map((plan) => {
    const usersLimit = Number(plan.limits?.users || 0);
    const isCurrent = plan.code === currentPlan?.code;
    const isEnterprise = plan.code === "enterprise";
    const isUpgrade = isEnterprise
      || usersLimit > Number(currentPlan?.limits?.users || 0)
      || Number(plan.price_monthly || 0) > currentPrice;
    const blockedUsers = usersLimit > 0 && activeUsers > usersLimit;
    const priceLabel = isEnterprise && !Number(plan.price_monthly) ?
       "Sob consulta"
      : `${money.format(Number(plan.price_monthly || 0))}<small>/mês</small>`;
    const button = isCurrent ?
       `<button class="secondary-btn" type="button" disabled>Plano atual</button>`
      : `<button class="${isUpgrade ? "primary-btn" : "secondary-btn"}" type="button" data-request-plan="${html(plan.code)}">${isEnterprise ? "Falar com vendas" : isUpgrade ? "Solicitar upgrade" : "Solicitar downgrade"}</button>`;
    return { plan, usersLimit, isCurrent, priceLabel, button, blockedUsers };
  });
  const featureCell = (enabled, text = "") => enabled ? `<span class="feature-yes">${text || "✓"}</span>` : `<span class="feature-no">×</span>`;
  target.innerHTML = `
    <div class="plan-comparison-wrap">
      <table class="plan-comparison-table">
        <thead><tr><th>Recurso</th>${columns.map(({ plan, isCurrent, priceLabel }) => `<th class="${isCurrent ? "current" : ""}"><strong>${html(plan.name)}</strong><span>${priceLabel}</span>${isCurrent ? `<small>Atual</small>` : ""}</th>`).join("")}</tr></thead>
        <tbody>
          <tr><th>Usuários</th>${columns.map(({ usersLimit }) => `<td>${usersLimit || "Ilimitado"}</td>`).join("")}</tr>
          <tr><th>Vendas importadas/mês</th>${columns.map(({ plan }) => `<td>${Number(plan.limits?.marketplace_sales_month || 0)}</td>`).join("")}</tr>
          <tr><th>Marketplaces</th>${columns.map(({ plan }) => `<td>${[plan.features?.mercado_livre, plan.features?.shopee, plan.features?.amazon].filter(Boolean).length || "-"}</td>`).join("")}</tr>
          <tr><th>Backup automático</th>${columns.map(({ plan }) => `<td>${featureCell(plan.features?.automatic_backup)}</td>`).join("")}</tr>
          <tr><th>Relatórios avançados</th>${columns.map(({ plan }) => `<td>${featureCell(plan.features?.advanced_reports)}</td>`).join("")}</tr>
          <tr><th>White label</th>${columns.map(({ plan }) => `<td>${featureCell(plan.features?.white_label)}</td>`).join("")}</tr>
          <tr class="plan-actions-row"><th></th>${columns.map(({ button, blockedUsers, usersLimit }) => `<td>${button}${blockedUsers ? `<small class="plan-warning">Desative ${activeUsers - usersLimit} usuário(s) ao fim do plano.</small>` : ""}</td>`).join("")}</tr>
        </tbody>
      </table>
    </div>`;
}

export async function requestPlanChange(planCode) {
  const targetPlan = state.subscriptionPlans.find((plan) => plan.code === planCode);
  const currentPlan = state.subscriptionPlans.find((plan) => plan.code === state.subscription?.plan_code);
  const isDowngrade = Number(targetPlan?.price_monthly || 0) < Number(currentPlan?.price_monthly || 0);
  if (isDowngrade) {
    openDowngradeDialog(targetPlan);
    return;
  }
  const message = byId("subscriptionChangeMessage");
  message.textContent = "Validando alteração...";
  message.className = "form-message";
  try {
    if (Number(targetPlan?.price_monthly || 0) > 0) {
      message.textContent = "Informe o cartao para ativar o plano.";
      await openPaymentMethodDialog(planCode);
      return;
    }
    const { data, error } = await state.supabase.rpc("request_subscription_plan_change", {
      target_plan_code: planCode,
    });
    if (error) throw error;
    message.textContent = `Solicitação para o plano ${targetPlan?.name || planCode} registrada. A alteração será concluída após a confirmação necessária.`;
    message.className = "form-message success";
    await recordAudit(
      "subscription_plan_change_requested",
      "subscription",
      data?.id || planCode,
      "",
      { plan_code: state.subscription?.plan_code || null },
      { plan_code: planCode },
      "manual",
    );
  } catch (error) {
    message.textContent = error.message || "Não foi possível solicitar a alteração.";
    message.className = "form-message error";
  }
}

export function openDowngradeDialog(targetPlan) {
  const dialog = byId("downgradeDialog");
  const targetLimit = Number(targetPlan?.limits?.users || 0);
  const users = state.activeUsers.filter((item) => String(item.email || item.user_email || "").toLowerCase() !== state.activeUserEmail);
  const requiredRemoval = targetLimit > 0 ? Math.max(state.activeUsers.length - targetLimit, 0) : 0;
  byId("downgradeForm").elements.plan_code.value = targetPlan.code;
  byId("downgradeDialogTitle").textContent = `Agendar plano ${targetPlan.name}`;
  const effectiveAt = state.subscription?.current_period_end || state.subscription?.next_payment_at || state.subscription?.trial_end;
  byId("downgradeEffectiveText").textContent = `O plano atual continuará válido até ${effectiveAt ? formatDateTime(effectiveAt) : "o fim do ciclo vigente"}. Nenhuma cobrança será feita agora.`;
  byId("downgradeUsersInstruction").textContent = requiredRemoval ?
     `Selecione pelo menos ${requiredRemoval} usuário(s) para desativar quando o novo plano entrar em vigor.`
    : "Nenhum usuário precisa ser removido para este plano.";
  byId("downgradeUserList").innerHTML = users.length ? users.map((user) => {
    const email = user.email || user.user_email || "";
    return `<label><input type="checkbox" name="deactivate_users" value="${html(email)}" /> <span><strong>${html(user.name || email)}</strong><small>${html(email)}</small></span></label>`;
  }).join("") : `<div class="empty-chart">Nenhum usuário adicional cadastrado.</div>`;
  byId("downgradeMessage").textContent = "";
  dialog.dataset.requiredRemoval = String(requiredRemoval);
  dialog.showModal();
}

export async function submitScheduledDowngrade(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const selectedUsers = [...form.querySelectorAll('input[name="deactivate_users"]:checked')].map((input) => input.value);
  const requiredRemoval = Number(byId("downgradeDialog").dataset.requiredRemoval || 0);
  const message = byId("downgradeMessage");
  if (selectedUsers.length < requiredRemoval) {
    message.textContent = `Selecione mais ${requiredRemoval - selectedUsers.length} usuário(s).`;
    return;
  }
  message.textContent = "Agendando alteração...";
  try {
    const result = await callSubscriptionApi({
      action: "schedule-downgrade",
      plan_code: form.elements.plan_code.value,
      deactivate_users: selectedUsers,
    });
    message.textContent = `Downgrade agendado para ${formatDateTime(result.effective_at)}.`;
    message.className = "form-message success";
    await loadRemoteData();
    setTimeout(() => byId("downgradeDialog").close(), 800);
  } catch (error) {
    message.textContent = error.message || "Não foi possível agendar o downgrade.";
    message.className = "form-message error";
  }
}

export async function handlePaymentAction(action) {
  const message = byId("subscriptionPaymentMessage");
  const button = document.querySelector(`[data-payment-action="${action}"]`);
  if (message) {
    message.textContent = "Abrindo ambiente seguro do Mercado Pago...";
    message.className = "form-message";
  }
  if (button) button.disabled = true;
  try {
    if (action === "activate" || action === "update-card") {
      await openPaymentMethodDialog();
      return;
    }
    if (action === "remove-card") {
      const confirmed = await showAppConfirm(
        "Remover forma de pagamento",
        "O cartão será removido do FlowOps e a renovação automática ficará pausada até cadastrar uma nova forma de pagamento. Deseja continuar?"
      );
      if (!confirmed) return;
      await callSubscriptionApi({ action: "remove-payment-method" });
      if (message) {
        message.textContent = "Cartão removido. Cadastre uma nova forma de pagamento antes da próxima renovação.";
        message.className = "form-message success";
      }
      await loadRemoteData();
      return;
    }
    if (action === "reconcile-billing") {
      const result = await callSubscriptionApi({ action: "reconcile-billing" });
      if (message) {
        message.textContent = result.message || "Cobrança verificada no Mercado Pago.";
        message.className = "form-message success";
      }
      flashActionMessage("Cobrança e assinatura atualizadas.");
      await loadRemoteData();
      return;
    }
  } catch (error) {
    if (byId("paymentMethodDialog")?.open) {
      await showPaymentCheckoutFallback(error.message || "Nao foi possivel abrir o Mercado Pago.");
    }
    if (message) {
      message.textContent = error.message || "Nao foi possivel abrir o Mercado Pago.";
      message.className = "form-message error";
    }
  } finally {
    if (button) button.disabled = false;
  }
}

export async function callSubscriptionApi(payload) {
  const { data: sessionData } = await state.supabase.auth.getSession();
  const response = await fetch(window.SUPABASE_CONFIG.MERCADO_PAGO_SUBSCRIPTIONS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${sessionData.session?.access_token || ""}`,
      apikey: window.SUPABASE_CONFIG.SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) throw new Error(normalizeApiError(result.error, "Falha ao processar a assinatura."));
  return result;
}

export async function openPaymentMethodDialog(planCode = "") {
  const dialog = byId("paymentMethodDialog");
  const message = byId("paymentMethodMessage");
  if (message) {
    message.textContent = "";
    message.className = "form-message";
  }
  const brickContainer = byId("cardPaymentBrick_container");
  if (brickContainer) brickContainer.innerHTML = `<div class="payment-loading">Preparando formulário seguro do Mercado Pago...</div>`;
  if (!dialog.open) dialog.showModal();
  try {
    await loadMercadoPagoSdk();
    if (window.cardPaymentBrickController) {
      window.cardPaymentBrickController.unmount?.().catch(() => null);
      window.cardPaymentBrickController = null;
    }
    const mp = new window.MercadoPago(window.SUPABASE_CONFIG.MERCADO_PAGO_PUBLIC_KEY, { locale: "pt-BR" });
    const plan = state.subscriptionPlans.find((item) => item.code === (planCode || state.subscription?.plan_code));
    if (!brickContainer) throw new Error("Area de pagamento nao encontrada.");
    brickContainer.innerHTML = `
      <form id="mpCardForm" class="mp-card-form">
        <div class="mp-card-form-grid">
          <label class="mp-field mp-field-wide">
            <span>Número do cartão</span>
            <input id="form-checkout__cardNumber" type="text" inputmode="numeric" autocomplete="cc-number" placeholder="0000 0000 0000 0000" required>
          </label>
          <label class="mp-field">
            <span>Validade</span>
            <input id="form-checkout__expirationDate" type="text" inputmode="numeric" autocomplete="cc-exp" placeholder="MM/AA" required>
          </label>
          <label class="mp-field">
            <span>CVV</span>
            <input id="form-checkout__securityCode" type="text" inputmode="numeric" autocomplete="cc-csc" placeholder="CVV" required>
          </label>
          <label class="mp-field mp-field-wide">
            <span>Nome no cartão</span>
            <input id="form-checkout__cardholderName" type="text" autocomplete="cc-name" required>
          </label>
          <label class="mp-field">
            <span>Documento</span>
            <select id="form-checkout__identificationType"></select>
          </label>
          <label class="mp-field">
            <span>Número do documento</span>
            <input id="form-checkout__identificationNumber" type="text" inputmode="numeric" required>
          </label>
          <label class="mp-field mp-field-wide">
            <span>E-mail</span>
            <input id="form-checkout__cardholderEmail" type="email" value="${html(state.currentUserEmail || "")}" autocomplete="email" required>
          </label>
        </div>
        <select id="form-checkout__issuer" class="sr-only" aria-hidden="true"></select>
        <select id="form-checkout__installments" class="sr-only" aria-hidden="true"></select>
        <button id="mpCardFormSubmit" class="primary-btn" type="submit">Cadastrar cartão</button>
      </form>
    `;
    let paymentSubmitting = false;
    const cardForm = mp.cardForm({
      amount: String(Math.max(getSubscriptionPrice(plan), 1)),
      iframe: false,
      form: {
        id: "mpCardForm",
        cardNumber: { id: "form-checkout__cardNumber", placeholder: "0000 0000 0000 0000" },
        expirationDate: { id: "form-checkout__expirationDate", placeholder: "MM/AA" },
        securityCode: { id: "form-checkout__securityCode", placeholder: "CVV" },
        cardholderName: { id: "form-checkout__cardholderName", placeholder: "Nome impresso no cartão" },
        issuer: { id: "form-checkout__issuer", placeholder: "Banco emissor" },
        installments: { id: "form-checkout__installments", placeholder: "Parcelas" },
        identificationType: { id: "form-checkout__identificationType", placeholder: "Tipo" },
        identificationNumber: { id: "form-checkout__identificationNumber", placeholder: "Numero" },
        cardholderEmail: { id: "form-checkout__cardholderEmail", placeholder: "email@empresa.com" },
      },
      callbacks: {
        onFormMounted: (error) => {
          if (error) throw error;
          const readyMessage = byId("paymentMethodMessage");
          if (readyMessage) {
            readyMessage.textContent = "";
            readyMessage.className = "form-message";
          }
        },
        onSubmit: async (event) => {
          event.preventDefault();
          if (paymentSubmitting) return;
          paymentSubmitting = true;
          const submit = byId("mpCardFormSubmit");
          try {
            if (submit) {
              submit.disabled = true;
              submit.textContent = "Cadastrando cartão...";
            }
            const target = byId("paymentMethodMessage");
            if (target) {
              target.textContent = "Validando cartão com o Mercado Pago...";
              target.className = "form-message";
            }
            normalizeMercadoPagoCardFields();
            const formData = cardForm.getCardFormData();
            if (!formData?.token) throw new Error("Não foi possível validar os dados do cartão.");
            const cardDigits = String(byId("form-checkout__cardNumber")?.value || "").replace(/\D/g, "");
            await callSubscriptionApi({
              action: "update-payment-method",
              card_token_id: formData.token,
              card_last_four: cardDigits.slice(-4),
              card_brand: formData.paymentMethodId || "",
              plan_code: planCode || state.subscription?.plan_code || ""
            });
            const success = byId("paymentMethodMessage");
            if (success) {
              success.textContent = planCode ?
                 "Plano e cartão cadastrados com sucesso."
                : "Cartão cadastrado para as próximas cobranças.";
              success.className = "form-message success";
            }
            await loadRemoteData();
            setTimeout(closePaymentMethodDialog, 800);
          } catch (error) {
            const target = byId("paymentMethodMessage");
            if (target) {
              const raw = error.message || "Nao foi possivel cadastrar o cartao.";
              target.textContent = paymentErrorMessage(raw);
              target.className = "form-message error";
            }
            await refreshPaymentCardFormAfterError(planCode);
          }
        },
        onFetching: () => {
          const target = byId("paymentMethodMessage");
          if (target) {
            target.textContent = "Consultando dados seguros do Mercado Pago...";
            target.className = "form-message";
          }
        },
        onValidityChange: () => {
          const target = byId("paymentMethodMessage");
          if (target?.classList.contains("error")) {
            target.textContent = "";
            target.className = "form-message";
          }
        },
        onError: (error) => {
          const target = byId("paymentMethodMessage");
          if (target) {
            target.textContent = normalizeApiError(error, "Nao foi possivel carregar o formulario.");
            target.className = "form-message error";
          }
        },
      },
    });
    window.cardPaymentBrickController = { unmount: () => Promise.resolve(cardForm?.unmount?.()) };
  } catch (error) {
    showPaymentCheckoutFallback(error.message || "Nao foi possivel carregar o formulario do Mercado Pago.", planCode);
  }
}

export function normalizeMercadoPagoCardFields() {
  const expiration = byId("form-checkout__expirationDate");
  if (!expiration) return;
  const digits = String(expiration.value || "").replace(/\D/g, "");
  if (digits.length >= 6) {
    expiration.value = `${digits.slice(0, 2)}/${digits.slice(-2)}`;
  } else if (digits.length === 4) {
    expiration.value = `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }
}

export function paymentErrorMessage(raw) {
  const text = String(raw || "");
  if (text.includes("without cvv validation")) {
    return "Nao foi possivel validar o CVV. Confira o codigo de seguranca e tente novamente.";
  }
  if (text.toLowerCase().includes("card token was used")) {
    return "O Mercado Pago recusou esta tentativa por seguranca. Gere um novo token preenchendo o formulario novamente.";
  }
  return text || "Nao foi possivel cadastrar o cartao.";
}

export async function refreshPaymentCardFormAfterError(planCode = "") {
  const brickContainer = byId("cardPaymentBrick_container");
  const message = byId("paymentMethodMessage");
  if (!brickContainer) return;
  const controller = window.cardPaymentBrickController;
  window.cardPaymentBrickController = null;
  if (controller) await controller.unmount?.().catch(() => null);
  if (message) {
    message.textContent = "Por seguranca, preencha os dados novamente para gerar um novo token.";
    message.className = "form-message error";
  }
  setTimeout(() => openPaymentMethodDialog(planCode), 900);
}

export function showPaymentCheckoutFallback(reason, planCode = "") {
  const message = byId("paymentMethodMessage");
  const brickContainer = byId("cardPaymentBrick_container");
  if (window.cardPaymentBrickController) {
    window.cardPaymentBrickController.unmount().catch(() => null);
    window.cardPaymentBrickController = null;
  }
  if (message) {
    message.textContent = reason;
    message.className = "form-message error";
  }
  if (!brickContainer) return;
  brickContainer.innerHTML = `
    <div class="payment-fallback">
      <strong>Nao foi possivel carregar o formulario agora.</strong>
      <span>Verifique a conexao e tente novamente. O pagamento permanece dentro do FlowOps pelo Mercado Pago.</span>
      <button class="primary-btn" type="button" id="retryMercadoPagoBrickBtn">Tentar novamente</button>
    </div>
  `;
  byId("retryMercadoPagoBrickBtn")?.addEventListener("click", () => openPaymentMethodDialog(planCode));
}

export function closePaymentMethodDialog() {
  const dialog = byId("paymentMethodDialog");
  if (dialog?.open) dialog.close();
  const brickContainer = byId("cardPaymentBrick_container");
  if (brickContainer) brickContainer.innerHTML = "";
  const message = byId("paymentMethodMessage");
  if (message) {
    message.textContent = "";
    message.className = "form-message";
  }
  const controller = window.cardPaymentBrickController;
  window.cardPaymentBrickController = null;
  if (controller) {
    setTimeout(() => controller.unmount?.().catch(() => null), 0);
  }
}

export function loadMercadoPagoSdk() {
  if (window.MercadoPago) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const timer = setTimeout(() => reject(new Error("O Mercado Pago demorou para responder.")), 8000);
    script.src = "https://sdk.mercadopago.com/js/v2";
    script.onload = () => {
      clearTimeout(timer);
      resolve();
    };
    script.onerror = () => {
      clearTimeout(timer);
      reject(new Error("Nao foi possivel carregar o Mercado Pago."));
    };
    document.head.appendChild(script);
  });
}

export function normalizeApiError(value, fallback) {
  if (!value) return fallback;
  if (typeof value === "string") return value;
  return value.message || value.error || value.cause?.[0]?.description || fallback;
}

export function subscriptionMetric(label, value) {
  return `<article><span>${html(label)}</span><strong>${html(String(value))}</strong></article>`;
}

export function getCompanyHealth() {
  const mlConnected = state.marketplaceAccounts.some((item) => item.marketplace === "Mercado Livre");
  const backupOk = state.backupRuns.some((item) => item.status === "success");
  const subscriptionOk = ["active", "trial", "free"].includes(state.subscription?.status);
  const score = [mlConnected, backupOk, subscriptionOk].filter(Boolean).length;
  if (score === 3) return { level: "healthy", label: "Saudável", detail: "Integração, backup e assinatura em ordem." };
  if (score >= 2) return { level: "attention", label: "Atenção", detail: "Existe uma configuração importante pendente." };
  return { level: "risk", label: "Em risco", detail: "Revise assinatura, integração e backup." };
}

export function subscriptionStatusText(value) {
  return ({ free: "Gratuito", trial: "Em teste", pending: "Aguardando pagamento", active: "Ativo", past_due: "Pagamento pendente", paused: "Pausado", cancelled: "Cancelado", suspended: "Suspenso" })[value] || value || "-";
}

export function paymentStatusText(value) {
  return ({ approved: "Aprovado", pending: "Pendente", rejected: "Recusado", refunded: "Estornado", cancelled: "Cancelado" })[value] || value || "-";
}
