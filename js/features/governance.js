import { state } from "../core/state.js";
import { byId, html, formatDateTime, showAppMessage, showAppConfirm, showAppPrompt } from "../core/dom.js";
import { loadRemoteData } from "../data/remote.js";

const POLICY_VERSION = "2026-07-15";

export function bindGovernance() {
  document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-governance-action]");
    if (!button) return;
    const action = button.dataset.governanceAction;
    if (action === "accept-policy") await acceptCurrentPolicy();
    if (action === "request-export") await requestDataAction("export");
    if (action === "request-correction") await requestDataAction("correction");
    if (action === "request-deletion") await requestDataAction("deletion");
    if (action === "save-retention") await saveRetention();
    if (action === "retry-integration-job") await manageIntegrationJob(button.dataset.jobId, "retry");
    if (action === "cancel-integration-job") await manageIntegrationJob(button.dataset.jobId, "cancel");
  });
}

export function renderGovernance() {
  const consent = byId("privacyConsentStatus");
  const requests = byId("dataRequestsList");
  if (!consent || !requests) return;
  const current = state.privacyConsents.find((item) => item.policy_code === "privacy" && item.policy_version === POLICY_VERSION && item.accepted);
  consent.className = `integration-alert ${current ? "success" : "warning"}`;
  consent.textContent = current ? `Política de privacidade ${POLICY_VERSION} aceita em ${formatDateTime(current.accepted_at)}.` : "A política de privacidade atual ainda não foi aceita por este usuário.";
  requests.innerHTML = state.dataRequests.length ? state.dataRequests.map((item) => `
    <article class="list-row"><div><strong>${html(requestLabel(item.request_type))}</strong><span>${html(item.status)} • ${formatDateTime(item.created_at)}</span>${item.reason ? `<p>${html(item.reason)}</p>` : ""}</div><span class="badge ${item.status === "completed" ? "done" : item.status === "rejected" ? "danger-badge" : "queue"}">${html(item.status)}</span></article>
  `).join("") : `<div class="empty-chart">Nenhuma solicitação registrada.</div>`;
  const retention = state.organizationSettings?.data_retention || {};
  if (byId("integrationRetentionDays")) byId("integrationRetentionDays").value = String(retention.integration_job_days || 90);
  if (byId("supportRetentionDays")) byId("supportRetentionDays").value = String(retention.support_diagnostic_days || 90);
  renderIntegrationRecovery();
}

function renderIntegrationRecovery() {
  const section = byId("integrationRecoverySection");
  const list = byId("integrationRecoveryList");
  const count = byId("integrationRecoveryCount");
  if (!section || !list || !count) return;
  const failed = state.isAdmin ? state.integrationJobs.filter((item) => item.status === "dead_letter") : [];
  section.hidden = !failed.length;
  count.textContent = String(failed.length);
  list.innerHTML = failed.map((item) => `
    <article class="list-row">
      <div><strong>${html(item.marketplace)} · ${html(item.job_type)}</strong><span>${item.attempts}/${item.max_attempts} tentativas · ${formatDateTime(item.created_at)}</span><p>${html(item.last_error || "Falha sem detalhe registrado.")}</p></div>
      <div class="inline-actions"><button class="secondary-btn" type="button" data-governance-action="retry-integration-job" data-job-id="${html(item.id)}">Tentar novamente</button><button class="danger-btn" type="button" data-governance-action="cancel-integration-job" data-job-id="${html(item.id)}">Cancelar</button></div>
    </article>
  `).join("");
}

async function manageIntegrationJob(jobId, action) {
  const label = action === "retry" ? "tentar novamente" : "cancelar";
  const confirmed = await showAppConfirm(`${label[0].toUpperCase()}${label.slice(1)} esta integração?`, action === "retry" ? "O job voltará para a fila e será processado no próximo ciclo de manutenção." : "O job será encerrado e não voltará para a fila.", { confirmLabel: action === "retry" ? "Reprocessar" : "Cancelar job", danger: action !== "retry" });
  if (!confirmed) return;
  const { error } = await state.supabase.rpc("manage_integration_job", { candidate_job_id: jobId, candidate_action: action });
  if (error) return showAppMessage("Integrações", error.message, "error");
  await refresh();
  showAppMessage("Fila atualizada", action === "retry" ? "O job foi devolvido à fila." : "O job foi cancelado.", "success");
}

async function saveRetention() {
  const { data, error } = await state.supabase.rpc("update_data_retention", {
    candidate_integration_days: Number(byId("integrationRetentionDays")?.value || 90),
    candidate_support_days: Number(byId("supportRetentionDays")?.value || 90),
  });
  if (error) return showAppMessage("Retenção", error.message, "error");
  state.organizationSettings = data || state.organizationSettings;
  renderGovernance();
  showAppMessage("Retenção atualizada", "Os próximos ciclos de manutenção usarão esses prazos.", "success");
}

async function acceptCurrentPolicy() {
  const { error } = await state.supabase.from("privacy_consents").insert({
    organization_id: state.organizationId,
    user_email: state.activeUserEmail,
    policy_code: "privacy",
    policy_version: POLICY_VERSION,
    accepted: true,
    metadata: { source: "subscription_portal" },
  });
  if (error) return showAppMessage("Privacidade", error.message, "error");
  await refresh();
  showAppMessage("Consentimento registrado", "A versão atual da política foi registrada.", "success");
}

async function requestDataAction(requestType) {
  const destructive = requestType === "deletion";
  if (destructive) {
    const confirmed = await showAppConfirm("Solicitar exclusão dos dados?", "A solicitação será analisada antes de qualquer remoção. Documentos sujeitos a retenção fiscal ou legal serão preservados.", { confirmLabel: "Solicitar análise", danger: true });
    if (!confirmed) return;
  }
  const reason = requestType === "correction"
    ? await showAppPrompt("Corrigir dados pessoais", "Descreva o dado incorreto e qual deve ser o valor correto.", { label: "Correção solicitada", placeholder: "Ex.: alterar o telefone de ... para ...", confirmLabel: "Enviar solicitação" })
    : destructive
      ? await showAppPrompt("Motivo da exclusão", "Explique brevemente o motivo. Registros sujeitos a obrigação fiscal ou legal poderão ser preservados.", { label: "Motivo", placeholder: "Informe o motivo da solicitação", confirmLabel: "Solicitar exclusão", danger: true })
      : "";
  if ((requestType === "correction" || destructive) && !String(reason || "").trim()) return;
  const { error } = await state.supabase.from("organization_data_requests").insert({
    organization_id: state.organizationId,
    request_type: requestType,
    requested_by: state.activeUserEmail,
    reason: String(reason || "").trim() || null,
    metadata: { source: "subscription_portal" },
  });
  if (error) return showAppMessage("Solicitação", error.message, "error");
  await refresh();
  showAppMessage("Solicitação registrada", "Você poderá acompanhar o andamento nesta tela.", "success");
}

async function refresh() {
  await loadRemoteData();
  renderGovernance();
}

function requestLabel(type) {
  return ({ export: "Exportação dos dados", correction: "Correção dos dados", deletion: "Exclusão dos dados" })[type] || type;
}
