import { state } from "../core/state.js";
import { byId, html, showAppMessage, flashActionMessage } from "../core/dom.js";
import { recordAudit } from "./logs.js";

// ========================================================================
// MÓDULO FISCAL E DOCUMENTOS (Prompt 10)
// Tabs: Visão geral, Notas venda, Notas compra, DAS MEI, Declaração, Arquivo, Relatórios, Config
// ========================================================================

// ========== A. CONFIGURAÇÕES FISCAIS ==========

export async function getFiscalSettings() {
  if (!state.supabase) return null;

  const { data, error } = await state.supabase
    .from("fiscal_settings")
    .select("*")
    .eq("organization_id", state.organizationId)
    .single();

  return data || null;
}

export async function saveFiscalSettings(settings) {
  if (!state.supabase) return false;

  const payload = {
    organization_id: state.organizationId,
    tipo_empresa: settings.tipo_empresa,
    cnpj: settings.cnpj,
    razao_social: settings.razao_social,
    cnae: settings.cnae,
    email_fiscal: settings.email_fiscal,
    vencimento_das: settings.vencimento_das,
    valor_das: settings.valor_das,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await state.supabase
    .from("fiscal_settings")
    .upsert(payload)
    .select()
    .single();

  if (error) {
    showAppMessage(`Erro ao salvar configurações: ${error.message}`, "error");
    return false;
  }

  await recordAudit("update", "fiscal_settings", state.organizationId, "Configurações Fiscais", null, data, "manual");
  flashActionMessage("✅ Configurações fiscais salvas!");
  return true;
}

// ========== B. NOTAS DE VENDA ==========

export async function getFiscalSalesDocuments(filters = {}) {
  if (!state.supabase) return [];

  let query = state.supabase
    .from("fiscal_sales_documents")
    .select("*")
    .eq("organization_id", state.organizationId);

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.marketplace) query = query.eq("marketplace", filters.marketplace);
  if (filters.year) query = query.eq("year", filters.year);

  const { data, error } = await query.order("created_at", { ascending: false });

  return data || [];
}

export async function linkSalesDocument(orderId, documentData) {
  if (!state.supabase) return false;

  const payload = {
    organization_id: state.organizationId,
    order_id: orderId,
    sale_id: documentData.sale_id,
    marketplace: documentData.marketplace,
    customer_name: documentData.customer_name,
    invoice_number: documentData.invoice_number,
    invoice_key: documentData.invoice_key,
    status: documentData.status || "pendente",
    total_amount: documentData.total_amount,
    xml_path: documentData.xml_path,
    danfe_path: documentData.danfe_path,
    source: documentData.source || "manual",
    created_at: new Date().toISOString()
  };

  const { data, error } = await state.supabase
    .from("fiscal_sales_documents")
    .insert(payload)
    .select()
    .single();

  if (error) {
    showAppMessage(`Erro ao vincular documento: ${error.message}`, "error");
    return false;
  }

  await recordAudit("create", "fiscal_sales_document", data.id, documentData.invoice_number, null, data, "manual");
  flashActionMessage("✅ Documento vinculado com sucesso!");
  return data;
}

// ========== C. NOTAS DE COMPRA ==========

export async function getFiscalPurchaseDocuments(filters = {}) {
  if (!state.supabase) return [];

  let query = state.supabase
    .from("fiscal_purchase_documents")
    .select("*")
    .eq("organization_id", state.organizationId);

  if (filters.category) query = query.eq("category", filters.category);
  if (filters.year) query = query.eq("year", filters.year);

  const { data, error } = await query.order("created_at", { ascending: false });

  return data || [];
}

