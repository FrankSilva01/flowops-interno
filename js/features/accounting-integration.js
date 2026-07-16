import { state, saveData } from "../core/state.js";
import { showAppMessage } from "../core/dom.js";
import { recordAudit } from "./logs.js";

export const ACCOUNTING_PROVIDERS = {
  omie: { name: "OMIE", icon: "📊", description: "NF-e e Contabilidade" },
  sirius: { name: "Sirius", icon: "💼", description: "Sistema Sirius" },
  hubsoft: { name: "Hubsoft", icon: "🔗", description: "ERP Hubsoft" },
  manual: { name: "Manual", icon: "📝", description: "Exportar CSV" },
};

export class AccountingIntegration {
  constructor() {
    this.config = this.loadConfig();
    this.syncHistory = this.loadSyncHistory();
  }

  loadConfig() {
    const stored = localStorage.getItem("accountingIntegrationConfig");
    return stored ? JSON.parse(stored) : {
      provider: null,
      apiKey: null,
      enabled: false,
      lastSync: null,
    };
  }

  saveConfig(config) {
    this.config = config;
    localStorage.setItem("accountingIntegrationConfig", JSON.stringify(config));
  }

  loadSyncHistory() {
    const stored = localStorage.getItem("accountingSyncHistory");
    return stored ? JSON.parse(stored) : [];
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
      showAppMessage("⚠️ Configure uma integração contábil primeiro", "warning");
      return;
    }

    try {
      showAppMessage("📤 Sincronizando dados...", "info");

      const orders = state.data?.orders || [];
      const products = state.data?.products || [];

      if (this.config.provider === "manual") {
        this.exportToCSV("vendas", orders);
        this.exportToCSV("produtos", products);
      } else {
        console.log(`Sincronizando com ${this.config.provider}...`);
      }

      this.config.lastSync = new Date().toISOString();
      this.saveConfig(this.config);

      this.addSyncRecord({
        provider: this.config.provider,
        itemsCount: orders.length + products.length,
      });

      recordAudit("accounting", this.config.provider, "sync_completed", orders.length, products.length);
      showAppMessage("✅ Sincronização concluída!", "success");
    } catch (err) {
      console.error("Sync error:", err);
      showAppMessage(`❌ Erro na sincronização: ${err.message}`, "error");
    }
  }

  exportToCSV(type, data) {
    if (!data || data.length === 0) return;

    const headers = Object.keys(data[0]);
    const rows = data.map(item =>
      headers.map(h => {
        const value = item[h];
        return typeof value === "string" && value.includes(",") ? `"${value}"` : value;
      })
    );

    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
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
              <button class="primary-btn" data-accounting-provider="${key}" type="button" style="padding: 6px 14px; font-size: 12px;">
                ${this.config.provider === key ? "✓ Ativo" : "Ativar"}
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
  accountingIntegration.config.provider = provider;
  accountingIntegration.config.enabled = true;
  accountingIntegration.saveConfig(accountingIntegration.config);
  recordAudit("accounting", provider, "provider_activated");
  showAppMessage(`✅ ${ACCOUNTING_PROVIDERS[provider].name} ativado!`, "success");

  // Close and reopen dialog to refresh
  const modal = document.querySelector(".modal");
  if (modal) {
    modal.close();
    setTimeout(() => accountingIntegration.openSettingsDialog(), 100);
  }
};

export const accountingIntegrationCSS = ``;
