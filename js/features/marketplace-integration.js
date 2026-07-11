import { state, money } from "../core/state.js";
import { byId, html, showAppMessage, flashActionMessage } from "../core/dom.js";

// ========================================================================
// INTEGRAÇÃO MULTI-MARKETPLACE: Export + Q&A Central
// ========================================================================

// ========== A. EXPORTAR ANÚNCIOS ==========

const MARKETPLACE_TEMPLATES = {
  shopee: {
    columns: ["name", "price", "stock", "sku", "images", "weight"],
    headers: ["Nome", "Preço", "Estoque", "SKU", "Imagens", "Peso"],
    getValue: (listing, field) => {
      const mapping = {
        name: listing.title,
        price: listing.price,
        stock: listing.available_quantity,
        sku: listing.sku,
        images: listing.thumbnail_url,
        weight: listing.raw_payload?.weight_kg || ""
      };
      return mapping[field] || "";
    }
  },

  amazon: {
    columns: ["sku", "product_name", "price", "quantity", "image_url"],
    headers: ["SKU", "Nome do Produto", "Preço", "Quantidade", "URL da Imagem"],
    getValue: (listing, field) => {
      const mapping = {
        sku: listing.sku,
        product_name: listing.title,
        price: listing.price,
        quantity: listing.available_quantity,
        image_url: listing.thumbnail_url
      };
      return mapping[field] || "";
    }
  },

  generic: {
    columns: ["title", "sku", "price", "stock", "category", "description", "image"],
    headers: ["Título", "SKU", "Preço", "Estoque", "Categoria", "Descrição", "Imagem"],
    getValue: (listing, field) => {
      const mapping = {
        title: listing.title,
        sku: listing.sku,
        price: listing.price,
        stock: listing.available_quantity,
        category: listing.raw_payload?.category_id || "",
        description: listing.raw_payload?.description || "",
        image: listing.thumbnail_url
      };
      return mapping[field] || "";
    }
  }
};

