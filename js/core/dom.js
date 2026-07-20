import { state } from "./state.js";

export function byId(id) {
  return document.getElementById(id);
}

export function applyAccessibleNames(root = document) {
  const labels = {
    date: "Data", type: "Tipo", category: "Categoria", description: "Descrição", amount: "Valor",
    method: "Forma de pagamento", supplier: "Fornecedor", spec: "Cor ou especificação", quantity: "Quantidade",
    unitCost: "Custo unitário", unit_cost: "Custo unitário", unit: "Unidade", minimum_quantity: "Estoque mínimo",
    notes: "Observação", subject: "Assunto", priority: "Prioridade", message: "Mensagem", name: "Nome",
    email: "E-mail", password: "Senha", role: "Perfil de acesso", goal: "Meta de lucro", number: "Número",
    status: "Status", value: "Valor", due_date: "Vencimento", payment_method: "Forma de pagamento",
    issuer: "Emissor", order_id: "Encomenda", product_id: "Produto", fiscal_file: "Arquivo fiscal",
    eventStatus: "Status do evento", eventMessage: "Observação do evento", listing: "Anúncio",
    referenceImageFile: "Imagem de referência",
  };
  const hasName = (control) => control.hasAttribute("aria-label") || control.hasAttribute("aria-labelledby")
    || (control.id && root.querySelector(`label[for="${CSS.escape(control.id)}"]`)) || control.closest("label");
  root.querySelectorAll('input:not([type="hidden"]), select, textarea').forEach((control) => {
    if (hasName(control)) return;
    const fallback = control.placeholder || labels[control.name] || labels[control.id] || (control.type === "file" ? "Selecionar arquivo" : "Campo");
    control.setAttribute("aria-label", fallback);
  });
  const buttonLabels = {
    clearDashboardNotificationsBtn: "Limpar notificações do dashboard",
    openAllNotificationsBtn: "Abrir todas as notificações",
  };
  root.querySelectorAll("button").forEach((button, index) => {
    if (button.textContent.trim() || button.hasAttribute("aria-label") || button.title) return;
    const label = buttonLabels[button.id] || (button.dataset.goTo ? `Ir para a etapa ${button.dataset.goTo}` : `Ação ${index + 1}`);
    button.setAttribute("aria-label", label);
  });
}

export function filterRows(rows, fields) {
  if (!state.query) return rows;
  return rows.filter((item) => fields.some((field) => {
    const value = Array.isArray(item[field]) ? item[field].join(" ") : item[field];
    return String(value || "").toLowerCase().includes(state.query);
  }));
}

export function countBy(rows, getKey) {
  const map = new Map();
  rows.forEach((item) => {
    const key = getKey(item);
    map.set(key, (map.get(key) || 0) + 1);
  });
  return [...map.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

export function flashActionMessage(message) {
  const previous = document.querySelector(".toast-message");
  if (previous) previous.remove();
  const toast = document.createElement("div");
  toast.className = "toast-message";
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 1800);
}

export function uniqueValues(values) {
  return [...new Set(values)].filter((value) => value !== undefined);
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function safeUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    const url = new URL(text);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

export function formatDateTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function formatRelativeTime(value) {
  if (!value) return "";
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "";
  const diffSec = Math.round((Date.now() - time) / 1000);
  if (diffSec < 45) return "agora mesmo";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `há ${diffMin} min`;
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `há ${diffHour}h`;
  const diffDay = Math.round(diffHour / 24);
  if (diffDay < 7) return `há ${diffDay}d`;
  const diffWeek = Math.round(diffDay / 7);
  if (diffWeek < 5) return `há ${diffWeek} sem`;
  return formatDate(value);
}

export function nextId(prefix, rows) {
  const defaultOrganization = "00000000-0000-0000-0000-000000000001";
  const tenantCode = state.organizationId && state.organizationId !== defaultOrganization ?
     state.organizationId.replace(/-/g, "").slice(0, 6).toUpperCase()
    : "";
  const base = tenantCode ? `${prefix}-${tenantCode}` : prefix;
  // Aceita ids antigos (sem sufixo) e novos (com sufixo) no calculo do maximo,
  // mantendo o numero sequencial coerente/legivel.
  const pattern = new RegExp(`^${base}-(\\d+)(?:-[0-9a-z]+)?$`);
  const max = rows.reduce((value, row) => {
    const match = String(row.id || "").match(pattern);
    return Math.max(value, match ? Number(match[1]) : 0);
  }, 0);
  // Sufixo aleatorio garante unicidade da PK mesmo com dois usuarios gerando o
  // mesmo sequencial ao mesmo tempo (o upsert deixa de sobrescrever o registro
  // do outro). Ex.: ENC-018-a3f2 / ENC-ABC123-018-a3f2.
  const suffix = (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)).replace(/-/g, "").slice(0, 4);
  return `${base}-${String(max + 1).padStart(3, "0")}-${suffix}`;
}

export function sum(rows, field) {
  return rows.reduce((total, item) => total + Number(item[field] || 0), 0);
}

export function number(value) {
  return Number(String(value || "0").replace(",", ".")) || 0;
}

export function formatDate(value) {
  if (!value) return "";
  const raw = String(value).trim();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) return raw;
  const isoDate = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoDate) return `${isoDate[3]}/${isoDate[2]}/${isoDate[1]}`;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime())
    ? raw
    : new Intl.DateTimeFormat("pt-BR").format(parsed);
}

