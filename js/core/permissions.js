import { state } from "./state.js";
import { byId, showAppMessage } from "./dom.js";

export function normalizeRole(role) {
  return String(role || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function isAdminRole(role) {
  return ["administrador", "admin", "owner"].includes(normalizeRole(role));
}

export function isSupervisorRole(role) {
  return ["supervisor", "gestor", "gerente"].includes(normalizeRole(role));
}

export function isOperatorRole(role) {
  return ["operador", "operacao", "edicao", "editor", "equipe"].includes(normalizeRole(role));
}

export function isResponsibleRole(role) {
  return ["responsavel", "responsible"].includes(normalizeRole(role));
}

export function isEditorRole(role) {
  return isAdminRole(role) || isSupervisorRole(role) || isOperatorRole(role) || isResponsibleRole(role);
}

export function displayRole(role) {
  if (isAdminRole(role)) return "Administrador";
  if (isSupervisorRole(role)) return "Supervisor";
  if (isOperatorRole(role)) return "Operador";
  if (isResponsibleRole(role)) return "Responsavel";
  return "Somente leitura";
}

export function ensureCanEdit() {
  if (state.canEdit) return true;
  showAppMessage("Acesso somente leitura", "Seu usuário não possui permissão para alterar registros.", "warning");
  return false;
}

export function ensureCanAdmin() {
  if (state.isAdmin) return true;
  showAppMessage("Acesso restrito", "Apenas administradores podem executar esta ação.", "warning");
  return false;
}

export function hasCapability(capability) {
  if (state.isAdmin) return true;
  if (Object.prototype.hasOwnProperty.call(state.activePermissions || {}, capability)) return state.activePermissions[capability] === true;
  const defaults = {
    export_data: isSupervisorRole(state.activeUserRoleName),
    delete_records: false,
    manage_finance: isSupervisorRole(state.activeUserRoleName),
    manage_marketplaces: isSupervisorRole(state.activeUserRoleName),
  };
  return defaults[capability] ?? state.canEdit;
}

export function ensureCapability(capability, label = "esta ação") {
  if (hasCapability(capability)) return true;
  showAppMessage("Permissão necessária", `Seu perfil não possui permissão para ${label}.`, "warning");
  return false;
}

export function updateEditAccess() {
  ["orderForm", "cashForm", "materialForm", "inventoryForm", "leadForm"].forEach((formId) => {
    const form = byId(formId);
    if (!form) return;
    [...form.elements].forEach((element) => {
      if (element.type !== "hidden") element.disabled = !state.canEdit;
    });
  });
  byId("importBtn").hidden = !state.canEdit;
  byId("newLeadBtn").hidden = !state.canEdit;
}
