// FlowOps AI Assistant v2 — 4 camadas: Dados + KB + Aprendido + API externa
import { state } from "../core/state.js";
import { byId, html } from "../core/dom.js";
import { searchKnowledge, searchDataQuery, getContextualSuggestions, normalize, generateBusinessContext } from "../data/knowledge-base.js";

let chatHistory = [], isOpen = false;

export function initAssistant() {
  if (document.getElementById("aiBtn")) return;
  const s = document.createElement("style"); s.id = "aiCSS";
  s.textContent = `#aiBtn{position:fixed;bottom:20px;right:20px;z-index:400;width:48px;height:48px;border-radius:50%;background:#0EA5E9;color:#fff;border:none;cursor:pointer;font-size:22px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(14,165,233,.4);transition:transform .2s}#aiBtn:hover{transform:scale(1.1)}#aiPanel{position:fixed;bottom:80px;right:20px;z-index:401;width:390px;max-height:560px;border-radius:12px;background:var(--panel,#1a2332);border:.5px solid var(--line,#2d3748);box-shadow:0 8px 32px rgba(0,0,0,.4);display:none;flex-direction:column;overflow:hidden;font-family:var(--font,system-ui)}.ai-hd{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:.5px solid var(--line,#2d3748)}.ai-hd-t{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:500;color:var(--ink,#edf2f7)}.ai-hd-t i{font-size:18px;color:#0EA5E9}.ai-hd button{background:none;border:none;color:var(--muted,#8896a6);cursor:pointer;font-size:16px}.ai-msgs{flex:1;overflow-y:auto;padding:12px 16px;max-height:340px;min-height:200px;display:flex;flex-direction:column;gap:8px}.ai-m{max-width:88%;padding:8px 12px;border-radius:10px;font-size:12px;line-height:1.6;word-wrap:break-word}.ai-m.bot{background:var(--canvas,#0f1923);color:var(--ink,#edf2f7);align-self:flex-start;border-bottom-left-radius:2px}.ai-m.user{background:#0EA5E9;color:#fff;align-self:flex-end;border-bottom-right-radius:2px}.ai-m.typing{opacity:.6;font-style:italic}.ai-act{display:inline-block;margin-top:6px;font-size:11px;color:var(--accent-text,#38bdf8);cursor:pointer;text-decoration:underline}.ai-fb{display:flex;gap:4px;margin-top:6px}.ai-fb button{background:none;border:.5px solid var(--line,#2d3748);border-radius:4px;padding:2px 6px;font-size:10px;color:var(--muted);cursor:pointer}.ai-fb button:hover,.ai-fb button.voted{background:rgba(14,165,233,.12);color:#38bdf8;border-color:#0EA5E9}.ai-src{font-size:9px;color:var(--muted);margin-top:4px;opacity:.7}.ai-sug{padding:8px 16px;display:flex;flex-wrap:wrap;gap:4px;border-top:.5px solid var(--line,#2d3748)}.ai-sg{font-size:11px;padding:4px 10px;border-radius:12px;background:var(--canvas,#0f1923);color:#38bdf8;cursor:pointer;border:.5px solid var(--line,#2d3748);transition:background .15s}.ai-sg:hover{background:rgba(14,165,233,.12)}.ai-iw{display:flex;gap:8px;padding:12px 16px;border-top:.5px solid var(--line,#2d3748)}.ai-iw input{flex:1;background:var(--canvas,#0f1923);border:.5px solid var(--line,#2d3748);border-radius:8px;padding:8px 12px;color:var(--ink,#edf2f7);font-size:12px;outline:none;font-family:inherit}.ai-iw input:focus{border-color:#0EA5E9}.ai-iw input::placeholder{color:var(--muted)}.ai-iw button{background:#0EA5E9;color:#fff;border:none;border-radius:8px;width:36px;height:36px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:16px}`;
  document.head.appendChild(s);

  const btn = document.createElement("button");
  btn.id = "aiBtn"; btn.type = "button"; btn.setAttribute("aria-label", "Assistente");
  btn.innerHTML = '<i class="ti ti-message-chatbot"></i>';
  btn.addEventListener("click", toggle);
  document.body.appendChild(btn);

  const panel = document.createElement("div");
  panel.id = "aiPanel";
  panel.innerHTML = '<div class="ai-hd"><div class="ai-hd-t"><i class="ti ti-message-chatbot"></i><span>Assistente FlowOps</span></div><button type="button" id="aiClose"><i class="ti ti-x"></i></button></div><div class="ai-msgs" id="aiMsgs"></div><div class="ai-sug" id="aiSug"></div><div class="ai-iw"><input type="text" id="aiIn" placeholder="Pergunte algo..." autocomplete="off"/><button type="button" id="aiSend"><i class="ti ti-send"></i></button></div>';
  document.body.appendChild(panel);
  panel.querySelector("#aiClose").addEventListener("click", toggle);
  panel.querySelector("#aiSend").addEventListener("click", send);
  panel.querySelector("#aiIn").addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } });

  document.addEventListener("keydown", e => {
    if (e.altKey && e.key === "a") { e.preventDefault(); toggle(); }
    if (e.key === "Escape" && isOpen) toggle();
  });
}

