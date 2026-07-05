import { state, normalizeOrderStatus, saveData } from "./state.js";
import { byId, flashActionMessage, showAppMessage, closeAppMessage } from "./dom.js";
import { ensureCanEdit, ensureCanAdmin, updateEditAccess } from "./permissions.js";
import { logout, saveRecoveredPassword } from "./session.js";
import { persist, removeRemote } from "../data/remote.js";
import {
  renderDashboard, renderCommercialDashboard, renderTopProducts, renderFollowUps,
  renderCompanySidebarStatus, openQuickAction, resetDashboardPreferences, openEmailDigest,
  applyFocusFilter,
} from "../features/dashboard.js";
import {
  saveOrder, saveOrderFromDialog, updateMarketplaceCodePlaceholder, updateOrderFormStatusColor,
  bindReferenceImageInput, cancelOrderEdit, startOrderEdit, openOrderEditDialog, showOrderHistory,
  duplicateOrder, removeReferenceImage, updateOrderInline, removeOrderTag, copyMarketplaceCode,
  syncOrderFilterControls, updateQuoteStage, convertQuoteToProduction, applyDeliveredPaymentDefault,
  appendHistory, syncOrderPaymentCash, renderOrders, deleteCustomTag,
  setOrdersViewMode, openOrderDrawer, closeOrderDrawer, bindOrderDrawer,
} from "../features/orders.js";
import { renderProduction } from "../features/production.js";
import { renderCash, saveCash, startCashEdit, cancelCashEdit } from "../features/cash.js";
import {
  setMaterialsTab, clearMaterialFilters, clearInventoryFilters, saveMaterial, cancelMaterialEdit,
  saveInventoryItem, renderMaterials, renderInventory, resetInventoryForm, materialCashId,
  startInventoryEdit, startMaterialEdit,
} from "../features/materials.js";
import { renderLeads, openLeadDialog, saveLead, openOrderFromLead, openLeadFile, deleteLeadFile } from "../features/customers.js";
import { renderReports } from "../features/reports.js";
import { renderLogs, recordAudit, applyHistoryRange } from "../features/logs.js";
import {
  renderApprovals, renderActiveUsers, renderResponsibleOptions, loadAndRenderApprovals,
  loadAndRenderUsers, loadAndRenderResponsibles, createManualUserAccess, saveResponsible,
  approveAccess, rejectAccess, changeUserRole, removeUser, editResponsible, deleteResponsible,
  renderResponsibles,
} from "../features/users.js";
import {
  renderNotifications, renderTrialBanner, clearVisibleNotifications, markAllNotificationsRead,
  clearReadNotifications, openNotification, markNotificationRead,
} from "../features/notifications.js";
import {
  renderSubscriptionPortal, requestPlanChange, handlePaymentAction, submitScheduledDowngrade,
  closePaymentMethodDialog,
} from "../features/subscription.js";
import { submitSupportTicket, renderSupportPortal, renderWhatsNew } from "../features/support.js";
import {
  renderMarketplaces, loadAndRenderMarketplaces, connectMercadoLivre, disconnectMercadoLivre,
  configureShopee, connectAmazon, syncAmazon, syncMercadoLivre, saveMarketplaceListing,
  saveStorefrontProduct, updateStorefrontTargetFields, importSelectedListingToStorefrontForm,
  loadMlCategoryFields, bindStorefrontImageInputs, bindStorefrontDescriptionEditor, setMarketplaceView,
  applyMarketplaceLogRange, showMarketplaceStats, openMarketplaceEdit, fillStorefrontFormFromListing,
  viewMarketplaceOrder, createMarketplaceOrder, downloadMarketplaceDocument,
} from "../features/marketplace.js";
import {
  runManualBackup, downloadBackupScope, simulateBackupRestore, restoreBackupFromFile,
  downloadSavedBackup, renderSettingsData,
} from "../features/backup.js";
import { exportJson, importFile } from "./importer.js";
import {
  renderLogistics, openLogisticsDialog, saveLogisticsInfo, addLogisticsEvent, syncLogisticsFromMarketplace,
} from "../features/logistics.js";
import {
  openProductQuickDialog, saveProduct, deleteProduct, bindProductFormAutoSku, getProductForListing,
  openPriceCalculatorDialog, bindPriceCalculatorForm, openFinancialSettingsDialog, saveFinancialSettings,
  renderCommercialIntelligence, dismissSuggestion, resolveSuggestion, simulateSalesForGoal,
  renderOrderProductOptions, bindProductMarketplaceCheckboxes, bindProductImageInputs,
  bindProductProfitPreview, openBulkCostDialog, saveBulkCosts, renderListingProfitabilityTable,
  openPriceCalculatorForListing, dismissInsight,
} from "../features/pricing.js";
import {
  syncAnalyticsFull, renderPerformanceTable, bindPerformanceTableToggles,
  openListingDrawer, bindListingDrawer, closeListingDrawer,
} from "../features/marketplace-analytics.js";