export async function recordPurchaseDocument(supplierData) {
  if (!state.supabase) return false;

  const payload = {
    organization_id: state.organizationId,
    supplier_name: supplierData.supplier_name,
    category: supplierData.category,
    total_amount: supplierData.total_amount,
    payment_status: supplierData.payment_status || "pendente",
    linked_cashflow_id: supplierData.linked_cashflow_id || null,
    xml_path: supplierData.xml_path || null,
    pdf_path: supplierData.pdf_path || null,
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    created_at: new Date().toISOString()
  };

  const { data, error } = await state.supabase
    .from("fiscal_purchase_documents")
    .insert(payload)
    .select()
    .single();

  if (error) {
    showAppMessage(`Erro ao registrar compra: ${error.message}`, "error");
    return false;
  }

  await recordAudit("create", "fiscal_purchase_document", data.id, supplierData.supplier_name, null, data, "manual");
  flashActionMessage("✅ Documento de compra registrado!");
  return data;
}

// ========== D. DAS MEI ==========

export async function getMEIDAS(filters = {}) {
  if (!state.supabase) return [];

  let query = state.supabase
    .from("fiscal_mei_das")
    .select("*")
    .eq("organization_id", state.organizationId);

  if (filters.year) query = query.eq("year", filters.year);
  if (filters.status) query = query.eq("status", filters.status);

  const { data, error } = await query.order("due_date", { ascending: false });

  return data || [];
}

export async function recordMEIDAS(dasData) {
  if (!state.supabase) return false;

  const payload = {
    organization_id: state.organizationId,
    year: dasData.year,
    month: dasData.month,
    due_date: dasData.due_date,
    amount: dasData.amount,
    status: dasData.status || "pendente",
    payment_date: dasData.payment_date || null,
    pix_code: dasData.pix_code || null,
    barcode: dasData.barcode || null,
    das_pdf_path: dasData.das_pdf_path || null,
    receipt_path: dasData.receipt_path || null,
    created_at: new Date().toISOString()
  };

  const { data, error } = await state.supabase
    .from("fiscal_mei_das")
    .insert(payload)
    .select()
    .single();

  if (error) {
    showAppMessage(`Erro ao registrar DAS: ${error.message}`, "error");
    return false;
  }

  await recordAudit("create", "fiscal_mei_das", data.id, `DAS ${dasData.month}/${dasData.year}`, null, data, "manual");
  flashActionMessage("✅ DAS registrado com sucesso!");
  return data;
}

export async function payMEIDAS(dasId, paymentData) {
  if (!state.supabase) return false;

  const { data, error } = await state.supabase
    .from("fiscal_mei_das")
    .update({
      status: "pago",
      payment_date: new Date().toISOString(),
      receipt_path: paymentData.receipt_path || null
    })
    .eq("id", dasId)
    .select()
    .single();

  if (error) {
    showAppMessage(`Erro ao marcar como pago: ${error.message}`, "error");
    return false;
  }

  await recordAudit("update", "fiscal_mei_das", dasId, `Pagamento DAS`, null, data, "manual");
  flashActionMessage("✅ DAS marcado como pago!");
  return data;
}

// ========== E. DECLARAÇÃO ANUAL ==========

export async function getAnnualDeclarations() {
  if (!state.supabase) return [];

  const { data, error } = await state.supabase
    .from("fiscal_annual_declarations")
    .select("*")
    .eq("organization_id", state.organizationId)
    .order("year", { ascending: false });

  return data || [];
}

export async function recordAnnualDeclaration(declarationData) {
  if (!state.supabase) return false;

  const payload = {
    organization_id: state.organizationId,
    year: declarationData.year,
    gross_revenue: declarationData.gross_revenue,
    commerce_revenue: declarationData.commerce_revenue,
    service_revenue: declarationData.service_revenue,
    status: declarationData.status || "pendente",
    receipt_path: declarationData.receipt_path || null,
    created_at: new Date().toISOString()
  };

  const { data, error } = await state.supabase
    .from("fiscal_annual_declarations")
    .insert(payload)
    .select()
    .single();

  if (error) {
    showAppMessage(`Erro ao registrar declaração: ${error.message}`, "error");
    return false;
  }

  await recordAudit("create", "fiscal_annual_declaration", data.id, `Declaração ${declarationData.year}`, null, data, "manual");
  flashActionMessage("✅ Declaração anual registrada!");
  return data;
}

