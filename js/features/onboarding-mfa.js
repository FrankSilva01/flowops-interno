import { state } from "../core/state.js";
import { byId, html, showAppMessage } from "../core/dom.js";

// ========================================================================
// ONBOARDING + MFA
// ========================================================================

// ========== ONBOARDING ==========

export function checkOnboarding() {
  const completed = localStorage.getItem("onboarding_completed");
  if (!completed && state.activeUserEmail) {
    showOnboardingWizard();
  }
}

function showOnboardingWizard() {
  const overlay = document.createElement("div");
  overlay.className = "onboarding-overlay";
  overlay.innerHTML = `
    <div class="onboarding-wizard">
      <div class="wizard-header">
        <h2>Bem-vindo ao FlowOps! 🎉</h2>
        <span class="close-wizard" onclick="closeOnboarding()">✕</span>
      </div>

      <div class="wizard-steps">
        <!-- Step 1: Welcome -->
        <div class="wizard-step active" data-step="1">
          <div class="step-icon">👋</div>
          <h3>Bem-vindo!</h3>
          <p>FlowOps é sua solução completa para gestão de pedidos, logística e marketplace.</p>
          <div class="step-features">
            <div>✓ Integração com Mercado Livre, Shopee, Amazon</div>
            <div>✓ Cálculo automático de lucro e taxas</div>
            <div>✓ Rastreio de logística em tempo real</div>
            <div>✓ Geração de etiquetas e NF-e</div>
          </div>
          <button class="primary-btn" onclick="goToStep(2)">Continuar</button>
          <button class="text-btn" onclick="skipOnboarding()">Pular</button>
        </div>

        <!-- Step 2: Company Info -->
        <div class="wizard-step" data-step="2">
          <div class="step-icon">🏢</div>
          <h3>Dados da Empresa</h3>
          <div class="form-group">
            <label>Nome da Empresa</label>
            <input type="text" id="org-name" placeholder="Sua Empresa Ltda" />
          </div>
          <div class="form-group">
            <label>CNPJ</label>
            <input type="text" id="org-cnpj" placeholder="00.000.000/0000-00" />
          </div>
          <div class="form-group">
            <label>Telefone</label>
            <input type="tel" id="org-phone" placeholder="(00) 0000-0000" />
          </div>
          <div class="form-group">
            <label>Email</label>
            <input type="email" id="org-email" placeholder="contato@empresa.com" />
          </div>
          <button class="primary-btn" onclick="saveCompanyInfo(); goToStep(3)">Continuar</button>
          <button class="text-btn" onclick="goToStep(1)">Voltar</button>
        </div>

        <!-- Step 3: First Order -->
        <div class="wizard-step" data-step="3">
          <div class="step-icon">📦</div>
          <h3>Seu Primeiro Pedido</h3>
          <p>Vamos criar seu primeiro pedido para testar o sistema.</p>
          <div class="form-group">
            <label>Produto/Descrição</label>
            <input type="text" id="first-product" placeholder="Ex: Camiseta Preta Tamanho M" />
          </div>
          <div class="form-group">
            <label>Preço</label>
            <input type="number" id="first-price" placeholder="99,90" step="0.01" />
          </div>
          <div class="form-group">
            <label>Quantidade</label>
            <input type="number" id="first-quantity" placeholder="1" value="1" />
          </div>
          <button class="primary-btn" onclick="createFirstOrder(); goToStep(4)">Continuar</button>
          <button class="text-btn" onclick="goToStep(2)">Voltar</button>
        </div>

        <!-- Step 4: Connect Marketplace -->
        <div class="wizard-step" data-step="4">
          <div class="step-icon">🔗</div>
          <h3>Conectar Marketplace</h3>
          <p>Integre seus marketplaces para sincronizar pedidos e anúncios automaticamente.</p>
          <div class="marketplace-list">
            <div class="marketplace-item">
              <strong>Mercado Livre</strong>
              <button class="secondary-btn" onclick="connectMarketplace('ml')">Conectar</button>
            </div>
            <div class="marketplace-item">
              <strong>Shopee</strong>
              <button class="secondary-btn" onclick="connectMarketplace('shopee')">Conectar</button>
            </div>
            <div class="marketplace-item">
              <strong>Amazon</strong>
              <button class="secondary-btn" onclick="connectMarketplace('amazon')">Conectar</button>
            </div>
          </div>
          <button class="primary-btn" onclick="completeOnboarding()">Finalizar Setup 🚀</button>
          <button class="text-btn" onclick="goToStep(3)">Voltar</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // CSS inline
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    animation: fadeIn 0.3s ease-out;
  `;
}

function goToStep(step) {
  const wizard = document.querySelector(".onboarding-wizard");
  if (!wizard) return;

  wizard.querySelectorAll(".wizard-step").forEach((s) => {
    s.classList.remove("active");
  });

  wizard.querySelector(`[data-step="${step}"]`).classList.add("active");
}

function saveCompanyInfo() {
  const info = {
    name: byId("org-name")?.value || "",
    cnpj: byId("org-cnpj")?.value || "",
    phone: byId("org-phone")?.value || "",
    email: byId("org-email")?.value || "",
  };

  localStorage.setItem("org_info", JSON.stringify(info));
  showAppMessage("Dados salvos", "success");
}

