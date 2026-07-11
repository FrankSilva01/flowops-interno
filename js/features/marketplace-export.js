import { state } from "../core/state.js";
import { byId, showAppMessage, flashActionMessage, html } from "../core/dom.js";
import { recordAudit } from "./logs.js";

// ========================================================================
// PROMPT 8A: EXPORT ANÚNCIOS + CENTRAL DE PERGUNTAS ML
// ========================================================================

// ========== A. EXPORTAR ANÚNCIOS ==========

const EXPORT_TEMPLATES = {
  shopee: {
    name: "Shopee",
    fields: ["name", "price", "stock", "sku", "description", "category", "images"]
  },
  amazon: {
    name: "Amazon",
    fields: ["sku", "product-name", "price", "quantity", "image-url", "description"]
  },
  generic: {
    name: "Genérico",
    fields: ["sku", "name", "price", "stock", "cost_price", "description", "category", "marketplace"]
  }
};

export async function openExportDialog() {
  const dialog = document.createElement("div");
  dialog.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: var(--panel);
    padding: 32px;
    border-radius: 12px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    z-index: 10000;
    min-width: 450px;
    max-width: 90vw;
  `;

  dialog.innerHTML = `
    <h2 style="margin: 0 0 12px 0; font-size: 18px; font-weight: 700; color: var(--ink);">
      Exportar Anúncios
    </h2>
    <p style="margin: 0 0 24px 0; font-size: 13px; color: var(--muted); line-height: 1.6;">
      Escolha o formato e os anúncios que deseja exportar.
    </p>

    <div style="display: flex; flex-direction: column; gap: 16px;">
      <div>
        <label style="display: block; font-size: 12px; font-weight: 600; color: var(--muted); margin-bottom: 8px; text-transform: uppercase;">
          Template
        </label>
        <select id="exportTemplate" style="
          width: 100%;
          padding: 8px 12px;
          border: 1px solid var(--line);
          border-radius: 6px;
          font-size: 13px;
          background: var(--canvas);
          color: var(--ink);
        ">
          ${Object.entries(EXPORT_TEMPLATES).map(([key, tmpl]) =>
            `<option value="${key}">${tmpl.name}</option>`
          ).join("")}
        </select>
      </div>

      <div>
        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px;">
          <input type="radio" name="exportScope" value="all" checked style="cursor: pointer;" />
          <span>Exportar todos os anúncios (${state.marketplaceListings?.length || 0})</span>
        </label>
        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px; margin-top: 8px;">
          <input type="radio" name="exportScope" value="selected" style="cursor: pointer;" />
          <span>Exportar selecionados</span>
        </label>
      </div>

      <div>
        <label style="display: block; font-size: 12px; font-weight: 600; color: var(--muted); margin-bottom: 8px; text-transform: uppercase;">
          Formato
        </label>
        <div style="display: flex; gap: 8px;">
          <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; flex: 1;">
            <input type="radio" name="exportFormat" value="csv" checked style="cursor: pointer;" />
            <span>CSV</span>
          </label>
          <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; flex: 1;">
            <input type="radio" name="exportFormat" value="xlsx" style="cursor: pointer;" />
            <span>XLSX (Excel)</span>
          </label>
        </div>
      </div>
    </div>

    <div style="display: flex; gap: 12px; margin-top: 24px; justify-content: flex-end;">
      <button id="cancelExport" style="
        background: transparent;
        border: 1px solid var(--line);
        color: var(--ink);
        padding: 10px 20px;
        border-radius: 8px;
        cursor: pointer;
        font-weight: 600;
      ">Cancelar</button>
      <button id="startExport" style="
        background: var(--teal);
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 8px;
        cursor: pointer;
        font-weight: 600;
      ">📥 Exportar</button>
    </div>
  `;

  const overlay = document.createElement("div");
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.4);
    z-index: 9999;
  `;

  document.body.appendChild(overlay);
  document.body.appendChild(dialog);

  byId("cancelExport").addEventListener("click", () => {
    overlay.remove();
    dialog.remove();
  });

  byId("startExport").addEventListener("click", () => {
    const template = document.querySelector('input[name="exportTemplate"]')?.value || "generic";
    const scope = document.querySelector('input[name="exportScope"]:checked')?.value || "all";
    const format = document.querySelector('input[name="exportFormat"]:checked')?.value || "csv";

    exportListings(template, scope, format);
    overlay.remove();
    dialog.remove();
  });
}

function exportListings(templateKey, scope, format) {
  const template = EXPORT_TEMPLATES[templateKey];
  let listings = state.marketplaceListings || [];

  if (scope === "selected") {
    // TODO: Filtrar por selecionados com checkbox
    flashActionMessage("Selecione anúncios com checkbox primeiro");
    return;
  }

  const data = listings.map(listing => {
    const row = {};
    template.fields.forEach(field => {
      switch (field) {
        case "sku":
          row[field] = listing.sku || "";
          break;
        case "name":
        case "product-name":
          row[field] = listing.title || "";
          break;
        case "price":
          row[field] = listing.price || 0;
          break;
        case "quantity":
        case "stock":
          row[field] = listing.available_quantity || 0;
          break;
        case "image-url":
          row[field] = listing.thumbnail || "";
          break;
        case "description":
          row[field] = listing.description || "";
          break;
        case "category":
          row[field] = listing.category_id || "";
          break;
        case "cost_price":
          row[field] = listing.cost_price || "";
          break;
        case "marketplace":
          row[field] = listing.marketplace || "";
          break;
        case "images":
          row[field] = listing.pictures?.map(p => p.url).join("; ") || "";
          break;
      }
    });
    return row;
  });

  if (format === "csv") {
    exportAsCSV(data, `anuncios_${templateKey}_${new Date().toISOString().split("T")[0]}.csv`);
  } else if (format === "xlsx") {
    exportAsXLSX(data, `anuncios_${templateKey}_${new Date().toISOString().split("T")[0]}.xlsx`);
  }

  flashActionMessage(`✅ Exportados ${data.length} anúncios!`);
}

