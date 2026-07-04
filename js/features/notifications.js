import { state } from "../core/state.js";
import { byId, html, formatDateTime, flashActionMessage } from "../core/dom.js";
import { bindActions, setView } from "../core/router.js";
import { getLeadFollowUp, openLeadDialog } from "./customers.js";
import { formatInventoryNumber, startInventoryEdit } from "./materials.js";
import { getTokenAlert, getRecentIntegrationErrors } from "./dashboard.js";
import { startOrderEdit } from "./orders.js";
import { getSubscriptionAlert } from "./subscription.js";
import { setMarketplaceView } from "./marketplace.js";

export async function createNotification(type, title, message, relatedEntity, relatedEntityId, priority = "normal", roleTarget = "all") {
  if (!state.supabase) return;
  const payload = {
    organization_id: state.organizationId,
    type,
    title,
    message,
    related_entity: relatedEntity || null,
    related_entity_id: relatedEntityId || null,
    priority,
    role_target: roleTarget,
  };
  const { data, error } = await state.supabase.from("notifications").insert(payload).select().single();
  if (!error && data) state.notifications.unshift(data);
}

export async function ensureOperationalNotifications() {
  if (!state.canEdit || !state.supabase) return;
  const today = new Date().toISOString().slice(0, 10);
  const exists = (type, entityId, title) => state.notifications.some((item) =>
    item.type === type
    && String(item.related_entity_id || "") === String(entityId || "")
    && item.title === title
    && String(item.created_at || "").startsWith(today)
  );
  const queue = [];
  const add = (type, title, message, entity, id, priority = "normal", role = "editor") => {
    if (!exists(type, id, title)) queue.push([type, title, message, entity, id, priority, role]);
  };
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  state.data.orders.forEach((item) => {
    if (item.status !== "Entregue" && item.deliveryDate && new Date(`${item.deliveryDate}T00:00:00`) < now) {
      add("system", "Pedido atrasado", `${item.orderCode || item.id} - ${item.description}`, "order", item.id, "high");
    }
    if (item.status !== "Entregue" && !item.deliveryDate && !item.quoteStage) {
      add("system", "Encomenda sem data", `${item.orderCode || item.id} - ${item.description}`, "order", item.id);
    }
    if (item.status !== "Entregue" && !Number(item.charged || 0) && !item.quoteStage) {
      add("system", "Encomenda sem valor", `${item.orderCode || item.id} - ${item.description}`, "order", item.id);
    }
    if (["Orçamento enviado", "Aguardando cliente"].includes(item.quoteStage)) {
      const days = Math.floor((Date.now() - new Date(item.quoteUpdatedAt || 0).getTime()) / 86400000);
      if (days > 7) add("quote", "Follow-up necessário", `${item.orderCode || item.id} aguarda cliente há ${days} dias`, "order", item.id, "high");
    }
  });
  state.leads.forEach((lead) => {
    const followUp = getLeadFollowUp(lead);
    if (followUp) add("lead", followUp, lead.name, "lead", lead.id);
  });
  state.inventoryItems
    .filter((item) => Number(item.quantity || 0) <= Number(item.minimum_quantity || 0))
    .forEach((item) => {
      add(
        "stock",
        "Estoque baixo",
        `${item.name}: ${formatInventoryNumber(item.quantity)} ${item.unit || "un."} disponíveis; mínimo ${formatInventoryNumber(item.minimum_quantity)}.`,
        "inventory",
        item.id,
        "high",
      );
    });
  const subscriptionAlert = getSubscriptionAlert();
  if (subscriptionAlert) {
    add(
      "subscription",
      subscriptionAlert.title,
      subscriptionAlert.message,
      "subscription",
      `subscription-${today}`,
      subscriptionAlert.level === "critical" ? "high" : "normal",
      "all",
    );
  }
  if (state.isAdmin) {
    const tokenAlert = getTokenAlert();
    if (tokenAlert && tokenAlert.level !== "success") {
      add("marketplace", "Token próximo do vencimento", tokenAlert.message, "marketplace_log", "token-ml", tokenAlert.level === "error" ? "high" : "normal", "admin");
    }
    getRecentIntegrationErrors().slice(0, 5).forEach((log) => {
      add("marketplace", "Erro em integração marketplace", log.message || log.kind, "marketplace_log", String(log.id), "high", "admin");
    });
  }
  for (const args of queue.slice(0, 30)) await createNotification(...args);
}

