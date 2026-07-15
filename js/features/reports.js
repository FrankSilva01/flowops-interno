import { state, money } from "../core/state.js";
import { byId, html, formatDate, formatDateShort, formatDateTime, countBy, sum, showAppMessage, renderPagination } from "../core/dom.js";
import { renderLineChart } from "../core/charts.js";
import { getOrderCode } from "./orders.js";
import { normalizeMarketplaceChannel } from "./marketplace.js";
import { normalizeText } from "../core/importer.js";
import { reportPricingDefinition } from "./pricing.js";
import { renderDataQualityReport } from "./data-quality.js";
import { marketplaceSalesForReport, reportMarketplaceRows } from "./report-marketplace-data.js";

export { marketplaceSalesForReport, reportMarketplaceRows } from "./report-marketplace-data.js";

export function renderReports() {
  const content = byId("reportsContent");
  if (!content) return;
  const primaryTabs = new Set(["overview", "financial", "production", "commercial", "marketplaces"]);
  document.querySelectorAll("[data-report-tab]").forEach((item) => item.classList.toggle("active", item.dataset.reportTab === state.reportTab));
  if (byId("reportMoreSelect")) byId("reportMoreSelect").value = primaryTabs.has(state.reportTab) ? "" : state.reportTab;
  const filterPanel = document.querySelector(".report-filter-panel");
  if (filterPanel) filterPanel.hidden = state.reportTab === "quality";
  const rows = getReportRows();
  const financial = getReportFinancial(rows.cash, rows.orders);
  const totalOrders = rows.orders.length;
  const ticket = totalOrders ? financial.revenue / totalOrders : 0;
  const marketplaceItems = reportMarketplaceRows([], marketplaceSalesForReport(rows.sales, rows.orders));
  const materialItems = countBy(rows.orders, (item) => item.material || "Não informado").slice(0, 6);
  const dailyRows = reportDailyRows(rows.cash, rows.orders);
  const statusRows = countBy(rows.orders, (item) => item.status || "Sem status");
  const tableRows = dailyRows.slice(-8).reverse();
  if (state.reportTab !== "overview") {
    renderReportTabContent(content, state.reportTab, rows, financial, dailyRows);
    return;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const lateReportOrders = rows.orders.filter((item) =>
    item.deliveryDate && item.status !== "Entregue" && new Date(`${item.deliveryDate}T00:00:00`) < today
  ).length;
  content.innerHTML = `
    <div class="report-kpi-grid">
      ${reportKpi("Receita líquida", money.format(financial.revenue), "Valores recebidos no período", "teal")}
      ${reportKpi("Custos", money.format(financial.costs), "Saídas registradas no período", "red")}
      ${reportKpi("Lucro líquido", money.format(financial.profit), "Receita menos custos", "blue")}
      ${reportKpi("Ticket médio", money.format(ticket), "Receita média por pedido", "purple")}
      ${reportKpi("A receber", money.format(financial.receivable), `${rows.orders.filter((item) => Number(item.charged || 0) > Number(item.received || 0)).length} títulos pendentes`, "amber")}
      ${reportKpi("Pedidos", totalOrders, "Encomendas no período", "green")}
    </div>
    <div class="report-main-grid">
      <section class="panel report-chart-card">
        <div class="panel-head"><h3>Receita por dia</h3><span>Linha</span></div>
        <div id="reportRevenueLine" class="line-chart-container"></div>
      </section>
      <section class="panel report-chart-card">
        <div class="panel-head"><h3>Entradas x Saídas</h3><span>Saldo diário</span></div>
        <div id="reportCashLine" class="line-chart-container"></div>
      </section>
      <section class="panel report-chart-card">
        <div class="panel-head"><h3>Receita por marketplace</h3></div>
        ${renderDonutChart(marketplaceItems, Math.max(marketplaceItems.reduce((total, item) => total + Number(item.value || 0), 0), 1))}
      </section>
      <section class="panel report-table-card">
        <div class="panel-head">
          <h3>Resumo financeiro</h3>
          <div class="panel-head-actions">
            <button class="secondary-btn" type="button" data-report-export="csv">Exportar CSV</button>
            <button class="secondary-btn" type="button" data-report-export="xlsx">Exportar Excel</button>
            <button class="secondary-btn" type="button" data-report-export="pdf">Exportar PDF</button>
          </div>
        </div>
        <table>
          <thead><tr><th>Data</th><th>Itens</th><th>Entradas</th><th>Saídas</th><th>Lucro</th><th>Pedidos</th><th>Ticket médio</th></tr></thead>
          <tbody>${tableRows.map((item) => `<tr><td>${html(formatReportGroupLabel(item.date))}</td><td>${renderReportItemsCell(item)}</td><td>${money.format(item.income)}</td><td>${money.format(item.expense)}</td><td>${money.format(item.income - item.expense)}</td><td>${item.orders}</td><td>${money.format(item.orders ? item.income / item.orders : 0)}</td></tr>`).join("") || `<tr><td colspan="7">Nenhum dado no período.</td></tr>`}</tbody>
        </table>
      </section>
      <aside class="panel report-insights">
        <h3>Insights do período</h3>
        ${renderReportInsight("↗", `Sua receita acumulada foi de ${money.format(financial.revenue)}.`)}
          ${renderReportInsight("◎", marketplaceItems[0] ? `${marketplaceItems[0].label} foi o principal marketplace no período.` : "Nenhuma venda de marketplace no período.")}
        ${renderReportInsight("●", `Você possui ${rows.leads.length} lead${rows.leads.length === 1 ? "" : "s"} no período.`)}
        ${renderReportInsight("!", `${lateReportOrders} pedido(s) atrasado(s).`)}
      </aside>
      <section class="panel report-chart-card">
        <div class="panel-head"><h3>Pedidos por status</h3></div>
        ${renderDonutChart(statusRows, Math.max(totalOrders, 1), "Pedidos")}
      </section>
      <section class="panel report-chart-card">
        <div class="panel-head"><h3>Pedidos por material</h3></div>
        ${renderDonutChart(materialItems, Math.max(totalOrders, 1), "Materiais")}
      </section>
    </div>
  `;
  content.querySelectorAll("[data-report-export]").forEach((button) => {
    button.addEventListener("click", () => exportReport(button.dataset.reportExport, tableRows));
  });
  renderLineChart("reportRevenueLine", dailyRows.map((item) => ({ label: formatReportGroupLabel(item.date, true), value: item.income })), { valueLabel: "Receita" });
  renderLineChart("reportCashLine", dailyRows.map((item) => ({ label: formatReportGroupLabel(item.date, true), value: item.income - item.expense })), { valueLabel: "Saldo" });
}

// Uma celula de tabela de relatorio normalmente e string/numero, mas pode
// ser { text, title } quando o texto exibido na tela e truncado (coluna
// "Itens") e precisa levar junto a versao completa pra exportacao e pro
// tooltip - cellText() mostra o truncado, cellExportText() sempre a
// versao completa (a exportacao nunca deve herdar a limitacao da tela).
function cellText(cell) {
  return cell && typeof cell === "object" && "text" in cell ? cell.text : cell;
}
function cellExportText(cell) {
  return cell && typeof cell === "object" && "text" in cell ? (cell.title ?? cell.text) : cell;
}

export function renderReportTabContent(content, tab, rows, financial, dailyRows) {
  if (tab === "quality") {
    renderDataQualityReport(content);
    return;
  }
  const marketplaceSales = marketplaceSalesForReport(rows.sales, rows.orders);
  const marketplaceRevenue = reportMarketplaceRows([], marketplaceSales);
  const definitions = {
    financial: {
      title: "Financeiro",
      kpis: [
        ["Receita", money.format(financial.revenue), "Valores recebidos no período", "teal"],
        ["Custos", money.format(financial.costs), "Saídas registradas", "red"],
        ["Lucro", money.format(financial.profit), "Receita menos custos", "blue"],
        ["A receber", money.format(financial.receivable), "Valores ainda pendentes", "amber"],
      ],
      chartTitle: "Resultado financeiro",
      chartRows: dailyRows.map((item) => ({ label: formatReportGroupLabel(item.date, true), value: item.income - item.expense })),
      headers: ["Data", "Itens", "Entradas", "Saídas", "Resultado"],
      body: dailyRows.slice().reverse().map((item) => [
        formatReportGroupLabel(item.date),
        { text: item.items || "-", title: (item.itemsFull || []).join(", ") || "-" },
        money.format(item.income), money.format(item.expense), money.format(item.income - item.expense),
      ]),
    },
    production: {
      title: "Produção",
      kpis: [
        ["Em produção", rows.orders.filter((item) => item.status !== "Entregue" && !item.quoteStage).length, "Pedidos ativos", "teal"],
        ["Concluídos", rows.orders.filter((item) => item.status === "Entregue").length, "Entregues no período", "green"],
        ["Atrasados", reportLateOrders(rows.orders).length, "Exigem atenção", "red"],
        ["Sem responsável", rows.orders.filter((item) => !item.responsible).length, "Aguardando atribuição", "amber"],
      ],
      chartTitle: "Pedidos por etapa",
      chartRows: countBy(rows.orders, (item) => item.productionStage || item.stage || "Em fila"),
      headers: ["Pedido", "Item", "Etapa", "Status", "Responsável", "Entrega"],
      body: rows.orders.map((item) => [
        getOrderCode(item), item.description || "-", item.productionStage || item.stage || "Em fila", item.status || "-", item.responsible || "-", item.deliveryDate ? formatDate(item.deliveryDate) : "Sem data",
      ]),
    },
    commercial: {
      title: "Comercial",
      kpis: [
        ["Leads", rows.leads.length, "Criados no período", "teal"],
        ["Pedidos", rows.orders.length, "Encomendas registradas", "blue"],
        ["Clientes", new Set(rows.orders.map((item) => item.client).filter(Boolean)).size, "Clientes com pedidos", "purple"],
        ["Ticket médio", money.format(rows.orders.length ? financial.revenue / rows.orders.length : 0), "Receita por pedido", "green"],
      ],
      chartTitle: "Leads por status",
      chartRows: countBy(rows.leads, (item) => item.status || "Novo"),
      headers: ["Nome", "E-mail", "WhatsApp", "Status", "Origem", "Último contato"],
      body: rows.leads.map((item) => [
        item.name || "-", item.email || "-", item.whatsapp || item.phone || "-", item.status || "Novo", item.origin || item.source || "-", item.last_contact_at ? formatDateTime(item.last_contact_at) : "-",
      ]),
    },
    marketplaces: {
      title: "Marketplaces",
      kpis: [
        ["Vendas importadas", marketplaceSales.length, "Pedidos externos únicos", "teal"],
        ["Receita", money.format(marketplaceRevenue.reduce((sumValue, item) => sumValue + Number(item.value || 0), 0)), "Total informado pelo canal", "green"],
        ["Mercado Livre", marketplaceSales.filter((item) => normalizeMarketplaceChannel(item.marketplace) === "mercado-livre").length, "Pedidos externos únicos", "blue"],
        ["Outros marketplaces", marketplaceSales.filter((item) => normalizeMarketplaceChannel(item.marketplace) !== "mercado-livre").length, "Shopee, Amazon e futuros canais", "amber"],
      ],
      chartTitle: "Receita por marketplace",
      chartRows: marketplaceRevenue,
      headers: ["Canal", "Código", "Item", "Valor", "Data", "Status"],
      body: marketplaceSales.map((item) => [
        item.marketplace || "-", item.external_order_id || item.order_id || "-", item.title || "-", money.format(item.report_amount), item.date || item.created_at ? formatDate(item.date || item.created_at) : "-", item.status || "-",
      ]),
    },
    products: reportProductDefinition(rows),
    materials: reportMaterialDefinition(rows),
    clients: reportClientDefinition(rows),
    stock: reportStockDefinition(),
    logistics: reportLogisticsDefinition(rows),
    pricing: reportPricingDefinition(),
  };
  const definition = definitions[tab] || definitions.financial;
  const pageSize = 15;
  const totalPages = Math.max(1, Math.ceil(definition.body.length / pageSize));
  state.reportTablePage = Math.min(Math.max(1, state.reportTablePage || 1), totalPages);
  const pageStart = (state.reportTablePage - 1) * pageSize;
  const limitedBody = definition.body.slice(pageStart, pageStart + pageSize);
  content.innerHTML = `
    <div class="report-section-heading"><div><p class="eyebrow">Relatórios</p><h2>${html(definition.title)}</h2></div><span>${html(reportPeriodLabel())}</span></div>
    <div class="report-kpi-grid report-kpi-grid-compact">
      ${definition.kpis.map((item) => reportKpi(item[0], item[1], item[2], item[3])).join("")}
    </div>
    <div class="report-main-grid report-tab-grid">
      <section class="panel report-chart-card">
        <div class="panel-head"><h3>${html(definition.chartTitle)}</h3><span>${html(reportGroupLabel())}</span></div>
        <div id="reportTabChart" class="line-chart-container"></div>
      </section>
      <section class="panel report-table-card report-tab-table">
        <div class="panel-head">
          <h3>Detalhamento</h3>
          <div class="panel-head-actions">
            <button class="secondary-btn" type="button" data-report-tab-export="csv">Exportar CSV</button>
            <button class="secondary-btn" type="button" data-report-tab-export="xlsx">Exportar Excel</button>
            <button class="secondary-btn" type="button" data-report-tab-export="pdf">Exportar PDF</button>
          </div>
        </div>
        <div class="table-scroll"><table><thead><tr>${definition.headers.map((item) => `<th>${html(item)}</th>`).join("")}</tr></thead>
        <tbody>${limitedBody.length ? limitedBody.map((row) => `<tr>${row.map((cell) => {
          const isObjectCell = cell && typeof cell === "object" && "text" in cell;
          return isObjectCell
            ? `<td title="${html(String(cell.title ?? ""))}">${html(String(cell.text ?? "-"))}</td>`
            : `<td>${html(String(cell ?? "-"))}</td>`;
        }).join("")}</tr>`).join("") : `<tr><td colspan="${definition.headers.length}">Nenhum dado no período selecionado.</td></tr>`}</tbody></table></div>
        ${renderPagination(state.reportTablePage, totalPages, "report-table-page")}
      </section>
    </div>`;
  content.querySelectorAll("[data-report-tab-export]").forEach((button) => {
    button.addEventListener("click", () => exportReportTable(button.dataset.reportTabExport, definition.headers, definition.body));
  });
  renderLineChart("reportTabChart", definition.chartRows.map((item) => ({
    label: item.label,
    value: Number(item.value || 0),
  })), { valueLabel: definition.chartTitle, format: (value) => Number(value).toLocaleString("pt-BR") });
}

export function reportProductDefinition(rows) {
  const datedIds = new Set(rows.orders.map((item) => item.id));
  const legacyOrders = state.data.orders.filter((item) =>
    !datedIds.has(item.id)
    && !item.createdAt
    && !item.created_at
    && !item.deliveryDate
    && (item.status === "Entregue" || Number(item.received || 0) > 0)
  );
  const soldOrders = [...rows.orders, ...legacyOrders].filter((item) =>
    item.status === "Entregue" || Number(item.received || 0) > 0
  );
  const products = aggregateReportRows(soldOrders, (item) => item.description || "Sem nome", (item) => ({
    quantity: Number(item.quantity || 1),
    revenue: Number(item.received || item.charged || 0),
  }));
  return {
    title: "Produtos",
    kpis: [
      ["Produtos vendidos", products.length, legacyOrders.length ? `${legacyOrders.length} registro(s) legado(s) sem data incluído(s)` : "Itens diferentes", "teal"],
      ["Unidades", products.reduce((sumValue, item) => sumValue + item.quantity, 0), "Quantidade total", "blue"],
      ["Receita", money.format(products.reduce((sumValue, item) => sumValue + item.revenue, 0)), "Receita dos produtos", "green"],
      ["Mais vendido", products[0]?.label || "-", products[0] ? `${products[0].quantity} unidade(s)` : "Sem vendas", "purple"],
    ],
    chartTitle: "Produtos mais vendidos",
    chartRows: products.slice(0, 12).map((item) => ({ label: item.label, value: item.quantity })),
    headers: ["Produto", "Quantidade", "Receita"],
    body: products.map((item) => [item.label, item.quantity, money.format(item.revenue)]),
  };
}

export function reportMaterialDefinition(rows) {
  const materials = aggregateReportRows(rows.materials, (item) => item.type || "Não informado", (item) => ({
    quantity: Number(item.quantity || 0),
    revenue: Number(item.quantity || 0) * Number(item.unitCost || 0),
  }));
  const totalSpent = materials.reduce((sumValue, item) => sumValue + item.revenue, 0);
  const suppliers = new Set(rows.materials.map((item) => item.supplier).filter(Boolean));
  return {
    title: "Materiais",
    kpis: [
      ["Compras", rows.materials.length, "Registros no período", "teal"],
      ["Valor investido", money.format(totalSpent), "Compras de materiais", "red"],
      ["Fornecedores", suppliers.size, "Fornecedores diferentes", "blue"],
      ["Maior investimento", materials.slice().sort((a, b) => b.revenue - a.revenue)[0]?.label || "-", "Por tipo de material", "purple"],
    ],
    chartTitle: "Investimento por material",
    chartRows: materials.map((item) => ({ label: item.label, value: item.revenue })),
    headers: ["Data", "Material", "Especificação", "Fornecedor", "Quantidade", "Custo unitário", "Total"],
    body: rows.materials.map((item) => [
      item.date ? formatDate(item.date) : "-",
      item.type || "-",
      item.spec || "-",
      item.supplier || "-",
      Number(item.quantity || 0).toLocaleString("pt-BR"),
      money.format(Number(item.unitCost || 0)),
      money.format(Number(item.quantity || 0) * Number(item.unitCost || 0)),
    ]),
  };
}

export function reportClientDefinition(rows) {
  const clients = aggregateReportRows(rows.orders.filter((item) => item.client), (item) => item.client, (item) => ({
    quantity: 1,
    revenue: Number(item.received || item.charged || 0),
  }));
  return {
    title: "Clientes",
    kpis: [
      ["Clientes", clients.length, "Com pedidos no período", "teal"],
      ["Novos leads", rows.leads.length, "Leads capturados", "blue"],
      ["Receita", money.format(clients.reduce((sumValue, item) => sumValue + item.revenue, 0)), "Receita por clientes", "green"],
      ["Maior cliente", clients.sort((a, b) => b.revenue - a.revenue)[0]?.label || "-", "Por receita", "purple"],
    ],
    chartTitle: "Pedidos por cliente",
    chartRows: clients.slice().sort((a, b) => b.quantity - a.quantity).slice(0, 12).map((item) => ({ label: item.label, value: item.quantity })),
    headers: ["Cliente", "Pedidos", "Receita"],
    body: clients.map((item) => [item.label, item.quantity, money.format(item.revenue)]),
  };
}

export function reportStockDefinition() {
  const stock = state.inventoryItems.map((item) => ({
    label: item.name || item.description || item.material || "Insumo",
    quantity: Number(item.quantity || 0),
    minimum: Number(item.minimum_quantity || item.minimum || 0),
    unit: item.unit || "un.",
  }));
  const low = stock.filter((item) => item.quantity <= item.minimum);
  return {
    title: "Estoque",
    kpis: [
      ["Itens cadastrados", stock.length, "Insumos monitorados", "teal"],
      ["Estoque baixo", low.length, "Itens abaixo do mínimo", "red"],
      ["Quantidade total", stock.reduce((sumValue, item) => sumValue + item.quantity, 0), "Todas as unidades", "blue"],
      ["Em situação normal", stock.length - low.length, "Itens com saldo suficiente", "green"],
    ],
    chartTitle: "Saldo em estoque",
    chartRows: stock.slice(0, 15).map((item) => ({ label: item.label, value: item.quantity })),
    headers: ["Item", "Quantidade", "Mínimo", "Unidade", "Situação"],
    body: stock.map((item) => [item.label, item.quantity, item.minimum, item.unit, item.quantity <= item.minimum ? "Estoque baixo" : "Normal"]),
  };
}

export function reportLogisticsDefinition(rows) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const delivered = rows.orderLogistics.filter((item) => item.status === "Entregue");
  const late = state.orderLogistics.filter((item) =>
    item.status !== "Entregue" && item.status !== "Devolvido"
    && item.estimated_delivery_date && new Date(`${item.estimated_delivery_date}T00:00:00`) < today
  );
  const deliveredWithDates = delivered.filter((item) => item.delivered_at && item.shipped_at);
  const avgDeliveryDays = deliveredWithDates.length
    ? (deliveredWithDates.reduce((sum, item) => sum + (new Date(item.delivered_at) - new Date(item.shipped_at)) / 86400000, 0) / deliveredWithDates.length).toFixed(1)
    : "-";
  return {
    title: "Logística",
    kpis: [
      ["Rastreios ativos", state.orderLogistics.filter((item) => item.status !== "Entregue" && item.status !== "Devolvido").length, "Em andamento", "teal"],
      ["Entregues no período", delivered.length, "Concluídos", "green"],
      ["Atrasados", late.length, "Passaram da previsão", "red"],
      ["Tempo médio de entrega", avgDeliveryDays === "-" ? "-" : `${avgDeliveryDays} dia(s)`, "Do envio até a entrega", "blue"],
    ],
    chartTitle: "Rastreios por status",
    chartRows: countBy(state.orderLogistics, (item) => item.status || "Sem rastreio"),
    headers: ["Pedido", "Transportadora", "Status", "Previsão", "Entregue em"],
    body: rows.orderLogistics.map((item) => {
      const order = state.data.orders.find((orderItem) => orderItem.id === item.order_id);
      return [
        order ? getOrderCode(order) : item.order_id,
        item.carrier || "-",
        item.status || "-",
        item.estimated_delivery_date ? formatDate(item.estimated_delivery_date) : "-",
        item.delivered_at ? formatDateTime(item.delivered_at) : "-",
      ];
    }),
  };
}

