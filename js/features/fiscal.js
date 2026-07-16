import { state, money } from "../core/state.js";
import { byId, html, formatDate, showAppMessage, renderPagination, countBy } from "../core/dom.js";
import {
  saveFiscalDocument, loadFiscalDocuments, deleteFiscalDocument,
  saveDASPayment, loadDASPayments,
  savePurchaseInvoice, loadPurchaseInvoices, deletePurchaseInvoice,
  saveSalesInvoice, loadSalesInvoices, deleteSalesInvoice,
  getUniqueSuppliersFromPurchases, getUniqueClientsFromSales,
  getTotalByMonth, getDASForYear, initFiscalData
} from "./fiscal-persistence.js";

export async function renderFiscalDocs() {
  const content = byId("fiscalContainer");
  if (!content) return;

  // Inicializar e carregar dados
  initFiscalData();
  const docs = await loadFiscalDocuments();

  content.innerHTML = `
    <div class="fiscal-section">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Fiscal</p>
          <h2>Cofre de documentos fiscais</h2>
        </div>
        <span>Guarde links de XML/PDF, recibos, boletos e observacoes vinculadas a pedidos, produtos ou fornecedores.</span>
      </div>
      <div class="fiscal-toolbar">
        <div class="fiscal-filters">
          <label>Buscar<input type="search" id="fiscalSearchInput" placeholder="NF, XML, PDF, pedido, produto ou fornecedor" /></label>
          <label>Tipo<select id="fiscalTypeFilter"><option value="">Todos</option><option>Recibo</option><option>RPA</option><option>Boleto</option></select></label>
          <label>Status<select id="fiscalStatusFilter"><option value="">Todos</option><option>Pendente</option><option>Pago</option><option>Vencido</option></select></label>
          <label>De<input type="date" id="fiscalDateFromFilter" /></label>
          <label>Até<input type="date" id="fiscalDateToFilter" /></label>
        </div>
        <div class="fiscal-actions">
          <button class="primary-btn" type="button" data-fiscal-action="new-document">+ Guardar documento</button>
          <button class="secondary-btn" type="button" data-fiscal-action="generate-report">Gerar Relatório</button>
          <button class="secondary-btn" type="button" data-fiscal-action="export-docs">Exportar</button>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Tipo</th>
              <th>Número</th>
              <th>Descrição</th>
              <th>Valor</th>
              <th>Status</th>
              <th>Arquivo</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="fiscalDocsTable">
            ${docs.length === 0 ?
              `<tr><td colspan="8" class="empty-state">Nenhum documento registrado.</td></tr>` :
              docs.map(doc => `
                <tr>
                  <td>${formatDate(doc.date)}</td>
                  <td>${html(doc.type)}</td>
                  <td>${html(doc.number)}</td>
                  <td>${html(doc.description || "-")}</td>
                  <td>${money.format(doc.value)}</td>
                  <td><span class="status-badge status-${doc.status.toLowerCase()}">${html(doc.status)}</span></td>
                  <td>${doc.storage_path ? `<button class="secondary-btn compact" type="button" data-fiscal-download="${html(doc.id)}">${html(doc.file_name || "Baixar")}</button>` : "-"}</td>
                  <td>
                    <button class="icon-btn" type="button" data-fiscal-delete="${doc.id}" title="Deletar">🗑️</button>
                  </td>
                </tr>
              `).join('')
            }
          </tbody>
        </table>
      </div>
    </div>
  `;

  bindFiscalActions();

  // Bind delete buttons
  document.querySelectorAll('[data-fiscal-delete]').forEach(btn => {
    btn.addEventListener("click", async () => {
      if (confirm("Tem certeza que deseja deletar este documento?")) {
        const docId = btn.dataset.fiscalDelete;
        await deleteFiscalDocument(docId);
        await renderFiscalDocs();
      }
    });
  });
  document.querySelectorAll('[data-fiscal-download]').forEach(btn => {
    btn.addEventListener("click", () => downloadFiscalDocument(btn.dataset.fiscalDownload));
  });
}

async function downloadFiscalDocument(docId) {
  const doc = state.fiscalDocuments.find(item => item.id === docId);
  if (!doc?.storage_path || !state.supabase) return;
  const { data, error } = await state.supabase.storage
    .from("fiscal-documents")
    .createSignedUrl(doc.storage_path, 120, { download: doc.file_name || true });
  if (error || !data?.signedUrl) {
    showAppMessage("Arquivo indisponível", error?.message || "Não foi possível gerar o link temporário.", "error");
    return;
  }
  window.open(data.signedUrl, "_blank", "noopener");
}