export function renderNotifications() {
  const list = byId("notificationList");
  if (!list) return;
  const visible = state.notifications.filter(notificationAllowed).filter((item) => !item.dismissed_at).filter((item) => {
    const filter = state.notificationFilter;
    if (filter === "unread") return !item.is_read;
    if (filter === "error") return item.priority === "high" || item.type === "error";
    if (filter === "quote") return item.type === "quote" || item.type === "lead";
    if (filter === "marketplace") return item.type === "marketplace";
    if (filter === "system") return ["system", "backup", "access", "stock", "subscription"].includes(item.type);
    return true;
  });
  const unread = state.notifications.filter(notificationAllowed).filter((item) => !item.dismissed_at && !item.is_read).length;
  byId("notificationBadge").hidden = unread === 0;
  byId("notificationBadge").textContent = unread > 99 ? "99+" : unread;
  byId("sidebarNotificationBadge").hidden = unread === 0;
  byId("sidebarNotificationBadge").textContent = unread > 99 ? "99+" : unread;
  document.querySelectorAll("[data-notification-filter]").forEach((button) => {
    button.classList.toggle("active", button.dataset.notificationFilter === state.notificationFilter);
  });
  list.innerHTML = visible.length ? visible.slice(0, state.notificationLimit).map((item) => `
    <button class="notification-item ${item.is_read ? "" : "unread"} ${html(item.priority)}" type="button" data-action="open-notification" data-id="${html(item.id)}">
      <i class="notification-item-icon" aria-hidden="true"></i>
      <span class="notification-item-copy"><strong>${html(item.title)}</strong><span>${html(item.message || "")}</span><small>${formatDateTime(item.created_at)}</small></span>
    </button>
  `).join("") : `<div class="empty-state compact"><strong>Tudo certo por aqui</strong><span>Nenhuma notificação encontrada.</span></div>`;
  const dashboardList = byId("dashboardNotificationList");
  if (dashboardList) {
    dashboardList.innerHTML = visible.length ? visible.slice(0, 5).map((item) => `
      <button type="button" data-action="open-notification" data-id="${html(item.id)}">
        <span class="notification-dot ${html(item.priority)}"></span>
        <span><strong>${html(item.title)}</strong><small>${html(item.message || "")}</small></span>
        <time>${formatDateTime(item.created_at)}</time>
      </button>`).join("") : `<div class="empty-chart">Nenhuma notificação importante.</div>`;
  }
  const pageList = byId("notificationsPageList");
  if (pageList) {
    pageList.innerHTML = visible.length ? visible.map((item) => `
      <article class="notification-page-item ${item.is_read ? "" : "unread"} ${html(item.priority)}">
        <button type="button" data-action="open-notification" data-id="${html(item.id)}">
          <span class="notification-dot ${html(item.priority)}"></span>
          <span><strong>${html(item.title)}</strong><small>${html(item.message || "")}</small></span>
          <time>${formatDateTime(item.created_at)}</time>
        </button>
      </article>`).join("") : `<div class="empty-chart">Nenhuma notificação para este filtro.</div>`;
  }
  bindActions();
}

export function notificationAllowed(item) {
  if (String(item.role_target || "").toLowerCase().includes("admin") && !state.isAdmin) return false;
  return true;
}