export function aggregateReportRows(rows, labelGetter, valuesGetter) {
  const map = new Map();
  rows.forEach((item) => {
    const label = labelGetter(item);
    const values = valuesGetter(item);
    const current = map.get(label) || { label, quantity: 0, revenue: 0 };
    current.quantity += Number(values.quantity || 0);
    current.revenue += Number(values.revenue || 0);
    map.set(label, current);
  });
  return [...map.values()].sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue);
}

export function reportLateOrders(orders) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return orders.filter((item) => item.deliveryDate && item.status !== "Entregue" && new Date(`${item.deliveryDate}T00:00:00`) < today);
}

export function reportTabLabel(tab) {
  return ({
    overview: "Visão geral", financial: "Financeiro", production: "Produção", commercial: "Comercial",
    marketplaces: "Marketplaces", products: "Produtos", materials: "Materiais", clients: "Clientes", stock: "Estoque",
    logistics: "Logística", pricing: "Inteligência Comercial",
  })[tab] || "Relatório";
}

export function reportPeriodLabel() {
  return state.reportPeriod === "all" ? "Todo o período" : `Últimos ${state.reportPeriod} dias`;
}

export function reportGroupLabel() {
  return ({ day: "Por dia", week: "Por semana", month: "Por mês" })[state.reportGroup] || "Por dia";
}