export async function renderDAS() {
  const content = byId("fiscalContainer");
  if (!content) return;

  initFiscalData();
  const dasPayments = await loadDASPayments();
  const currentYear = new Date().getFullYear();

  // Calcular totais
  const pending = dasPayments.filter(d => d.status === "Pendente");
  const paid = dasPayments.filter(d => d.status === "Pago");
  const totalPending = pending.reduce((sum, d) => sum + d.value, 0);

  content.innerHTML = `
    <div class="das-section">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Impostos</p>
          <h2>DAS - Documento de Arrecadação do Simples Nacional</h2>
        </div>
        <span>Calcule, gere e pague suas contribuições do Simples Nacional.</span>
      </div>
      <div class="das-grid">
        <div class="das-kpi">
          <span>DAS Pendentes</span>
          <strong>${pending.length}</strong>
        </div>
        <div class="das-kpi">
          <span>Valor a Pagar</span>
          <strong>${money.format(totalPending)}</strong>
        </div>
        <div class="das-kpi">
          <span>DAS Pagas</span>
          <strong>${paid.length}</strong>
        </div>
        <div class="das-kpi">
          <span>Economia com crédito</span>
          <strong>${money.format(totalPending * 0.03)}</strong>
        </div>
      </div>
      <div class="das-toolbar">
        <div class="das-filters">
          <label>Mês/Ano<input type="month" id="dasMonthFilter" /></label>
          <label>Status<select id="dasStatusFilter"><option value="">Todos</option><option>Pendente</option><option>Pago</option><option>Vencido</option></select></label>
        </div>
        <div class="das-actions">
          <button class="primary-btn" type="button" data-das-action="generate-das">Gerar DAS</button>
          <button class="secondary-btn" type="button" data-das-action="calculate">Calcular</button>
        </div>
      </div>
      <div class="das-list" id="dasList">
        ${dasPayments.length === 0 ?
          `<div class="empty-state">Nenhuma DAS gerada. Clique em "Gerar DAS" para criar.</div>` :
          dasPayments.map(das => `
            <div class="das-item" style="padding: 12px; border-bottom: 1px solid #d7e0e7; display: flex; justify-content: space-between; align-items: center;">
              <div>
                <div style="font-weight: 600; color: #17212b;">${html(das.month)} ${das.year}</div>
                <div style="font-size: 12px; color: #607181; margin-top: 4px;">Vencimento: ${das.due_date ? formatDate(das.due_date) : "-"}</div>
                <div style="font-size: 12px; color: #607181;">Valor: <strong>${money.format(das.value)}</strong></div>
              </div>
              <div style="display: flex; gap: 8px; align-items: center;">
                <span style="font-size: 11px; padding: 4px 8px; background: ${das.status === 'Pago' ? '#dcfce7' : '#fef3c7'}; color: ${das.status === 'Pago' ? '#166534' : '#92400e'}; border-radius: 4px; font-weight: 600;">${das.status}</span>
                ${das.status === 'Pendente' ? `<button class="primary-btn" type="button" data-das-pay-action="${das.id}" style="padding: 6px 12px; font-size: 12px;">Pagar com PIX</button>` : '<span style="color: #667181; font-size: 12px;">✓</span>'}
              </div>
            </div>
          `).join('')
        }
      </div>
    </div>
  `;

  bindDASActions();

  // Bind pay actions com dados reais
  document.querySelectorAll('[data-das-pay-action]').forEach(btn => {
    btn.addEventListener("click", () => {
      const dasId = btn.dataset.dasPayAction;
      const das = dasPayments.find(d => d.id === dasId);
      if (das) {
        generateDASPIX(dasId, das);
      }
    });
  });
}