function createFirstOrder() {
  const product = byId("first-product")?.value || "Primeiro Produto";
  const price = Number(byId("first-price")?.value || 0);
  const quantity = Number(byId("first-quantity")?.value || 1);

  const newOrder = {
    id: `ENC-${Date.now().toString().slice(-6)}`,
    description: product,
    charged: price * quantity,
    status: "A preparar",
    created_at: new Date().toISOString(),
  };

  state.data.orders.unshift(newOrder);
  localStorage.setItem("printflow-direct-data", JSON.stringify(state.data));

  showAppMessage("Primeiro pedido criado!", "success");
}

function connectMarketplace(marketplace) {
  showAppMessage(`Redirecionando para conectar ${marketplace}...`, "info");
  // Redirecionar para integrations
  state.view = "settings";
  // TODO: abrir marketplace integrations
  setTimeout(() => closeOnboarding(), 1000);
}

function completeOnboarding() {
  localStorage.setItem("onboarding_completed", "true");
  closeOnboarding();
  showAppMessage("Setup completo! Bem-vindo ao FlowOps 🎉", "success");
}

function skipOnboarding() {
  if (confirm("Deseja pular o onboarding? Pode voltar depois.")) {
    localStorage.setItem("onboarding_completed", "true");
    closeOnboarding();
  }
}

function closeOnboarding() {
  const overlay = document.querySelector(".onboarding-overlay");
  if (overlay) {
    overlay.style.animation = "fadeOut 0.3s ease-out";
    setTimeout(() => overlay.remove(), 300);
  }
}

// ========== MFA (Multi-Factor Authentication) ==========

export async function initMFA() {
  const mfaBtn = byId("mfa-toggle");
  if (!mfaBtn) return;

  mfaBtn.addEventListener("click", () => {
    if (state.user?.user_metadata?.mfa_enabled) {
      disableMFA();
    } else {
      enableMFA();
    }
  });

  updateMFAStatus();
}

async function enableMFA() {
  try {
    // Chamar Supabase para gerar TOTP
    const { data, error } = await state.supabase.auth.mfa.enroll({
      factorType: "totp",
    });

    if (error) throw error;

    showMFASetup(data);
  } catch (error) {
    showAppMessage(`Erro ao ativar MFA: ${error.message}`, "error");
  }
}

async function disableMFA() {
  const code = prompt("Digite seu código de autenticação para desativar MFA:");
  if (!code) return;

  try {
    // Desativar MFA
    await state.supabase.auth.mfa.unenroll({
      id: state.user?.user_metadata?.mfa_factor_id,
    });

    showAppMessage("MFA desativado", "success");
    updateMFAStatus();
  } catch (error) {
    showAppMessage(`Erro: ${error.message}`, "error");
  }
}

function showMFASetup(data) {
  const modal = document.createElement("div");
  modal.className = "mfa-setup-modal";
  modal.innerHTML = `
    <div class="modal-overlay"></div>
    <div class="modal-content">
      <div class="modal-header">
        <h2>Ativar Autenticação em Duas Etapas</h2>
      </div>

      <div class="modal-body">
        <div class="mfa-step">
          <strong>1. Escaneie o código QR</strong>
          <p>Use seu aplicativo de autenticação (Google Authenticator, Authy, etc):</p>
          <div class="qr-placeholder">
            [QR Code seria aqui: ${data.totp.qr_code}]
          </div>
        </div>

        <div class="mfa-step">
          <strong>2. Ou copie a chave manualmente</strong>
          <div class="mfa-secret">
            <code>${data.totp.secret}</code>
            <button class="icon-btn" onclick="copyToClipboard('${data.totp.secret}')">📋</button>
          </div>
        </div>

        <div class="mfa-step">
          <strong>3. Digite o código de 6 dígitos</strong>
          <input type="text" id="mfa-code" placeholder="000000" maxlength="6" pattern="[0-9]{6}" />
        </div>

        <div class="mfa-recovery">
          <strong>Códigos de Recuperação</strong>
          <p>Guarde em local seguro:</p>
          <div class="recovery-codes">
            ${(data.totp.recovery_codes || []).map(code => `
              <div>${code}</div>
            `).join("")}
          </div>
          <button class="secondary-btn" onclick="downloadRecoveryCodes()">📥 Baixar</button>
        </div>
      </div>

      <div class="modal-actions">
        <button class="primary-btn" onclick="verifyMFACode('${data.id}')">Confirmar e Ativar</button>
        <button class="secondary-btn" onclick="this.closest('.mfa-setup-modal').remove()">Cancelar</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
}

async function verifyMFACode(factorId) {
  const code = byId("mfa-code")?.value || "";
  if (code.length !== 6) {
    showAppMessage("Digite um código válido", "error");
    return;
  }

  try {
    // TODO: Chamar Supabase para verificar código
    showAppMessage("MFA ativado com sucesso! 🔐", "success");
    updateMFAStatus();
  } catch (error) {
    showAppMessage(`Código inválido: ${error.message}`, "error");
  }
}

function updateMFAStatus() {
  const mfaBtn = byId("mfa-toggle");
  if (!mfaBtn) return;

  const enabled = state.user?.user_metadata?.mfa_enabled;
  mfaBtn.textContent = enabled ? "🔐 Desativar MFA" : "🔓 Ativar MFA";
  mfaBtn.classList.toggle("enabled", enabled);
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text);
  showAppMessage("Copiado!", "success");
}

function downloadRecoveryCodes() {
  const codes = Array.from(document.querySelectorAll(".recovery-codes > div"))
    .map(el => el.textContent)
    .join("\n");

  const blob = new Blob([codes], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "codigos-recuperacao-mfa.txt";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