function bindFilter(elementId, filterKey) {
  const element = byId(elementId);
  if (!element) return;
  element.addEventListener("change", (event) => {
    state.filters[filterKey] = event.target.value;
    renderTables();
  });
}

function bindTextFilter(elementId, filterKey, renderer, normalize = true) {
  const element = byId(elementId);
  if (!element) return;
  element.addEventListener("input", (event) => {
    state.filters[filterKey] = normalize ? event.target.value.trim().toLowerCase() : event.target.value;
    renderer();
  });
}

export function renderTables() {
  renderOrders();
  renderCash();
  renderMaterials();
  renderInventory();
}

export function bindEvents() {
  byId("sidebarToggle")?.addEventListener("click", toggleSidebar);
  document.querySelectorAll(".tab[data-view]").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view));
  });
  byId("globalSearch").addEventListener("input", (event) => {
    state.query = event.target.value.trim().toLowerCase();
    renderTables();
    renderLogs();
  });
  bindFilter("cashTypeFilter", "cashType");
  bindFilter("orderSort", "orderSort");
  bindFilter("orderMaterialFilter", "orderMaterial");
  bindFilter("orderMarketplaceFilter", "orderMarketplace");
  bindFilter("orderFocusFilter", "orderFocus");
  bindFilter("orderQuoteFilter", "orderQuote");
  bindFilter("materialTypeFilter", "materialType");
  bindFilter("materialSort", "materialSort");
  bindFilter("logTypeFilter", "logType");
  document.querySelectorAll("[data-order-status-pill]").forEach((button) => {
    button.addEventListener("click", () => {
      state.filters.orderStatus = button.dataset.orderStatusPill;
      syncOrderFilterControls();
      renderTables();
    });
  });
  byId("ordersSearchInput")?.addEventListener("input", (event) => {
    state.query = event.target.value.trim().toLowerCase();
    renderTables();
    renderLogs();
  });
  byId("ordersViewCardsBtn")?.addEventListener("click", () => setOrdersViewMode("cards"));
  byId("ordersViewTableBtn")?.addEventListener("click", () => setOrdersViewMode("table"));
  byId("toggleOrderFiltersBtn")?.addEventListener("click", () => {
    const panel = byId("orderAdvancedFilters");
    if (panel) panel.hidden = !panel.hidden;
  });
  bindOrderDrawer();
  byId("exportBtn").addEventListener("click", exportJson);
  byId("importBtn").addEventListener("click", () => byId("importFileInput").click());
  byId("importFileInput").addEventListener("change", importFile);
  byId("emailDigestBtn").addEventListener("click", openEmailDigest);
  byId("topProductsPeriod").addEventListener("change", (event) => {
    state.topProductsPeriod = event.target.value;
    renderTopProducts();
  });
  document.querySelectorAll("[data-report-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.reportTab = button.dataset.reportTab;
      document.querySelectorAll("[data-report-tab]").forEach((item) => item.classList.toggle("active", item === button));
      renderReports();
    });
  });
  byId("reportPeriodFilter")?.addEventListener("change", (event) => {
    state.reportPeriod = event.target.value;
  });
  byId("reportCompareFilter")?.addEventListener("change", (event) => {
    state.reportCompare = event.target.value;
  });
  byId("reportGroupFilter")?.addEventListener("change", (event) => {
    state.reportGroup = event.target.value;
  });
  byId("applyReportFiltersBtn")?.addEventListener("click", () => {
    state.reportPeriod = byId("reportPeriodFilter")?.value || "30";
    state.reportCompare = byId("reportCompareFilter")?.value || "previous";
    state.reportGroup = byId("reportGroupFilter")?.value || "day";
    renderReports();
    flashActionMessage("Filtros aplicados.");
  });
  byId("clearReportFiltersBtn")?.addEventListener("click", () => {
    state.reportPeriod = "30";
    state.reportCompare = "previous";
    state.reportGroup = "day";
    byId("reportPeriodFilter").value = state.reportPeriod;
    byId("reportCompareFilter").value = state.reportCompare;
    byId("reportGroupFilter").value = state.reportGroup;
    renderReports();
  });
  byId("themeToggle").addEventListener("click", cycleTheme);
  byId("notificationBell").addEventListener("click", () => {
    byId("notificationDropdown").hidden = !byId("notificationDropdown").hidden;
  });
  byId("sidebarNotificationsBtn").addEventListener("click", () => {
    byId("notificationDropdown").hidden = true;
    setView("notifications");
  });
  byId("openAllNotificationsBtn").addEventListener("click", () => {
    byId("notificationDropdown").hidden = true;
    setView("notifications");
  });
  byId("clearDashboardNotificationsBtn").addEventListener("click", clearVisibleNotifications);
  byId("notificationsPageMarkAllBtn").addEventListener("click", markAllNotificationsRead);
  byId("notificationsPageClearBtn").addEventListener("click", clearVisibleNotifications);
  document.querySelectorAll("[data-quick-action]").forEach((button) => {
    button.addEventListener("click", () => openQuickAction(button.dataset.quickAction));
  });
  document.querySelectorAll("[data-materials-tab]").forEach((button) => {
    button.addEventListener("click", () => setMaterialsTab(button.dataset.materialsTab));
  });
  bindTextFilter("materialSearchFilter", "materialSearch", renderMaterials);
  bindTextFilter("materialSupplierFilter", "materialSupplier", renderMaterials);
  bindTextFilter("materialDateFromFilter", "materialDateFrom", renderMaterials, false);
  bindTextFilter("materialDateToFilter", "materialDateTo", renderMaterials, false);
  bindTextFilter("inventorySearchFilter", "inventorySearch", renderInventory);
  bindTextFilter("inventorySupplierFilter", "inventorySupplier", renderInventory);
  byId("inventoryStatusFilter").addEventListener("change", (event) => {
    state.filters.inventoryStatus = event.target.value;
    renderInventory();
  });
  byId("clearMaterialFiltersBtn").addEventListener("click", clearMaterialFilters);
  byId("clearInventoryFiltersBtn").addEventListener("click", clearInventoryFilters);
  byId("goToUpgradeBtn").addEventListener("click", () => {
    byId("planLimitDialog").close();
    setView("subscription");
    byId("subscriptionPlanOptions").scrollIntoView({ behavior: "smooth", block: "center" });
  });
  document.addEventListener("pointerdown", (event) => {
    const notificationCenter = event.target.closest(".notification-center");
    if (!notificationCenter) byId("notificationDropdown").hidden = true;
    const dashboardToolbar = event.target.closest(".dashboard-toolbar");
    if (!dashboardToolbar) byId("dashboardCustomizePanel").hidden = true;
    const topbarMenu = event.target.closest(".topbar-menu");
    if (!topbarMenu) {
      byId("topbarMoreMenu").hidden = true;
      byId("topbarMoreBtn")?.setAttribute("aria-expanded", "false");
    }
  });
  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      byId("globalSearch")?.focus();
      return;
    }
    if (event.key !== "Escape") return;
    byId("notificationDropdown").hidden = true;
    byId("dashboardCustomizePanel").hidden = true;
    byId("topbarMoreMenu").hidden = true;
    closeOrderDrawer();
    closeListingDrawer();
  });
  byId("topbarMoreBtn")?.addEventListener("click", () => {
    const menu = byId("topbarMoreMenu");
    const willOpen = menu.hidden;
    menu.hidden = !willOpen;
    byId("topbarMoreBtn").setAttribute("aria-expanded", String(willOpen));
  });
  document.addEventListener("click", async (event) => {
    const planButton = event.target.closest("[data-request-plan]");
    if (planButton) await requestPlanChange(planButton.dataset.requestPlan);
    const paymentButton = event.target.closest("[data-payment-action]");
    if (paymentButton) await handlePaymentAction(paymentButton.dataset.paymentAction);
  });
  byId("passwordResetForm").addEventListener("submit", saveRecoveredPassword);
  byId("downgradeForm").addEventListener("submit", submitScheduledDowngrade);
  byId("closeDowngradeDialogBtn").addEventListener("click", () => byId("downgradeDialog").close());
  byId("cancelDowngradeBtn").addEventListener("click", () => byId("downgradeDialog").close());
  byId("closePaymentMethodBtn").addEventListener("click", (event) => {
    event.preventDefault();
    closePaymentMethodDialog();
  });
  byId("paymentMethodDialog").addEventListener("cancel", (event) => {
    event.preventDefault();
    closePaymentMethodDialog();
  });
  document.querySelectorAll("[data-close-payment-method]").forEach((button) => {
    button.addEventListener("click", closePaymentMethodDialog);
  });
  byId("markAllNotificationsBtn").addEventListener("click", markAllNotificationsRead);
  byId("clearReadNotificationsBtn").addEventListener("click", clearReadNotifications);
  byId("customizeDashboardBtn").addEventListener("click", () => {
    const panel = byId("dashboardCustomizePanel");
    panel.hidden = !panel.hidden;
  });
  byId("resetDashboardBtn").addEventListener("click", resetDashboardPreferences);
  byId("clearMarketplaceLogsViewBtn").addEventListener("click", () => {
    state.marketplaceLogsCleared = true;
    renderMarketplaces();
  });
  byId("applyMarketplaceLogRangeBtn").addEventListener("click", applyMarketplaceLogRange);
  byId("loadMoreMarketplaceLogsBtn").addEventListener("click", () => {
    state.marketplaceLogsCleared = false;
    state.marketplaceLogLimit += 30;
    renderMarketplaces();
  });
  byId("clearHistoryViewBtn").addEventListener("click", () => {
    state.historyCleared = true;
    renderLogs();
  });
  byId("applyHistoryRangeBtn").addEventListener("click", applyHistoryRange);
  byId("loadMoreHistoryBtn").addEventListener("click", () => {
    state.historyCleared = false;
    state.historyLimit += 40;
    renderLogs();
  });
  document.querySelectorAll("[data-notification-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.notificationFilter = button.dataset.notificationFilter || "all";
      renderNotifications();
    });
  });
  byId("leadSearch").addEventListener("input", (event) => {
    state.leadSearch = event.target.value.trim().toLowerCase();
    renderLeads();
  });
  byId("leadStatusFilter").addEventListener("change", (event) => {
    state.leadStatusFilter = event.target.value;
    renderLeads();
  });
  byId("leadOriginFilter").addEventListener("change", (event) => {
    state.leadOriginFilter = event.target.value;
    renderLeads();
  });
  byId("supportTicketForm").addEventListener("submit", submitSupportTicket);
  byId("newLeadBtn").addEventListener("click", () => openLeadDialog());
  byId("leadForm").addEventListener("submit", saveLead);
  byId("orderForm").addEventListener("submit", saveOrder);
  byId("orderEditDialogForm").addEventListener("submit", saveOrderFromDialog);
  byId("orderForm").elements.marketplaceTagToAdd.addEventListener("change", updateMarketplaceCodePlaceholder);
  byId("orderForm").elements.status.addEventListener("change", updateOrderFormStatusColor);
  bindReferenceImageInput();
  byId("cancelOrderEditBtn").addEventListener("click", cancelOrderEdit);
  byId("closeHistoryBtn").addEventListener("click", () => byId("historyDialog").close());
  byId("cashForm").addEventListener("submit", saveCash);
  byId("cancelCashEditBtn").addEventListener("click", cancelCashEdit);
  byId("materialForm").addEventListener("submit", saveMaterial);
  byId("cancelMaterialEditBtn").addEventListener("click", cancelMaterialEdit);
  byId("inventoryForm").addEventListener("submit", saveInventoryItem);
  byId("cancelInventoryEditBtn").addEventListener("click", resetInventoryForm);
  byId("closeAppMessageBtn").addEventListener("click", closeAppMessage);
  byId("confirmAppMessageBtn").addEventListener("click", closeAppMessage);
  byId("logoutBtn").addEventListener("click", logout);
  byId("refreshApprovalsBtn").addEventListener("click", loadAndRenderApprovals);
  byId("refreshUsersBtn").addEventListener("click", loadAndRenderUsers);
  byId("refreshResponsiblesBtn").addEventListener("click", loadAndRenderResponsibles);
  byId("refreshMarketplacesBtn").addEventListener("click", loadAndRenderMarketplaces);
  byId("refreshMarketplaceSalesBtn").addEventListener("click", loadAndRenderMarketplaces);
  byId("refreshMarketplaceLogsBtn").addEventListener("click", loadAndRenderMarketplaces);
  byId("connectMercadoLivreBtn").addEventListener("click", connectMercadoLivre);
  byId("connectShopeeBtn").addEventListener("click", configureShopee);
  byId("connectAmazonBtn").addEventListener("click", connectAmazon);
  byId("syncAmazonBtn").addEventListener("click", syncAmazon);
  byId("syncMercadoLivreBtn").addEventListener("click", syncMercadoLivre);
  byId("syncMarketplaceSalesBtn").addEventListener("click", syncMercadoLivre);
  byId("marketplaceEditForm").addEventListener("submit", saveMarketplaceListing);
  byId("storefrontProductForm").addEventListener("submit", saveStorefrontProduct);
  byId("storefrontProductForm").elements.publish_ml.addEventListener("change", updateStorefrontTargetFields);
  byId("storefrontProductForm").elements.publish_shopee.addEventListener("change", updateStorefrontTargetFields);
  byId("storefrontProductForm").elements.publish_amazon.addEventListener("change", updateStorefrontTargetFields);
  byId("storefrontProductForm").elements.marketplace.addEventListener("change", updateStorefrontTargetFields);
  byId("importListingToStorefrontBtn").addEventListener("click", importSelectedListingToStorefrontForm);
  byId("loadMlCategoryFieldsBtn").addEventListener("click", loadMlCategoryFields);
  byId("refreshStorefrontBtn").addEventListener("click", loadAndRenderMarketplaces);
  byId("openStorefrontBtn").addEventListener("click", () => window.open("https://fancy-pastelito-51931f.netlify.app/", "_blank", "noopener"));
  bindStorefrontImageInputs();
  bindStorefrontDescriptionEditor();
  document.querySelectorAll("[data-marketplace-view]").forEach((button) => {
    button.addEventListener("click", () => setMarketplaceView(button.dataset.marketplaceView));
  });
  document.querySelectorAll("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => byId(button.dataset.closeDialog).close());
  });
  byId("manualUserForm").addEventListener("submit", createManualUserAccess);
  byId("responsibleForm").addEventListener("submit", saveResponsible);
  byId("runBackupBtn").addEventListener("click", runManualBackup);
  byId("downloadSystemBackupBtn").addEventListener("click", () => downloadBackupScope("system"));
  byId("downloadStorefrontBackupBtn").addEventListener("click", () => downloadBackupScope("storefront"));
  byId("downloadDatabaseBackupBtn").addEventListener("click", () => downloadBackupScope("database"));
  byId("simulateBackupRestoreBtn").addEventListener("click", simulateBackupRestore);
  byId("restoreBackupBtn").addEventListener("click", restoreBackupFromFile);
  byId("logisticsForm").addEventListener("submit", saveLogisticsInfo);
  byId("logisticsEventForm").addEventListener("submit", addLogisticsEvent);
  byId("logisticsSearch")?.addEventListener("input", (event) => {
    state.logisticsSearch = event.target.value.trim().toLowerCase();
    renderLogistics();
  });
  byId("logisticsStatusFilter")?.addEventListener("change", (event) => {
    state.logisticsStatusFilter = event.target.value;
    renderLogistics();
  });
  byId("productForm").addEventListener("submit", saveProduct);
  bindProductFormAutoSku();
  bindProductMarketplaceCheckboxes();
  bindProductImageInputs();
  bindProductProfitPreview();
  byId("priceCalculatorForm").addEventListener("submit", (event) => event.preventDefault());
  bindPriceCalculatorForm();
  byId("financialSettingsForm").addEventListener("submit", saveFinancialSettings);
  byId("profitSimulatorForm").addEventListener("submit", simulateSalesForGoal);
  byId("bulkCostForm").addEventListener("submit", saveBulkCosts);
  byId("productSearchInput")?.addEventListener("input", (event) => {
    state.productSearch = event.target.value.trim().toLowerCase();
    renderCommercialIntelligence();
  });
  byId("intelligenceTableLevelFilter")?.addEventListener("change", (event) => {
    state.intelligenceTableLevelFilter = event.target.value;
    renderListingProfitabilityTable();
  });
  byId("intelligenceTableMarketplaceFilter")?.addEventListener("change", (event) => {
    state.intelligenceTableMarketplaceFilter = event.target.value;
    renderListingProfitabilityTable();
  });
  byId("intelligenceTableSort")?.addEventListener("change", (event) => {
    state.intelligenceTableSort = event.target.value;
    renderListingProfitabilityTable();
  });
  byId("performanceTableHealthFilter")?.addEventListener("change", (event) => {
    state.performanceTableHealthFilter = event.target.value;
    renderPerformanceTable();
  });
  byId("performanceTableSort")?.addEventListener("change", (event) => {
    state.performanceTableSort = event.target.value;
    renderPerformanceTable();
  });
  bindPerformanceTableToggles();
  bindListingDrawer();
  updateMarketplaceCodePlaceholder();
  updateOrderFormStatusColor();
  updateStorefrontTargetFields();
}

