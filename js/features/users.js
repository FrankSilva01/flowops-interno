import { state } from "../core/state.js";
import { byId, html, formatDateTime, showAppMessage } from "../core/dom.js";
import { bindActions } from "../core/router.js";
import { ensureCanAdmin, isAdminRole, isEditorRole } from "../core/permissions.js";
import { userAccessRequest } from "../core/session.js";
import { renderLogs } from "./logs.js";

export function renderApprovals() {
  const table = byId("approvalsTable");
  if (!table) return;
  if (!state.isAdmin) {
    table.innerHTML = "";
    return;
  }
  const pending = state.accessRequests.filter((request) => (request.status || "pending") === "pending");
  table.innerHTML = pending.length ? pending.map((request) => `
    <tr>
      <td>${formatDateTime(request.requested_at)}</td>
      <td>${html(request.name || "-")}</td>
      <td class="cell-truncate" title="${html(request.email)}">${html(request.email)}</td>
      <td><span class="badge ${request.status === "approved" ? "done" : request.status === "rejected" ? "danger-badge" : "queue"}">${html(request.status || "pending")}</span></td>
      <td>
        <button class="icon-btn" type="button" data-action="approve-access" data-email="${html(request.email)}">Aprovar</button>
        <button class="icon-btn danger" type="button" data-action="reject-access" data-email="${html(request.email)}">Recusar</button>
      </td>
    </tr>
  `).join("") : `
    <tr>
      <td colspan="5">Nenhuma solicitação pendente.</td>
    </tr>
  `;
  bindActions();
}

export function renderActiveUsers() {
  const table = byId("activeUsersTable");
  if (!table) return;
  if (!state.isAdmin) {
    table.innerHTML = "";
    return;
  }
  const plan = state.subscriptionPlans.find((item) => item.code === state.subscription?.plan_code);
  const limit = Number(plan?.limits?.users || 0);
  const limitLabel = byId("userPlanLimit");
  const overLimit = limit > 0 && state.activeUsers.length >= limit;
  if (limitLabel) {
    limitLabel.className = overLimit ? "limit-warning" : "";
    limitLabel.textContent = limit > 0 ?
       `${state.activeUsers.length} de ${limit} usuários utilizados${state.activeUsers.length > limit ? " — acima do limite" : ""}`
      : `${state.activeUsers.length} usuários`;
  }
  const submitButton = byId("manualUserForm")?.querySelector('button[type="submit"]');
  if (submitButton) {
    submitButton.disabled = false;
    submitButton.title = overLimit ?
       "Ao tentar cadastrar, serão exibidas as opções de upgrade."
      : "";
  }
  table.innerHTML = state.activeUsers.length ? state.activeUsers.map((user) => `
    <tr>
      <td class="cell-truncate" title="${html(user.email)}">${html(user.email)}</td>
      <td>
        <select class="role-select" data-action="change-user-role" data-email="${html(user.email)}" ${user.email === state.activeUserEmail ? "disabled" : ""}>
          <option value="Administrador" ${user.role === "Administrador" ? "selected" : ""}>Administrador</option>
          <option value="Edicao" ${isEditorRole(user.role) && !isAdminRole(user.role) ? "selected" : ""}>Edição</option>
          <option value="Leitura" ${!isEditorRole(user.role) && !isAdminRole(user.role) ? "selected" : ""}>Somente leitura</option>
        </select>
      </td>
      <td>${formatDateTime(user.approved_at)}</td>
      <td>
        <button class="icon-btn danger" type="button" data-action="remove-user" data-email="${html(user.email)}" ${user.email === state.activeUserEmail ? "disabled" : ""}>Remover</button>
      </td>
    </tr>
  `).join("") : `
    <tr>
      <td colspan="4">Nenhum usuário ativo.</td>
    </tr>
  `;
  bindActions();
}

export function renderResponsibles() {
  const table = byId("responsiblesTable");
  if (!table) return;
  table.innerHTML = state.responsibles.length ? state.responsibles.map((item) => `
    <tr>
      <td>${html(item.name)}</td>
      <td>
        <button class="icon-btn" type="button" data-action="edit-responsible" data-id="${html(item.id)}">Editar</button>
        <button class="icon-btn danger" type="button" data-action="delete-responsible" data-id="${html(item.id)}">Excluir</button>
      </td>
    </tr>
  `).join("") : `<tr><td colspan="2">Nenhum responsável cadastrado.</td></tr>`;
  bindActions();
}

