import { state } from "../core/state.js";
import { byId, showAppMessage, flashActionMessage } from "../core/dom.js";

// ========================================================================
// PROMPT 11: PWA + ONBOARDING + MFA
// ========================================================================

// ========== A. ONBOARDING WIZARD ==========

const ONBOARDING_COMPLETE_KEY = "flowops-onboarding-completed";
const ONBOARDING_STEP_KEY = "flowops-onboarding-step";

export async function initOnboarding() {
  // Nao abre onboarding por cima da tela de login; ele bloqueia os cliques do
  // formulario quando ainda nao existe sessao autenticada.
  if (byId("onlineLogin") || byId("appView")?.hidden || !state.activeUserEmail) return;

  // Verificar se já completou onboarding
  const isComplete = state.organizationSettings?.onboarding_completed === true || localStorage.getItem(ONBOARDING_COMPLETE_KEY) === "true";
  if (isComplete) return;

  if (document.querySelector(".onboarding-overlay, .onboarding-wizard")) return;

  // Mostrar wizard no primeiro login
  const currentStep = Number(state.organizationSettings?.onboarding_step || localStorage.getItem(ONBOARDING_STEP_KEY) || 1);
  showOnboardingWizard(currentStep);
}

function showOnboardingWizard(startStep = 1) {
  const overlay = document.createElement("div");
  overlay.className = "onboarding-overlay";
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    backdrop-filter: blur(4px);
  `;

  const wizard = document.createElement("div");
  wizard.className = "onboarding-wizard";
  wizard.style.cssText = `
    position: fixed;
    z-index: 10001;
    background: var(--panel);
    border-radius: 16px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    min-width: 500px;
    max-width: 90vw;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
  `;

  const steps = [
    {
      title: "Bem-vindo ao FlowOps! 👋",
      description: "Vamos configurar sua conta em 4 passos rápidos. Pode pular se preferir.",
      content: "onboarding-welcome"
    },
    {
      title: "Dados da Empresa 🏢",
      description: "Cadastre as informações básicas da sua empresa.",
      content: "onboarding-company"
    },
    {
      title: "Primeiro Pedido 📦",
      description: "Crie seu primeiro pedido para começar a trabalhar.",
      content: "onboarding-order"
    },
    {
      title: "Conectar Marketplace 🌐",
      description: "Integre com Mercado Livre, Shopee ou Amazon.",
      content: "onboarding-marketplace"
    }
  ];

  const currentStepData = steps[startStep - 1];

  wizard.innerHTML = `
    <div style="padding: 32px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
        <div>
          <h2 style="margin: 0 0 8px 0; font-size: 20px; font-weight: 700; color: var(--ink);">
            ${currentStepData.title}
          </h2>
          <p style="margin: 0; font-size: 13px; color: var(--muted);">
            ${currentStepData.description}
          </p>
        </div>
        <button id="skipOnboarding" style="
          background: none;
          border: none;
          font-size: 24px;
          cursor: pointer;
          color: var(--muted);
          padding: 0;
        ">✕</button>
      </div>

      <!-- Progress -->
      <div style="
        height: 4px;
        background: var(--line);
        border-radius: 2px;
        margin-bottom: 32px;
        overflow: hidden;
      ">
        <div style="
          height: 100%;
          background: var(--teal);
          width: ${(startStep / steps.length) * 100}%;
          transition: width 0.3s ease;
        "></div>
      </div>

      <!-- Content by step -->
      <div id="onboarding-content" style="min-height: 200px;">
        ${renderOnboardingStep(startStep)}
      </div>

      <!-- Actions -->
      <div style="
        display: flex;
        gap: 12px;
        margin-top: 32px;
        justify-content: flex-end;
      ">
        ${startStep > 1 ? `
          <button id="prevStep" style="
            background: transparent;
            border: 1px solid var(--line);
            color: var(--ink);
            padding: 10px 20px;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 600;
          ">← Anterior</button>
        ` : ""}
        <button id="nextStep" style="
          background: var(--teal);
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 600;
        ">
          ${startStep === steps.length ? "Concluir" : "Próximo →"}
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  document.body.appendChild(wizard);

  // Event listeners
  byId("skipOnboarding").addEventListener("click", () => {
    completeOnboarding();
    overlay.remove();
    wizard.remove();
  });

  byId("nextStep").addEventListener("click", async () => {
    if (!(await saveOnboardingStepData(startStep))) return;
    if (startStep === steps.length) {
      completeOnboarding();
      overlay.remove();
      wizard.remove();
    } else {
      overlay.remove();
      wizard.remove();
      localStorage.setItem(ONBOARDING_STEP_KEY, String(startStep + 1));
      await persistOnboarding(startStep + 1, false);
      showOnboardingWizard(startStep + 1);
    }
  });

  if (startStep > 1) {
    byId("prevStep").addEventListener("click", () => {
      overlay.remove();
      wizard.remove();
      localStorage.setItem(ONBOARDING_STEP_KEY, String(startStep - 1));
      showOnboardingWizard(startStep - 1);
    });
  }

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      completeOnboarding();
      overlay.remove();
      wizard.remove();
    }
  });
}