export function formatDateShort(value) {
  if (!value) return "";
  const raw = String(value).trim();
  const isoDate = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoDate) return `${isoDate[3]}/${isoDate[2]}`;
  const brDate = raw.match(/^(\d{2})\/(\d{2})\/\d{4}$/);
  if (brDate) return `${brDate[1]}/${brDate[2]}`;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime())
    ? raw
    : new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(parsed);
}

export function html(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

export function sanitizeRichHtml(value) {
  const template = document.createElement("template");
  template.innerHTML = String(value || "");
  const blockedTags = "script,style,iframe,object,embed,form,input,button,meta,link";
  template.content.querySelectorAll(blockedTags).forEach((node) => node.remove());
  template.content.querySelectorAll("*").forEach((node) => {
    [...node.attributes].forEach((attr) => {
      const name = attr.name.toLowerCase();
      const rawValue = String(attr.value || "").trim();
      if (name.startsWith("on") || name === "style" || name === "srcdoc") {
        node.removeAttribute(attr.name);
        return;
      }
      if (["href", "src"].includes(name) && !/^(https?:|mailto:|tel:|data:image\/)/i.test(rawValue)) {
        node.removeAttribute(attr.name);
      }
    });
  });
  return template.innerHTML;
}

export function showAppMessage(title, message, tone = "info") {
  const dialog = byId("appMessageDialog");
  if (!dialog) {
    alert(message);
    return;
  }
  byId("appMessageTitle").textContent = title;
  byId("appMessageText").textContent = message;
  dialog.dataset.tone = tone;
  if (!dialog.open) dialog.showModal();
}

export function showAppConfirm(title, message, options = {}) {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "app-message-dialog";
    dialog.dataset.tone = options.danger ? "error" : options.tone || "info";
    const titleId = `confirm-title-${Date.now()}`;
    dialog.setAttribute("aria-labelledby", titleId);
    dialog.innerHTML = `
      <div class="app-message-content">
        <div class="dialog-head">
          <div><p class="eyebrow">FlowOps</p><h3 id="${titleId}">${html(title)}</h3></div>
          <button class="icon-btn" type="button" data-confirm-value="false" aria-label="Fechar">×</button>
        </div>
        <p>${html(message)}</p>
        <div class="dialog-actions">
          <button class="secondary-btn" type="button" data-confirm-value="false">${html(options.cancelLabel || "Cancelar")}</button>
          <button class="${options.danger ? "danger-btn" : "primary-btn"}" type="button" data-confirm-value="true">${html(options.confirmLabel || "Continuar")}</button>
        </div>
      </div>`;
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      if (dialog.open) dialog.close();
      dialog.remove();
      resolve(value);
    };
    dialog.addEventListener("click", (event) => {
      const button = event.target.closest("[data-confirm-value]");
      if (button) finish(button.dataset.confirmValue === "true");
    });
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      finish(false);
    });
    document.body.appendChild(dialog);
    dialog.showModal();
  });
}