export async function loadAccessRequests() {
  if (!state.supabase || !state.isAdmin) {
    state.accessRequests = [];
    return;
  }
  let { data, error } = await state.supabase
    .from("access_requests")
    .select("email,name,status,requested_at,decided_at,decided_by")
    .eq("organization_id", state.organizationId)
    .order("requested_at", { ascending: false });
  if (error && String(error.message || "").includes("decided_at")) {
    const fallback = await state.supabase
      .from("access_requests")
      .select("email,name,status,requested_at")
      .eq("organization_id", state.organizationId)
      .order("requested_at", { ascending: false });
    data = fallback.data;
    error = fallback.error;
  }
  if (error) throw error;
  state.accessRequests = data || [];
}

export async function loadActiveUsers() {
  if (!state.supabase || !state.isAdmin) {
    state.activeUsers = [];
    return;
  }
  const [approved, members] = await Promise.all([
    state.supabase
      .from("approved_users")
      .select("email,role,approved_at")
      .eq("organization_id", state.organizationId)
      .order("approved_at", { ascending: false }),
    state.supabase
      .from("organization_members")
      .select("user_email,role,updated_at,status")
      .eq("organization_id", state.organizationId)
      .eq("status", "active"),
  ]);
  if (approved.error) throw approved.error;
  if (members.error) throw members.error;
  const byEmail = new Map();
  (approved.data || []).forEach((row) => byEmail.set(String(row.email || "").toLowerCase(), row));
  (members.data || []).forEach((row) => {
    const email = String(row.user_email || "").toLowerCase();
    if (!email || byEmail.has(email)) return;
    byEmail.set(email, { email, role: row.role || "Leitura", approved_at: row.updated_at });
  });
  state.activeUsers = [...byEmail.values()];
}

export async function loadResponsibles() {
  if (!state.supabase) return;
  try {
    const { data, error } = await state.supabase
      .from("responsibles")
      .select("id,name")
      .eq("organization_id", state.organizationId)
      .order("name", { ascending: true });
    if (error) return;
    state.responsibles = data || [];
  } catch {
    // Mantém responsáveis padrão quando a tabela ainda não existe.
  }
}

export async function loadAndRenderResponsibles() {
  await loadResponsibles();
  renderResponsibles();
  renderResponsibleOptions();
}

export async function loadAndRenderApprovals() {
  await loadAccessRequests();
  renderApprovals();
}

export async function loadAndRenderUsers() {
  await loadActiveUsers();
  renderActiveUsers();
}

export async function approveAccess(email) {
  try {
    await userAccessRequest({
      action: "approve-request",
      email,
      role: "Edicao",
    }, true);
  } catch (error) {
    showAppMessage(
      /limite de usuarios/i.test(error.message) ? "Limite do plano atingido" : "Não foi possível aprovar",
      error.message,
      "error",
    );
    return;
  }
  await loadAndRenderApprovals();
  await loadAndRenderUsers();
  renderLogs();
}

export async function rejectAccess(email) {
  const decidedAt = new Date().toISOString();
  const { error } = await state.supabase
    .from("access_requests")
    .update({
      status: "rejected",
      decided_at: decidedAt,
      decided_by: state.activeUserEmail
    })
    .eq("email", email);
  if (error) {
    await state.supabase
      .from("access_requests")
      .update({ status: "rejected", requested_at: decidedAt })
      .eq("email", email);
  }
  state.accessRequests = state.accessRequests.map((item) => item.email === email ? { ...item, status: "rejected", decided_at: decidedAt, decided_by: state.activeUserEmail } : item);
  await loadAndRenderApprovals();
  renderLogs();
}

export async function changeUserRole(email, role) {
  await state.supabase
    .from("approved_users")
    .update({ role })
    .eq("email", email)
    .eq("organization_id", state.organizationId);
  await state.supabase
    .from("organization_members")
    .update({ role, updated_at: new Date().toISOString() })
    .eq("organization_id", state.organizationId)
    .eq("user_email", email);
  await loadAndRenderUsers();
}

export async function removeUser(email) {
  if (!confirm(`Remover acesso de ${email}?`)) return;
  await state.supabase
    .from("approved_users")
    .delete()
    .eq("email", email)
    .eq("organization_id", state.organizationId);
  await state.supabase
    .from("organization_members")
    .update({ status: "inactive", updated_at: new Date().toISOString() })
    .eq("organization_id", state.organizationId)
    .eq("user_email", email);
  await loadAndRenderUsers();
}