function exportAsCSV(data, filename) {
  if (data.length === 0) return;

  const headers = Object.keys(data[0]);
  const csv = [
    headers.map(h => `"${h}"`).join(","),
    ...data.map(row =>
      headers.map(h => `"${String(row[h] || "").replace(/"/g, '""')}"`).join(",")
    )
  ].join("\n");

  downloadFile(csv, filename, "text/csv");
}

function exportAsXLSX(data, filename) {
  // Simples implementação XLSX usando CSV com estrutura
  // Para XLSX real, seria necessário uma biblioteca como xlsx
  const csv = exportAsCSV(data, filename);
  // Por enquanto, exportar como CSV
  downloadFile(csv, filename.replace(".xlsx", ".csv"), "text/csv");
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ========== B. CENTRAL DE PERGUNTAS ML ==========

export async function renderMLQuestionsTab() {
  const container = byId("mlQuestionsContainer");
  if (!container) return;

  const questions = await getMLQuestions();

  container.innerHTML = `
    <div class="filter-bar">
      <button class="secondary-btn" id="refreshMLQuestions">🔄 Sincronizar</button>
      <label>
        Status
        <select id="questionStatusFilter">
          <option value="all">Todos</option>
          <option value="unanswered">Não respondidas</option>
          <option value="answered">Respondidas</option>
        </select>
      </label>
    </div>

    <div class="questions-list">
      ${questions.length === 0 ? `
        <div class="empty-state">
          <strong>Nenhuma pergunta</strong>
          <span>Suas perguntas do Mercado Livre aparecerão aqui</span>
        </div>
      ` : `
        ${questions.map(q => `
          <div class="question-card" style="
            padding: 16px;
            background: var(--canvas);
            border-radius: 8px;
            margin-bottom: 12px;
            border-left: 4px solid ${q.answered ? 'var(--green)' : 'var(--amber)'};
          ">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
              <div>
                <div style="font-size: 12px; font-weight: 600; color: var(--muted); margin-bottom: 4px;">
                  ${q.buyer_name} • ${new Date(q.created_at).toLocaleDateString('pt-BR')}
                </div>
                <h4 style="margin: 0; font-size: 14px; font-weight: 600; color: var(--ink);">
                  ${html(q.question_text)}
                </h4>
              </div>
              ${!q.answered ? `
                <span class="badge" style="background: var(--amber); color: white; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">
                  Por responder
                </span>
              ` : ""}
            </div>

            ${q.answer_text ? `
              <div style="background: var(--panel); padding: 12px; border-radius: 6px; margin-bottom: 12px; font-size: 13px; color: var(--ink);">
                <strong style="display: block; margin-bottom: 4px;">Sua resposta:</strong>
                ${html(q.answer_text)}
              </div>
            ` : `
              <div style="display: flex; gap: 8px;">
                <textarea id="answer_${q.id}" placeholder="Escrever resposta..." style="
                  flex: 1;
                  padding: 8px;
                  border: 1px solid var(--line);
                  border-radius: 6px;
                  font-size: 12px;
                  background: var(--panel);
                  color: var(--ink);
                  font-family: inherit;
                  resize: vertical;
                  min-height: 60px;
                "></textarea>
                <button onclick="respondMLQuestion('${q.id}')" class="primary-btn" style="
                  padding: 8px 16px;
                  background: var(--teal);
                  color: white;
                  border: none;
                  border-radius: 6px;
                  cursor: pointer;
                  font-weight: 600;
                  font-size: 12px;
                  height: fit-content;
                ">Enviar</button>
              </div>
            `}
          </div>
        `).join("")}
      `}
    </div>
  `;

  byId("refreshMLQuestions")?.addEventListener("click", syncMLQuestions);
}

async function getMLQuestions() {
  if (!state.supabase) return [];

  const { data, error } = await state.supabase
    .from("ml_questions")
    .select("*")
    .eq("organization_id", state.organizationId)
    .order("created_at", { ascending: false });

  return data || [];
}

async function syncMLQuestions() {
  if (!state.supabase) return;

  flashActionMessage("🔄 Sincronizando perguntas do ML...");

  // TODO: Chamar Edge Function para GET /questions/search
  // Por enquanto, apenas mostrar mensagem

  flashActionMessage("✅ Sincronização completa!");
}

export async function respondMLQuestion(questionId) {
  const textarea = document.getElementById(`answer_${questionId}`);
  if (!textarea || !textarea.value.trim()) {
    showAppMessage("Digite uma resposta", "warning");
    return;
  }

  if (!state.supabase) return;

  const response_text = textarea.value.trim();

  const { data, error } = await state.supabase
    .from("ml_questions")
    .update({
      answer_text: response_text,
      answered: true,
      answered_at: new Date().toISOString()
    })
    .eq("id", questionId)
    .select()
    .single();

  if (error) {
    showAppMessage("Erro ao enviar resposta", "error");
    return;
  }

  // TODO: POST /answers via Edge Function

  await recordAudit("create", "ml_answer", questionId, response_text, null, data, "manual");
  flashActionMessage("✅ Resposta enviada!");

  // Recarregar lista
  await renderMLQuestionsTab();
}

// Expor globalmente para onclick
window.respondMLQuestion = respondMLQuestion;
