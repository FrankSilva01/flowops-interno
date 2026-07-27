const config = window.FLOWOPS_CONFIG || {};
const state = { plans: [], selectedPlan: null, credentials: null };
const byId = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-login-link]").forEach((link) => link.href = config.LOGIN_URL);
  byId("menuButton").addEventListener("click", toggleMenu);
  byId("closeSignup").addEventListener("click", () => byId("signupDialog").close());
  byId("signupForm").addEventListener("submit", submitSignup);
  loadPlans();
});

function toggleMenu() {
  const nav = document.querySelector(".site-header nav");
  const open = nav.classList.toggle("open");
  byId("menuButton").setAttribute("aria-expanded", String(open));
}

async function loadPlans() {
  try {
    const response = await fetch(config.ONBOARDING_URL, { headers: { apikey: config.SUPABASE_ANON_KEY } });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || "Não foi possível carregar os planos.");
    state.plans = result.plans || [];
    renderPlans();
  } catch (error) {
    byId("plansGrid").innerHTML = `<p class="loading-state">${escapeHtml(error.message)}</p>`;
  }
}

function renderPlans() {
  byId("plansGrid").innerHTML = state.plans.map((plan) => {
    const price = Number(plan.price_monthly || 0);
    const enterprise = plan.code === "enterprise";
    const highlights = Array.isArray(plan.marketing_highlights) ? plan.marketing_highlights : [];
    return `
      <article class="plan-card ${plan.marketing_featured ? "featured" : ""}">
        ${plan.marketing_badge ? `<span class="plan-badge">${escapeHtml(plan.marketing_badge)}</span>` : ""}
        <h3>${escapeHtml(plan.name)}</h3>
        <p class="plan-description">${escapeHtml(plan.marketing_description || "")}</p>
        <div class="plan-price">${enterprise ? `<strong>Sob consulta</strong>` : price > 0 ? `<strong>${formatMoney(price)}</strong><small>/mês</small>` : `<strong>Grátis</strong><small>para sempre</small>`}</div>
        <ul>${highlights.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
        ${enterprise
          ? `<a class="button full" href="https://wa.me/5511967617077?text=${encodeURIComponent("Olá, gostaria de conversar sobre o plano Enterprise do FlowOps.")}" target="_blank" rel="noopener">${escapeHtml(plan.marketing_cta || "Falar com vendas")}</a>`
          : `<button class="button full" type="button" data-plan-code="${escapeHtml(plan.code)}">${escapeHtml(plan.marketing_cta || "Criar minha conta")}</button>`}
      </article>
    `;
  }).join("");
  document.querySelectorAll("[data-plan-code]").forEach((button) => {
    button.addEventListener("click", () => openSignup(button.dataset.planCode));
  });
}

function openSignup(code) {
  const plan = state.plans.find((item) => item.code === code);
  if (!plan) return;
  state.selectedPlan = plan;
  const form = byId("signupForm");
  form.reset();
  form.elements.plan_code.value = plan.code;
  byId("selectedPlanText").textContent = `Plano ${plan.name} • ${Number(plan.price_monthly || 0) > 0 ? `${formatMoney(plan.price_monthly)} por mês` : "gratuito permanente"}`;
  byId("signupMessage").textContent = "";
  byId("signupDialog").showModal();
}

async function submitSignup(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const message = byId("signupMessage");
  const button = byId("submitSignup");
  const values = Object.fromEntries(new FormData(form).entries());
  if (values.password !== values.password_confirm) {
    message.textContent = "As senhas não coincidem.";
    return;
  }
  button.disabled = true;
  button.textContent = "Criando ambiente...";
  message.textContent = "";
  try {
    const payload = {
      action: "register",
      company_name: values.company_name,
      contact_name: values.contact_name,
      email: values.email,
      phone: values.phone,
      password: values.password,
      plan_code: values.plan_code,
      accepted_terms: form.elements.accepted_terms.checked,
    };
    const response = await fetch(config.ONBOARDING_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: config.SUPABASE_ANON_KEY },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) throw new Error(result.error || "Não foi possível criar a empresa.");
    state.credentials = { email: values.email, password: values.password };
    byId("signupDialog").close();
    showSuccess(result);
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = "Criar minha empresa";
  }
}

function showSuccess(result) {
  const actions = byId("successActions");
  byId("successText").textContent = `${result.organization.name} foi cadastrada no plano ${result.plan.name}. Deseja ir para a tela de login agora?`;
  actions.innerHTML = `
    <button class="button secondary" id="stayButton" type="button">Continuar nesta página</button>
    ${result.plan.paid ? `<button class="button" id="paymentButton" type="button">Ativar assinatura</button>` : ""}
    <a class="button" href="${escapeHtml(config.LOGIN_URL)}">Ir para o login</a>
  `;
  byId("stayButton").addEventListener("click", () => byId("successDialog").close());
  if (result.plan.paid) byId("paymentButton").addEventListener("click", () => startCheckout(result.plan.code));
  byId("successDialog").showModal();
}

async function startCheckout(planCode) {
  const button = byId("paymentButton");
  button.disabled = true;
  button.textContent = "Abrindo Mercado Pago...";
  try {
    await loadSupabase();
    const client = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
    const { data, error } = await client.auth.signInWithPassword(state.credentials);
    if (error || !data.session) throw error || new Error("Não foi possível autenticar a nova conta.");
    const response = await fetch(config.SUBSCRIPTIONS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: config.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${data.session.access_token}`,
      },
      body: JSON.stringify({ action: "create-checkout", plan_code: planCode }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok || !result.checkout_url) throw new Error(result.error || "Checkout indisponível.");
    window.location.assign(result.checkout_url);
  } catch (error) {
    button.disabled = false;
    button.textContent = "Tentar pagamento novamente";
    byId("successText").textContent = `Empresa criada, mas o checkout não abriu: ${error.message}. Você pode entrar no FlowOps e ativar o plano em Minha Assinatura.`;
  }
}

function loadSupabase() {
  if (window.supabase) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://unpkg.com/@supabase/supabase-js@2";
    script.onload = resolve;
    script.onerror = () => reject(new Error("Não foi possível carregar o serviço de autenticação."));
    document.head.appendChild(script);
  });
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[char]);
}