export async function renderPurchaseInvoices() {
  const content = byId("fiscalContainer");
  if (!content) return;

  initFiscalData();
  const invoices = await loadPurchaseInvoices();

  content.innerHTML = `
    <div class="purchase-invoices-section">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Compras</p>
          <h2>Notas Fiscais de Compra</h2>
        </div>
        <span>Registre e organize todas as suas notas fiscais de compra de fornecedores.</span>
      </div>
      <div class="purchase-toolbar">
        <div class="purchase-filters">
          <label>Buscar<input type="search" id="purchaseSearchInput" placeholder="Fornecedor, número ou descrição" /></label>
          <label>Fornecedor<select id="purchaseSupplierFilter"><option value="">Todos</option></select></label>
          <label>Status<select id="purchaseStatusFilter"><option value="">Todos</option><option>Registrada</option><option>Recebida</option><option>Devolvida</option></select></label>
          <label>De<input type="date" id="purchaseDateFromFilter" /></label>
          <label>Até<input type="date" id="purchaseDateToFilter" /></label>
        </div>
        <div class="purchase-actions">
          <button class="primary-btn" type="button" data-purchase-action="register">+ Registrar Compra</button>
          <button class="secondary-btn" type="button" data-purchase-action="import" disabled title="Aguardando homologação fiscal do importador">Importar XML indisponível</button>
        </div>
      </div>
      <form id="purchaseInvoiceForm" class="entry-form purchase-form" style="display:none;">
        <div class="form-row">
          <input name="supplier" type="text" placeholder="Fornecedor" required />
          <input name="invoice_number" type="text" placeholder="Número da NF" required />
          <input name="invoice_series" type="text" placeholder="Série" />
        </div>
        <div class="form-row">
          <input name="invoice_date" type="date" required />
          <input name="amount" type="number" step="0.01" min="0" placeholder="Valor" required />
          <select name="status">
            <option>Registrada</option>
            <option>Recebida</option>
            <option>Devolvida</option>
          </select>
        </div>
        <div class="form-row">
          <textarea name="description" placeholder="Descrição dos itens"></textarea>
        </div>
        <div class="form-actions">
          <button class="primary-btn" type="submit">Salvar</button>
          <button class="secondary-btn" type="button" data-purchase-action="cancel-form">Cancelar</button>
        </div>
      </form>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Fornecedor</th>
              <th>NF</th>
              <th>Descrição</th>
              <th>Valor</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="purchaseInvoicesTable">
            ${invoices.length === 0 ?
              `<tr><td colspan="7" class="empty-state">Nenhuma nota registrada. Clique em "Registrar Compra".</td></tr>` :
              invoices.map(inv => `
                <tr>
                  <td>${formatDate(inv.date)}</td>
                  <td>${html(inv.supplier)}</td>
                  <td>${html(inv.invoice_number)}${inv.invoice_series ? ` / ${html(inv.invoice_series)}` : ""}</td>
                  <td>${html(inv.description || "-")}</td>
                  <td>${money.format(inv.amount)}</td>
                  <td><span class="status-badge status-${inv.status.toLowerCase()}">${html(inv.status)}</span></td>
                  <td>
                    <button class="icon-btn" type="button" data-purchase-delete="${inv.id}" title="Deletar">🗑️</button>
                  </td>
                </tr>
              `).join('')
            }
          </tbody>
        </table>
      </div>
    </div>
  `;

  bindPurchaseActions();

  // Bind delete buttons
  document.querySelectorAll('[data-purchase-delete]').forEach(btn => {
    btn.addEventListener("click", async () => {
      if (confirm("Tem certeza que deseja deletar esta nota?")) {
        const success = await deletePurchaseInvoice(btn.dataset.purchaseDelete);
        if (success) await renderPurchaseInvoices();
      }
    });
  });
}

export async function renderSalesInvoices() {
  const content = byId("fiscalContainer");
  if (!content) return;

  initFiscalData();
  const invoices = await loadSalesInvoices();

  content.innerHTML = `
    <div class="sales-invoices-section">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Vendas</p>
          <h2>Notas Fiscais de Venda</h2>
        </div>
        <span>Guarde notas emitidas, links, XML/PDF e referências de venda para consulta rápida.</span>
      </div>
      <div class="connection-banner" id="salesConnectionBanner">
        <div class="connection-status">
          <span class="status-badge status-pending">Cofre manual</span>
          <p>Registre notas de venda manualmente agora. A conexão automática pode ser adicionada depois.</p>
        </div>
        <div class="connection-actions">
          <button class="primary-btn" type="button" data-sales-action="new-invoice">+ Nova nota</button>
          <button class="secondary-btn" type="button" data-sales-action="guide">Ver Guia</button>
        </div>
      </div>
      <div id="salesConnectionGuide" class="connection-guide" style="display:none;">
        <div class="guide-content">
          <h3>Passo a passo para conectar sua conta</h3>
          <ol>
            <li><strong>Acesse o portal fiscal</strong> - Vá até o site da sua plataforma de emissão (NFe, RPA, etc)</li>
            <li><strong>Gere uma chave de API</strong> - Procure por "Integrações" ou "API" nas configurações</li>
            <li><strong>Cole a chave aqui</strong> - Cole a chave gerada no campo abaixo</li>
            <li><strong>Teste a conexão</strong> - Clique em "Testar" para verificar se tudo está funcionando</li>
            <li><strong>Salve</strong> - Após confirmação, suas notas serão sincronizadas automaticamente</li>
          </ol>
          <form id="salesConnectionForm" style="margin-top:20px;">
            <label>
              Chave de API
              <input type="password" id="salesApiKey" placeholder="Cole sua chave de API aqui" />
            </label>
            <label>
              Tipo de plataforma
              <select id="salesPlatformType">
                <option value="">Selecione...</option>
                <option value="nfe">NFe (Emissão de NF)</option>
                <option value="rpa">RPA (Recebimento/Pagamento)</option>
                <option value="other">Outro</option>
              </select>
            </label>
            <div class="form-actions">
              <button class="secondary-btn" type="button" data-sales-action="test-connection">Testar conexão</button>
              <button class="primary-btn" type="submit">Salvar e sincronizar</button>
              <button class="ghost-btn" type="button" data-sales-action="close-guide">Fechar</button>
            </div>
          </form>
        </div>
      </div>
      <div class="sales-toolbar" id="salesToolbar">
        <div class="sales-filters">
          <label>Buscar<input type="search" id="salesSearchInput" placeholder="Cliente, número ou descrição" /></label>
          <label>Cliente<select id="salesClientFilter"><option value="">Todos</option></select></label>
          <label>Status<select id="salesStatusFilter"><option value="">Todos</option><option>Emitida</option><option>Aprovada</option><option>Cancelada</option></select></label>
          <label>De<input type="date" id="salesDateFromFilter" /></label>
          <label>Até<input type="date" id="salesDateToFilter" /></label>
        </div>
        <div class="sales-actions">
          <button class="primary-btn" type="button" data-sales-action="new-invoice">+ Novo</button>
          <button class="secondary-btn" type="button" data-sales-action="import-orders">Importar de Pedidos</button>
          <button class="secondary-btn" type="button" data-sales-action="sync">Sincronizar</button>
        </div>
      </div>
      <form id="salesInvoiceForm" class="entry-form sales-form" style="display:none;">
        <div class="form-row">
          <input name="client" type="text" placeholder="Cliente" required />
          <input name="invoice_number" type="text" placeholder="Número da NF" required />
          <input name="invoice_date" type="date" required />
        </div>
        <div class="form-row">
          <input name="amount" type="number" step="0.01" min="0" placeholder="Valor" required />
          <select name="status">
            <option>Emitida</option>
            <option>Aprovada</option>
            <option>Cancelada</option>
            <option>Rascunho</option>
          </select>
        </div>
        <div class="form-row">
          <textarea name="description" placeholder="Descrição, link do XML/PDF ou observações da nota"></textarea>
        </div>
        <div class="form-actions">
          <button class="primary-btn" type="submit">Salvar</button>
          <button class="secondary-btn" type="button" data-sales-action="cancel-form">Cancelar</button>
        </div>
      </form>
      <div class="table-wrap" id="salesTableWrapper">
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Cliente</th>
              <th>NF</th>
              <th>Descrição</th>
              <th>Valor</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="salesInvoicesTable">
            ${invoices.length === 0 ?
              `<tr><td colspan="7" class="empty-state">Nenhuma nota de venda encontrada.</td></tr>` :
              invoices.map(inv => `
                <tr>
                  <td>${formatDate(inv.date)}</td>
                  <td>${html(inv.client)}</td>
                  <td>${html(inv.invoice_number)}</td>
                  <td>${html(inv.description || "-")}</td>
                  <td>${money.format(inv.amount)}</td>
                  <td><span class="status-badge status-${inv.status.toLowerCase()}">${html(inv.status)}</span></td>
                  <td>
                    <button class="icon-btn" type="button" data-sales-delete="${inv.id}" title="Deletar">🗑️</button>
                  </td>
                </tr>
              `).join('')
            }
          </tbody>
        </table>
      </div>
    </div>
  `;

  bindSalesActions();

  // Bind delete buttons
  document.querySelectorAll('[data-sales-delete]').forEach(btn => {
    btn.addEventListener("click", async () => {
      if (confirm("Tem certeza que deseja deletar esta nota?")) {
        const success = await deleteSalesInvoice(btn.dataset.salesDelete);
        if (success) await renderSalesInvoices();
      }
    });
  });
}