export function showAppPrompt(title, message, options = {}) {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "app-message-dialog";
    dialog.dataset.tone = options.danger ? "error" : "info";
    const stamp = Date.now();
    const titleId = `prompt-title-${stamp}`;
    const fieldId = `prompt-field-${stamp}`;
    dialog.setAttribute("aria-labelledby", titleId);
    dialog.innerHTML = `
      <form method="dialog" class="app-message-content app-prompt-content" novalidate>
        <div class="dialog-head"><div><p class="eyebrow">FlowOps</p><h3 id="${titleId}">${html(title)}</h3></div><button class="icon-btn" type="button" data-prompt-cancel aria-label="Fechar">×</button></div>
        <p>${html(message)}</p>
        <label for="${fieldId}">${html(options.label || "Detalhes")}</label>
        <textarea id="${fieldId}" rows="4" maxlength="${Number(options.maxLength || 1000)}" placeholder="${html(options.placeholder || "")}" aria-describedby="${fieldId}-error" required>${html(options.value || "")}</textarea>
        <span id="${fieldId}-error" class="form-message" data-prompt-error hidden>Preencha este campo para continuar.</span>
        <div class="dialog-actions"><button class="secondary-btn" type="button" data-prompt-cancel>${html(options.cancelLabel || "Cancelar")}</button><button class="${options.danger ? "danger-btn" : "primary-btn"}" type="submit">${html(options.confirmLabel || "Continuar")}</button></div>
      </form>`;
    const field = dialog.querySelector("textarea");
    let settled = false;
    const finish = (value) => { if (settled) return; settled = true; if (dialog.open) dialog.close(); dialog.remove(); resolve(value); };
    dialog.querySelectorAll("[data-prompt-cancel]").forEach((button) => button.addEventListener("click", () => finish(null)));
    dialog.addEventListener("cancel", (event) => { event.preventDefault(); finish(null); });
    dialog.querySelector("form").addEventListener("submit", (event) => {
      event.preventDefault();
      const value = field.value.trim();
      if (!value) { dialog.querySelector("[data-prompt-error]").hidden = false; field.setAttribute("aria-invalid", "true"); field.focus(); return; }
      finish(value);
    });
    field.addEventListener("input", () => { if (field.value.trim()) { dialog.querySelector("[data-prompt-error]").hidden = true; field.removeAttribute("aria-invalid"); } });
    document.body.appendChild(dialog);
    dialog.showModal();
    field.focus();
  });
}

export function closeAppMessage() {
  const dialog = byId("appMessageDialog");
  if (dialog?.open) dialog.close();
}

export function renderOperationalSummary(viewId, summaryId, metrics) {
  const view = byId(viewId);
  if (!view) return;
  let target = byId(summaryId);
  if (!target) {
    target = document.createElement("section");
    target.id = summaryId;
    target.className = "operational-summary-grid";
    view.prepend(target);
  }
  target.innerHTML = metrics.map(([label, value, note, tone]) => `
    <article class="operational-summary-card ${html(tone || "teal")}">
      <span>${html(label)}</span>
      <strong>${html(String(value))}</strong>
      <small>${html(note || "")}</small>
    </article>
  `).join("");
}

// Paginacao numerada generica (Anterior / 1 2 3 ... / Proxima) - usada nas
// tabelas de detalhamento de Relatorios (Bloco 3.4). actionName e o
// data-action generico que o roteador central ja trata, recebendo o
// numero da pagina clicada via data-page.
export function renderPagination(currentPage, totalPages, actionName) {
  if (totalPages <= 1) return "";
  const windowSize = 2;
  const pages = [];
  for (let page = 1; page <= totalPages; page++) {
    if (page === 1 || page === totalPages || Math.abs(page - currentPage) <= windowSize) {
      pages.push(page);
    } else if (pages[pages.length - 1] !== "...") {
      pages.push("...");
    }
  }
  return `
    <nav class="report-pagination" aria-label="Paginação">
      <button class="secondary-btn" type="button" data-action="${html(actionName)}" data-page="${currentPage - 1}" ${currentPage <= 1 ? "disabled" : ""}>Anterior</button>
      ${pages.map((page) => page === "..."
        ? `<span class="report-pagination-ellipsis">…</span>`
        : `<button class="icon-btn ${page === currentPage ? "active" : ""}" type="button" data-action="${html(actionName)}" data-page="${page}">${page}</button>`
      ).join("")}
      <button class="secondary-btn" type="button" data-action="${html(actionName)}" data-page="${currentPage + 1}" ${currentPage >= totalPages ? "disabled" : ""}>Próxima</button>
    </nav>
  `;
}
