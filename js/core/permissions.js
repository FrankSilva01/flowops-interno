import { state } from "./state.js";
import { byId } from "./dom.js";

export function isAdminRole(role) {
  return ["administrador", "admin"].includes(String(role || "").toLowerCase());
}

export function isEditorRole(role) {
  return ["administrador", "admin", "edição", "edicao", "editor", "equipe"].includes(String(role || "").toLowerCase());
}

export function displayRole(role) {
  if (isAdminRole(role)) return "Administrador";
  if (isEditorRole(role)) return "Edição";
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
