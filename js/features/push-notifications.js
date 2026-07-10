import { state } from "../core/state.js";
import { recordAudit } from "./logs.js";
import { showAppMessage } from "../core/dom.js";

const NOTIFICATION_TYPES = {
  newOrder: { title: "🛒 Novo Pedido", priority: "high", sound: true },
  shipmentReady: { title: "📦 Pronto para Envio", priority: "medium", sound: true },
  delivered: { title: "✅ Pedido Entregue", priority: "low", sound: false },
  lowStock: { title: "⚠️ Estoque Baixo", priority: "high", sound: true },
  priceChange: { title: "💲 Preço Atualizado", priority: "medium", sound: false },
};

export class PushNotificationManager {
  constructor() {
    this.supported = "serviceWorker" in navigator && "PushManager" in window;
    this.notifications = [];
    this.settings = this.loadSettings();
  }

  loadSettings() {
    const stored = localStorage.getItem("pushNotificationSettings");
    return stored ? JSON.parse(stored) : {
      enabled: true,
      sound: true,
      vibration: true,
      enabledTypes: Object.keys(NOTIFICATION_TYPES),
    };
  }

  saveSettings(settings) {
    this.settings = settings;
    localStorage.setItem("pushNotificationSettings", JSON.stringify(settings));
  }

  async init() {
    if (!this.supported) return;
    if (Notification.permission === "default") {
      await Notification.requestPermission();
    }
  }

  sendNotification(type, data) {
    if (!this.settings.enabled || !this.settings.enabledTypes.includes(type)) return;

    const config = NOTIFICATION_TYPES[type];
    if (!config) return;

    const notification = {
      id: Date.now().toString(),
      type,
      title: config.title,
      message: this.formatMessage(type, data),
      timestamp: new Date().toISOString(),
      read: false,
    };

    this.notifications.push(notification);
    recordAudit("notification", notification.id, "sent", type, notification.message);

    if (Notification.permission === "granted") {
      new Notification(notification.title, {
        body: notification.message,
        icon: "🔔",
        requireInteraction: config.priority === "high",
      });
    }

    if (this.settings.vibration && "vibrate" in navigator) {
      navigator.vibrate(config.priority === "high" ? [100, 50, 100] : [50]);
    }
  }

  formatMessage(type, data) {
    switch (type) {
      case "newOrder":
        return `Novo pedido: ${data.description}`;
      case "shipmentReady":
        return `Pedido ${data.orderId} pronto para envio`;
      case "delivered":
        return `Pedido ${data.orderId} foi entregue`;
      case "lowStock":
        return `Produto ${data.productName} com estoque baixo`;
      case "priceChange":
        return `Preço de ${data.productName} foi atualizado`;
      default:
        return data.message || "Nova notificação";
    }
  }

  openSettingsDialog() {
    const modal = document.createElement("dialog");
    modal.className = "push-settings-dialog";
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h2>🔔 Configurações de Notificações</h2>
          <button onclick="this.closest('dialog').close()">✕</button>
        </div>

        <div class="modal-body">
          <div class="settings-group">
            <label class="toggle-label">
              <input type="checkbox" id="pushEnabled" ${this.settings.enabled ? "checked" : ""} />
              <span>Ativar notificações</span>
            </label>
          </div>

          <div class="settings-group">
            <h3>Preferências</h3>
            <label class="toggle-label">
              <input type="checkbox" id="pushSound" ${this.settings.sound ? "checked" : ""} />
              <span>🔊 Som</span>
            </label>
            <label class="toggle-label">
              <input type="checkbox" id="pushVibration" ${this.settings.vibration ? "checked" : ""} />
              <span>📳 Vibração</span>
            </label>
          </div>

          <div class="settings-group">
            <h3>Tipos de Notificação</h3>
            ${Object.entries(NOTIFICATION_TYPES).map(([key, config]) => `
              <label class="toggle-label">
                <input type="checkbox" class="notif-type-toggle" data-type="${key}"
                  ${this.settings.enabledTypes.includes(key) ? "checked" : ""} />
                <span>${config.title}</span>
              </label>
            `).join("")}
          </div>
        </div>

        <div class="modal-actions">
          <button class="primary-btn" id="savePushSettings">Salvar Configurações</button>
          <button class="secondary-btn" onclick="this.closest('dialog').close()">Fechar</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    modal.querySelector("#savePushSettings").addEventListener("click", () => {
      const newSettings = {
        enabled: document.getElementById("pushEnabled").checked,
        sound: document.getElementById("pushSound").checked,
        vibration: document.getElementById("pushVibration").checked,
        enabledTypes: Array.from(document.querySelectorAll(".notif-type-toggle:checked"))
          .map(el => el.dataset.type),
      };

      this.saveSettings(newSettings);
      showAppMessage("✅ Configurações salvas!", "success");
      modal.close();
    });

    modal.showModal();
  }
}

export const pushNotificationManager = new PushNotificationManager();

export const pushNotificationsCSS = `
.push-settings-dialog {
  max-width: 500px;
}

.settings-group {
  margin-bottom: 25px;
  padding-bottom: 15px;
  border-bottom: 1px solid #eee;
}

.settings-group h3 {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: #00D084;
  text-transform: uppercase;
  font-weight: 600;
}

.toggle-label {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  cursor: pointer;
  user-select: none;
}

.toggle-label input[type="checkbox"] {
  width: 18px;
  height: 18px;
  cursor: pointer;
}

.toggle-label span {
  color: #333;
  font-size: 14px;
}
`;