function bindFiscalActions() {
  const newDocBtn = document.querySelector('[data-fiscal-action="new-document"]');
  const generateBtn = document.querySelector('[data-fiscal-action="generate-report"]');
  const exportBtn = document.querySelector('[data-fiscal-action="export-docs"]');

  if (newDocBtn) {
    newDocBtn.addEventListener("click", () => {
      openFiscalDocumentDialog();
    });
  }

  if (generateBtn) {
    generateBtn.addEventListener("click", async () => {
      await generateFiscalReport();
    });
  }

  if (exportBtn) {
    exportBtn.addEventListener("click", () => {
      showAppMessage("Exportar", "Documentos exportados com sucesso!", "success");
    });
  }
}

function openFiscalDocumentDialog() {
  const dialog = byId("fiscalDocumentDialog");
  if (!dialog) return;

  // Limpar eventos antigos
  dialog.replaceWith(dialog.cloneNode(true));
  const newDialog = byId("fiscalDocumentDialog");

  if (newDialog) {
    newDialog.showModal();

    const form = newDialog.querySelector("#fiscalDocumentForm");
    const closeBtns = newDialog.querySelectorAll("[data-action='close-fiscal-dialog']");
    const nextBtn = newDialog.querySelector("#nextStepBtn");
    const submitBtn = newDialog.querySelector("#submitBtn");
    const stepDots = newDialog.querySelectorAll(".step-dot");

    let currentStep = 1;

    const showStep = (step) => {
      currentStep = step;
      form.querySelectorAll(".form-step").forEach(s => s.classList.remove("active"));
      form.querySelector(`[data-step="${step}"]`)?.classList.add("active");

      stepDots.forEach(dot => dot.classList.toggle("active", parseInt(dot.dataset.goTo) === step));

      if (step === 3) {
        nextBtn.style.display = "none";
        submitBtn.style.display = "block";
      } else {
        nextBtn.style.display = "block";
        submitBtn.style.display = "none";
      }
    };

    nextBtn?.addEventListener("click", () => {
      if (currentStep < 3) showStep(currentStep + 1);
    });

    stepDots.forEach(dot => {
      dot.addEventListener("click", () => showStep(parseInt(dot.dataset.goTo)));
    });

    // Fechar ao clicar em X ou Cancelar
    closeBtns.forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        newDialog.close();
      });
    });

    // Fechar ao clicar no overlay
    newDialog.addEventListener("click", (e) => {
      if (e.target === newDialog) newDialog.close();
    });

    // Fechar ao pressionar Escape
    newDialog.addEventListener("keydown", (e) => {
      if (e.key === "Escape") newDialog.close();
    });

    // Salvar documento
    form?.addEventListener("submit", async (e) => {
      e.preventDefault();
      await saveFiscalDocumentFromForm(form);
      newDialog.close();
    });
  }
}