export function exportReportTable(format, headers, body) {
  if (format === "pdf") {
    openReportPrintView(headers, body);
    return;
  }
  if (format === "xlsx") {
    const table = `<table><thead><tr>${headers.map((item) => `<th>${html(item)}</th>`).join("")}</tr></thead><tbody>${body.map((row) => `<tr>${row.map((cell) => `<td>${html(String(cellExportText(cell)))}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    downloadTextFile(table, `flowops-${state.reportTab}-${new Date().toISOString().slice(0, 10)}.xls`, "application/vnd.ms-excel;charset=utf-8");
    return;
  }
  const csv = [headers, ...body].map((row) => row.map((cell) => `"${String(cellExportText(cell)).replaceAll('"', '""')}"`).join(";")).join("\n");
  downloadTextFile(csv, `flowops-${state.reportTab}-${new Date().toISOString().slice(0, 10)}.csv`, "text/csv;charset=utf-8");
}

export function exportReport(format, rows) {
  const headers = ["Data", "Itens", "Entradas", "Saídas", "Lucro", "Pedidos", "Ticket médio"];
  const body = rows.map((item) => [
    formatReportGroupLabel(item.date),
    (item.itemsFull && item.itemsFull.length ? item.itemsFull.join(", ") : "-"),
    money.format(Number(item.income || 0)),
    money.format(Number(item.expense || 0)),
    money.format(Number((item.income || 0) - (item.expense || 0))),
    item.orders || 0,
    money.format(Number(item.orders ? item.income / item.orders : 0)),
  ]);
  if (format === "pdf") {
    openReportPrintView(headers, body);
    return;
  }
  if (format === "xlsx") {
    const table = `<table><thead><tr>${headers.map((item) => `<th>${html(item)}</th>`).join("")}</tr></thead><tbody>${body.map((row) => `<tr>${row.map((cell) => `<td>${html(String(cell))}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    downloadTextFile(table, `flowops-relatorio-${new Date().toISOString().slice(0, 10)}.xls`, "application/vnd.ms-excel;charset=utf-8");
    return;
  }
  const csv = [headers, ...body]
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(";"))
    .join("\n");
  downloadTextFile(csv, `flowops-relatorio-${new Date().toISOString().slice(0, 10)}.csv`, "text/csv;charset=utf-8");
}

export function downloadTextFile(content, fileName, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(blob);
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(anchor.href);
}

export function getReportRows() {
  const from = reportStartDate();
  const until = reportReferenceDate();
  until.setHours(23, 59, 59, 999);
  const inPeriod = (dateValue) => {
    if (!dateValue) return true;
    const date = parseReportDate(dateValue);
    if (!date) return true;
    return (!from || date >= from) && date <= until;
  };
  return {
    cash: state.data.cash.filter((item) => inPeriod(item.date)),
    orders: state.data.orders.filter((item) => inPeriod(reportOrderDate(item))),
    sales: state.marketplaceSales.filter((item) => inPeriod(item.date || item.created_at)),
    leads: state.leads.filter((item) => inPeriod(item.created_at || item.updated_at)),
    materials: state.data.materials.filter((item) => inPeriod(item.date || item.created_at)),
    orderLogistics: state.orderLogistics.filter((item) => inPeriod(item.delivered_at || item.updated_at)),
  };
}

export function reportStartDate() {
  if (state.reportPeriod === "all") return null;
  const days = Number(state.reportPeriod || 30);
  const date = reportReferenceDate();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - days + 1);
  return date;
}

export function reportReferenceDate() {
  const candidates = [
    new Date(),
    ...state.data.cash.map((item) => parseReportDate(item.date)),
    ...state.data.orders.map((item) => parseReportDate(reportOrderDate(item))),
    ...state.marketplaceSales.map((item) => parseReportDate(item.date || item.created_at)),
    ...state.data.materials.map((item) => parseReportDate(item.date || item.created_at)),
  ].filter(Boolean);
  return new Date(Math.max(...candidates.map((item) => item.getTime())));
}

export function reportOrderDate(item) {
  const direct = item.createdAt || item.created_at || item.orderDate || item.order_date;
  if (direct) return direct;
  const cashEntry = findOrderCashEntry(item);
  if (cashEntry?.date) return cashEntry.date;
  const historyDate = [...(item.history || [])]
    .map((entry) => entry.at || entry.date || entry.created_at)
    .filter(Boolean)
    .sort()
    .at(-1);
  return historyDate || item.deliveryDate || "";
}

export function findOrderCashEntry(item, rows = state.data.cash) {
  const tokens = [getOrderCode(item), item.id, item.description]
    .map((value) => normalizeText(value))
    .filter((value) => value.length >= 4);
  return rows.find((entry) => {
    const description = normalizeText(entry.description);
    return tokens.some((token) => description.includes(token));
  });
}

export function getReportFinancial(cashRows, orderRows) {
  const income = sum(cashRows, "income");
  const expense = sum(cashRows, "expense");
  const orderReceived = orderRows.reduce((total, item) => total + Number(item.received || 0), 0);
  const revenue = Math.max(income, orderReceived);
  const receivable = orderRows.reduce((total, item) => total + Math.max(Number(item.charged || 0) - Number(item.received || 0), 0), 0);
  return { revenue, costs: expense, profit: revenue - expense, receivable };
}

export function reportDailyRows(cashRows, orderRows) {
  const map = new Map();
  const ensure = (date) => {
    const key = reportGroupKey(date);
    if (!map.has(key)) map.set(key, { date: key, income: 0, expense: 0, orders: 0, itemNames: new Set() });
    return map.get(key);
  };
  cashRows.forEach((item) => {
    const row = ensure(item.date);
    row.income += Number(item.income || 0);
    row.expense += Number(item.expense || 0);
    if (item.description) row.itemNames.add(item.description);
  });
  orderRows.forEach((item) => {
    const row = ensure(reportOrderDate(item));
    if (!findOrderCashEntry(item, cashRows)) row.income += Number(item.received || 0);
    row.orders += 1;
    row.itemNames.add(item.description || item.orderCode || item.id || "Encomenda");
  });
  return [...map.values()]
    .map((item) => {
      const names = [...item.itemNames];
      return {
        ...item,
        items: names.slice(0, 4).join(", ") + (names.length > 4 ? ` +${names.length - 4}` : ""),
        itemsFull: names,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function reportGroupKey(dateValue) {
  const date = parseReportDate(dateValue) || new Date();
  if (state.reportGroup === "month") return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  if (state.reportGroup === "week") {
    const monday = new Date(date);
    const day = monday.getDay() || 7;
    monday.setDate(monday.getDate() - day + 1);
    return `${localReportDateKey(monday)}|week`;
  }
  return localReportDateKey(date);
}

export function localReportDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function formatReportGroupLabel(value, short = false) {
  const raw = String(value || "");
  if (raw.endsWith("|week")) {
    const date = new Date(`${raw.replace("|week", "")}T00:00:00`);
    return `${short ? "Sem." : "Semana de"} ${date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`;
  }
  if (/^\d{4}-\d{2}$/.test(raw)) {
    const [year, month] = raw.split("-");
    return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString("pt-BR", { month: short ? "short" : "long", year: "numeric" });
  }
  return short ? formatDateShort(raw) : formatDate(raw);
}

export function parseReportDate(value) {
  if (!value) return null;
  const raw = String(value).slice(0, 10);
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00`) : new Date(value);
  return Number.isFinite(iso.getTime()) ? iso : null;
}

export function openReportPrintView(headers, body) {
  const reportWindow = window.open("", "_blank");
  if (!reportWindow) {
    showAppMessage("Exportar PDF", "Permita pop-ups para gerar o PDF do relatório.", "error");
    return;
  }
  reportWindow.opener = null;
  const title = `Relatório FlowOps - ${reportTabLabel(state.reportTab)}`;
  reportWindow.document.open();
  const financial = getReportFinancial(getReportRows().cash, getReportRows().orders);
  const itemColumn = headers.findIndex((item) => item === "Itens");
  reportWindow.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${html(title)}</title>
    <style>
      *{box-sizing:border-box}body{font:13px Arial,sans-serif;color:#17212b;margin:0;background:#fff}
      .report{padding:28px}.header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:18px;border-bottom:3px solid #0f8f7e}
      .brand{display:flex;align-items:center;gap:12px}.mark{display:grid;place-items:center;width:42px;height:42px;border-radius:8px;background:#0f8f7e;color:#fff;font-weight:800}
      h1{font-size:22px;margin:0 0 5px}p{color:#526273;margin:0}.meta{text-align:right;line-height:1.55}
      .metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:18px 0}.metric{padding:12px;border:1px solid #d7e0e7;border-radius:7px;background:#f7fafb}
      .metric span{display:block;color:#607181;font-size:11px;margin-bottom:5px}.metric strong{font-size:17px}
      h2{font-size:16px;margin:22px 0 10px}table{width:100%;border-collapse:collapse;table-layout:fixed}
      th,td{padding:9px 8px;border-bottom:1px solid #d7e0e7;text-align:left;vertical-align:top;overflow-wrap:anywhere}
      th{background:#eef4f6;color:#334554;font-size:10px;text-transform:uppercase}tbody tr:nth-child(even){background:#fafcfd}
      .items{display:grid;gap:3px;line-height:1.35}.footer{margin-top:18px;padding-top:10px;border-top:1px solid #d7e0e7;color:#738290;font-size:10px}
      @page{size:landscape;margin:10mm}@media print{.report{padding:0}thead{display:table-header-group}tr{break-inside:avoid}}
    </style></head><body><main class="report">
    <header class="header"><div class="brand"><div class="mark">FO</div><div><h1>${html(title)}</h1><p>${html(state.organizationName || "FlowOps")}</p></div></div>
    <div class="meta"><strong>${html(reportPeriodLabel())}</strong><br>${html(reportGroupLabel())}<br>Gerado em ${html(new Date().toLocaleString("pt-BR"))}</div></header>
    <section class="metrics">
      <div class="metric"><span>Receita</span><strong>${html(money.format(financial.revenue))}</strong></div>
      <div class="metric"><span>Custos</span><strong>${html(money.format(financial.costs))}</strong></div>
      <div class="metric"><span>Resultado</span><strong>${html(money.format(financial.profit))}</strong></div>
      <div class="metric"><span>A receber</span><strong>${html(money.format(financial.receivable))}</strong></div>
    </section>
    <h2>Detalhamento do período</h2>
    <table><thead><tr>${headers.map((item) => `<th>${html(item)}</th>`).join("")}</tr></thead>
    <tbody>${body.map((row) => `<tr>${row.map((cell, index) => {
      const value = html(String(cellExportText(cell)));
      return index === itemColumn ? `<td><div class="items">${value.split(", ").map((part) => `<span>${part}</span>`).join("")}</div></td>` : `<td>${value}</td>`;
    }).join("")}</tr>`).join("")}</tbody></table>
    <footer class="footer">Relatório gerado pelo FlowOps. Os valores refletem os registros disponíveis no período selecionado.</footer></main>
    <script>window.addEventListener('load',()=>{window.print();});<\/script></body></html>`);
  reportWindow.document.close();
}

// Coluna "Itens" na tela: mostra o texto truncado (4 itens + "+N") mas com
// tooltip nativo (title) revelando a lista completa - sem precisar de JS de
// hover proprio. A exportacao (csv/xlsx/pdf) usa a lista completa direto,
// nunca esse texto truncado (ver exportReport/exportReportTable).
function renderReportItemsCell(item) {
  const full = (item.itemsFull || []).join(", ") || "-";
  return `<span title="${html(full)}">${html(item.items || "-")}</span>`;
}

export function reportKpi(label, value, note, tone) {
  return `<article class="report-kpi ${tone || ""}"><span>${html(label)}</span><strong>${html(String(value))}</strong><small>${html(note)}</small></article>`;
}

export function renderDonutChart(rows, total, centerLabel = "Total") {
  if (!rows.length) return `<div class="empty-chart">Sem dados</div>`;
  const colors = ["#22c55e", "#3b82f6", "#8b5cf6", "#eab308", "#14b8a6", "#f43f5e"];
  let current = 0;
  const parts = rows.map((item, index) => {
    const start = current;
    const percent = total ? (Number(item.value || 0) / total) * 100 : 0;
    current += percent;
    return `${colors[index % colors.length]} ${start}% ${current}%`;
  }).join(", ");
  return `<div class="donut-panel report-donut-panel">
    <div class="donut" title="${html(centerLabel)}: ${html(String(total))}" style="background: conic-gradient(${parts})"><span>${html(centerLabel)}</span></div>
    <div class="donut-legend">${rows.map((item, index) => {
      const percent = total ? Math.round((Number(item.value || 0) / total) * 100) : 0;
      const value = Number(item.value || 0) > 20 ? money.format(Number(item.value || 0)) : item.value;
      return `<div title="${html(item.label)}: ${html(String(value))} (${percent}%)"><span><i style="background:${colors[index % colors.length]}"></i>${html(item.label)}</span><strong>${html(String(value))} (${percent}%)</strong></div>`;
    }).join("")}</div>
  </div>`;
}

export function renderReportInsight(icon, text) {
  return `<div class="report-insight"><span>${html(icon)}</span><p>${html(text)}</p></div>`;
}