export async function markNotificationRead(id, isRead) {
  const item = state.notifications.find((notification) => notification.id === id);
  if (!item || item.is_read === isRead) return;
  const readAt = isRead ? new Date().toISOString() : null;
  await state.supabase.from("notifications").update({ is_read: isRead, read_at: readAt }).eq("id", id);
  item.is_read = isRead;
  item.read_at = readAt;
  renderNotifications();
}

export async function markAllNotificationsRead() {
  const ids = state.notifications.filter(notificationAllowed).filter((item) => !item.dismissed_at && !item.is_read).map((item) => item.id);
  if (!ids.length) return;
  const readAt = new Date().toISOString();
  await state.supabase.from("notifications").update({ is_read: true, read_at: readAt }).in("id", ids);
  state.notifications.forEach((item) => {
    if (ids.includes(item.id)) {
      item.is_read = true;
      item.read_at = readAt;
    }
  });
  renderNotifications();
}

export async function clearReadNotifications() {
  const ids = state.notifications.filter(notificationAllowed).filter((item) => item.is_read && !item.dismissed_at).map((item) => item.id);
  if (!ids.length) {
    flashActionMessage("Não há notificações lidas para limpar.");
    return;
  }
  const dismissedAt = new Date().toISOString();
  const { error } = await state.supabase.from("notifications").update({ dismissed_at: dismissedAt }).in("id", ids);
  if (error) {
    alert(`Não foi possível limpar as notificações: ${error.message}`);
    return;
  }
  state.notifications.forEach((item) => {
    if (ids.includes(item.id)) item.dismissed_at = dismissedAt;
  });
  renderNotifications();
}

export async function clearVisibleNotifications() {
  const ids = state.notifications
    .filter(notificationAllowed)
    .filter((item) => !item.dismissed_at)
    .map((item) => item.id);
  if (!ids.length) {
    flashActionMessage("A tela de notificações já está limpa.");
    return;
  }
  const dismissedAt = new Date().toISOString();
  const { error } = await state.supabase.from("notifications").update({
    dismissed_at: dismissedAt,
    is_read: true,
    read_at: dismissedAt,
  }).in("id", ids);
  if (error) {
    alert(`Não foi possível limpar as notificações: ${error.message}`);
    return;
  }
  state.notifications.forEach((item) => {
    if (ids.includes(item.id)) {
      item.dismissed_at = dismissedAt;
      item.is_read = true;
      item.read_at = dismissedAt;
    }
  });
  renderNotifications();
}

export async function openNotification(id) {
  const item = state.notifications.find((notification) => notification.id === id);
  if (!item) return;
  await markNotificationRead(id, true);
  byId("notificationDropdown").hidden = true;
  if (item.related_entity === "order") {
    setView("orders");
    const orderItem = state.data.orders.find((order) => order.id === item.related_entity_id);
    if (orderItem) startOrderEdit(orderItem.id);
  } else if (item.related_entity === "lead") {
    setView("leads");
    openLeadDialog(item.related_entity_id);
  } else if (item.related_entity === "marketplace_log") {
    setView("marketplace");
    setMarketplaceView("api-logs");
  } else if (item.related_entity === "access_request") {
    setView("approvals");
  } else if (item.related_entity === "announcement") {
    setView("whatsnew");
  } else if (item.related_entity === "support_ticket") {
    setView("support");
  } else if (item.related_entity === "subscription") {
    setView("subscription");
  } else if (item.related_entity === "inventory") {
    setView("materials");
    startInventoryEdit(item.related_entity_id);
  }
}

export function renderTrialBanner() {
  const banner = byId("trialBanner");
  if (!banner) return;
  const alert = getSubscriptionAlert();
  if (!alert) {
    banner.hidden = true;
    return;
  }
  banner.hidden = false;
  banner.className = `trial-banner ${alert.level === "critical" ? "critical" : "warning"}`;
  banner.innerHTML = `<div><strong>${html(alert.title)}</strong><span>${html(alert.message)}</span></div><button type="button" class="secondary-btn" data-action="open-subscription">Ver assinatura</button>`;
  bindActions();
}