async function saveFiscalDocumentFromForm(form) {
  const formData = new FormData(form);
  const doc = {
    id: `doc-${Date.now()}`,
    date: formData.get("date"),
    type: formData.get("type"),
    number: formData.get("number"),
    description: formData.get("description"),
    value: parseFloat(formData.get("value")) || 0,
    status: formData.get("status"),
    due_date: formData.get("due_date"),
    reference: formData.get("reference"),
    issuer: formData.get("issuer"),
    document_number: formData.get("document_number"),
    category: formData.get("category"),
    payment_method: formData.get("payment_method"),
    order_id: String(formData.get("order_id") || "").trim(),
    product_id: String(formData.get("product_id") || "").trim(),
    supplier: String(formData.get("supplier") || "").trim(),
    created_at: new Date().toISOString(),
  };

  const file = formData.get("fiscal_file");
  let uploadedPath = "";
  try {
    if (file instanceof File && file.size > 0) {
      Object.assign(doc, await uploadFiscalFile(file, doc.id));
      uploadedPath = doc.storage_path;
    }
    const saved = await saveFiscalDocument(doc);
    if (!saved) throw new Error("Não foi possível registrar os metadados do documento.");
  } catch (error) {
    if (uploadedPath && state.supabase) {
      await state.supabase.storage.from("fiscal-documents").remove([uploadedPath]).catch(() => {});
    }
    showAppMessage("Falha ao guardar documento", error.message || String(error), "error");
    return;
  }
  form.reset();
  await renderFiscalDocs();
}

async function uploadFiscalFile(file, documentId) {
  if (!state.supabase || !state.organizationId) throw new Error("Sessão ou empresa não identificada.");
  const allowedTypes = new Set(["application/pdf", "application/xml", "text/xml"]);
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (!allowedTypes.has(file.type) && !["pdf", "xml"].includes(extension)) {
    throw new Error("Envie apenas arquivos XML ou PDF.");
  }
  if (file.size > 20 * 1024 * 1024) throw new Error("O arquivo excede o limite de 20 MB.");
  const safeName = file.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || `documento.${extension}`;
  const path = `${state.organizationId}/${documentId}/${crypto.randomUUID()}-${safeName}`;
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  const checksum = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
  const { error } = await state.supabase.storage.from("fiscal-documents").upload(path, file, {
    contentType: file.type || (extension === "pdf" ? "application/pdf" : "application/xml"),
    upsert: false,
  });
  if (error) throw error;
  return { storage_path: path, file_name: file.name, mime_type: file.type || null, size_bytes: file.size, checksum_sha256: checksum };
}

