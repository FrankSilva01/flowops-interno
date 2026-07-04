import { SUPABASE_CONFIG } from "./core/config.js";
import {
  state, money, DEFAULT_RESPONSIBLES, PRODUCTION_STAGES, PRIORITY_OPTIONS, STATUS_OPTIONS,
  SUBSCRIPTION_DEFAULT_GRACE_DAYS, normalizeOrderStatus, normalizeStage, defaultChecklist,
  saveData, getInitialView, getHashRoute,
} from "./core/state.js";
import {
  byId, filterRows, countBy, flashActionMessage, uniqueValues, today, safeUrl, formatDateTime,
  nextId, sum, number, formatDate, formatDateShort, html, sanitizeRichHtml, showAppMessage,
  showAppConfirm, closeAppMessage,
} from "./core/dom.js";
import { renderBarChart, renderLineChart } from "./core/charts.js";
import { isAdminRole, isEditorRole, displayRole, ensureCanEdit, ensureCanAdmin, updateEditAccess } from "./core/permissions.js";
import {
  setupBackend, loadSupabase, resolveLoginBrand, showLoginOverlay, loginOnline, userAccessRequest,
  recoverPasswordFromLogin, sendPasswordRecovery, isPasswordRecoveryUrl, applyRecoverySessionFromUrl,
  promptForNewPassword, saveRecoveredPassword, enterOnlineApp, chooseMembership, canUserAccess,
  isConfiguredAdmin, getApprovedUser, logout, setSessionInfo,
} from "./core/session.js";
import {
  setView, render, bindEvents, bindActions, applySidebarPreference, toggleSidebar,
  updateSidebarToggle, setTheme, cycleTheme, applyTheme,
} from "./core/router.js";
import {
  persist, removeRemote, loadRemoteData, subscribeRemote, refreshRemote, tableName, toRemote,
  fromRemoteOrder, fromRemoteCash, fromRemoteMaterial,
} from "./data/remote.js";
import {
  initDashboardDrag, applyDashboardOrder, saveDashboardOrder, DASHBOARD_CARD_LABELS,
  renderDashboardCustomizer, applyDashboardVisibility, resetDashboardPreferences, openQuickAction,
  renderDashboard, renderCompanySidebarStatus, getRecentIntegrationErrors, getTokenAlert,
  renderIntegrationHealth, renderAlerts, renderWeeklyFocus, applyFocusFilter, renderTopOpenOrders,
  cashByDate, getTopClient, openEmailDigest, renderCommercialDashboard, renderTopProducts,
  renderFollowUps, getFinancialMetrics,
} from "./features/dashboard.js";
import {
  renderOrders, renderOrderReferences, renderQuoteActions, renderTags, renderInlineSelect,
  renderDeliveryDate, renderSlaBadge, getSlaState, getFieldClass, duplicateOrder,
  removeReferenceImage, updateQuoteStage, convertQuoteToProduction, updateOrderInline,
  removeOrderTag, removeStorageImage, saveOrder, openOrderEditDialog, saveOrderFromDialog,
  orderPaymentCashId, applyDeliveredPaymentDefault, syncOrderPaymentCash, ensureCustomTag,
  startOrderEdit, cancelOrderEdit, resetOrderForm, bindReferenceImageInput, setPendingReferenceImage,
  clearPendingReferenceImage, updateReferenceImagePreview, validateReferenceImage, uploadReferenceImage,
  normalizeImportedOrder, normalizeMarketplaceTag, filterOrders, getOrderMarketplaceChannel,
  matchesOrderFocus, sortOrders, getOrderPriority, parseOrderMeta, serializeOrderMeta,
  getOrderChanges, parseTags, mergeTags, isMarketplaceTag, getMarketplaceLabel,
  getSelectedMarketplaceLabel, updateMarketplaceCodePlaceholder, updateOrderFormStatusColor,
  copyMarketplaceCode, syncOrderFilterControls, getTagClass, getOrderCode, deriveOrderCode,
  nextOrderCode, appendHistory, showOrderHistory, customTagClass, deleteCustomTag,
} from "./features/orders.js";
import {
  renderProduction, filterProductionOrders, renderProductionSummary, isProductionEligible,
  renderKanbanCard, renderKanbanFilters, bindKanban,
} from "./features/production.js";
import { renderCash, saveCash, startCashEdit, cancelCashEdit, resetCashForm, filterCash } from "./features/cash.js";
import {
  setMaterialsTab, clearMaterialFilters, clearInventoryFilters, renderMaterials, renderInventory,
  formatInventoryNumber, saveMaterial, startMaterialEdit, cancelMaterialEdit, resetMaterialForm,
  saveInventoryItem, startInventoryEdit, resetInventoryForm, materialToCashEntry, materialCashId,
  filterMaterials, sortMaterials,
} from "./features/materials.js";
import {
  renderLeads, getInitials, getLeadOrders, getLeadFollowUp, openLeadDialog, renderLeadFiles,
  renderLeadHistory, saveLead, uploadLeadFiles, openLeadFile, deleteLeadFile, formatFileSize,
  openOrderFromLead,
} from "./features/customers.js";

