import { state, money } from "../core/state.js";
import { byId, showAppMessage, flashActionMessage } from "../core/dom.js";
import { recordAudit } from "./logs.js";

// ========================================================================
// PROMPT 9: RESUMO SEMANAL + TEMPLATES WHATSAPP
// ========================================================================

// ========== A. RESUMO SEMANAL ==========

const WEEKLY_SUMMARY_TEMPLATE = `
Olá, {{company_name}}!

Aqui está seu resumo semanal de {{start_date}} a {{end_date}}:

📊 VENDAS
- Novos pedidos: {{new_orders}}
- Valor total: {{total_value}}
- Ticket médio: {{avg_ticket}}

📦 OPERAÇÃO
- Pedidos entregues: {{delivered_orders}}
- Pendências: {{pending_orders}}
- Taxa de atraso: {{late_percentage}}%

💰 FINANCEIRO
- Entradas: {{income}}
- Saídas: {{expenses}}
- Saldo: {{balance}}

⚠️ ATENÇÃO
- Produtos com estoque baixo: {{low_stock_count}}
- Pedidos vencidos: {{overdue_count}}

Acesse {{app_url}} para mais detalhes.
`;

export async function getWeeklySettings() {
  if (!state.supabase) return null;

  const { data, error } = await state.supabase
    .from("weekly_summary_settings")
    .select("*")
    .eq("organization_id", state.organizationId)
    .single();

  return data || {
    enabled: false,
    email: state.user?.email || "",
    day_of_week: 1, // Monday
    time: "09:00"
  };
}

export async function saveWeeklySettings(settings) {
  if (!state.supabase) return false;

  const payload = {
    organization_id: state.organizationId,
    enabled: settings.enabled,
    email: settings.email,
    day_of_week: settings.day_of_week,
    time: settings.time,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await state.supabase
    .from("weekly_summary_settings")
    .upsert(payload)
    .select()
    .single();

  if (error) {
    showAppMessage("Erro ao salvar configurações", "error");
    return false;
  }

  await recordAudit("update", "weekly_summary_settings", state.organizationId, "Configurações", null, data, "manual");
  flashActionMessage("✅ Configurações salvas!");
  return true;
}

export async function sendWeeklySummary() {
  // Calcular dados da semana
  const now = new Date();
  const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay() + 1));
  const endOfWeek = new Date(now.setDate(now.getDate() - now.getDay() + 7));

  const weekOrders = (state.data?.orders || []).filter(o => {
    const oDate = new Date(o.createdAt);
    return oDate >= startOfWeek && oDate <= endOfWeek;
  });

  const totalValue = weekOrders.reduce((sum, o) => sum + Number(o.charged || 0), 0);
  const deliveredOrders = weekOrders.filter(o => o.status === "Entregue").length;
  const pendingOrders = weekOrders.filter(o => !["Entregue", "Cancelado"].includes(o.status)).length;

  const email = (await getWeeklySettings())?.email || state.user?.email;

  const summary = WEEKLY_SUMMARY_TEMPLATE
    .replace("{{company_name}}", state.companyName || "Usuário")
    .replace("{{start_date}}", startOfWeek.toLocaleDateString("pt-BR"))
    .replace("{{end_date}}", endOfWeek.toLocaleDateString("pt-BR"))
    .replace("{{new_orders}}", weekOrders.length)
    .replace("{{total_value}}", money.format(totalValue))
    .replace("{{avg_ticket}}", money.format(totalValue / Math.max(weekOrders.length, 1)))
    .replace("{{delivered_orders}}", deliveredOrders)
    .replace("{{pending_orders}}", pendingOrders)
    .replace("{{late_percentage}}", "0") // TODO: Calcular
    .replace("{{income}}", "R$ 0,00") // TODO: Calcular
    .replace("{{expenses}}", "R$ 0,00") // TODO: Calcular
    .replace("{{balance}}", "R$ 0,00") // TODO: Calcular
    .replace("{{low_stock_count}}", "0") // TODO: Contar
    .replace("{{overdue_count}}", "0") // TODO: Contar
    .replace("{{app_url}}", window.location.origin);

  // TODO: Enviar via Brevo/Edge Function
  console.log("Weekly summary to send:", summary);
  flashActionMessage("✅ Resumo enviado!");
}

// ========== B. TEMPLATES WHATSAPP ==========

export async function getWhatsappTemplates() {
  if (!state.supabase) return [];

  const { data, error } = await state.supabase
    .from("whatsapp_templates")
    .select("*")
    .eq("organization_id", state.organizationId)
    .order("created_at", { ascending: false });

  return data || [];
}