function toggle() {
  isOpen = !isOpen;
  const p = byId("aiPanel"), b = byId("aiBtn");
  if (!p) return;
  p.style.display = isOpen ? "flex" : "none";
  b.innerHTML = isOpen ? '<i class="ti ti-x"></i>' : '<i class="ti ti-message-chatbot"></i>';
  if (isOpen) {
    updateSuggestions();
    if (!chatHistory.length) addBot("Olá! 👋 Sou o assistente do FlowOps.\n\n• **Pergunte sobre o sistema** — como usar cada funcionalidade\n• **Consulte seus dados** — lucro, pedidos, estoque, clientes\n• **Taxas e regras** — ML, Shopee, Amazon\n• **Dicas de negócio** — precificação, estratégia\n\nDigite sua pergunta ou clique numa sugestão abaixo!");
    setTimeout(() => byId("aiIn")?.focus(), 100);
  }
}

function addBot(text, action, source, showFb = false) {
  const c = byId("aiMsgs"); if (!c) return;
  const id = "m" + Date.now();
  const fmt = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>");
  const actHtml = action?.view ? `<span class="ai-act" data-view="${html(action.view)}">Ir para ${action.view} →</span>` : "";
  const srcHtml = source ? `<div class="ai-src">📎 ${html(source)}</div>` : "";
  const fbHtml = showFb ? `<div class="ai-fb"><button data-v="up" title="Útil">👍</button><button data-v="down" title="Não ajudou">👎</button></div>` : "";
  const d = document.createElement("div");
  d.className = "ai-m bot"; d.id = id;
  d.innerHTML = fmt + actHtml + srcHtml + fbHtml;
  c.appendChild(d); c.scrollTop = c.scrollHeight;
  d.querySelector(".ai-act")?.addEventListener("click", e => {
    const v = e.target.dataset.view;
    if (v) { const tab = document.querySelector(`[data-view="${v}"]`); if (tab) tab.click(); }
  });
  d.querySelectorAll(".ai-fb button").forEach(btn => {
    btn.addEventListener("click", () => {
      d.querySelectorAll(".ai-fb button").forEach(b => b.classList.remove("voted"));
      btn.classList.add("voted");
      saveFeedback(text, btn.dataset.v);
    });
  });
  chatHistory.push({ role: "bot", text, id });
}

function addUser(text) {
  const c = byId("aiMsgs"); if (!c) return;
  const d = document.createElement("div");
  d.className = "ai-m user"; d.textContent = text;
  c.appendChild(d); c.scrollTop = c.scrollHeight;
  chatHistory.push({ role: "user", text });
}

function showTyping() {
  const c = byId("aiMsgs"); if (!c) return;
  const d = document.createElement("div");
  d.className = "ai-m bot typing"; d.id = "aiTyping"; d.textContent = "Pensando...";
  c.appendChild(d); c.scrollTop = c.scrollHeight;
}
function hideTyping() { document.getElementById("aiTyping")?.remove(); }

function send() {
  const input = byId("aiIn"); if (!input) return;
  const text = input.value.trim(); if (!text) return;
  input.value = ""; addUser(text); processQuery(text);
}

