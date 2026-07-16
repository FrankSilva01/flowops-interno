import { state, saveData } from "../core/state.js";
import { showAppMessage } from "../core/dom.js";
import { recordAudit } from "./logs.js";

export const ACCOUNTING_PROVIDERS = {
  omie: { name: "OMIE", icon: "📊", description: "NF-e e Contabilidade", available: false },
  sirius: { name: "Sirius", icon: "💼", description: "Sistema Sirius", available: false },
  hubsoft: { name: "Hubsoft", icon: "🔗", description: "ERP Hubsoft", available: false },
  manual: { name: "Manual", icon: "📝", description: "Exportar CSV", available: true },
};

export class AccountingIntegration {
  constructor() {
    this.config = this.loadConfig();
    this.syncHistory = this.loadSyncHistory();
  }

  loadConfig() {
    const stored = localStorage.getItem("accountingIntegrationConfig");
    const fallback = {
      provider: null,
      apiKey: null,
      enabled: false,
      lastSync: null,
    };
    if (!stored) return fallback;
    try {
      return { ...fallback, ...JSON.parse(stored) };
    } catch {
      localStorage.removeItem("accountingIntegrationConfig");
      return fallback;
    }
  }

  saveConfig(config) {
    this.config = config;
    localStorage.setItem("accountingIntegrationConfig", JSON.stringify(config));
  }

  loadSyncHistory() {
    const stored = localStorage.getItem("accountingSyncHistory");
    if (!stored) return [];
    try {
      const history = JSON.parse(stored);
      return Array.isArray(history) ? history : [];
    } catch {
      localStorage.removeItem("accountingSyncHistory");
      return [];
    }
  }

  addSyncRecord(record) {
    this.syncHistory.unshift({
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      status: "success",
      ...record,
    });
    localStorage.setItem("accountingSyncHistory", JSON.stringify(this.syncHistory.slice(0, 100)));
  }

  async syncAllData() {
    if (!this.config.enabled || !this.config.provider) {
      showAppMessage("Integração contábil", "Configure uma forma de exportação primeiro.", "warning");
      return;
    }
    if (!ACCOUNTING_PROVIDERS[this.config.provider]?.available) {
      showAppMessage("Integração ainda indisponível", "Este provedor ainda não possui sincronização externa. Use a exportação manual por enquanto.", "info");
      return;
    }

    try {
      showAppMessage("Preparando exportação", "Organizando vendas e produtos em arquivos CSV.", "info");

      const orders = state.data?.orders || [];
      const products = state.data?.products || [];

      if (this.config.provider === "manual") {
        this.exportToCSV("vendas", orders);
        this.exportToCSV("produtos", products);
      }

      this.config.lastSync = new Date().toISOString();
      this.saveConfig(this.config);

      this.addSyncRecord({
        provider: this.config.provider,
        itemsCount: orders.length + products.length,
      });

      recordAudit("accounting", this.config.provider, "sync_completed", orders.length, products.length);
      showAppMessage("Exportação concluída", "Os arquivos contábeis foram preparados.", "success");
    } catch (err) {
      console.error("Sync error:", err);
      showAppMessage("Erro na exportação", err.message, "error");
    }
  }

  exportToCSV(type, data) {
    if (!data || data.length === 0) return;

    const headers = Object.keys(data[0]);
    const csvCell = (value) => {
      if (value === null || value === undefined) return "";
      const normalized = typeof value === "object" ? JSON.stringify(value) : String(value);
      return `"${normalized.replaceAll('"', '""')}"`;
    };
    const rows = data.map((item) => headers.map((header) => csvCell(item[header])));

    const csv = [headers.map(csvCell).join(";"), ...rows.map((row) => row.join(";"))].join("\r\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${type}-${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  openSettingsDialog() {
    const modal = document.createElement("dialog");
    modal.className = "modal";

    modal.innerHTML = `
      <div style="padding: 20px; max-width: 500px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h2 style="margin: 0; font-size: 18px;">💼 Integração Contábil</h2>
          <button data-accounting-close type="button" aria-label="Fechar" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #999;">✕</button>
        </div>

        <div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px;">
          ${Object.entries(ACCOUNTING_PROVIDERS).map(([key, provider]) => `
            <div style="border: 1px solid ${this.config.provider === key ? '#00D084' : '#222'}; padding: 12px; border-radius: 6px; background: ${this.config.provider === key ? '#0f2820' : '#0f1419'}; cursor: pointer; display: flex; justify-content: space-between; align-items: center;">
              <div style="display: flex; gap: 12px; align-items: center;">
                <span style="font-size: 24px;">${provider.icon}</span>
                <div>
                  <strong style="display: block; font-size: 13px;">${provider.name}</strong>
                  <small style="color: #999; font-size: 11px;">${provider.description}</small>
                </div>
              </div>
              <button class="primary-btn" data-accounting-provider="${key}" type="button" style="padding: 6px 14px; font-size: 12px;" ${provider.available ? "" : "disabled"}>
                ${provider.available ? (this.config.provider === key ? "✓ Ativo" : "Ativar") : "Em breve"}
              </button>
            </div>
          `).join("")}
        </div>

        ${this.config.enabled ? `
          <div style="background: #0f2820; padding: 12px; border-radius: 6px; margin-bottom: 20px; border-left: 3px solid #00D084;">
            <p style="margin: 0 0 8px 0; font-size: 12px; color: #999;">Último sincronismo:</p>
            <p style="margin: 0; font-size: 13px; color: #fff;">${this.config.lastSync ? new Date(this.config.lastSync).toLocaleString("pt-BR") : "Nunca"}</p>
          </div>
          <button class="primary-btn" data-accounting-sync type="button" style="width: 100%; padding: 8px; font-size: 13px; margin-bottom: 10px;">
            🔄 Sincronizar Agora
          </button>
        ` : ""}

        <button class="secondary-btn" data-accounting-close type="button" style="width: 100%; padding: 8px; font-size: 13px;">
          Fechar
        </button>
      </div>
    `;

    document.body.appendChild(modal);
    modal.querySelectorAll("[data-accounting-close]").forEach((button) => {
      button.addEventListener("click", () => modal.close());
    });
    modal.querySelectorAll("[data-accounting-provider]").forEach((button) => {
      button.addEventListener("click", () => window.activateAccountingProvider(button.dataset.accountingProvider));
    });
    modal.querySelector("[data-accounting-sync]")?.addEventListener("click", () => this.syncAllData());
    modal.showModal();

    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.close();
      }
    });
  }
}

export const accountingIntegration = new AccountingIntegration();

// Global function for provider activation
window.activateAccountingProvider = (provider) => {
  if (!ACCOUNTING_PROVIDERS[provider]?.available) {
    showAppMessage("Integração ainda indisponível", "Este provedor será liberado após a implementação da API oficial.", "info");
    return;
  }
  accountingIntegration.config.provider = provider;
  accountingIntegration.config.enabled = true;
  accountingIntegration.saveConfig(accountingIntegration.config);
  recordAudit("accounting", provider, "provider_activated");
  showAppMessage("Exportação ativada", `${ACCOUNTING_PROVIDERS[provider].name} foi definido como formato contábil.`, "success");

  // Close and reopen dialog to refresh
  const modal = document.querySelector(".modal");
  if (modal) {
    modal.close();
    setTimeout(() => accountingIntegration.openSettingsDialog(), 100);
  }
};

export const accountingIntegrationCSS = ``;
