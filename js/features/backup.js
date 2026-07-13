import { state } from "../core/state.js";
import { supabaseFunctionUrl } from "../core/config.js";
import { byId, html, formatDateTime, flashActionMessage } from "../core/dom.js";
import { ensureCanAdmin } from "../core/permissions.js";
import { bindActions, render } from "../core/router.js";
import { loadRemoteData } from "../data/remote.js";
import { customTagClass } from "./orders.js";
import { formatFileSize } from "./customers.js";
import { loadMarketplaces, renderMarketplaces } from "./marketplace.js";

export function renderSettingsData() {
  const datalist = byId("customTagsList");
  if (datalist) datalist.innerHTML = state.customTags.map((tag) => `<option value="${html(tag.name)}"></option>`).join("");
  const manager = byId("customTagsManager");
  if (manager) {
    manager.innerHTML = state.customTags.length ? state.customTags.map((tag) => `
      <span class="${customTagClass(tag.color)}">${html(tag.name)}
        ${state.canEdit ? `<button type="button" data-action="delete-custom-tag" data-id="${html(tag.id)}">×</button>` : ""}
      </span>
    `).join("") : `<span class="muted">Nenhuma tag personalizada.</span>`;
  }
  const backup = byId("backupStatus");
  if (backup) {
    const latest = state.backupRuns[0];
    backup.innerHTML = `
      <article><span>Ultimo backup</span><strong>${latest ? formatDateTime(latest.started_at) : "Ainda nao executado"}</strong></article>
      <article><span>Resultado</span><strong>${latest?.status === "success" ? "Concluido" : latest?.status === "error" ? "Falhou" : latest?.status || "-"}</strong></article>
      <article><span>Tamanho</span><strong>${latest?.size_bytes ? formatFileSize(latest.size_bytes) : "-"}</strong></article>
      <article><span>Falhou?</span><strong>${latest?.status === "error" ? "Sim" : "Nao"}</strong></article>
    `;
  }
  const backupHistory = byId("backupHistoryList");
  if (backupHistory) {
    backupHistory.innerHTML = state.backupRuns.length ? state.backupRuns.slice(0, 30).map((run) => `
      <div class="list-row">
        <span><strong>${run.status === "success" ? "Backup concluído" : "Backup com erro"}</strong><br><small>${formatDateTime(run.started_at)} • ${run.backup_type || "automático"}</small></span>
        <span class="backup-history-actions">
          <span class="badge ${run.status === "success" ? "done" : "danger-badge"}">${run.status === "success" ? formatFileSize(run.size_bytes) : html(run.error_message || "Falhou")}</span>
          ${run.status === "success" && run.storage_path ? `<button class="secondary-btn compact" type="button" data-action="download-saved-backup" data-id="${html(run.id)}">Baixar</button>` : ""}
        </span>
      </div>
    `).join("") : `<div class="empty-chart">Nenhum backup executado ainda.</div>`;
  }
  bindActions();
}