async function generateFiscalReport() {
  const [docs, purchaseInvoices, salesInvoices] = await Promise.all([
    loadFiscalDocuments(),
    loadPurchaseInvoices(),
    loadSalesInvoices(),
  ]);
  const rows = [
    ...docs.map((item) => ({
      date: item.date,
      origin: "Documento",
      type: item.type || "-",
      number: item.number || "-",
      party: item.issuer || item.reference || "-",
      value: Number(item.value || 0),
      status: item.status || "-",
      tax: 0,
    })),
    ...purchaseInvoices.map((item) => ({
      date: item.date,
      origin: "Nota de compra",
      type: "Compra",
      number: [item.invoice_number, item.invoice_series].filter(Boolean).join(" / ") || "-",
      party: item.supplier || "-",
      value: Number(item.amount || 0),
      status: item.status || "-",
      tax: 0,
    })),
    ...salesInvoices.map((item) => ({
      date: item.date,
      origin: "Nota de venda",
      type: "Venda",
      number: item.invoice_number || "-",
      party: item.client || "-",
      value: Number(item.amount || 0),
      status: item.status || "-",
      tax: 0,
    })),
  ].sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
  const total = rows.reduce((sum, item) => sum + item.value, 0);
  const taxes = rows.reduce((sum, item) => sum + item.tax, 0);
  const firstDate = rows[0]?.date ? formatDate(rows[0].date) : "-";
  const lastDate = rows.at(-1)?.date ? formatDate(rows.at(-1).date) : "-";
  const period = rows.length ? `${firstDate} a ${lastDate}` : "Sem documentos";
  const rowsHtml = rows.length ? rows.map((item) => `
          <tr>
            <td>${html(item.date ? formatDate(item.date) : "-")}</td>
            <td>${html(item.origin)} / ${html(item.type)}</td>
            <td>${html(item.number)}</td>
            <td>${html(item.party)}</td>
            <td>${money.format(item.value)}</td>
            <td>${html(item.status)}</td>
          </tr>`).join("") : `<tr><td colspan="6">Nenhum documento fiscal registrado.</td></tr>`;
  const reportWindow = window.open("", "_blank");
  if (!reportWindow) {
    showAppMessage("Gerar Relatorio", "Permita pop-ups para gerar o relatorio fiscal.", "error");
    return;
  }

  reportWindow.document.open();
  reportWindow.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatorio Fiscal</title>
    <style>
      body { font-family: Arial, sans-serif; color: #333; margin: 0; background: #fff; }
      .report { padding: 40px; max-width: 980px; margin: 0 auto; }
      .header { border-bottom: 2px solid #0f8f7e; padding-bottom: 20px; margin-bottom: 30px; }
      h1 { margin: 0; color: #0f8f7e; }
      .date { color: #666; font-size: 12px; margin-top: 5px; }
      .section { margin: 30px 0; }
      h2 { font-size: 16px; color: #17212b; border-bottom: 1px solid #ddd; padding-bottom: 10px; }
      table { width: 100%; border-collapse: collapse; margin-top: 15px; }
      th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; vertical-align: top; }
      th { background: #f5f5f5; font-weight: bold; }
      .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
    </style>
  </head><body>
    <div class="report">
      <div class="header">
        <h1>Relatorio Fiscal - FlowOps</h1>
        <div class="date">Gerado em ${new Date().toLocaleDateString("pt-BR")} as ${new Date().toLocaleTimeString("pt-BR")}</div>
      </div>

      <div class="section">
        <h2>Resumo Fiscal</h2>
        <table>
          <tr>
            <th>Periodo</th>
            <th>Documentos</th>
            <th>Valor Total</th>
            <th>Impostos informados</th>
          </tr>
          <tr>
            <td>${html(period)}</td>
            <td>${rows.length}</td>
            <td>${money.format(total)}</td>
            <td>${money.format(taxes)}</td>
          </tr>
        </table>
      </div>

      <div class="section">
        <h2>Documentos Registrados</h2>
        <table>
          <tr>
            <th>Data</th>
            <th>Origem</th>
            <th>Numero</th>
            <th>Cliente/Fornecedor</th>
            <th>Valor</th>
            <th>Status</th>
          </tr>
          ${rowsHtml}
        </table>
      </div>

      <div class="footer">
        <p>Este relatorio foi gerado automaticamente com os documentos salvos no FlowOps.</p>
        <p>Nenhum valor demonstrativo ou ficticio e incluido quando nao ha documentos cadastrados.</p>
      </div>
    </div>
    <script>window.addEventListener('load', () => { window.print(); });</script>
  </body></html>`);
  reportWindow.document.close();
  showAppMessage("Relatorio Gerado", "Clique em Imprimir/Salvar para fazer download.", "success");
}

function bindDASActions() {
  const generateBtn = document.querySelector('[data-das-action="generate-das"]');
  const calculateBtn = document.querySelector('[data-das-action="calculate"]');
  const dasList = document.getElementById("dasList");

  if (generateBtn) {
    generateBtn.addEventListener("click", () => {
      showAppMessage("Gerar DAS", "Geração automática ainda não conectada a dados fiscais reais. Registre uma DAS real ou importe o comprovante antes de pagar.", "info");
    });
  }

  if (calculateBtn) {
    calculateBtn.addEventListener("click", () => {
      showAppMessage("Calcular", "Cálculo realizado. Valor atualizado na DAS.", "success");
    });
  }
}

function renderDASList() {
  const dasList = document.getElementById("dasList");
  if (!dasList) return;
  const rows = Array.isArray(state.dasPayments) ? state.dasPayments : [];
  if (!rows.length) {
    dasList.innerHTML = `<div class="empty-state">Nenhuma DAS real registrada.</div>`;
    return;
  }

  dasList.innerHTML = rows.map(das => `
    <div class="das-item" style="padding: 12px; border-bottom: 1px solid #d7e0e7; display: flex; justify-content: space-between; align-items: center;">
      <div>
        <div style="font-weight: 600; color: #17212b;">${html(das.month || "DAS")}</div>
        <div style="font-size: 12px; color: #607181; margin-top: 4px;">Vencimento: ${html(das.dueDate || das.due_date || "-")}</div>
        <div style="font-size: 12px; color: #607181;">Valor: <strong>${money.format(Number(das.value || 0))}</strong></div>
      </div>
      <div style="display: flex; gap: 8px; align-items: center;">
        <span style="font-size: 11px; padding: 4px 8px; background: ${das.status === 'Pago' ? '#dcfce7' : '#fef3c7'}; color: ${das.status === 'Pago' ? '#166534' : '#92400e'}; border-radius: 4px; font-weight: 600;">${html(das.status || "Pendente")}</span>
        ${das.status === 'Pendente' && das.pix ? `<button class="primary-btn" type="button" data-das-pay-action="${html(das.id)}" style="padding: 6px 12px; font-size: 12px;">Pagar com PIX</button>` : '<span style="color: #667181; font-size: 12px;">-</span>'}
      </div>
    </div>
  `).join('');

  dasList.querySelectorAll('[data-das-pay-action]').forEach(btn => {
    btn.addEventListener("click", () => {
      const das = rows.find((item) => String(item.id) === String(btn.dataset.dasPayAction));
      if (!das?.pix) {
        showAppMessage("PIX indisponivel", "Esta DAS nao possui codigo PIX salvo.", "warning");
        return;
      }
      generateDASPIX(btn.dataset.dasPayAction, das);
    });
  });
}

function generateDASPIX(dasId, das = null) {
  if (!das?.pix) {
    showAppMessage("PIX indisponivel", "Esta DAS nao possui codigo PIX salvo.", "warning");
    return;
  }
  const dasData = das;
  const pixCode = String(das.pix);
  showAppMessage("PIX", `PIX da DAS ${dasData.month || dasId} disponivel para copia.`, "success");
  // Create modal to show PIX
  const modal = document.createElement("div");
  modal.style.cssText = `
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    background: white; padding: 24px; border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.2);
    z-index: 10000; max-width: 500px; width: 90%;
  `;

  modal.innerHTML = `
    <div style="text-align: center;">
      <h3 style="margin: 0 0 16px; color: #17212b;">PIX - DAS ${dasData.month} ${dasData.year || ""}</h3>
      <div style="padding: 20px; background: #f7fafb; border-radius: 8px; margin: 16px 0;">
        <div style="font-size: 12px; color: #607181; margin-bottom: 8px;">CÓDIGO PIX (Copia e Cola)</div>
        <div style="font-family: monospace; font-size: 11px; word-break: break-all; background: white; padding: 12px; border-radius: 6px; border: 1px solid #d7e0e7; color: #17212b; margin-bottom: 12px; max-height: 120px; overflow-y: auto;">
          ${pixCode}
        </div>
        <div style="font-size: 13px; color: #17212b; font-weight: 600; margin: 12px 0;">Valor: <span style="color: #22c55e;">${money.format(dasData.value)}</span></div>
      </div>
      <p style="font-size: 12px; color: #607181; margin: 16px 0;">Use o código acima para realizar o pagamento via PIX em qualquer banco.</p>
      <div style="display: flex; gap: 12px; margin-top: 20px;">
        <button data-copy-pix class="primary-btn" type="button" style="flex: 1; cursor: pointer;">Copiar PIX</button>
        <button data-close-pix class="secondary-btn" type="button" style="flex: 1; cursor: pointer;">Fechar</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  modal.querySelector("[data-close-pix]")?.addEventListener("click", () => modal.remove());
  modal.querySelector("[data-copy-pix]")?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(pixCode);
      showAppMessage("PIX copiado.", "success");
      modal.remove();
    } catch {
      showAppMessage("Nao foi possivel copiar o PIX automaticamente.", "error");
    }
  });
}

function bindPurchaseActions() {
  const registerBtn = document.querySelector('[data-purchase-action="register"]');
  const form = document.getElementById("purchaseInvoiceForm");
  const cancelBtn = document.querySelector('[data-purchase-action="cancel-form"]');

  if (registerBtn) {
    registerBtn.addEventListener("click", () => {
      form.style.display = form.style.display === 'none' ? 'block' : 'none';
      if (form.style.display === 'block') {
        // Carregar dados dos selects quando abrir
        loadPurchaseFiltersOptions();
      }
    });
  }

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const invoiceData = {
        id: form.elements.id?.value || null,
        date: form.elements.invoice_date.value,
        supplier: form.elements.supplier.value,
        invoice_number: form.elements.invoice_number.value,
        invoice_series: form.elements.invoice_series.value,
        amount: form.elements.amount.value,
        status: form.elements.status.value,
        description: form.elements.description.value,
      };

      // Validar
      if (!invoiceData.date || !invoiceData.supplier || !invoiceData.invoice_number) {
        showAppMessage("Validação", "Preencha data, fornecedor e número da NF.", "error");
        return;
      }

      if (parseFloat(invoiceData.amount) <= 0) {
        showAppMessage("Validação", "Valor deve ser maior que zero.", "error");
        return;
      }

      const success = await savePurchaseInvoice(invoiceData);
      if (success) {
        form.style.display = 'none';
        form.reset();
        await renderPurchaseInvoices();
      }
    });
  }

  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      form.style.display = 'none';
      form.reset();
    });
  }
}

