import { state } from "./state.js";
import { byId, html, showAppMessage } from "./dom.js";
import { isAdminRole, isEditorRole, displayRole, hasCapability } from "./permissions.js";
import { render } from "./router.js";
import { loadResponsibles, loadAccessRequests, loadActiveUsers } from "../features/users.js";
import { ensureOperationalNotifications } from "../features/notifications.js";
import { getSubscriptionAccessStatus } from "../features/subscription.js";
import { loadMarketplaces } from "../features/marketplace.js";
import { loadListingAnalytics, loadSellerMetrics, loadListingFeeSync } from "../features/marketplace-analytics.js";
import { loadRemoteData, subscribeRemote } from "../data/remote.js";

export async function setupBackend() {
  const config = window.SUPABASE_CONFIG || {};
  if (!config.SUPABASE_URL || !config.SUPABASE_ANON_KEY) {
    throw new Error("Configuração do Supabase ausente. Publique também o arquivo supabase-config.js.");
  }

  await loadSupabase();
  state.supabase = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
  state.supabase.auth.onAuthStateChange(async (event) => {
    if (event === "PASSWORD_RECOVERY") await promptForNewPassword();
  });
  state.online = true;
  setSessionInfo("Online", "Aguardando login", "Supabase online", false);

  if (isPasswordRecoveryUrl()) {
    await applyRecoverySessionFromUrl();
    await promptForNewPassword();
    return;
  }
  const { data } = await state.supabase.auth.getSession();
  if (!data.session) {
    await resolveLoginBrand();
    showLoginOverlay();
    return;
  }

  await enterOnlineApp(data.session.user);
}

export function loadSupabase() {
  if (window.supabase) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const sources = [
      "./assets/vendor/supabase.js",
      "https://unpkg.com/@supabase/supabase-js@2/dist/umd/supabase.js",
      "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js",
    ];
    let index = 0;

    const loadNext = () => {
      const script = document.createElement("script");
      script.src = sources[index];
      script.onload = resolve;
      script.onerror = () => {
        script.remove();
        index += 1;
        if (index < sources.length) {
          loadNext();
        } else {
          reject(new Error("Não foi possível carregar a biblioteca do Supabase."));
        }
      };
      document.head.appendChild(script);
    };

    loadNext();
  });
}

export async function resolveLoginBrand() {
  document.title = "FlowOps";
}

export function showLoginOverlay() {
  byId("appView").hidden = true;
  const currentOverlay = byId("onlineLogin");
  if (currentOverlay) currentOverlay.remove();
  const overlay = document.createElement("main");
  overlay.id = "onlineLogin";
  overlay.className = "login-shell";
  overlay.innerHTML = `
    <section class="login-panel">
      <div>
        <img class="login-flowops-logo" src="./assets/flowops-logo-full.svg" alt="FlowOps" />
        <p class="eyebrow">Gestão de operações sob demanda</p>
        <h1 id="loginCompanyName">FlowOps</h1>
        <p class="muted">Entre com seu e-mail e senha. Seu ambiente será identificado automaticamente.</p>
      </div>
      <form id="onlineLoginForm" class="login-form">
        <label>
          E-mail
          <input id="onlineEmail" type="email" autocomplete="username" placeholder="ravena@email.com" required />
        </label>
        <label>
          Senha
          <input id="onlinePassword" type="password" autocomplete="current-password" required />
        </label>
        <button class="primary-btn" type="submit">Entrar</button>
        <button id="recoverPasswordBtn" class="ghost-btn" type="button">Recuperar senha</button>
        <p id="onlineLoginError" class="form-error" aria-live="polite"></p>
        <p class="login-legal-links"><a href="termos.html" target="_blank" rel="noopener">Termos</a> · <a href="privacidade.html" target="_blank" rel="noopener">Privacidade</a> · <a href="cancelamento.html" target="_blank" rel="noopener">Cancelamento</a></p>
      </form>
    </section>
  `;
  document.body.prepend(overlay);
  byId("onlineLoginForm").addEventListener("submit", loginOnline);
  byId("recoverPasswordBtn").addEventListener("click", recoverPasswordFromLogin);
}