export function openExportDialog() {
  const dialog = document.createElement("div");
  dialog.className = "export-dialog";
  dialog.innerHTML = `
    <div class="dialog-overlay"></div>
    <div class="dialog-modal">
      <div class="dialog-header">
        <h2>Exportar Anúncios</h2>
        <span class="close-btn">✕</span>
      </div>

      <div class="dialog-content">
        <div class="field">
          <label>Marketplace Destino</label>
          <select id="marketplace-select">
            <option value="shopee">Shopee</option>
            <option value="amazon">Amazon</option>
            <option value="generic">CSV Genérico</option>
          </select>
        </div>

        <div class="field">
          <label>Formato</label>
          <select id="format-select">
            <option value="csv">CSV (.csv)</option>
            <option value="xlsx">Excel (.xlsx)</option>
          </select>
        </div>

        <div class="field">
          <label>Anúncios</label>
          <div class="listings-selection">
            <label>
              <input type="radio" name="listings" value="all" checked />
              Todos os anúncios (${state.marketplaceListings.length})
            </label>
            <label>
              <input type="radio" name="listings" value="selected" />
              Apenas selecionados
            </label>
          </div>
        </div>

        <div class="preview-note">
          <strong>Preview:</strong> Será gerado um arquivo com as colunas do ${MARKETPLACE_TEMPLATES.shopee.headers.slice(0, 3).join(", ")}, ...
        </div>
      </div>

      <div class="dialog-actions">
        <button class="secondary-btn" data-action="cancel">Cancelar</button>
        <button class="primary-btn" data-action="export">Exportar</button>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);

  // Handlers
  dialog.querySelector(".close-btn").addEventListener("click", () => dialog.remove());
  dialog.querySelector("[data-action='cancel']").addEventListener("click", () => dialog.remove());
  dialog.querySelector("[data-action='export']").addEventListener("click", () => {
    const marketplace = byId("marketplace-select").value;
    const format = byId("format-select").value;
    const selection = document.querySelector('input[name="listings"]:checked').value;
    performExport(marketplace, format, selection);
    dialog.remove();
  });
};

function performExport(marketplace, format, selection) {
  const listings = selection === "all"
    ? state.marketplaceListings
    : state.marketplaceListings.filter(l => l.selected); // Assumindo checkbox

  const template = MARKETPLACE_TEMPLATES[marketplace];
  const data = listings.map(listing =>
    template.columns.map(col => template.getValue(listing, col))
  );

  if (format === "csv") {
    exportAsCSV(template.headers, data, marketplace);
  } else if (format === "xlsx") {
    exportAsExcel(template.headers, data, marketplace);
  }

  flashActionMessage(`${listings.length} anúncio${listings.length > 1 ? "s" : ""} exportado${listings.length > 1 ? "s" : ""}`);
}

function exportAsCSV(headers, data, marketplace) {
  const csv = [
    headers.map(h => `"${h}"`).join(","),
    ...data.map(row => row.map(cell => `"${cell}"`).join(","))
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv" });
  downloadFile(blob, `anuncios_${marketplace}_${Date.now()}.csv`);
}

function exportAsExcel(headers, data, marketplace) {
  // Simples: converter para CSV e avisar que é "Excel"
  // Em produção, usar uma lib como SheetJS
  const csv = [
    headers.map(h => `"${h}"`).join(","),
    ...data.map(row => row.map(cell => `"${cell}"`).join(","))
  ].join("\n");

  const blob = new Blob([csv], { type: "application/vnd.ms-excel" });
  downloadFile(blob, `anuncios_${marketplace}_${Date.now()}.xlsx`);
}

function downloadFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ========== B. CENTRAL DE PERGUNTAS ML ==========

export async function syncMLQuestions(organizationId) {
  // TODO: Chamar Edge Function para GET /questions/search?seller_id={id}
  // Salvar em state.mlQuestions
  console.log("Sincronizando perguntas do ML...");
}

export function renderQuestionsTab() {
  const unanswered = (state.mlQuestions || []).filter(q => !q.answered);
  const answered = (state.mlQuestions || []).filter(q => q.answered);

  return `
    <div class="questions-container">
      <div class="questions-header">
        <div class="questions-stats">
          <div class="stat-box">
            <strong>${unanswered.length}</strong>
            <span>Sem resposta</span>
          </div>
          <div class="stat-box">
            <strong>${answered.length}</strong>
            <span>Respondidas</span>
          </div>
          <button class="primary-btn" data-action="sync-questions">Sincronizar</button>
        </div>
      </div>

      ${unanswered.length ? `
        <div class="questions-section">
          <h3>🔴 Aguardando Resposta (${unanswered.length})</h3>
          <div class="questions-list">
            ${unanswered.map(q => renderQuestionItem(q)).join("")}
          </div>
        </div>
      ` : ""}

      ${answered.length ? `
        <div class="questions-section answered">
          <h3>Respondidas (${answered.length})</h3>
          <div class="questions-list">
            ${answered.slice(0, 5).map(q => renderQuestionItem(q)).join("")}
          </div>
        </div>
      ` : ""}

      ${!unanswered.length && !answered.length ? `
        <div class="empty-state">Nenhuma pergunta ainda</div>
      ` : ""}
    </div>
  `;
}

function renderQuestionItem(question) {
  const hoursAgo = Math.round((Date.now() - new Date(question.created_at).getTime()) / (1000 * 60 * 60));
  const isUrgent = hoursAgo > 4 && !question.answered;

  return `
    <div class="question-item ${isUrgent ? "urgent" : ""}">
      <div class="question-header">
        <div class="question-meta">
          <strong>${html(question.asker_name)}</strong>
          <span class="time-badge">${hoursAgo}h atrás</span>
          ${isUrgent ? `<span class="urgent-badge">🔴 Sem resposta 4h+</span>` : ""}
        </div>
      </div>

      <div class="question-content">
        <p>${html(question.text)}</p>
      </div>

      ${question.answered ? `
        <div class="answer-preview">
          <strong>Sua resposta:</strong>
          <p>${html(question.answer_text)}</p>
        </div>
      ` : `
        <div class="answer-form">
          <textarea class="answer-input" placeholder="Digite sua resposta..."></textarea>
          <div class="template-buttons">
            ${getResponseTemplates().map(t => `
              <button class="template-btn" title="${t.label}">${t.label}</button>
            `).join("")}
          </div>
          <button class="primary-btn" data-action="send-answer" data-question-id="${question.id}">
            ✉️ Enviar Resposta
          </button>
        </div>
      `}
    </div>
  `;
}

function getResponseTemplates() {
  return [
    { label: "Prazo", text: "Olá! O produto {produto} tem prazo de entrega em {prazo}. Obrigado!" },
    { label: "Disponibilidade", text: "Sim, o produto {produto} está disponível em estoque. Aproveite!" },
    { label: "Especificações", text: "O {produto} possui as seguintes especificações: ..." },
    { label: "Promoção", text: "Ótima pergunta! Temos uma promoção especial para {produto} agora!" }
  ];
}

export async function sendQuestionAnswer(questionId, answerText) {
  // TODO: POST /answers via Edge Function
  const question = state.mlQuestions?.find(q => q.id === questionId);
  if (!question) return;

  question.answered = true;
  question.answer_text = answerText;
  question.answered_at = new Date().toISOString();

  flashActionMessage("Resposta enviada!");

  // TODO: recordAudit("answer-question", "ml-question", questionId);
}

// ========== C. WIDGET DE ALERTA ==========

export function renderQuestionsWidget() {
  const unanswered = (state.mlQuestions || []).filter(q => !q.answered);
  const urgent = unanswered.filter(q => {
    const hoursAgo = (Date.now() - new Date(q.created_at).getTime()) / (1000 * 60 * 60);
    return hoursAgo > 4;
  });

  if (!urgent.length) return "";

  return `
    <div class="dashboard-widget alert-widget">
      <div class="widget-title">
        <span>🔴 Perguntas Urgentes</span>
        <strong>${urgent.length}</strong>
      </div>
      <div class="widget-content">
        <p>${urgent.length} pergunta${urgent.length > 1 ? "s" : ""} sem resposta há mais de 4 horas</p>
        <button class="secondary-btn" onclick="state.view='marketplace'; state.marketplaceView='questions'">
          Ver Perguntas
        </button>
      </div>
    </div>
  `;
}
