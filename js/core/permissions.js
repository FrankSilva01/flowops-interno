import { state } from "./state.js";
import { byId } from "./dom.js";

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
  alert("Seu usuário está com permissão somente leitura.");
  return false;
}

export function ensureCanAdmin() {
  if (state.isAdmin) return true;
  alert("Apenas administrador pode executar esta ação.");
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