const DEFAULT_WHATSAPP_TEMPLATES = [
  {
    name: "Confirmação de Pedido",
    content: "Olá {cliente}! Seu pedido #{codigo} foi confirmado. Valor: R$ {valor}. Você receberá um email com mais detalhes. Obrigado!"
  },
  {
    name: "Aviso de Saída para Entrega",
    content: "Oi {cliente}! Seu pedido #{codigo} saiu para entrega hoje. Você pode acompanhar aqui: {link_rastreio}. Obrigado!"
  },
  {
    name: "Entrega Realizada",
    content: "Tudo certo, {cliente}! Seu pedido #{codigo} foi entregue. Esperamos que aproveite! Qualquer dúvida, é só chamar."
  },
  {
    name: "Oferta Flash",
    content: "Flash sale! Desconto de 30% em {produto}! Aproveita, oferta válida até hoje. {link_loja}"
  },
  {
    name: "Follow-up Abandono de Carrinho",
    content: "Oi {cliente}! Vimos que você deixou {produto} no carrinho. Quer um cupom de 15% para finalizar a compra? {link_loja}"
  },
  {
    name: "Feedback Pós-Entrega",
    content: "Opa {cliente}! Tudo bem com você? Ficou satisfeito com seu pedido #{codigo}? Sua opinião é super importante para melhorarmos!"
  },
  {
    name: "Informação sobre Stock",
    content: "Oi {cliente}! Sobre o produto {produto} que você perguntou: temos {quantidade} unidades em estoque. Posso ajudar com mais algo?"
  },
  {
    name: "Reativação de Cliente",
    content: "Oi {cliente}! Estamos com uma promoção especial só para você! Aproveita e volta a comprar connosco. {link_loja}"
  }
];

export async function renderWhatsappTemplatesTab() {
  const container = byId("whatsappTemplatesContainer");
  if (!container) return;

  const templates = await getWhatsappTemplates();
  const displayTemplates = templates.length > 0 ? templates : DEFAULT_WHATSAPP_TEMPLATES.map((t, i) => ({ ...t, id: `default-${i}` }));

  container.innerHTML = `
    <div class="templates-toolbar">
      <button class="primary-btn" id="newTemplateBtn">Novo Template</button>
    </div>

    <div class="templates-grid">
      ${displayTemplates.length === 0 ? `
        <div class="empty-state">
          <strong>Nenhum template</strong>
          <span>Crie templates para enviar mensagens rápidas via WhatsApp</span>
        </div>
      ` : `
        ${displayTemplates.map(t => `
          <div class="template-card" style="
            padding: 16px;
            background: var(--canvas);
            border-radius: 8px;
            border-left: 4px solid var(--teal);
          ">
            <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600; color: var(--ink);">
              ${t.name}
            </h3>
            <p style="margin: 0 0 12px 0; font-size: 12px; color: var(--muted); line-height: 1.5; min-height: 40px;">
              ${t.content.substring(0, 60)}...
            </p>
            <div style="display: flex; gap: 8px;">
              ${t.id.startsWith('default-') ? `
                <button onclick="copyWhatsappTemplate('${t.name}', \`${t.content.replace(/`/g, '\\`')}\`)" class="secondary-btn" style="
                  flex: 1;
                  padding: 8px;
                  font-size: 12px;
                  border: 1px solid var(--teal);
                  color: var(--teal);
                  background: transparent;
                  border-radius: 6px;
                  cursor: pointer;
                ">Usar</button>
              ` : `
                <button onclick="editWhatsappTemplate('${t.id}')" class="secondary-btn" style="
                  flex: 1;
                  padding: 8px;
                  font-size: 12px;
                  border: 1px solid var(--teal);
                  color: var(--teal);
                  background: transparent;
                  border-radius: 6px;
                  cursor: pointer;
                ">Editar</button>
                <button onclick="deleteWhatsappTemplate('${t.id}')" class="secondary-btn" style="
                  flex: 1;
                  padding: 8px;
                  font-size: 12px;
                  border: 1px solid #ff6b6b;
                  color: #ff6b6b;
                  background: transparent;
                  border-radius: 6px;
                  cursor: pointer;
                ">Deletar</button>
              `}
            </div>
          </div>
        `).join("")}
      `}
    </div>
  `;

  byId("newTemplateBtn")?.addEventListener("click", () => openTemplateEditor());
}