export async function runManualBackup() {
  if (!ensureCanAdmin()) return;
  const button = byId("runBackupBtn");
  button.disabled = true;
  button.textContent = "Executando...";
  try {
    const { data: sessionData } = await state.supabase.auth.getSession();
    const response = await fetch(supabaseFunctionUrl("system-maintenance"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionData.session?.access_token || ""}`,
      },
      body: JSON.stringify({ action: "manual" }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Falha no backup.");
    await loadRemoteData();
    renderSettingsData();
    flashActionMessage("Backup concluido.");
  } catch (error) {
    alert(`Backup falhou: ${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = "Executar agora";
  }
}

export async function maintenanceRequest(payload) {
  if (!ensureCanAdmin()) throw new Error("Apenas administradores podem gerenciar backups.");
  const { data: sessionData } = await state.supabase.auth.getSession();
  const response = await fetch(supabaseFunctionUrl("system-maintenance"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sessionData.session?.access_token || ""}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) throw new Error(data.error || "Falha ao processar o backup.");
  return data;
}

export async function downloadBackupScope(scope) {
  const labels = {
    system: "sistema",
    storefront: "vitrine",
    database: "banco-completo",
  };
  const button = byId(scope === "system" ?
     "downloadSystemBackupBtn"
    : scope === "storefront" ?
       "downloadStorefrontBackupBtn"
      : "downloadDatabaseBackupBtn");
  const previous = button.textContent;
  button.disabled = true;
  button.textContent = "Preparando...";
  try {
    const data = await maintenanceRequest({ action: "export", scope });
    downloadJsonFile(data.snapshot, `3daft-backup-${labels[scope]}-${new Date().toISOString().slice(0, 10)}.json`);
    flashActionMessage("Backup baixado.");
  } catch (error) {
    alert(`Nao foi possivel baixar o backup: ${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = previous;
  }
}

export async function downloadSavedBackup(id) {
  try {
    const data = await maintenanceRequest({ action: "download", backup_id: id });
    const anchor = document.createElement("a");
    anchor.href = data.url;
    anchor.download = data.file_name || "3daft-backup.json.gz";
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } catch (error) {
    alert(`Nao foi possivel baixar o backup: ${error.message}`);
  }
}

export async function restoreBackupFromFile() {
  if (!ensureCanAdmin()) return;
  const input = byId("backupImportFile");
  const message = byId("backupRestoreMessage");
  const button = byId("restoreBackupBtn");
  const file = input.files?.[0];
  if (!file) {
    message.textContent = "Selecione um arquivo de backup.";
    return;
  }
  if (!confirm("Restaurar este backup Registros com o mesmo identificador serao atualizados no Supabase.")) return;
  button.disabled = true;
  button.textContent = "Restaurando...";
  message.textContent = "Validando arquivo...";
  try {
    const snapshot = await readBackupFile(file);
    validateBackupSnapshot(snapshot);
    const data = await maintenanceRequest({ action: "restore", snapshot });
    message.textContent = `${data.restored_rows || 0} registro(s) restaurado(s) em ${data.restored_tables || 0} tabela(s).`;
    input.value = "";
    await loadRemoteData();
    await loadMarketplaces();
    render();
    renderMarketplaces();
  } catch (error) {
    message.textContent = `Falha: ${error.message}`;
  } finally {
    button.disabled = false;
    button.textContent = "Importar backup";
  }
}

export async function simulateBackupRestore() {
  if (!ensureCanAdmin()) return;
  const input = byId("backupImportFile");
  const message = byId("backupRestoreMessage");
  const report = byId("backupSimulationReport");
  const button = byId("simulateBackupRestoreBtn");
  const file = input.files?.[0];
  if (!file) {
    message.textContent = "Selecione um arquivo de backup.";
    report.hidden = true;
    return;
  }
  button.disabled = true;
  button.textContent = "Analisando...";
  message.textContent = "Comparando o backup com o banco atual sem alterar dados...";
  report.hidden = true;
  try {
    const snapshot = await readBackupFile(file);
    validateBackupSnapshot(snapshot);
    const data = await maintenanceRequest({ action: "simulate-restore", snapshot });
    renderBackupSimulation(data);
    message.textContent = data.can_restore ?
       "Teste concluido. O arquivo pode ser restaurado."
      : "Teste concluido com problemas que precisam ser revisados.";
  } catch (error) {
    message.textContent = `Falha no teste: ${error.message}`;
  } finally {
    button.disabled = false;
    button.textContent = "Testar restauracao";
  }
}

export function renderBackupSimulation(data) {
  const report = byId("backupSimulationReport");
  const totals = data.totals || {};
  const rows = Array.isArray(data.tables) ? data.tables : [];
  report.innerHTML = `
    <div class="backup-simulation-summary">
      <article><span>Criaria</span><strong>${Number(totals.create || 0)}</strong></article>
      <article><span>Atualizaria</span><strong>${Number(totals.update || 0)}</strong></article>
      <article><span>Sem mudanca</span><strong>${Number(totals.identical || 0)}</strong></article>
      <article><span>Ignorados</span><strong>${Number(totals.skipped || 0)}</strong></article>
      <article><span>Invalidos</span><strong>${Number(totals.invalid || 0)}</strong></article>
    </div>
    <div class="table-wrap">
      <table class="backup-simulation-table">
        <thead><tr><th>Tabela</th><th>Arquivo</th><th>Novos</th><th>Atualizacoes</th><th>Iguais</th><th>Ignorados</th><th>Invalidos</th></tr></thead>
        <tbody>${rows.map((item) => `
          <tr>
            <td><strong>${html(item.table)}</strong>${item.reason ? `<br><small>${html(item.reason)}</small>` : ""}</td>
            <td>${Number(item.rows || 0)}</td>
            <td>${Number(item.create || 0)}</td>
            <td>${Number(item.update || 0)}</td>
            <td>${Number(item.identical || 0)}</td>
            <td>${Number(item.skipped || 0)}</td>
            <td>${Number(item.invalid || 0)}</td>
          </tr>
        `).join("")}</tbody>
      </table>
    </div>
    <p class="backup-simulation-result ${data.can_restore ? "success" : "warning"}">
      ${data.can_restore ?
         "Nenhuma alteracao foi executada. A restauracao real continua dependendo do botao Importar backup."
        : "Nenhuma alteracao foi executada. Corrija ou substitua o arquivo antes da restauracao."}
    </p>
  `;
  report.hidden = false;
}

export async function readBackupFile(file) {
  let text;
  if (file.name.toLowerCase().endsWith(".gz") || file.type === "application/gzip") {
    if (typeof DecompressionStream !== "function") {
      throw new Error("Este navegador nao suporta arquivos GZIP. Use um backup JSON.");
    }
    const decompressed = file.stream().pipeThrough(new DecompressionStream("gzip"));
    text = await new Response(decompressed).text();
  } else {
    text = await file.text();
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Arquivo JSON invalido.");
  }
}

export function validateBackupSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || !snapshot.tables || typeof snapshot.tables !== "object") {
    throw new Error("O arquivo nao possui a estrutura de backup da 3D.AFT.");
  }
  if (!Object.values(snapshot.tables).every(Array.isArray)) {
    throw new Error("Uma ou mais tabelas do backup sao invalidas.");
  }
}

export function downloadJsonFile(data, fileName) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