function renderOnboardingStep(step) {
  switch (step) {
    case 1:
      return `
        <div style="text-align: center; padding: 40px 0;">
          <div style="font-size: 48px; margin-bottom: 20px;">🚀</div>
          <p style="font-size: 14px; color: var(--muted); line-height: 1.6;">
            FlowOps é uma plataforma completa para gerenciar pedidos,
            produção, financeiro e integrações com marketplaces.
          </p>
          <p style="font-size: 14px; color: var(--muted); line-height: 1.6;">
            Este é um tour rápido para deixar você pronto para começar.
          </p>
        </div>
      `;

    case 2:
      return `
        <form id="onboarding-form" style="display: flex; flex-direction: column; gap: 16px;">
          <div>
            <label style="display: block; font-size: 12px; font-weight: 600; color: var(--muted); margin-bottom: 6px; text-transform: uppercase;">
              Razão Social
            </label>
            <input type="text" name="company_name" placeholder="Sua Empresa LTDA" style="
              width: 100%;
              padding: 10px 12px;
              border: 1px solid var(--line);
              border-radius: 6px;
              font-size: 13px;
              background: var(--canvas);
              color: var(--ink);
              box-sizing: border-box;
            " required />
          </div>
          <div>
            <label style="display: block; font-size: 12px; font-weight: 600; color: var(--muted); margin-bottom: 6px; text-transform: uppercase;">
              CNPJ
            </label>
            <input type="text" name="cnpj" placeholder="00.000.000/0000-00" style="
              width: 100%;
              padding: 10px 12px;
              border: 1px solid var(--line);
              border-radius: 6px;
              font-size: 13px;
              background: var(--canvas);
              color: var(--ink);
              box-sizing: border-box;
            " />
          </div>
          <div>
            <label style="display: block; font-size: 12px; font-weight: 600; color: var(--muted); margin-bottom: 6px; text-transform: uppercase;">
              Email Comercial
            </label>
            <input type="email" name="email" placeholder="contato@empresa.com" style="
              width: 100%;
              padding: 10px 12px;
              border: 1px solid var(--line);
              border-radius: 6px;
              font-size: 13px;
              background: var(--canvas);
              color: var(--ink);
              box-sizing: border-box;
            " required />
          </div>
        </form>
      `;

    case 3:
      return `
        <form id="onboarding-form" style="display: flex; flex-direction: column; gap: 16px;">
          <div>
            <label style="display: block; font-size: 12px; font-weight: 600; color: var(--muted); margin-bottom: 6px; text-transform: uppercase;">
              Descrição do Pedido
            </label>
            <input type="text" name="description" placeholder="Ex: Peça em resina - Protótipo" style="
              width: 100%;
              padding: 10px 12px;
              border: 1px solid var(--line);
              border-radius: 6px;
              font-size: 13px;
              background: var(--canvas);
              color: var(--ink);
              box-sizing: border-box;
            " required />
          </div>
          <div>
            <label style="display: block; font-size: 12px; font-weight: 600; color: var(--muted); margin-bottom: 6px; text-transform: uppercase;">
              Cliente
            </label>
            <input type="text" name="client" placeholder="João Silva" style="
              width: 100%;
              padding: 10px 12px;
              border: 1px solid var(--line);
              border-radius: 6px;
              font-size: 13px;
              background: var(--canvas);
              color: var(--ink);
              box-sizing: border-box;
            " />
          </div>
          <div>
            <label style="display: block; font-size: 12px; font-weight: 600; color: var(--muted); margin-bottom: 6px; text-transform: uppercase;">
              Valor (R$)
            </label>
            <input type="number" name="charged" placeholder="0.00" min="0" step="0.01" style="
              width: 100%;
              padding: 10px 12px;
              border: 1px solid var(--line);
              border-radius: 6px;
              font-size: 13px;
              background: var(--canvas);
              color: var(--ink);
              box-sizing: border-box;
            " />
          </div>
          <label class="checkbox-row"><input type="checkbox" name="demo_order" /> Criar como pedido de demonstração claramente identificado</label>
        </form>
      `;

    case 4:
      return `
        <div style="text-align: center; padding: 40px 0;">
          <div style="font-size: 48px; margin-bottom: 20px;">🌐</div>
          <p style="font-size: 14px; color: var(--muted); line-height: 1.6;">
            Para sincronizar pedidos automaticamente de seus marketplaces,
            você precisará conectar suas contas.
          </p>
          <p style="font-size: 14px; color: var(--muted); line-height: 1.6; margin-top: 16px;">
            Isso pode ser feito depois no menu <strong>Marketplace > Configurações</strong>.
          </p>
          <div style="margin-top: 20px; padding: 16px; background: var(--canvas); border-radius: 8px; border-left: 3px solid var(--teal);">
            <p style="margin: 0; font-size: 12px; font-weight: 600; color: var(--teal);">
              💡 Dica: Comece criando seus primeiros pedidos manualmente enquanto configura os marketplaces.
            </p>
          </div>
        </div>
      `;

    default:
      return "";
  }
}