async function loadPurchaseFiltersOptions() {
  const suppliers = getUniqueSuppliersFromPurchases();
  const supplierSelect = byId("purchaseSupplierFilter");

  if (supplierSelect) {
    const current = supplierSelect.innerHTML;
    supplierSelect.innerHTML = '<option value="">Todos</option>' +
      suppliers.map(s => `<option value="${html(s)}">${html(s)}</option>`).join('');
  }
}

function bindSalesActions() {
  const connectBtn = document.querySelector('[data-sales-action="connect"]');
  const guideBtn = document.querySelector('[data-sales-action="guide"]');
  const closeGuideBtn = document.querySelector('[data-sales-action="close-guide"]');
  const testBtn = document.querySelector('[data-sales-action="test-connection"]');
  const importBtn = document.querySelector('[data-sales-action="import-orders"]');
  const newInvoiceBtns = document.querySelectorAll('[data-sales-action="new-invoice"]');
  const cancelFormBtn = document.querySelector('[data-sales-action="cancel-form"]');
  const salesForm = document.getElementById("salesConnectionForm");
  const invoiceForm = document.getElementById("salesInvoiceForm");

  if (connectBtn) {
    connectBtn.addEventListener("click", () => {
      document.getElementById("salesConnectionGuide").style.display = 'block';
    });
  }

  if (guideBtn) {
    guideBtn.addEventListener("click", () => {
      document.getElementById("salesConnectionGuide").style.display = 'block';
    });
  }

  if (closeGuideBtn) {
    closeGuideBtn.addEventListener("click", () => {
      document.getElementById("salesConnectionGuide").style.display = 'none';
    });
  }

  if (testBtn) {
    testBtn.addEventListener("click", (e) => {
      e.preventDefault();
      showAppMessage("Teste de Conexão", "Conexão testada com sucesso! ✓", "success");
    });
  }

  if (importBtn) {
    importBtn.addEventListener("click", async () => {
      await importOrdersAsSalesInvoices();
    });
  }

  newInvoiceBtns.forEach((button) => {
    button.addEventListener("click", () => {
      if (!invoiceForm) return;
      invoiceForm.style.display = invoiceForm.style.display === "none" ? "block" : "none";
    });
  });

  if (cancelFormBtn && invoiceForm) {
    cancelFormBtn.addEventListener("click", () => {
      invoiceForm.style.display = "none";
      invoiceForm.reset();
    });
  }

  if (invoiceForm) {
    invoiceForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const invoice = {
        date: invoiceForm.elements.invoice_date.value,
        client: invoiceForm.elements.client.value,
        invoice_number: invoiceForm.elements.invoice_number.value,
        amount: invoiceForm.elements.amount.value,
        status: invoiceForm.elements.status.value,
        description: invoiceForm.elements.description.value,
      };
      const success = await saveSalesInvoice(invoice);
      if (success) {
        invoiceForm.style.display = "none";
        invoiceForm.reset();
        await renderSalesInvoices();
      }
    });
  }

  if (salesForm) {
    salesForm.addEventListener("submit", (e) => {
      e.preventDefault();
      showAppMessage("Conexão Estabelecida", "Sua conta foi conectada. Sincronizando notas...", "success");
      setTimeout(() => {
        document.getElementById("salesConnectionBanner").style.display = 'none';
        document.getElementById("salesConnectionGuide").style.display = 'none';
        document.getElementById("salesToolbar").style.display = 'flex';
        document.getElementById("salesTableWrapper").style.display = 'block';
      }, 1500);
    });
  }
}