export async function loginOnline(event) {
  event.preventDefault();
  byId("onlineLoginError").textContent = "";
  const email = byId("onlineEmail").value.trim();
  const password = byId("onlinePassword").value;
  const { data, error } = await state.supabase.auth.signInWithPassword({ email, password });
  if (error) {
    byId("onlineLoginError").textContent = "E-mail ou senha inválidos.";
    return;
  }
  await enterOnlineApp(data.user);
}

export async function userAccessRequest(payload, requireSession = false) {
  const config = window.SUPABASE_CONFIG || {};
  const headers = {
    "Content-Type": "application/json",
    apikey: config.SUPABASE_ANON_KEY,
    Authorization: `Bearer ${config.SUPABASE_ANON_KEY}`
  };
  if (requireSession) {
    const { data } = await state.supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Sessao expirada. Entre novamente.");
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(`${config.SUPABASE_URL}/functions/v1/user-access`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) {
    const error = new Error(result.error || "Falha ao processar o acesso.");
    error.code = result.code || "";
    throw error;
  }
  return result;
}

export async function recoverPasswordFromLogin() {
  const email = byId("onlineEmail").value.trim().toLowerCase();
  const target = byId("onlineLoginError");
  if (!email) {
    target.textContent = "Informe seu e-mail para recuperar a senha.";
    return;
  }
  target.textContent = "Enviando link de recuperacao...";
  try {
    await sendPasswordRecovery(email);
    target.textContent = "Se este e-mail existir, enviamos um link para redefinir a senha.";
  } catch (error) {
    target.textContent = `Nao consegui enviar recuperacao: ${error.message}`;
  }
}

export async function sendPasswordRecovery(email) {
  const redirectTo = `${window.location.origin}${window.location.pathname}`;
  await userAccessRequest({
    action: "recover-password",
    email,
    redirect_to: redirectTo,
  });
}

export function isPasswordRecoveryUrl() {
  return window.location.hash.includes("type=recovery")
    || window.location.search.includes("type=recovery")
    || window.location.search.includes("token=")
    || window.location.search.includes("token_hash=")
    || (window.location.hash.includes("access_token=") && window.location.hash.includes("refresh_token="));
}

export async function applyRecoverySessionFromUrl() {
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const searchParams = new URLSearchParams(window.location.search);
  const accessToken = hashParams.get("access_token") || searchParams.get("access_token");
  const refreshToken = hashParams.get("refresh_token") || searchParams.get("refresh_token");
  if (accessToken && refreshToken) {
    const { error } = await state.supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) throw error;
    return;
  }
  const recoveryType = searchParams.get("type") || hashParams.get("type");
  const tokenHash = searchParams.get("token_hash")
    || hashParams.get("token_hash")
    || searchParams.get("token")
    || hashParams.get("token");
  if (recoveryType !== "recovery" || !tokenHash) return;
  let result = await state.supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: "recovery",
  });
  if (result.error) {
    result = await state.supabase.auth.verifyOtp({
      token: tokenHash,
      type: "recovery",
    });
  }
  if (result.error) throw result.error;
}

export async function promptForNewPassword() {
  byId("onlineLogin")?.remove();
  byId("appView").hidden = true;
  byId("passwordResetForm").reset();
  byId("passwordResetMessage").textContent = "";
  byId("passwordResetDialog").showModal();
}

export async function saveRecoveredPassword(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const message = byId("passwordResetMessage");
  const password = form.elements.password.value;
  if (password !== form.elements.password_confirm.value) {
    message.textContent = "As senhas nao coincidem.";
    return;
  }
  message.textContent = "Alterando senha...";
  const { data: currentSession } = await state.supabase.auth.getSession();
  if (!currentSession?.session) {
    try {
      await applyRecoverySessionFromUrl();
    } catch (error) {
      message.textContent = `Nao foi possivel validar o link de recuperacao: ${error.message || error}`;
      return;
    }
  }
  const { error } = await state.supabase.auth.updateUser({ password });
  if (error) {
    message.textContent = "Nao foi possivel concluir a alteracao da senha. Informe uma senha valida ou solicite um novo link de recuperacao.";
    return;
  }
  message.textContent = "Senha alterada. Voce ja pode entrar com a nova senha.";
  message.className = "form-message success";
  setTimeout(async () => {
    byId("passwordResetDialog").close();
    await state.supabase.auth.signOut();
    window.history.replaceState(null, "", window.location.pathname);
    showLoginOverlay();
  }, 900);
}