async function processQuery(query) {
  // CAMADA 1: Dados do negócio (state.data)
  const dataResult = searchDataQuery(query, state);
  if (dataResult) { addBot(dataResult.text, dataResult.action, "Seus dados", true); saveInteraction(query, "data", dataResult.text); return; }

  // CAMADA 2: Base de conhecimento (FAQ + marketplace docs)
  const faqResult = searchKnowledge(query);
  if (faqResult && faqResult.confidence >= 40) { addBot(faqResult.text, faqResult.action, "Base de conhecimento", true); saveInteraction(query, "faq", faqResult.text); return; }

  // CAMADA 3: Respostas customizadas (Supabase)
  const learned = await searchLearned(query);
  if (learned) { addBot(learned.answer, learned.action_view ? { view: learned.action_view } : null, "Resposta personalizada", true); saveInteraction(query, "learned", learned.answer); return; }

  // CAMADA 4: IA externa (Anthropic via Edge Function)
  if (faqResult && faqResult.confidence >= 20) {
    addBot(faqResult.text + "\n\n_Se não respondeu, tente reformular._", faqResult.action, "Base de conhecimento", true);
    saveInteraction(query, "faq_partial", faqResult.text); return;
  }

  showTyping();
  try {
    const aiAnswer = await callExternalAI(query);
    hideTyping();
    if (aiAnswer) { addBot(aiAnswer, null, "Assistente IA", true); saveInteraction(query, "ai_external", aiAnswer); return; }
  } catch (e) { hideTyping(); }

  // Fallback
  addBot("Não encontrei resposta. 🤔\n\n• Reformule a pergunta\n• Veja as sugestões abaixo\n• Use o **Suporte** pra falar com a equipe", { view: "support" }, null, false);
  saveInteraction(query, "miss", null);
}

// === IA EXTERNA (Anthropic via Edge Function) ===
async function callExternalAI(query) {
  const baseUrl = state.supabaseUrl || "";
  const edgeUrl = baseUrl.replace(/\.supabase\.co.*$/, ".supabase.co/functions/v1/ai-assistant");
  if (!edgeUrl || !state.supabase) return null;
  try {
    const { data: session } = await state.supabase.auth.getSession();
    const token = session?.session?.access_token;
    if (!token) return null;
    const context = generateBusinessContext(state);
    const recent = chatHistory.slice(-6).map(m => `${m.role === "user" ? "Usuário" : "Bot"}: ${m.text}`).join("\n");
    const res = await fetch(edgeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ query, context, recent_chat: recent, organization_id: state.organizationId }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.answer || null;
  } catch (e) { return null; }
}

// === SUGESTÕES ===
function updateSuggestions() {
  const c = byId("aiSug"); if (!c) return;
  const view = state.currentView || "dashboard";
  const sug = getContextualSuggestions(view);
  c.innerHTML = sug.map(s => `<span class="ai-sg">${html(s)}</span>`).join("");
  c.querySelectorAll(".ai-sg").forEach(el => {
    el.addEventListener("click", () => { byId("aiIn").value = el.textContent; send(); });
  });
}

// === APRENDIZADO (Supabase) ===
async function saveInteraction(query, type, answer) {
  if (!state.supabase || !state.organizationId) return;
  try { await state.supabase.from("ai_interactions").insert({ organization_id: state.organizationId, user_email: state.activeUserEmail || "", query: query.slice(0, 500), query_normalized: normalize(query).slice(0, 500), result_type: type, answer_preview: (answer || "").slice(0, 300) }); } catch (e) { /* silent */ }
}

async function saveFeedback(answer, vote) {
  if (!state.supabase) return;
  try { const last = [...chatHistory].reverse().find(m => m.role === "user"); if (!last) return; await state.supabase.from("ai_interactions").update({ feedback: vote }).eq("organization_id", state.organizationId).eq("query_normalized", normalize(last.text).slice(0, 500)).order("created_at", { ascending: false }).limit(1); } catch (e) { /* silent */ }
}

async function searchLearned(query) {
  if (!state.supabase || !state.organizationId) return null;
  try {
    const { data } = await state.supabase.from("ai_custom_answers").select("keywords, answer, action_view").eq("organization_id", state.organizationId).eq("active", true);
    if (!data?.length) return null;
    const q = normalize(query);
    for (const e of data) { const kws = (e.keywords || "").split(",").map(k => normalize(k.trim())).filter(Boolean); if (kws.some(k => q.includes(k))) return e; }
  } catch (e) { /* silent */ }
  return null;
}