async function persistOnboarding(step, completed) {
  if (!state.supabase || !state.online) return;
  const { data } = await state.supabase.rpc("save_onboarding_progress", { candidate_step: step, candidate_completed: completed });
  if (data) state.organizationSettings = data;
}

async function saveOnboardingStepData(step) {
  const form = byId("onboarding-form");
  if (!form || !state.supabase || !state.online) return true;
  if (!form.reportValidity()) return false;
  const values = Object.fromEntries(new FormData(form).entries());
  try {
    if (step === 2) {
      const { data, error } = await state.supabase.rpc("save_onboarding_company", {
        candidate_name: String(values.company_name || ""), candidate_cnpj: String(values.cnpj || ""), candidate_email: String(values.email || ""),
      });
      if (error) throw error;
      state.organizationSettings = data || state.organizationSettings;
    }
    if (step === 3) {
      const demo = values.demo_order === "on";
      const { error } = await state.supabase.from("orders").insert({
        id: `ONB-${Date.now()}`,
        organization_id: state.organizationId,
        client: String(values.client || "Cliente não informado"),
        description: `${demo ? "[DEMO] " : ""}${String(values.description || "")}`,
        status: "A preparar",
        charged: Number(values.charged || 0), received: 0, quantity: 1,
        notes: demo ? "Pedido demonstrativo criado no onboarding. Pode ser excluído a qualquer momento." : "Criado no onboarding.",
      });
      if (error) throw error;
    }
    return true;
  } catch (error) {
    showAppMessage("Onboarding", error.message || String(error), "error");
    return false;
  }
}

function completeOnboarding() {
  localStorage.setItem(ONBOARDING_COMPLETE_KEY, "true");
  persistOnboarding(4, true).catch(() => {});
  flashActionMessage("✅ Onboarding concluído! Boas-vindas ao FlowOps!");
}

// ========== B. MFA (Multi-Factor Authentication) ==========

export async function setupMFA() {
  if (!state.supabase) return false;

  try {
    const { data, error } = await state.supabase.auth.mfa.enroll({
      factorType: "totp"
    });

    if (error) {
      showAppMessage("Falha ao configurar MFA", error.message, "error");
      return false;
    }

    // Mostrar QR Code
    showMFAQRCode(data);
    return true;
  } catch (err) {
    showAppMessage("Falha ao configurar MFA", err.message, "error");
    return false;
  }
}

function showMFAQRCode(enrollData) {
  const dialog = document.createElement("div");
  dialog.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: var(--panel);
    padding: 32px;
    border-radius: 12px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    z-index: 10000;
    min-width: 400px;
    max-width: 90vw;
  `;

  dialog.innerHTML = `
    <h2 style="margin: 0 0 12px 0; font-size: 18px; font-weight: 700; color: var(--ink);">
      Configurar Autenticação de Dois Fatores
    </h2>
    <p style="margin: 0 0 24px 0; font-size: 13px; color: var(--muted); line-height: 1.6;">
      Escaneie este código QR com seu app autenticador (Google Authenticator, Authy, etc).
    </p>

    <div style="text-align: center; margin-bottom: 24px; padding: 20px; background: white; border-radius: 8px;">
      <div id="mfa-qr-code" style="width: 200px; height: 200px; margin: 0 auto;"></div>
    </div>

    <div style="background: var(--canvas); padding: 16px; border-radius: 8px; margin-bottom: 24px;">
      <p style="margin: 0 0 8px 0; font-size: 12px; font-weight: 600; color: var(--muted); text-transform: uppercase;">
        Chave manual (se o QR não funcionar):
      </p>
      <code style="
        display: block;
        padding: 8px;
        background: var(--panel);
        border-radius: 4px;
        font-size: 12px;
        color: var(--teal);
        word-break: break-all;
        font-family: monospace;
      ">${enrollData.totp?.secret || "N/A"}</code>
    </div>

    <div style="display: flex; gap: 12px; justify-content: flex-end;">
      <button class="secondary-btn" type="button" id="cancelMFA" style="
        background: transparent;
        border: 1px solid var(--line);
        color: var(--ink);
        padding: 10px 20px;
        border-radius: 8px;
        cursor: pointer;
        font-weight: 600;
      ">Cancelar</button>
      <button class="primary-btn" type="button" id="verifyMFA" style="
        background: var(--teal);
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 8px;
        cursor: pointer;
        font-weight: 600;
      ">Próximo (Verificar Código)</button>
    </div>
  `;

  const overlay = document.createElement("div");
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.4);
    z-index: 9999;
  `;

  document.body.appendChild(overlay);
  document.body.appendChild(dialog);

  byId("cancelMFA").addEventListener("click", async () => {
    await state.supabase.auth.mfa.unenroll({ factorId: enrollData.id }).catch(() => null);
    overlay.remove();
    dialog.remove();
  });

  byId("verifyMFA").addEventListener("click", () => {
    // Próximo passo: verificar código
    overlay.remove();
    dialog.remove();
    showMFAVerification(enrollData.id);
  });
}