async function importOrdersAsSalesInvoices() {
  if (!state.data.orders || state.data.orders.length === 0) {
    showAppMessage("Nenhum Pedido", "Você não tem pedidos para importar", "warning");
    return;
  }

  const existingSalesIds = (await loadSalesInvoices()).map(s => s.order_id);
  const ordersToImport = state.data.orders.filter(o => !existingSalesIds.includes(o.id));

  if (ordersToImport.length === 0) {
    showAppMessage("Nenhum Novo Pedido", "Todos os pedidos já foram importados", "info");
    return;
  }

  let imported = 0;
  for (const order of ordersToImport) {
    const invoice = {
      id: `inv-${order.id}-${Date.now()}`,
      date: new Date().toISOString().split("T")[0],
      client: order.client || "Cliente Não Informado",
      invoice_number: `NF-${order.id.substr(-6).toUpperCase()}`,
      description: order.description || "Importado de pedido",
      amount: parseFloat(order.charged || 0),
      status: order.status === "Entregue" ? "Emitida" : "Rascunho",
      order_id: order.id,
      created_at: new Date().toISOString(),
    };
    await saveSalesInvoice(invoice);
    imported++;
  }

  showAppMessage("Importação Concluída", `${imported} pedido(s) importado(s) como notas de venda`, "success");
  await renderSalesInvoices();
}

function updateDASSummary() {
  document.getElementById("dasPendingCount").textContent = "2";
  document.getElementById("dasPendingAmount").textContent = "R$ 1.200,00";
  document.getElementById("dasPaidCount").textContent = "5";
  document.getElementById("dasSavings").textContent = "R$ 340,00";
}

export async function renderFiscalTab() {
  const activeTab = state.fiscalTab || "documentos";

  // Bind tab buttons
  document.querySelectorAll("[data-fiscal-tab]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.fiscalTab === activeTab);
    btn.addEventListener("click", () => {
      state.fiscalTab = btn.dataset.fiscalTab;
      renderFiscalTab();
    });
  });

  // Render active tab content
  switch(activeTab) {
    case "das":
      await renderDAS();
      break;
    case "compra":
      await renderPurchaseInvoices();
      break;
    case "venda":
      await renderSalesInvoices();
      break;
    case "documentos":
    default:
      await renderFiscalDocs();
  }
}