export function setView(view, replace = false) {
  const allowed = ["dashboard", "orders", "production", "logistics", "cash", "materials", "reports", "leads", "subscription", "notifications", "support", "whatsnew", "logs", ...(state.isAdmin ? ["marketplace", "approvals"] : [])];
  if (!allowed.includes(view)) view = "dashboard";
  state.view = view;
  localStorage.setItem("3daft-active-view", view);
  const nextHash = `#${view}`;
  if (window.location.hash !== nextHash) {
    const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`;
    if (replace) history.replaceState(null, "", nextUrl);
    else history.pushState(null, "", nextUrl);
  }
  document.querySelectorAll(".tab").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  document.querySelectorAll(".view").forEach((section) => section.classList.remove("active-view"));
  byId(`${view}View`).classList.add("active-view");
  byId("viewTitle").textContent = {
    dashboard: "Dashboard",
    orders: "Encomendas",
    production: "Produção",
    logistics: "Logística",
    cash: "Fluxo de caixa",
    materials: "Materiais",
    reports: "Relatórios",
    leads: "Clientes e Leads",
    subscription: "Minha Assinatura",
    notifications: "Notificações",
    support: "Suporte",
    whatsnew: "Novidades da Plataforma",
    marketplace: "Marketplace",
    logs: "Histórico",
    approvals: "Gestão de usuários"
  }[view];
  byId("globalSearch").hidden = ["dashboard", "reports", "approvals", "notifications", "subscription", "support", "whatsnew", "orders"].includes(view);
  if (view === "approvals") renderActiveUsers();
  if (!byId("appView")?.hidden) render();
}

export function render() {
  updateEditAccess();
  renderCompanySidebarStatus();
  renderResponsibleOptions();
  renderOrderProductOptions();
  renderNotifications();
  renderTrialBanner();
  switch (state.view) {
    case "dashboard":
      renderDashboard();
      renderCommercialDashboard();
      renderTopProducts();
      renderFollowUps();
      break;
    case "orders":
    case "cash":
    case "materials":
      renderTables();
      renderSettingsData();
      break;
    case "reports":
      renderReports();
      break;
    case "production":
      renderProduction();
      break;
    case "logistics":
      renderLogistics();
      break;
    case "approvals":
      renderApprovals();
      renderActiveUsers();
      renderResponsibles();
      break;
    case "marketplace":
      renderMarketplaces();
      break;
    case "logs":
      renderLogs();
      break;
    case "leads":
      renderLeads();
      renderFollowUps();
      break;
    case "notifications":
      break;
    case "subscription":
      renderSubscriptionPortal();
      break;
    case "support":
      renderSupportPortal();
      break;
    case "whatsnew":
      renderWhatsNew();
      break;
    default:
      renderDashboard();
  }
}

export function bindActions() {
  document.querySelectorAll("[data-action]").forEach((button) => {
    const handler = async () => {
      const { action, id } = button.dataset;
      if (action === "edit-order") {
        if (!ensureCanEdit()) return;
        startOrderEdit(id);
        return;
      }
      if (action === "edit-order-modal") {
        if (!ensureCanEdit()) return;
        openOrderEditDialog(id);
        return;
      }
      if (action === "edit-material") {
        if (!ensureCanEdit()) return;
        startMaterialEdit(id);
        return;
      }
      if (action === "edit-cash") {
        if (!ensureCanEdit()) return;
        startCashEdit(id);
        return;
      }
      if (action === "history-order") {
        showOrderHistory(id);
        return;
      }
      if (action === "open-order-drawer") {
        openOrderDrawer(id);
        return;
      }
      if (action === "duplicate-order") {
        if (!ensureCanEdit()) return;
        await duplicateOrder(id);
        return;
      }
      if (action === "remove-reference-image") {
        if (!ensureCanEdit()) return;
        await removeReferenceImage(id);
        return;
      }
      if (action === "inline-order-field") {
        if (!ensureCanEdit()) return;
        await updateOrderInline(id, button.dataset.field, button.value);
        return;
      }
      if (action === "remove-order-tag") {
        if (!ensureCanEdit()) return;
        await removeOrderTag(id, button.dataset.tag);
        return;
      }
      if (action === "copy-marketplace-code") {
        await copyMarketplaceCode(id);
        return;
      }
      if (action === "download-saved-backup") {
        await downloadSavedBackup(id);
        return;
      }
      if (action === "open-logistics") {
        openLogisticsDialog(id);
        return;
      }
      if (action === "sync-ml-shipment") {
        if (!ensureCanEdit()) return;
        syncLogisticsFromMarketplace(id);
        return;
      }
      if (action === "open-product-dialog") {
        if (!ensureCanEdit()) return;
        openProductQuickDialog();
        return;
      }
      if (action === "edit-product") {
        if (!ensureCanEdit()) return;
        openProductQuickDialog(id);
        return;
      }
      if (action === "delete-product") {
        if (!ensureCanEdit()) return;
        await deleteProduct(id);
        return;
      }
      if (action === "edit-listing-product") {
        if (!ensureCanEdit()) return;
        const form = byId("marketplaceEditForm");
        const marketplace = form.elements.marketplace.value;
        const externalId = form.elements.itemId.value;
        const product = getProductForListing(marketplace, externalId);
        byId("marketplaceEditDialog").close();
        openProductQuickDialog(product?.id || "");
        if (!product) byId("productForm").elements.listingLink.value = `${marketplace}:${externalId}`;
        return;
      }
      if (action === "open-price-calculator") {
        openPriceCalculatorDialog();
        return;
      }
      if (action === "open-financial-settings") {
        if (!ensureCanEdit()) return;
        openFinancialSettingsDialog();
        return;
      }
      if (action === "open-bulk-cost-dialog") {
        if (!ensureCanEdit()) return;
        openBulkCostDialog();
        return;
      }
      if (action === "simulate-listing") {
        openPriceCalculatorForListing(button.dataset.marketplace, button.dataset.externalId);
        return;
      }
      if (action === "dismiss-insight") {
        dismissInsight(button.dataset.insightKey);
        return;
      }
      if (action === "sync-analytics-full") {
        await syncAnalyticsFull();
        return;
      }
      if (action === "open-listing-drawer") {
        openListingDrawer(button.dataset.marketplace, button.dataset.externalId);
        return;
      }
      if (action === "resolve-suggestion") {
        if (!ensureCanEdit()) return;
        await resolveSuggestion(id);
        return;
      }
      if (action === "dismiss-suggestion") {
        if (!ensureCanEdit()) return;
        await dismissSuggestion(id);
        return;
      }
      if (action === "kanban-filter") {
        state.filters[button.dataset.filter] = button.dataset.value;
        syncOrderFilterControls();
        renderProduction();
        return;
      }
      if (action === "focus-orders") {
        applyFocusFilter(button.dataset.focus);
        return;
      }
      if (action === "view-orders") {
        setView("orders");
        return;
      }
      if (action === "open-quotes") {
        state.filters.orderQuote = "quotes";
        syncOrderFilterControls();
        setView("orders");
        renderTables();
        return;
      }
      if (action === "open-leads") {
        setView("leads");
        return;
      }
      if (action === "scroll-subscription-payment") {
        byId("subscriptionPaymentSection")?.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      if (action === "scroll-subscription-plans") {
        byId("subscriptionPlanOptions")?.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      if (action === "marketplace-stats") {
        await showMarketplaceStats(id, button.dataset.marketplace);
        return;
      }
      if (action === "marketplace-edit") {
        await openMarketplaceEdit(id, button.dataset.marketplace);
        return;
      }
      if (action === "storefront-edit") {
        const item = state.marketplaceListings.find((listing) =>
          listing.external_id === id && listing.marketplace === button.dataset.marketplace
        );
        fillStorefrontFormFromListing(item);
        setMarketplaceView("storefront");
        return;
      }
      if (action === "marketplace-view-order") {
        viewMarketplaceOrder(id);
        return;
      }
      if (action === "marketplace-create-order") {
        await createMarketplaceOrder(id, button.dataset.marketplace);
        return;
      }
      if (action === "open-marketplace-logs") {
        setMarketplaceView("api-logs");
        return;
      }
      if (action === "marketplace-reconnect-ml") {
        await connectMercadoLivre();
        return;
      }
      if (action === "marketplace-disconnect-ml") {
        await disconnectMercadoLivre();
        return;
      }
      if (action === "marketplace-log-filter") {
        state.marketplaceLogFilter = button.dataset.filter || "all";
        state.marketplaceLogsCleared = false;
        state.marketplaceLogLimit = 30;
        renderMarketplaces();
        return;
      }
      if (action === "marketplace-channel-filter") {
        state.marketplaceChannelFilter = button.dataset.channel || "all";
        renderMarketplaces();
        return;
      }
      if (action === "marketplace-document") {
        await downloadMarketplaceDocument(id, button.dataset.marketplace, button.dataset.document || "label");
        return;
      }
      if (action === "marketplace-print") {
        await downloadMarketplaceDocument(id, button.dataset.marketplace, "label", true);
        return;
      }
      if (action === "open-marketplace-errors") {
        state.marketplaceLogFilter = "error";
        setView("marketplace");
        setMarketplaceView("api-logs");
        renderMarketplaces();
        return;
      }
      if (action === "approve-access") {
        if (!ensureCanAdmin()) return;
        await approveAccess(button.dataset.email);
        return;
      }
      if (action === "reject-access") {
        if (!ensureCanAdmin()) return;
        await rejectAccess(button.dataset.email);
        return;
      }
      if (action === "change-user-role") {
        if (!ensureCanAdmin()) return;
        await changeUserRole(button.dataset.email, button.value);
        return;
      }
      if (action === "remove-user") {
        if (!ensureCanAdmin()) return;
        await removeUser(button.dataset.email);
        return;
      }
      if (action === "edit-responsible") {
        if (!ensureCanAdmin()) return;
        await editResponsible(id);
        return;
      }
      if (action === "delete-responsible") {
        if (!ensureCanAdmin()) return;
        await deleteResponsible(id);
        return;
      }
      if (action === "edit-lead") {
        openLeadDialog(id);
        return;
      }
      if (action === "open-lead-order") {
        openOrderFromLead(id);
        return;
      }
      if (action === "open-lead-file") {
        await openLeadFile(id);
        return;
      }
      if (action === "delete-lead-file") {
        if (!ensureCanEdit()) return;
        await deleteLeadFile(id);
        return;
      }
      if (action === "delete-custom-tag") {
        if (!ensureCanEdit()) return;
        await deleteCustomTag(id);
        return;
      }
      if (action === "mark-notification-read") {
        await markNotificationRead(id, true);
        return;
      }
      if (action === "open-notification") {
        await openNotification(id);
        return;
      }
      if (action === "open-subscription") {
        setView("subscription");
        return;
      }
      if (action === "set-quote-stage") {
        if (!ensureCanEdit()) return;
        await updateQuoteStage(id, button.value);
        return;
      }
      if (action === "convert-quote") {
        if (!ensureCanEdit()) return;
        await convertQuoteToProduction(id);
        return;
      }
      if (action === "toggle-order") {
        if (!ensureCanEdit()) return;
        const item = state.data.orders.find((row) => row.id === id);
        const previousOrder = structuredClone(item);
        const previousStatus = normalizeOrderStatus(item.status);
        item.status = previousStatus === "Entregue" ? "A preparar" : "Entregue";
        if (item.status === "Entregue") item.productionStage = "Entregue";
        applyDeliveredPaymentDefault(item);
        item.history = appendHistory(item.history, [{ field: "Status", from: previousStatus, to: item.status }]);
        await persist("orders", item);
        await syncOrderPaymentCash(item, previousOrder);
      }
      if (action === "delete-order") {
        if (!ensureCanEdit() || !confirm("Excluir esta encomenda?")) return;
        const deleted = state.data.orders.find((item) => item.id === id);
        await recordAudit("delete", "order", id, deleted?.orderCode, deleted, null, "manual");
        state.data.orders = state.data.orders.filter((item) => item.id !== id);
        await removeRemote("orders", id);
      }
      if (action === "delete-cash") {
        if (!ensureCanEdit() || !confirm("Excluir este lançamento do fluxo de caixa?")) return;
        state.data.cash = state.data.cash.filter((item) => item.id !== id);
        await removeRemote("cash", id);
      }
      if (action === "delete-material") {
        if (!ensureCanEdit() || !confirm("Excluir este material e a saída vinculada no caixa?")) return;
        state.data.materials = state.data.materials.filter((item) => item.id !== id);
        const cashId = materialCashId(id);
        state.data.cash = state.data.cash.filter((item) => item.id !== cashId);
        await removeRemote("materials", id);
        await removeRemote("cash", cashId);
      }
      if (action === "edit-inventory") {
        if (!ensureCanEdit()) return;
        startInventoryEdit(id);
        return;
      }
      if (action === "delete-inventory") {
        if (!ensureCanEdit() || !confirm("Excluir este item do estoque?")) return;
        const { error } = await state.supabase.from("inventory_items").delete().eq("id", id);
        if (error) {
          showAppMessage("Não foi possível excluir", error.message, "error");
          return;
        }
        state.inventoryItems = state.inventoryItems.filter((item) => item.id !== id);
        renderInventory();
        return;
      }
      saveData();
      render();
    };
    if (button.tagName === "SELECT") button.onchange = handler;
    else button.onclick = handler;
  });
}

export function applySidebarPreference() {
  const collapsed = localStorage.getItem("flowops-sidebar-collapsed") === "true";
  byId("appView")?.classList.toggle("sidebar-collapsed", collapsed);
  updateSidebarToggle(collapsed);
}

export function toggleSidebar() {
  const appView = byId("appView");
  if (!appView) return;
  const collapsed = appView.classList.toggle("sidebar-collapsed");
  localStorage.setItem("flowops-sidebar-collapsed", String(collapsed));
  updateSidebarToggle(collapsed);
}

export function updateSidebarToggle(collapsed) {
  const button = byId("sidebarToggle");
  if (!button) return;
  button.setAttribute("aria-expanded", String(!collapsed));
  button.setAttribute("aria-label", collapsed ? "Expandir menu" : "Recolher menu");
  button.title = collapsed ? "Expandir menu" : "Recolher menu";
}

export function setTheme(theme) {
  state.theme = ["light", "dark"].includes(theme) ? theme : "dark";
  localStorage.setItem("3daft-theme", state.theme);
  applyTheme(state.theme);
}

export function cycleTheme() {
  setTheme(state.theme === "dark" ? "light" : "dark");
}

export function applyTheme(theme) {
  const resolved = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = resolved;
  const button = byId("themeToggle");
  const icon = byId("themeToggleIcon");
  const labels = { light: "claro", dark: "escuro" };
  const icons = { light: "ti-sun", dark: "ti-moon" };
  if (button) {
    button.title = `Tema: ${labels[theme]}. Clique para alterar.`;
    button.setAttribute("aria-label", button.title);
  }
  if (icon) icon.className = `ti ${icons[theme]}`;
}
