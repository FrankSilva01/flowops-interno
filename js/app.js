import { SUPABASE_CONFIG } from "./core/config.js";
import {
  state, money, DEFAULT_RESPONSIBLES, PRODUCTION_STAGES, PRIORITY_OPTIONS, STATUS_OPTIONS,
  SUBSCRIPTION_DEFAULT_GRACE_DAYS, normalizeOrderStatus, normalizeStage, defaultChecklist,
  saveData, getInitialView, getHashRoute,
} from "./core/state.js";
import {
  byId, filterRows, countBy, flashActionMessage, uniqueValues, today, safeUrl, formatDateTime,
  nextId, sum, number, formatDate, formatDateShort, html, sanitizeRichHtml, showAppMessage,
  showAppConfirm, closeAppMessage, renderOperationalSummary,
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
  renderFollowUps, getFinancialMetrics, renderAttentionNeeded, updateDashboardCollapsibleSummaries,
  bindDashboardCollapsibles,
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
  setOrdersViewMode, applyOrdersViewMode, openOrderDrawer, closeOrderDrawer, bindOrderDrawer,
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
import {
  renderReports, renderReportTabContent, reportProductDefinition, reportMaterialDefinition,
  reportClientDefinition, reportStockDefinition, aggregateReportRows, reportLateOrders,
  reportTabLabel, reportPeriodLabel, reportGroupLabel, exportReportTable, exportReport,
  downloadTextFile, getReportRows, reportStartDate, reportReferenceDate, reportOrderDate,
  findOrderCashEntry, getReportFinancial, reportDailyRows, reportGroupKey, localReportDateKey,
  formatReportGroupLabel, parseReportDate, openReportPrintView, reportMarketplaceRows, reportKpi,
  renderDonutChart, renderReportInsight,
} from "./features/reports.js";
import {
  renderLogs, applyHistoryRange, isWithinDateRange, auditActionLabel, auditDiffText,
  formatAuditValue, recordAudit, auditSnapshot,
} from "./features/logs.js";
import {
  renderApprovals, renderActiveUsers, renderResponsibles, loadAccessRequests, loadActiveUsers,
  loadResponsibles, loadAndRenderResponsibles, loadAndRenderApprovals, loadAndRenderUsers,
  approveAccess, rejectAccess, changeUserRole, removeUser, createManualUserAccess,
  showPlanLimitDialog, saveResponsible, editResponsible, deleteResponsible,
  renderResponsibleOptions, getResponsibleNames, nextResponsibleId,
} from "./features/users.js";
import {
  createNotification, ensureOperationalNotifications, renderNotifications, notificationAllowed,
  markNotificationRead, markAllNotificationsRead, clearReadNotifications, clearVisibleNotifications,
  openNotification, renderTrialBanner,
} from "./features/notifications.js";
import {
  getSubscriptionAccessStatus, subscriptionFallbackFromOrganization, getSubscriptionAlert,
  renderSubscriptionPortal, getSubscriptionPrice, addDays, subscriptionPaymentApproved,
  subscriptionRenewalMissed, getSubscriptionGraceInfo, renderSubscriptionPlanOptions,
  requestPlanChange, openDowngradeDialog, submitScheduledDowngrade, handlePaymentAction,
  callSubscriptionApi, openPaymentMethodDialog, normalizeMercadoPagoCardFields, paymentErrorMessage,
  refreshPaymentCardFormAfterError, showPaymentCheckoutFallback, closePaymentMethodDialog,
  loadMercadoPagoSdk, normalizeApiError, subscriptionMetric, getCompanyHealth,
  subscriptionStatusText, paymentStatusText,
} from "./features/subscription.js";
import { submitSupportTicket, renderSupportPortal, renderWhatsNew } from "./features/support.js";
import {
  normalizeMarketplaceChannel, marketplaceDisplayName, matchesMarketplaceChannel,
  marketplaceChannelsForCurrentFilter, renderMarketplaceChannelCards, getIntegrationTokenAlert,
  renderMarketplaces, renderIntegrationSummary, renderMarketplaceLogSummary, renderMarketplaceApiLog,
  marketplaceLogLabel, marketplaceLogKindClass, marketplaceLogStatusLabel, marketplaceLogStatusClass,
  matchesMarketplaceLogFilter, loadMarketplaces, loadAndRenderMarketplaces, renderStorefrontAdmin,
  updateStorefrontTargetFields, storefrontListingImages, storefrontDeliveryNoteFromListing,
  fillStorefrontFormFromListing, importSelectedListingToStorefrontForm, saveStorefrontProduct,
  bindStorefrontImageInputs, addStorefrontImageFiles, bindStorefrontDescriptionEditor,
  resizeImageFileForStorefront, storefrontRequest, loadMlCategoryFields, parseJsonSafe,
  connectMercadoLivre, disconnectMercadoLivre, configureShopee, renderMarketplaceWritePermission,
  marketplaceSaleStatus, marketplaceSaleStatusClass, setMarketplaceView, applyMarketplaceLogRange,
  viewMarketplaceOrder, createMarketplaceOrder, marketplaceRequest, downloadMarketplaceDocument,
  syncMercadoLivre, connectAmazon, syncAmazon, showMarketplaceStats, openMarketplaceEdit,
  saveMarketplaceListing, getMarketplaceStatusFromHash, showMarketplaceOAuthStatus,
} from "./features/marketplace.js";
import {
  renderSettingsData, runManualBackup, maintenanceRequest, downloadBackupScope, downloadSavedBackup,
  restoreBackupFromFile, simulateBackupRestore, renderBackupSimulation, readBackupFile,
  validateBackupSnapshot, downloadJsonFile,
} from "./features/backup.js";
import {
  exportJson, importFile, importJson, importCollection, importRows, parseCsv, splitCsvLine,
  normalizeText, normalizeImportedItem, pick, normalizeKey, normalizeDate, loadXlsx,
} from "./core/importer.js";
import {
  LOGISTICS_STATUSES, getOrderLogistics, getLogisticsStatusLabel, getLogisticsStatusClass,
  renderLogisticsBadge, renderLogistics, openLogisticsDialog, renderLogisticsTimeline,
  saveLogisticsInfo, addLogisticsEvent, getDeliveryStatusCounts, renderDeliveryStatusWidget,
  checkLogisticsDelays, syncLogisticsFromMarketplace,
} from "./features/logistics.js";
import {
  getFinancialSettings, hasCommercialIntelligenceAccess, getProfitabilityLevel, deriveSkuCode,
  categoryPrefix, nextProductSku, getProductForListing, getProductForOrder, renderProductCatalogTable,
  openProductQuickDialog, renderProductListingOptions, bindProductFormAutoSku, saveProduct, deleteProduct,
  renderOrderProductOptions, classifyMlListingType, resolveListingFeePct, resolveOrderFeeInfo,
  getListingProfitability, getOrderProfitability, renderProfitabilityBadge, getProfitabilitySummary,
  getProfitPotential, calculatePriceSuggestion, buildPriceCalculatorResult, openPriceCalculatorDialog,
  renderPriceCalculator, updatePriceCalculatorResult, bindPriceCalculatorForm, generateSuggestions,
  renderSuggestions, dismissSuggestion, resolveSuggestion, renderProfitSimulator, simulateSalesForGoal,
  renderMarketplaceComparison, renderProfitabilityDashboardWidget, renderCommercialIntelligence,
  renderProfitabilitySummaryPanel, openFinancialSettingsDialog, saveFinancialSettings, reportPricingDefinition,
  isMarketplaceAccountConnected, updateProductMarketplaceStatusHints, bindProductMarketplaceCheckboxes,
  bindProductImageInputs, resolveChannelFeePct, computeMarginBreakdown, renderProductProfitPreview,
  bindProductProfitPreview,
} from "./features/pricing.js";
import { bindCalendarEvents, renderCalendarWithEvents } from "./features/calendar-navigation.js";
import { renderAdvancedDashboard, advancedDashboardCSS } from "./features/advanced-dashboard.js";
import { openMLPricingDialog, applyPriceRecommendation, iaPricingCSS } from "./features/ia-pricing.js";
import { pushNotificationManager, pushNotificationsCSS } from "./features/push-notifications.js";
import { accountingIntegration, accountingIntegrationCSS } from "./features/accounting-integration.js";

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

  // Initialize calendar
  try {
    const now = new Date();
    bindCalendarEvents();
    const calendarContainer = byId("calendarWidget");
    if (calendarContainer) {
      calendarContainer.innerHTML = renderCalendarWithEvents(now.getFullYear(), now.getMonth());
    }
  } catch (err) {
    console.error("Calendar init error:", err);
  }

  // Temporarily disabled Advanced Dashboard
  /*
  try {
    const dashboardContainer = byId("advancedDashboard");
    if (dashboardContainer) {
      const style = document.createElement("style");
      style.textContent = advancedDashboardCSS;
      document.head.appendChild(style);
      renderAdvancedDashboard();
    }
  } catch (err) {
    console.error("Advanced dashboard init error:", err);
  }
  */

  // Initialize all remaining features
  setTimeout(() => {
    try {
      const iaPricingStyle = document.createElement("style");
      iaPricingStyle.textContent = iaPricingCSS;
      document.head.appendChild(iaPricingStyle);
    } catch (err) {
      console.error("IA Pricing CSS error:", err);
    }

    try {
      const pushStyle = document.createElement("style");
      pushStyle.textContent = pushNotificationsCSS;
      document.head.appendChild(pushStyle);
      pushNotificationManager.init?.().catch(e => console.error("Push init error:", e));
    } catch (err) {
      console.error("Push Notifications error:", err);
    }

    try {
      const accountingStyle = document.createElement("style");
      accountingStyle.textContent = accountingIntegrationCSS;
      document.head.appendChild(accountingStyle);
    } catch (err) {
      console.error("Accounting CSS error:", err);
    }
  }, 200);

  // Global functions for new features
  window.openMLPricingDialog = openMLPricingDialog;
  window.applyPriceRecommendation = applyPriceRecommendation;
  window.openPushNotificationSettings = () => pushNotificationManager?.openSettingsDialog?.();
  window.openAccountingSettings = () => accountingIntegration?.openSettingsDialog?.();
  window.syncAllAccountingData = () => accountingIntegration?.syncAllData?.();

});

window.addEventListener("popstate", () => setView(getInitialView(), true));
