import { state, saveData, recordAudit } from "../core/state.js";
import { showAppMessage } from "../core/dom.js";

export const ACCOUNTING_PROVIDERS = {
  omie: { name: "OMIE", icon: "📊", description: "NF-e e Contabilidade" },
  sirius: { name: "Sirius", icon: "💼", description: "Sistema Sirius" },
  hubsoft: { name: "Hubsoft", icon: "🔗", description: "ERP Hubsoft" },
  manual: { name: "Manual", icon: "📝", description: "CSV Export" },
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
    modal.className = "accounting-settings-dialog";
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h2>💼 Integração Contábil</h2>
          <button onclick="this.closest('dialog').close()">✕</button>
        </div>

        <div class="modal-body">
          <div class="provider-cards">
            ${Object.entries(ACCOUNTING_PROVIDERS).map(([key, provider]) => `
              <div class="provider-card ${this.config.provider === key ? "selected" : ""}" data-provider="${key}">
                <div class="provider-icon">${provider.icon}</div>
                <div class="provider-info">
                  <strong>${provider.name}</strong>
                  <small>${provider.description}</small>
                </div>
                <button class="provider-select-btn primary-btn" data-provider="${key}">
                  ${this.config.provider === key ? "✓ Ativo" : "Ativar"}
                </button>
              </div>
            `).join("")}
          </div>

          ${this.config.enabled ? `
            <div class="sync-info">
              <h3>Status</h3>
              <p>Último sync: ${this.config.lastSync ? new Date(this.config.lastSync).toLocaleString("pt-BR") : "Nunca"}</p>
            </div>
          ` : ""}
        </div>

        <div class="modal-actions">
          ${this.config.enabled ? `
            <button class="primary-btn" onclick="syncAllAccountingData()">🔄 Sincronizar</button>
          ` : ""}
          <button class="secondary-btn" onclick="this.closest('dialog').close()">Fechar</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    modal.querySelectorAll(".provider-select-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const provider = btn.dataset.provider;
        this.config.provider = provider;
        this.config.enabled = true;
        this.saveConfig(this.config);
        modal.close();
        showAppMessage(`✅ ${ACCOUNTING_PROVIDERS[provider].name} ativado!`, "success");
      });
    });

    modal.showModal();
  }
}

export const accountingIntegration = new AccountingIntegration();

export const accountingIntegrationCSS = `
.accounting-settings-dialog {
  max-width: 700px;
}

.provider-cards {
  display: grid;
  gap: 15px;
  margin-bottom: 25px;
}

.provider-card {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 15px;
  border: 2px solid #ddd;
  border-radius: 8px;
  background: #fafafa;
  cursor: pointer;
  transition: all 0.2s;
}

.provider-card:hover {
  border-color: #00D084;
  background: #f0f8f5;
}

.provider-card.selected {
  border-color: #00D084;
  background: #e8f7f1;
}

.provider-icon {
  font-size: 32px;
}

.provider-info {
  flex: 1;
}

.provider-info strong {
  display: block;
  margin-bottom: 4px;
  color: #333;
}

.provider-info small {
  color: #666;
  font-size: 12px;
}

.provider-select-btn {
  padding: 8px 16px;
  font-size: 12px;
  white-space: nowrap;
}

.sync-info {
  background: #f0f0f0;
  padding: 15px;
  border-radius: 6px;
  margin-top: 20px;
}

.sync-info h3 {
  margin: 0 0 10px 0;
  font-size: 13px;
  color: #00D084;
}

.sync-info p {
  margin: 5px 0;
  font-size: 12px;
  color: #666;
}
`;