export async function createManualUserAccess(event) {
  event.preventDefault();
  if (!ensureCanAdmin()) return;
  const form = event.currentTarget;
  const data = new FormData(form);
  const name = String(data.get("name") || "").trim();
  const email = String(data.get("email") || "").trim().toLowerCase();
  const password = String(data.get("password") || "");
  const role = String(data.get("role") || "Edicao");
  if (!email) return;
  const currentPlan = state.subscriptionPlans.find((item) => item.code === state.subscription?.plan_code);
  const userLimit = Number(currentPlan?.limits?.users || 0);
  if (userLimit > 0 && state.activeUsers.length >= userLimit) {
    showPlanLimitDialog(currentPlan, userLimit);
    return;
  }
  if (password.length < 6) {
    showAppMessage("Senha inválida", "A senha precisa ter pelo menos 6 caracteres.", "error");
    return;
  }
  try {
    await userAccessRequest({
      action: "manual-create",
      name,
      email,
      password,
      role
    }, true);
  } catch (error) {
    showAppMessage("Não foi possível criar o acesso", error.message, "error");
    return;
  }
  form.reset();
  await loadAndRenderUsers();
  await loadAndRenderApprovals();
  renderLogs();
  showAppMessage("Acesso criado", "A senha foi definida e o usuário já pode entrar.");
}

export function showPlanLimitDialog(plan, limit) {
  const currentPrice = Number(plan?.price_monthly || 0);
  const currentUsers = Number(plan?.limits?.users || limit || 0);
  const nextPlan = state.subscriptionPlans
    .filter((item) => item.active !== false && (
      Number(item.limits?.users || 0) > currentUsers
      || Number(item.price_monthly || 0) > currentPrice
    ))
    .sort((a, b) => Number(a.limits?.users || 0) - Number(b.limits?.users || 0))[0];
  byId("planLimitMessage").textContent = `O plano ${plan?.name || state.subscription?.plan_code || "atual"} permite ${limit} usuário(s) e a empresa possui ${state.activeUsers.length}.`;
  byId("planLimitRecommendation").innerHTML = nextPlan
    ? `<strong>Plano recomendado: ${html(nextPlan.name)}</strong><span>${Number(nextPlan.limits?.users || 0)} usuários e ${Number(nextPlan.limits?.marketplace_sales_month || 0)} vendas importadas por mês.</span>`
    : `<strong>Limite atingido</strong><span>Remova usuários não utilizados ou fale com o suporte sobre um plano superior.</span>`;
  byId("planLimitDialog").showModal();
}

export async function saveResponsible(event) {
  event.preventDefault();
  if (!ensureCanAdmin()) return;
  const name = new FormData(event.currentTarget).get("name").trim();
  if (!name) return;
  const item = { id: nextResponsibleId(), name };
  if (state.supabase) await state.supabase.from("responsibles").upsert({ ...item, organization_id: state.organizationId });
  state.responsibles.push(item);
  event.currentTarget.reset();
  renderResponsibles();
  renderResponsibleOptions();
}

export async function editResponsible(id) {
  const item = state.responsibles.find((row) => row.id === id);
  if (!item) return;
  const nextName = prompt("Novo nome do responsável:", item.name);
  if (!nextName?.trim()) return;
  item.name = nextName.trim();
  if (state.supabase) await state.supabase.from("responsibles").upsert({ ...item, organization_id: state.organizationId });
  renderResponsibles();
  renderResponsibleOptions();
}

export async function deleteResponsible(id) {
  const item = state.responsibles.find((row) => row.id === id);
  if (!item || !confirm(`Excluir responsável ${item.name}?`)) return;
  if (state.supabase) await state.supabase.from("responsibles").delete().eq("id", id).eq("organization_id", state.organizationId);
  state.responsibles = state.responsibles.filter((row) => row.id !== id);
  renderResponsibles();
  renderResponsibleOptions();
}

export function renderResponsibleOptions() {
  const select = document.querySelector('#orderForm select[name="responsible"]');
  if (!select) return;
  const current = select.value;
  select.innerHTML = `<option value="">Responsável</option>${getResponsibleNames().map((name) => `<option>${html(name)}</option>`).join("")}`;
  select.value = current;
}

export function getResponsibleNames() {
  return [...new Set(state.responsibles.map((item) => item.name).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export function nextResponsibleId() {
  const max = state.responsibles.reduce((value, row) => Math.max(value, Number(String(row.id || "").split("-")[1] || 0)), 0);
  return `RESP-${String(max + 1).padStart(3, "0")}`;
}
