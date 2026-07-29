export const SUBSCRIPTION_AREAS = Object.freeze(["plan", "billing", "governance"]);
export const FISCAL_AREAS = Object.freeze(["documentos", "compra", "venda", "das"]);

export function areaForKey(areas, currentArea, key) {
  const currentIndex = areas.indexOf(currentArea);
  const index = currentIndex < 0 ? 0 : currentIndex;
  if (key === "Home") return areas[0];
  if (key === "End") return areas.at(-1);
  if (key === "ArrowRight") return areas[(index + 1) % areas.length];
  if (key === "ArrowLeft") return areas[(index - 1 + areas.length) % areas.length];
  return null;
}

export function activateSubscriptionArea(area = "plan", { focus = false } = {}) {
  const selectedArea = SUBSCRIPTION_AREAS.includes(area) ? area : "plan";
  document.querySelectorAll("[data-subscription-area]").forEach((tab) => {
    const selected = tab.dataset.subscriptionArea === selectedArea;
    tab.classList.toggle("active", selected);
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
    if (selected && focus) tab.focus();
  });
  SUBSCRIPTION_AREAS.forEach((name) => {
    const panel = document.getElementById(`subscriptionPanel-${name}`);
    if (!panel) return;
    const selected = name === selectedArea;
    panel.hidden = !selected;
    panel.setAttribute("aria-hidden", String(!selected));
  });
  return selectedArea;
}

export function bindSubscriptionNavigation(initialArea = "plan") {
  document.querySelectorAll("[data-subscription-area]").forEach((tab) => {
    tab.onclick = () => activateSubscriptionArea(tab.dataset.subscriptionArea);
    tab.onkeydown = (event) => {
      const next = areaForKey(SUBSCRIPTION_AREAS, tab.dataset.subscriptionArea, event.key);
      if (!next) return;
      event.preventDefault();
      activateSubscriptionArea(next, { focus: true });
    };
  });
  return activateSubscriptionArea(initialArea);
}

export function syncFiscalTabs(activeArea = "documentos", { focus = false } = {}) {
  const selectedArea = FISCAL_AREAS.includes(activeArea) ? activeArea : "documentos";
  document.querySelectorAll("[data-fiscal-tab]").forEach((tab) => {
    const selected = tab.dataset.fiscalTab === selectedArea;
    tab.classList.toggle("active", selected);
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
    if (selected && focus) tab.focus();
  });
  return selectedArea;
}

export function friendlyPaymentDetail(value) {
  const detail = String(value || "").trim();
  if (!detail) return "-";
  const messages = {
    cc_rejected_high_risk: "Pagamento recusado por segurança. Tente outro cartão ou confirme os dados com o banco.",
    cc_rejected_insufficient_amount: "Saldo ou limite insuficiente. Use outro cartão ou ajuste o limite.",
    cc_rejected_bad_filled_card_number: "Número do cartão inválido. Revise os dados e tente novamente.",
    cc_rejected_bad_filled_date: "Data de validade inválida. Revise os dados do cartão.",
    cc_rejected_bad_filled_security_code: "Código de segurança inválido. Revise o CVV e tente novamente.",
    cc_rejected_call_for_authorize: "O banco precisa autorizar a cobrança. Entre em contato com a instituição emissora.",
    cc_rejected_card_disabled: "Cartão desativado. Ative-o no banco ou use outro cartão.",
    cc_rejected_duplicated_payment: "Esta cobrança já foi processada. Atualize o histórico antes de tentar novamente.",
    cc_rejected_max_attempts: "Limite de tentativas atingido. Aguarde alguns minutos ou use outro cartão.",
  };
  return messages[detail.toLowerCase()] || detail;
}