export async function enterOnlineApp(user) {
  state.activeUserEmail = String(user.email || "").toLowerCase();
  state.activeUserName = String(
    (isConfiguredAdmin(state.activeUserEmail) ? window.SUPABASE_CONFIG?.ADMIN_NAME : "")
      || user.user_metadata?.name
      || user.user_metadata?.full_name
      || state.activeUserEmail.split("@")[0]
      || "Usuário"
  ).trim();
  state.isAdmin = isConfiguredAdmin(state.activeUserEmail);
  if (!(await canUserAccess(user))) {
    await state.supabase.auth.signOut();
    showLoginOverlay();
    byId("onlineLoginError").textContent = "Cadastro pendente de autorização. Peça ao administrador para liberar seu e-mail.";
    return;
  }
  const { data: memberships } = await state.supabase
    .from("organization_members")
    .select("organization_id,role,permissions,organizations(name,slug,settings)")
    .eq("user_email", state.activeUserEmail)
    .eq("status", "active");
  const membership = await chooseMembership(memberships || []);
  if (!membership?.organization_id) {
    await state.supabase.auth.signOut();
    showLoginOverlay();
    byId("onlineLoginError").textContent = "Seu usuario nao esta vinculado a nenhuma empresa ativa.";
    return;
  }
  state.organizationId = membership.organization_id;
  state.organizationSlug = membership.organizations?.slug || "";
  state.organizationName = membership.organizations?.name || state.organizationName;
  state.organizationSettings = membership.organizations?.settings || {};
  const approvedUser = await getApprovedUser(state.activeUserEmail);
  state.activeUserRoleName = state.isAdmin ? "Administrador" : (membership.role || approvedUser?.role || "Leitura");
  state.activePermissions = membership.permissions || {};
  state.isAdmin = state.isAdmin || isAdminRole(state.activeUserRoleName);
  state.canEdit = state.isAdmin || isEditorRole(state.activeUserRoleName);
  const sidebarCompanyName = byId("sidebarCompanyName");
  if (sidebarCompanyName) sidebarCompanyName.textContent = state.organizationName || "3D.AFT";
  const supportOrganizationId = new URLSearchParams(window.location.search).get("support_org");
  if (supportOrganizationId) {
    const { data: isPlatformAdmin, error: platformError } = await state.supabase.rpc("is_platform_admin");
    if (platformError || !isPlatformAdmin) {
      await state.supabase.auth.signOut();
      throw new Error("Acesso de suporte restrito ao administrador da plataforma.");
    }
    const { data: supportOrganization, error: supportError } = await state.supabase
      .from("organizations")
      .select("id,name,slug,settings")
      .eq("id", supportOrganizationId)
      .single();
    if (supportError) throw supportError;
    state.organizationId = supportOrganization.id;
    state.organizationSlug = supportOrganization.slug || "";
    state.organizationSettings = supportOrganization.settings || {};
    state.supportMode = true;
    state.isAdmin = false;
    state.canEdit = false;
    state.activeUserRoleName = "Suporte somente leitura";
    state.activeUserName = `${user.email || "Suporte"} em ${supportOrganization.name}`;
  }
  if (!state.supportMode) {
    const accessStatus = await getSubscriptionAccessStatus();
    if (!accessStatus.allowed) {
      await state.supabase.auth.signOut();
      showLoginOverlay();
      byId("onlineLoginError").textContent = accessStatus.message;
      return;
    }
  }
  const overlay = byId("onlineLogin");
  if (overlay) overlay.remove();
  byId("appView").hidden = false;
  byId("approvalsTab").hidden = !state.isAdmin;
  byId("marketplaceTab").hidden = !hasCapability("manage_marketplaces");
  setSessionInfo(
    state.activeUserName || user.email || "Usuário online",
    state.supportMode ? "Suporte • somente leitura" : `${displayRole(state.activeUserRoleName)} • ${state.canEdit ? "edição liberada" : "somente leitura"}`,
    state.supportMode ? "Empresa selecionada" : "Supabase online",
    true
  );
  try {
    await loadRemoteData();
    await loadResponsibles();
    if (state.isAdmin) {
      await loadAccessRequests();
      await loadActiveUsers();
      await loadMarketplaces();
      await loadListingAnalytics();
      await loadSellerMetrics();
      await loadListingFeeSync();
    }
    if (!state.supportMode) {
      await ensureOperationalNotifications();
      subscribeRemote();
    }
    render();
  } catch (error) {
    showAppMessage("Falha ao carregar sua empresa", error.message, "error");
    throw error;
  }
}