function showMFAVerification(factorId) {
  const dialog = document.createElement("div");
  dialog.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: var(--panel);
    padding: 32px;
    border-radius: 12px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    z-index: 10000;
    min-width: 400px;
    max-width: 90vw;
  `;

  dialog.innerHTML = `
    <h2 style="margin: 0 0 12px 0; font-size: 18px; font-weight: 700; color: var(--ink);">
      Verificar Código
    </h2>
    <p style="margin: 0 0 24px 0; font-size: 13px; color: var(--muted); line-height: 1.6;">
      Digite o código de 6 dígitos exibido no seu app autenticador.
    </p>

    <input type="text" id="mfa-code" maxlength="6" placeholder="000000" style="
      width: 100%;
      padding: 12px;
      border: 1px solid var(--line);
      border-radius: 6px;
      font-size: 24px;
      text-align: center;
      background: var(--canvas);
      color: var(--ink);
      box-sizing: border-box;
      letter-spacing: 8px;
      font-weight: 600;
      margin-bottom: 24px;
    " />

    <div style="display: flex; gap: 12px; justify-content: flex-end;">
      <button class="secondary-btn" type="button" id="cancelMFA2" style="
        background: transparent;
        border: 1px solid var(--line);
        color: var(--ink);
        padding: 10px 20px;
        border-radius: 8px;
        cursor: pointer;
        font-weight: 600;
      ">Cancelar</button>
      <button class="primary-btn" type="button" id="submitMFACode" style="
        background: var(--teal);
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 8px;
        cursor: pointer;
        font-weight: 600;
      ">Verificar</button>
    </div>
  `;

  const overlay = document.createElement("div");
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.4);
    z-index: 9999;
  `;

  document.body.appendChild(overlay);
  document.body.appendChild(dialog);

  byId("cancelMFA2").addEventListener("click", () => {
    overlay.remove();
    dialog.remove();
  });

  byId("submitMFACode").addEventListener("click", async () => {
    const code = byId("mfa-code").value;
    if (code.length !== 6) {
      showAppMessage("Código incompleto", "Digite os 6 dígitos exibidos no aplicativo autenticador.", "warning");
      return;
    }

    // Verificar código com Supabase
    try {
      const { data, error } = await state.supabase.auth.mfa.challengeAndVerify({
        factorId: factorId,
        code: code
      });

      if (error) {
        showAppMessage("Código inválido", error.message || "Confira o código e tente novamente.", "error");
        return;
      }

      flashActionMessage("✅ MFA ativado com sucesso!");
      overlay.remove();
      dialog.remove();
    } catch (err) {
      showAppMessage("Falha ao verificar código", err.message || "Tente novamente.", "error");
    }
  });
}

export async function disableMFA() {
  if (!state.supabase) return false;

  try {
    const { data, error: listError } = await state.supabase.auth.mfa.listFactors();
    if (listError) {
      showAppMessage("Falha ao consultar MFA", listError.message, "error");
      return false;
    }
    const factors = [...(data?.totp || []), ...(data?.phone || [])];
    if (!factors.length) {
      showAppMessage("MFA não configurado", "Nenhum autenticador está vinculado a esta conta.", "info");
      return true;
    }
    for (const factor of factors) {
      const { error } = await state.supabase.auth.mfa.unenroll({ factorId: factor.id });
      if (error) throw error;
    }

    flashActionMessage("✅ MFA desativado");
    return true;
  } catch (err) {
    showAppMessage("Falha ao desativar MFA", err.message, "error");
    return false;
  }
}