// ========== F. ARQUIVO FISCAL ==========

export async function getFiscalArchive(filters = {}) {
  if (!state.supabase) return [];

  let query = state.supabase
    .from("fiscal_archive")
    .select("*")
    .eq("organization_id", state.organizationId);

  if (filters.document_type) query = query.eq("document_type", filters.document_type);
  if (filters.year) query = query.eq("year", filters.year);
  if (filters.month) query = query.eq("month", filters.month);

  const { data, error } = await query.order("created_at", { ascending: false });

  return data || [];
}

export async function uploadFiscalDocument(documentData) {
  if (!state.supabase) return false;

  const payload = {
    organization_id: state.organizationId,
    document_type: documentData.document_type,
    title: documentData.title,
    year: documentData.year || new Date().getFullYear(),
    month: documentData.month || new Date().getMonth() + 1,
    related_entity_type: documentData.related_entity_type || null,
    related_entity_id: documentData.related_entity_id || null,
    file_path: documentData.file_path,
    retention_until: new Date(new Date().setFullYear(new Date().getFullYear() + 5)).toISOString(),
    created_at: new Date().toISOString()
  };

  const { data, error } = await state.supabase
    .from("fiscal_archive")
    .insert(payload)
    .select()
    .single();

  if (error) {
    showAppMessage(`Erro ao fazer upload: ${error.message}`, "error");
    return false;
  }

  await recordAudit("create", "fiscal_archive", data.id, documentData.title, null, data, "manual");
  flashActionMessage("✅ Documento arquivado com sucesso!");
  return data;
}

// ========== G. ALERTAS FISCAIS ==========

export function getFiscalAlerts() {
  const alerts = [];

  // DAS vencendo (próximos 7 dias)
  if (state.fiscalData?.das) {
    const today = new Date();
    const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

    state.fiscalData.das.forEach(das => {
      if (das.status === "pendente") {
        const dueDate = new Date(das.due_date);
        if (dueDate <= nextWeek && dueDate > today) {
          alerts.push({
            type: "das_warning",
            icon: "⏰",
            title: `DAS ${das.month}/${das.year} vence em ${Math.ceil((dueDate - today) / (24 * 60 * 60 * 1000))} dias`,
            action: "fiscal",
            severity: "warning"
          });
        }
      }
    });
  }

  // Vendas sem nota fiscal
  if (state.data?.orders) {
    const unnotarized = state.data.orders.filter(o => !o.fiscal_document_id).length;
    if (unnotarized > 0) {
      alerts.push({
        type: "sales_no_invoice",
        icon: "📄",
        title: `${unnotarized} vendas sem nota fiscal`,
        action: "fiscal",
        severity: "info"
      });
    }
  }

  return alerts;
}

// ========== H. RENDERIZAÇÃO DA ABA FISCAL ==========