export async function chooseMembership(memberships) {
  if (!memberships.length) return null;
  if (memberships.length === 1) return memberships[0];
  const dialog = document.createElement("dialog");
  dialog.className = "app-dialog tenant-picker-dialog";
  dialog.innerHTML = `
    <form method="dialog">
      <div class="dialog-header">
        <div><span class="eyebrow">Empresa</span><h3>Escolha o ambiente</h3></div>
      </div>
      <div class="tenant-options">
        ${memberships.map((item, index) => `<button class="secondary-btn" type="button" data-index="${index}">${html(item.organizations?.name || item.organization_id)}</button>`).join("")}
      </div>
    </form>
  `;
  document.body.appendChild(dialog);
  const selected = await new Promise((resolve) => {
    dialog.querySelectorAll("[data-index]").forEach((button) => {
      button.addEventListener("click", () => {
        resolve(memberships[Number(button.dataset.index)]);
        dialog.close();
      });
    });
    dialog.addEventListener("close", () => resolve(null), { once: true });
    dialog.showModal();
  });
  dialog.remove();
  return selected;
}

export async function canUserAccess(user) {
  const email = String(user.email || "").toLowerCase();
  try {
    const { data, error } = await state.supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_email", email)
      .eq("status", "active")
      .limit(1);
    if (error) return false;
    return Boolean(data?.length);
  } catch {
    return false;
  }
}

export function isConfiguredAdmin(email) {
  const config = window.SUPABASE_CONFIG || {};
  const approved = (config.APPROVED_EMAILS || []).map((item) => String(item).toLowerCase());
  return Boolean(email && approved.includes(email));
}

export async function getApprovedUser(email) {
  try {
    const { data, error } = await state.supabase
      .from("approved_users")
      .select("email,role,approved_at")
      .eq("email", email)
      .eq("organization_id", state.organizationId)
      .maybeSingle();
    if (error) return null;
    return data;
  } catch {
    return null;
  }
}

export async function logout() {
  if (state.supabase) await state.supabase.auth.signOut();
  localStorage.removeItem("printflow-direct-data");
  localStorage.removeItem("calendarCustomEvents");
  Object.keys(localStorage).filter((key) => key.startsWith("calendarCustomEvents:")).forEach((key) => localStorage.removeItem(key));
  localStorage.removeItem("accountingIntegrationConfig");
  localStorage.removeItem("accountingSyncHistory");
  window.location.reload();
}

export function setSessionInfo(name, role, mode, canLogout) {
  state.activeUserName = name;
  byId("activeUserName").textContent = name;
  byId("activeUserRole").textContent = role;
  const syncMode = byId("syncMode");
  const staging = window.SUPABASE_CONFIG?.ENVIRONMENT === "staging";
  syncMode.textContent = staging ? "Ambiente de homologacao" : mode;
  syncMode.hidden = !staging;
  byId("logoutBtn").hidden = !canLogout;
  const avatar = byId("topbarAvatar");
  if (avatar) {
    const words = String(name || "").trim().split(/\s+/).filter(Boolean);
    const initials = words.length >= 2 ? `${words[0][0]}${words[1][0]}` : (words[0] || "?").slice(0, 2);
    avatar.textContent = initials.toUpperCase();
    avatar.title = name || "";
  }
}
