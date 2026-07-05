import { state } from "./state.js";

export function byId(id) {
  return document.getElementById(id);
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

export function nextId(prefix, rows) {
  const defaultOrganization = "00000000-0000-0000-0000-000000000001";
  const tenantCode = state.organizationId && state.organizationId !== defaultOrganization ?
     state.organizationId.replace(/-/g, "").slice(0, 6).toUpperCase()
    : "";
  const base = tenantCode ? `${prefix}-${tenantCode}` : prefix;
  const pattern = new RegExp(`^${base}-(\\d+)$`);
  const max = rows.reduce((value, row) => {
    const match = String(row.id || "").match(pattern);
    return Math.max(value, match ? Number(match[1]) : 0);
  }, 0);
  return `${base}-${String(max + 1).padStart(3, "0")}`;
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

export function showAppConfirm(title, message) {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "app-message-dialog";
    dialog.innerHTML = `
      <div class="app-message-content">
        <div class="dialog-head">
          <div><p class="eyebrow">FlowOps</p><h3>${html(title)}</h3></div>
          <button class="icon-btn" type="button" data-confirm-value="false" aria-label="Fechar">×</button>
        </div>
        <p>${html(message)}</p>
        <div class="dialog-actions">
          <button class="secondary-btn" type="button" data-confirm-value="false">Cancelar</button>
          <button class="primary-btn" type="button" data-confirm-value="true">Continuar</button>
        </div>
      </div>`;
    const finish = (value) => {
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