function openTemplateEditor(templateId = null) {
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
    min-width: 500px;
    max-width: 90vw;
    max-height: 90vh;
    overflow-y: auto;
  `;

  dialog.innerHTML = `
    <h2 style="margin: 0 0 24px 0; font-size: 18px; font-weight: 700; color: var(--ink);">
      ${templateId ? "Editar" : "Novo"} Template WhatsApp
    </h2>

    <form id="templateForm" style="display: flex; flex-direction: column; gap: 16px;">
      <div>
        <label style="display: block; font-size: 12px; font-weight: 600; color: var(--muted); margin-bottom: 8px; text-transform: uppercase;">
          Nome do Template
        </label>
        <input type="text" name="name" placeholder="Ex: Confirmação de Pedido" style="
          width: 100%;
          padding: 10px 12px;
          border: 1px solid var(--line);
          border-radius: 6px;
          font-size: 13px;
          background: var(--canvas);
          color: var(--ink);
          box-sizing: border-box;
        " required />
      </div>

      <div>
        <label style="display: block; font-size: 12px; font-weight: 600; color: var(--muted); margin-bottom: 8px; text-transform: uppercase;">
          Conteúdo
        </label>
        <textarea name="content" placeholder="Use {cliente}, {produto}, {codigo}, {link_rastreio} como placeholders" style="
          width: 100%;
          padding: 10px 12px;
          border: 1px solid var(--line);
          border-radius: 6px;
          font-size: 12px;
          background: var(--canvas);
          color: var(--ink);
          box-sizing: border-box;
          font-family: monospace;
          min-height: 120px;
          resize: vertical;
        " required></textarea>
      </div>

      <div>
        <div style="padding: 12px; background: var(--canvas); border-radius: 6px; border-left: 3px solid var(--teal);">
          <p style="margin: 0 0 8px 0; font-size: 11px; font-weight: 600; color: var(--muted); text-transform: uppercase;">
            Placeholders disponíveis:
          </p>
          <code style="font-size: 11px; color: var(--teal); font-family: monospace;">
            {cliente} {produto} {codigo} {link_rastreio} {data}
          </code>
        </div>
      </div>
    </form>

    <div style="display: flex; gap: 12px; margin-top: 24px; justify-content: flex-end;">
      <button id="cancelTemplate" style="
        background: transparent;
        border: 1px solid var(--line);
        color: var(--ink);
        padding: 10px 20px;
        border-radius: 8px;
        cursor: pointer;
        font-weight: 600;
      ">Cancelar</button>
      <button id="saveTemplate" style="
        background: var(--teal);
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 8px;
        cursor: pointer;
        font-weight: 600;
      ">💾 Salvar</button>
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

  byId("cancelTemplate").addEventListener("click", () => {
    overlay.remove();
    dialog.remove();
  });

  byId("saveTemplate").addEventListener("click", async () => {
    const form = document.getElementById("templateForm");
    const data = new FormData(form);
    await saveWhatsappTemplate(templateId, Object.fromEntries(data));
    overlay.remove();
    dialog.remove();
  });
}

function copyWhatsappTemplate(name, content) {
  openTemplateEditor(null);
  setTimeout(() => {
    const form = document.getElementById("templateForm");
    if (form) {
      form.elements.name.value = name;
      form.elements.content.value = content;
    }
  }, 100);
}

async function saveWhatsappTemplate(templateId, data) {
  if (!state.supabase) return;

  const payload = {
    organization_id: state.organizationId,
    name: data.name,
    content: data.content,
    updated_at: new Date().toISOString()
  };

  if (templateId) {
    const { error } = await state.supabase
      .from("whatsapp_templates")
      .update(payload)
      .eq("id", templateId);

    if (error) {
      showAppMessage("Erro ao atualizar template", "error");
      return;
    }
  } else {
    const { error } = await state.supabase
      .from("whatsapp_templates")
      .insert([{ ...payload, created_at: new Date().toISOString() }]);

    if (error) {
      showAppMessage("Erro ao criar template", "error");
      return;
    }
  }

  flashActionMessage("✅ Template salvo!");
  await renderWhatsappTemplatesTab();
}

export async function deleteWhatsappTemplate(templateId) {
  if (!confirm("Tem certeza que deseja deletar este template?")) return;

  if (!state.supabase) return;

  const { error } = await state.supabase
    .from("whatsapp_templates")
    .delete()
    .eq("id", templateId);

  if (error) {
    showAppMessage("Erro ao deletar template", "error");
    return;
  }

  flashActionMessage("✅ Template deletado!");
  await renderWhatsappTemplatesTab();
}

// Expor globalmente para onclick
window.editWhatsappTemplate = async (id) => openTemplateEditor(id);
window.deleteWhatsappTemplate = deleteWhatsappTemplate;
window.copyWhatsappTemplate = copyWhatsappTemplate;