export function renderFiscalTab() {
  const container = byId("fiscalContainer");
  if (!container) return;

  try {
    const alerts = getFiscalAlerts();
    container.innerHTML = `
      <div class="fiscal-wrapper">
        <div class="fiscal-tabs">
          <button class="fiscal-tab-btn active" data-tab="overview">📊 Visão Geral</button>
          <button class="fiscal-tab-btn" data-tab="sales">🧾 Notas Venda</button>
          <button class="fiscal-tab-btn" data-tab="purchases">📥 Notas Compra</button>
          <button class="fiscal-tab-btn" data-tab="das">💰 DAS MEI</button>
          <button class="fiscal-tab-btn" data-tab="annual">📋 Declaração</button>
          <button class="fiscal-tab-btn" data-tab="archive">🗂️ Arquivo</button>
          <button class="fiscal-tab-btn" data-tab="reports">📈 Relatórios</button>
          <button class="fiscal-tab-btn" data-tab="settings">⚙️ Configurações</button>
        </div>

        <div class="fiscal-content">
          <div id="fiscal-overview" class="fiscal-tab-content active">
            <div class="fiscal-kpis">
              <div class="kpi-card">
                <div class="kpi-label">Notas de Venda</div>
                <div class="kpi-value">—</div>
              </div>
              <div class="kpi-card">
                <div class="kpi-label">DAS Pendentes</div>
                <div class="kpi-value">—</div>
              </div>
              <div class="kpi-card">
                <div class="kpi-label">Declaração Anual</div>
                <div class="kpi-value">—</div>
              </div>
            </div>
            <div class="fiscal-alerts">
              ${alerts.map(alert => `
                <div class="fiscal-alert ${alert.severity}">
                  <span>${alert.icon} ${alert.title}</span>
                </div>
              `).join("")}
            </div>
          </div>

          <div id="fiscal-sales" class="fiscal-tab-content">
            <h3>Notas Fiscais de Venda</h3>
            <div style="background: var(--canvas); padding: 16px; border-radius: 8px; margin: 16px 0;">
              <p style="margin: 0 0 12px 0; color: var(--muted); font-size: 13px;">As notas de venda dos seus pedidos são sincronizadas automaticamente quando conectados ao Mercado Livre ou integração fiscal.</p>
              <p style="margin: 0; color: var(--muted); font-size: 13px;">Status: <strong style="color: var(--ink);">Aguardando conexão com marketplace</strong></p>
            </div>
            <div style="margin-top: 20px; padding: 16px; border: 1px dashed var(--line); border-radius: 8px; text-align: center;">
              <p style="margin: 0 0 12px 0; font-size: 13px; color: var(--muted);">Para sincronizar notas fiscais:</p>
              <p style="margin: 0; font-size: 12px; color: var(--muted); line-height: 1.6;">1. Conecte sua conta do Mercado Livre em Marketplace > Integrações<br/>2. Notas serão importadas automaticamente<br/>3. Acompanhe aqui o histórico</p>
            </div>
          </div>

          <div id="fiscal-purchases" class="fiscal-tab-content">
            <h3>Notas Fiscais de Compra</h3>
            <div style="background: var(--canvas); padding: 16px; border-radius: 8px; margin: 16px 0;">
              <p style="margin: 0 0 12px 0; color: var(--muted); font-size: 13px;">Registre as notas fiscais de compra de fornecedores para controle de entrada.</p>
              <button style="background: var(--teal); color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 13px;">Registrar nova nota</button>
            </div>
            <div id="purchasesTableContainer" style="margin-top: 16px;">
              <p style="color: var(--muted); text-align: center; padding: 20px;">Nenhuma nota de compra registrada ainda</p>
            </div>
          </div>

          <div id="fiscal-das" class="fiscal-tab-content">
            <h3>DAS - Documento de Arrecadação do Simples</h3>
            <div style="background: var(--canvas); padding: 16px; border-radius: 8px; margin: 16px 0;">
              <p style="margin: 0; color: var(--muted); font-size: 13px;"><strong>Próximo vencimento:</strong> Não configurado</p>
            </div>
            <div style="margin-top: 16px;">
              <h4 style="margin: 0 0 12px 0; color: var(--ink);">DAS de 2026</h4>
              <table style="width: 100%; border-collapse: collapse;">
                <thead>
                  <tr style="border-bottom: 1px solid var(--line);">
                    <th style="text-align: left; padding: 8px; font-size: 12px; font-weight: 600; color: var(--muted);">Mês</th>
                    <th style="text-align: left; padding: 8px; font-size: 12px; font-weight: 600; color: var(--muted);">Vencimento</th>
                    <th style="text-align: left; padding: 8px; font-size: 12px; font-weight: 600; color: var(--muted);">Status</th>
                    <th style="text-align: center; padding: 8px; font-size: 12px; font-weight: 600; color: var(--muted);">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style="border-bottom: 1px solid var(--line);">
                    <td style="padding: 8px; font-size: 13px;">Janeiro</td>
                    <td style="padding: 8px; font-size: 13px;">25/01/2026</td>
                    <td style="padding: 8px;"><span style="background: #ff6b6b; color: white; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600;">Aberto</span></td>
                    <td style="padding: 8px; text-align: center;"><button style="background: transparent; color: var(--teal); border: 1px solid var(--teal); padding: 4px 12px; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: 600;">Pagar</button></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div id="fiscal-annual" class="fiscal-tab-content">
            <h3>Declaração Anual de Faturamento</h3>
            <div style="background: var(--canvas); padding: 16px; border-radius: 8px; margin: 16px 0;">
              <p style="margin: 0 0 12px 0; color: var(--muted); font-size: 13px;"><strong>Ano-base:</strong> 2025</p>
              <p style="margin: 0 0 12px 0; color: var(--muted); font-size: 13px;"><strong>Faturamento total:</strong> R$ 0,00</p>
              <p style="margin: 0; color: var(--muted); font-size: 13px;"><strong>Status:</strong> Não iniciada</p>
            </div>
            <div style="margin-top: 16px; padding: 16px; background: var(--canvas); border-radius: 8px; border-left: 4px solid var(--amber);">
              <p style="margin: 0 0 8px 0; color: var(--muted); font-size: 12px; font-weight: 600;">Próximas datas importantes:</p>
              <p style="margin: 0 0 4px 0; color: var(--muted); font-size: 12px;">- Declaração DASN-SIMEI: até 31 de maio</p>
              <p style="margin: 0; color: var(--muted); font-size: 12px;">- Declaração anual IR: até 31 de março</p>
            </div>
          </div>

          <div id="fiscal-archive" class="fiscal-tab-content">
            <h3>Arquivo Fiscal</h3>
            <div style="background: var(--canvas); padding: 16px; border-radius: 8px; margin: 16px 0;">
              <p style="margin: 0 0 12px 0; color: var(--muted); font-size: 13px;">Faça upload de documentos fiscais para manter tudo centralizado e organizado.</p>
              <button style="background: var(--teal); color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 13px;">Fazer upload</button>
            </div>
            <div style="margin-top: 16px; padding: 20px; text-align: center; background: var(--canvas); border-radius: 8px; border-dashed 1px var(--line);">
              <p style="color: var(--muted); margin: 0;">Nenhum documento carregado ainda</p>
            </div>
          </div>

          <div id="fiscal-reports" class="fiscal-tab-content">
            <h3>Relatórios Fiscais</h3>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 16px; margin: 16px 0;">
              <div style="background: var(--canvas); padding: 16px; border-radius: 8px; border-left: 4px solid #845ef7;">
                <h4 style="margin: 0 0 8px 0; color: var(--ink); font-size: 13px; font-weight: 600;">Resumo de Vendas</h4>
                <p style="margin: 0 0 12px 0; color: var(--muted); font-size: 12px;">Faturamento e quantidade de notas por período</p>
                <button style="background: var(--teal); color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: 600;">Gerar</button>
              </div>
              <div style="background: var(--canvas); padding: 16px; border-radius: 8px; border-left: 4px solid #00D084;">
                <h4 style="margin: 0 0 8px 0; color: var(--ink); font-size: 13px; font-weight: 600;">Resumo de Compras</h4>
                <p style="margin: 0 0 12px 0; color: var(--muted); font-size: 12px;">Despesas e notas de entrada por fornecedor</p>
                <button style="background: var(--teal); color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: 600;">Gerar</button>
              </div>
              <div style="background: var(--canvas); padding: 16px; border-radius: 8px; border-left: 4px solid #ffc107;">
                <h4 style="margin: 0 0 8px 0; color: var(--ink); font-size: 13px; font-weight: 600;">Apuração de Impostos</h4>
                <p style="margin: 0 0 12px 0; color: var(--muted); font-size: 12px;">Cálculo de impostos retidos e a recolher</p>
                <button style="background: var(--teal); color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: 600;">Gerar</button>
              </div>
            </div>
          </div>

          <div id="fiscal-settings" class="fiscal-tab-content">
            <h3>Configurações Fiscais</h3>
            <form style="background: var(--canvas); padding: 16px; border-radius: 8px; display: flex; flex-direction: column; gap: 12px;">
              <div>
                <label style="display: block; font-size: 12px; font-weight: 600; color: var(--muted); margin-bottom: 4px;">CNPJ/CPF</label>
                <input type="text" placeholder="00.000.000/0000-00" style="width: 100%; padding: 8px; border: 1px solid var(--line); border-radius: 6px; font-size: 13px; box-sizing: border-box;" />
              </div>
              <div>
                <label style="display: block; font-size: 12px; font-weight: 600; color: var(--muted); margin-bottom: 4px;">Razão Social</label>
                <input type="text" placeholder="Nome da empresa" style="width: 100%; padding: 8px; border: 1px solid var(--line); border-radius: 6px; font-size: 13px; box-sizing: border-box;" />
              </div>
              <div>
                <label style="display: block; font-size: 12px; font-weight: 600; color: var(--muted); margin-bottom: 4px;">Regime de Tributação</label>
                <select style="width: 100%; padding: 8px; border: 1px solid var(--line); border-radius: 6px; font-size: 13px; box-sizing: border-box;">
                  <option>Simples Nacional</option>
                  <option>Lucro Presumido</option>
                  <option>Lucro Real</option>
                </select>
              </div>
              <button type="button" style="background: var(--teal); color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 13px; align-self: flex-start;">Salvar</button>
            </form>
          </div>
        </div>
      </div>
    `;
    bindFiscalTabEvents();
  } catch (error) {
    console.error("Error rendering fiscal tab:", error);
    container.innerHTML = `<div style="padding: 20px; color: var(--muted);">Erro ao carregar módulo fiscal. Por favor, recarregue a página.</div>`;
  }
}