// Bridge: o restante do app (ainda não modularizado, carregado por app-direct-legacy.js
// como script classico logo depois deste modulo) referencia estes nomes como globais.
// Isso preserva o comportamento atual identico enquanto o resto das features vai sendo
// migrado, uma de cada vez, em cima desta base.
Object.assign(window, {
  state, money, DEFAULT_RESPONSIBLES, PRODUCTION_STAGES, PRIORITY_OPTIONS, STATUS_OPTIONS,
  SUBSCRIPTION_DEFAULT_GRACE_DAYS, normalizeOrderStatus, normalizeStage, defaultChecklist,
  saveData, getInitialView, getHashRoute,
  byId, filterRows, countBy, flashActionMessage, uniqueValues, today, safeUrl, formatDateTime,
  nextId, sum, number, formatDate, formatDateShort, html, sanitizeRichHtml, showAppMessage,
  showAppConfirm, closeAppMessage,
  renderBarChart, renderLineChart,
  isAdminRole, isEditorRole, displayRole, ensureCanEdit, ensureCanAdmin, updateEditAccess,
  setupBackend, loadSupabase, resolveLoginBrand, showLoginOverlay, loginOnline, userAccessRequest,
  recoverPasswordFromLogin, sendPasswordRecovery, isPasswordRecoveryUrl, applyRecoverySessionFromUrl,
  promptForNewPassword, saveRecoveredPassword, enterOnlineApp, chooseMembership, canUserAccess,
  isConfiguredAdmin, getApprovedUser, logout, setSessionInfo,
  setView, render, bindEvents, bindActions, applySidebarPreference, toggleSidebar,
  updateSidebarToggle, setTheme, cycleTheme, applyTheme,
  persist, removeRemote, loadRemoteData, subscribeRemote, refreshRemote, tableName, toRemote,
  fromRemoteOrder, fromRemoteCash, fromRemoteMaterial,
  initDashboardDrag, applyDashboardOrder, saveDashboardOrder, DASHBOARD_CARD_LABELS,
  renderDashboardCustomizer, applyDashboardVisibility, resetDashboardPreferences, openQuickAction,
  renderDashboard, renderCompanySidebarStatus, getRecentIntegrationErrors, getTokenAlert,
  renderIntegrationHealth, renderAlerts, renderWeeklyFocus, applyFocusFilter, renderTopOpenOrders,
  cashByDate, getTopClient, openEmailDigest, renderCommercialDashboard, renderTopProducts,
  renderFollowUps, getFinancialMetrics,
  renderOrders, renderOrderReferences, renderQuoteActions, renderTags, renderInlineSelect,
  renderDeliveryDate, renderSlaBadge, getSlaState, getFieldClass, duplicateOrder,
  removeReferenceImage, updateQuoteStage, convertQuoteToProduction, updateOrderInline,
  removeOrderTag, removeStorageImage, saveOrder, openOrderEditDialog, saveOrderFromDialog,
  orderPaymentCashId, applyDeliveredPaymentDefault, syncOrderPaymentCash, ensureCustomTag,
  startOrderEdit, cancelOrderEdit, resetOrderForm, bindReferenceImageInput, setPendingReferenceImage,
  clearPendingReferenceImage, updateReferenceImagePreview, validateReferenceImage, uploadReferenceImage,
  normalizeImportedOrder, normalizeMarketplaceTag, filterOrders, getOrderMarketplaceChannel,
  matchesOrderFocus, sortOrders, getOrderPriority, parseOrderMeta, serializeOrderMeta,
  getOrderChanges, parseTags, mergeTags, isMarketplaceTag, getMarketplaceLabel,
  getSelectedMarketplaceLabel, updateMarketplaceCodePlaceholder, updateOrderFormStatusColor,
  copyMarketplaceCode, syncOrderFilterControls, getTagClass, getOrderCode, deriveOrderCode,
  nextOrderCode, appendHistory, showOrderHistory, customTagClass, deleteCustomTag,
  renderProduction, filterProductionOrders, renderProductionSummary, isProductionEligible,
  renderKanbanCard, renderKanbanFilters, bindKanban,
  renderCash, saveCash, startCashEdit, cancelCashEdit, resetCashForm, filterCash,
  setMaterialsTab, clearMaterialFilters, clearInventoryFilters, renderMaterials, renderInventory,
  formatInventoryNumber, saveMaterial, startMaterialEdit, cancelMaterialEdit, resetMaterialForm,
  saveInventoryItem, startInventoryEdit, resetInventoryForm, materialToCashEntry, materialCashId,
  filterMaterials, sortMaterials,
  renderLeads, getInitials, getLeadOrders, getLeadFollowUp, openLeadDialog, renderLeadFiles,
  renderLeadHistory, saveLead, uploadLeadFiles, openLeadFile, deleteLeadFile, formatFileSize,
  openOrderFromLead,
});

document.addEventListener("DOMContentLoaded", async () => {
  const marketplaceStatus = getMarketplaceStatusFromHash();
  applyTheme(state.theme);
  applySidebarPreference();
  bindEvents();
  initDashboardDrag();
  setView(state.view, true);
  try {
    await setupBackend();
  } catch (error) {
    console.error(error);
    setSessionInfo("Modo teste", "Falha no Supabase, usando local", "Modo local", false);
    alert(`Não foi possível iniciar o modo online: ${error.message}`);
  }
  render();
  showMarketplaceOAuthStatus(marketplaceStatus);
});

window.addEventListener("popstate", () => setView(getInitialView(), true));
