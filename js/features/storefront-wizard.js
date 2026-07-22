const STEP_LABELS = ["Produto", "Comercial", "Canais", "Revisão"];
let currentStep = 1;

export function clampStorefrontStep(step) {
  return Math.min(4, Math.max(1, Math.trunc(Number(step)) || 1));
}

function fieldNames(node) {
  return [...node.querySelectorAll?.("[name]") || []].map((field) => field.name);
}

function nodeStep(node) {
  const names = fieldNames(node);
  if (node.id === "storefrontProductMessage" || node.classList?.contains("storefront-wizard-actions")) return 4;
  if (node.classList?.contains("publish-targets") || node.classList?.contains("marketplace-extra-fields")) return 3;
  if (names.some((name) => ["marketplace", "publish_vitrine", "publish_ml", "publish_shopee", "publish_tiktok", "publish_amazon", "featured"].includes(name))) return 3;
  if (names.some((name) => ["price", "available_quantity", "marketplace_url", "shopee_url", "amazon_url", "whatsapp_url", "payment_note", "delivery_note", "tech_material", "tech_height", "tech_painting", "tech_assembly"].includes(name))) return 2;
  return 1;
}

function buildSteps(form) {
  if (form.querySelector(".storefront-form-step")) return;
  const actions = form.querySelector(".storefront-wizard-actions");
  const nodes = [...form.children].filter((node) => node !== actions);
  const steps = STEP_LABELS.map((_, index) => {
    const section = document.createElement("section");
    section.className = "storefront-form-step";
    section.dataset.storefrontStep = String(index + 1);
    form.append(section);
    return section;
  });
  nodes.forEach((node) => steps[nodeStep(node) - 1].append(node));
  if (actions) form.append(actions);
}

function renderReview(form) {
  let review = form.querySelector("#storefrontWizardReview");
  if (!review) {
    review = document.createElement("div");
    review.id = "storefrontWizardReview";
    review.className = "storefront-wizard-review wide";
    form.querySelector('[data-storefront-step="4"]')?.prepend(review);
  }
  const channels = [
    ["publish_vitrine", "Vitrine"], ["publish_ml", "Mercado Livre"],
    ["publish_shopee", "Shopee"], ["publish_amazon", "Amazon"],
  ].filter(([name]) => form.elements[name]?.checked).map(([, label]) => label);
  review.innerHTML = `<h4>Revise antes de salvar</h4><dl><div><dt>Produto</dt><dd>${form.elements.title.value || "-"}</dd></div><div><dt>Preço</dt><dd>R$ ${Number(form.elements.price.value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</dd></div><div><dt>Estoque</dt><dd>${form.elements.available_quantity.value || 0}</dd></div><div><dt>Canais</dt><dd>${channels.join(", ") || "Nenhum"}</dd></div></dl>`;
}

function syncWizard(form, step) {
  currentStep = clampStorefrontStep(step);
  form.querySelectorAll("[data-storefront-step]").forEach((section) => {
    section.hidden = Number(section.dataset.storefrontStep) !== currentStep;
  });
  const progress = document.getElementById("storefrontWizardProgress");
  progress.innerHTML = STEP_LABELS.map((label, index) => `<span class="${index + 1 === currentStep ? "active" : index + 1 < currentStep ? "completed" : ""}" ${index + 1 === currentStep ? 'aria-current="step"' : ""}><b>${index + 1}</b>${label}</span>`).join("");
  document.getElementById("storefrontPrevBtn").hidden = currentStep === 1;
  document.getElementById("storefrontNextBtn").hidden = currentStep === 4;
  document.getElementById("storefrontSubmitBtn").hidden = currentStep !== 4;
  if (currentStep === 4) renderReview(form);
}

function validateStep(form) {
  const fields = [...form.querySelectorAll(`[data-storefront-step="${currentStep}"] input, [data-storefront-step="${currentStep}"] select, [data-storefront-step="${currentStep}"] textarea`)]
    .filter((field) => !field.disabled && !field.closest("[hidden]"));
  const invalid = fields.find((field) => !field.checkValidity());
  if (invalid) invalid.reportValidity();
  return !invalid;
}

export function initializeStorefrontWizard() {
  const form = document.getElementById("storefrontProductForm");
  if (!form) return;
  buildSteps(form);
  syncWizard(form, 1);
}

export function openStorefrontProductDialog({ editing = false } = {}) {
  const form = document.getElementById("storefrontProductForm");
  const dialog = document.getElementById("storefrontProductDialog");
  if (!editing) form.reset();
  document.getElementById("storefrontDialogTitle").textContent = editing ? "Editar produto" : "Cadastrar produto";
  syncWizard(form, 1);
  if (!dialog.open) dialog.showModal();
}

export function closeStorefrontProductDialog() {
  document.getElementById("storefrontProductDialog")?.close();
}

export function nextStorefrontStep() {
  const form = document.getElementById("storefrontProductForm");
  if (validateStep(form)) syncWizard(form, currentStep + 1);
}

export function previousStorefrontStep() {
  syncWizard(document.getElementById("storefrontProductForm"), currentStep - 1);
}