function bindFiscalTabEvents() {
  document.querySelectorAll(".fiscal-tab-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const tab = e.target.dataset.tab;

      // Remove active de todos
      document.querySelectorAll(".fiscal-tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".fiscal-tab-content").forEach(c => c.classList.remove("active"));

      // Ativa selecionado
      e.target.classList.add("active");
      const content = document.getElementById(`fiscal-${tab}`);
      if (content) content.classList.add("active");
    });
  });
}

// ========== I. ESTILOS ==========

export const fiscalCSS = `
  .fiscal-wrapper {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .fiscal-tabs {
    display: flex;
    gap: 8px;
    border-bottom: 1px solid var(--line);
    overflow-x: auto;
    padding-bottom: 0;
  }

  .fiscal-tab-btn {
    padding: 12px 16px;
    border: none;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    font-weight: 600;
    font-size: 13px;
    border-bottom: 3px solid transparent;
    transition: all 0.2s;
    white-space: nowrap;
  }

  .fiscal-tab-btn:hover {
    color: var(--ink);
  }

  .fiscal-tab-btn.active {
    color: var(--teal);
    border-bottom-color: var(--teal);
  }

  .fiscal-content {
    min-height: 400px;
  }

  .fiscal-tab-content {
    display: none;
  }

  .fiscal-tab-content.active {
    display: block;
    animation: fadeIn 0.2s ease-in;
  }

  .fiscal-kpis {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
    margin-bottom: 24px;
  }

  .kpi-card {
    background: var(--canvas);
    padding: 16px;
    border-radius: 8px;
    border-left: 4px solid var(--teal);
  }

  .kpi-label {
    font-size: 12px;
    color: var(--muted);
    font-weight: 600;
    text-transform: uppercase;
    margin-bottom: 8px;
  }

  .kpi-value {
    font-size: 24px;
    font-weight: 700;
    color: var(--ink);
  }

  .fiscal-alerts {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .fiscal-alert {
    padding: 12px 16px;
    border-radius: 6px;
    font-size: 13px;
    border-left: 4px solid;
  }

  .fiscal-alert.warning {
    background: rgba(255, 193, 7, 0.1);
    border-left-color: #ffc107;
    color: #f57f17;
  }

  .fiscal-alert.info {
    background: rgba(33, 150, 243, 0.1);
    border-left-color: #2196f3;
    color: #1565c0;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
`;
