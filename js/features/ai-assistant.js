// FlowOps AI Assistant v3 — 100% local + aprendizado por reforço.
// SEM APIs de IA externas. Camadas: comandos → follow-up → aprendido (com pesos)
// → entidades → dados → base de conhecimento → conteúdo externo (ML público /
// Wikipedia via Edge Function própria) → miss + modo "ensinar".
import { state } from "../core/state.js";
import { byId, html } from "../core/dom.js";
import { supabaseFunctionUrl } from "../core/config.js";
import { recordAudit } from "./logs.js";
import {
  searchKnowledge, searchDataQuery, searchEntityQuery, runDataQuery,
  getContextualSuggestions, normalize, tokenize, coverage,
  detectPeriod, isPeriodOnly, buildDailyDigest,
} from "../data/knowledge-base.js";
import { addWatch, removeWatch, describeWatches, checkWatchesDaily, edgeMarketSearch } from "./market-watch.js";

let chatHistory = [];
let isOpen = false;
let lastDataResult = null;      // p/ follow-up "e essa semana?"
let learnedCache = null;        // respostas aprendidas (org)
let aiAnswersOk = true;         // tabela ai_custom_answers disponível?
let aiLogOk = true;             // tabela ai_interactions disponível?

const HIST_LIMIT = 40;

export function initAssistant() {
  if (document.getElementById("aiBtn")) return;
  const s = document.createElement("style"); s.id = "aiCSS";
  s.textContent = `#aiBtn{position:fixed;bottom:20px;right:20px;z-index:400;width:48px;height:48px;border-radius:50%;background:#0EA5E9;color:#fff;border:none;cursor:pointer;font-size:22px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(14,165,233,.4);transition:transform .2s}#aiBtn:hover{transform:scale(1.1)}#aiPanel{position:fixed;bottom:80px;right:20px;z-index:401;width:390px;max-height:560px;border-radius:12px;background:var(--panel,#1a2332);border:.5px solid var(--line,#2d3748);box-shadow:0 8px 32px rgba(0,0,0,.4);display:none;flex-direction:column;overflow:hidden;font-family:var(--font,system-ui)}.ai-hd{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:.5px solid var(--line,#2d3748)}.ai-hd-t{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:500;color:var(--ink,#edf2f7)}.ai-hd-t i{font-size:18px;color:#0EA5E9}.ai-hd .ai-hd-a{display:flex;gap:6px}.ai-hd button{background:none;border:none;color:var(--muted,#8896a6);cursor:pointer;font-size:16px}.ai-msgs{flex:1;overflow-y:auto;padding:12px 16px;max-height:340px;min-height:200px;display:flex;flex-direction:column;gap:8px}.ai-m{max-width:88%;padding:8px 12px;border-radius:10px;font-size:12px;line-height:1.6;word-wrap:break-word}.ai-m.bot{background:var(--canvas,#0f1923);color:var(--ink,#edf2f7);align-self:flex-start;border-bottom-left-radius:2px}.ai-m.user{background:#0EA5E9;color:#fff;align-self:flex-end;border-bottom-right-radius:2px}.ai-m.typing{opacity:.6;font-style:italic}.ai-act{display:inline-block;margin-top:6px;font-size:11px;color:var(--accent-text,#38bdf8);cursor:pointer;text-decoration:underline}.ai-fb{display:flex;gap:4px;margin-top:6px}.ai-fb button{background:none;border:.5px solid var(--line,#2d3748);border-radius:4px;padding:2px 6px;font-size:10px;color:var(--muted);cursor:pointer}.ai-fb button:hover,.ai-fb button.voted{background:rgba(14,165,233,.12);color:#38bdf8;border-color:#0EA5E9}.ai-src{font-size:9px;color:var(--muted);margin-top:4px;opacity:.7}.ai-sug{padding:8px 16px;display:flex;flex-wrap:wrap;gap:4px;border-top:.5px solid var(--line,#2d3748)}.ai-sg{font-size:11px;padding:4px 10px;border-radius:12px;background:var(--canvas,#0f1923);color:#38bdf8;cursor:pointer;border:.5px solid var(--line,#2d3748);transition:background .15s}.ai-sg:hover{background:rgba(14,165,233,.12)}.ai-iw{display:flex;gap:8px;padding:12px 16px;border-top:.5px solid var(--line,#2d3748)}.ai-iw input{flex:1;background:var(--canvas,#0f1923);border:.5px solid var(--line,#2d3748);border-radius:8px;padding:8px 12px;color:var(--ink,#edf2f7);font-size:12px;outline:none;font-family:inherit}.ai-iw input:focus{border-color:#0EA5E9}.ai-iw input::placeholder{color:var(--muted)}.ai-iw button{background:#0EA5E9;color:#fff;border:none;border-radius:8px;width:36px;height:36px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:16px}.ai-teach{background:var(--canvas,#0f1923);border:.5px solid var(--line,#2d3748);border-radius:10px;padding:10px;display:flex;flex-direction:column;gap:6px;align-self:stretch}.ai-teach label{font-size:10px;color:var(--muted)}.ai-teach input,.ai-teach textarea{background:var(--panel,#1a2332);border:.5px solid var(--line,#2d3748);border-radius:6px;padding:6px 8px;color:var(--ink,#edf2f7);font-size:11px;outline:none;font-family:inherit;resize:vertical}.ai-teach textarea{min-height:52px}.ai-teach .ai-teach-b{display:flex;gap:6px;justify-content:flex-end}.ai-teach button{border:none;border-radius:6px;padding:5px 12px;font-size:11px;cursor:pointer}.ai-teach .tsave{background:#0EA5E9;color:#fff}.ai-teach .tcancel{background:none;color:var(--muted);border:.5px solid var(--line,#2d3748)}`;
  document.head.appendChild(s);

  const btn = document.createElement("button");
  btn.id = "aiBtn"; btn.type = "button"; btn.setAttribute("aria-label", "Assistente");
  btn.innerHTML = '<i class="ti ti-message-chatbot"></i>';
  btn.addEventListener("click", toggle);
  document.body.appendChild(btn);

  const panel = document.createElement("div");
  panel.id = "aiPanel";
  panel.innerHTML = '<div class="ai-hd"><div class="ai-hd-t"><i class="ti ti-message-chatbot"></i><span>Assistente FlowOps</span></div><div class="ai-hd-a"><button type="button" id="aiClear" title="Limpar conversa"><i class="ti ti-eraser"></i></button><button type="button" id="aiClose"><i class="ti ti-x"></i></button></div></div><div class="ai-msgs" id="aiMsgs"></div><div class="ai-sug" id="aiSug"></div><div class="ai-iw"><input type="text" id="aiIn" placeholder="Pergunte algo... (/ajuda)" autocomplete="off"/><button type="button" id="aiSend"><i class="ti ti-send"></i></button></div>';
  document.body.appendChild(panel);
  panel.querySelector("#aiClose").addEventListener("click", toggle);
  panel.querySelector("#aiClear").addEventListener("click", clearChat);
  panel.querySelector("#aiSend").addEventListener("click", send);
  panel.querySelector("#aiIn").addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } });

  document.addEventListener("keydown", e => {
    if (e.altKey && e.key === "a") { e.preventDefault(); toggle(); }
    if (e.key === "Escape" && isOpen) toggle();
  });
  restoreHistory();
  // Vigilância de preços: checagem diária em segundo plano (day-gate interno)
  setTimeout(() => { checkWatchesDaily().catch(() => null); }, 15000);
}

function toggle() {
  isOpen = !isOpen;
  const p = byId("aiPanel"), b = byId("aiBtn");
  if (!p) return;
  p.style.display = isOpen ? "flex" : "none";
  b.innerHTML = isOpen ? '<i class="ti ti-x"></i>' : '<i class="ti ti-message-chatbot"></i>';
  if (isOpen) {
    updateSuggestions();
    if (!chatHistory.length) greet();
    showDailyDigest();
    setTimeout(() => byId("aiIn")?.focus(), 100);
  }
}

// IA proativa: resumo do dia na primeira abertura do assistente (1x/dia/org)
function showDailyDigest() {
  try {
    const key = `flowops_ai_digest_${state.organizationId || "local"}`;
    const today = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem(key) === today) return;
    const digest = buildDailyDigest(state);
    if (!digest) return;
    localStorage.setItem(key, today);
    addBot(digest, { view: "dashboard" }, "IA proativa");
  } catch (e) { /* digest nunca quebra o chat */ }
}

function greet() {
  addBot("Olá! 👋 Sou o assistente do FlowOps.\n\n• **Pergunte sobre o sistema** — como usar cada funcionalidade\n• **Consulte seus dados** — lucro, pedidos, estoque, clientes\n• **Pesquise o mercado** — \"preço médio de [produto]\" no ML\n• **Me ensine** — aprendo com seus votos 👍/👎 e com /ensinar\n\nDigite **/ajuda** pra ver tudo que sei fazer.");
}

// ============================== RENDER ==============================

function fmtText(text) {
  // Escapa HTML antes de aplicar negrito/quebras (evita injeção via respostas aprendidas)
  return html(String(text)).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>");
}

function addBot(text, action, source, meta = null, persist = true) {
  const c = byId("aiMsgs"); if (!c) return;
  const id = "m" + Date.now() + Math.floor(Math.random() * 999);
  const actHtml = action?.view ? `<span class="ai-act" data-view="${html(action.view)}">Ir para ${html(action.view)} →</span>` : "";
  const srcHtml = source ? `<div class="ai-src">📎 ${html(source)}</div>` : "";
  const fbHtml = meta ? `<div class="ai-fb"><button data-v="up" title="Útil">👍</button><button data-v="down" title="Não ajudou">👎</button></div>` : "";
  const d = document.createElement("div");
  d.className = "ai-m bot"; d.id = id;
  d.innerHTML = fmtText(text) + actHtml + srcHtml + fbHtml;
  c.appendChild(d); c.scrollTop = c.scrollHeight;
  d.querySelector(".ai-act")?.addEventListener("click", e => {
    const v = e.target.dataset.view;
    if (v) { const tab = document.querySelector(`[data-view="${v}"]`); if (tab) tab.click(); }
  });
  if (meta) {
    d.querySelectorAll(".ai-fb button").forEach(b => {
      b.addEventListener("click", () => {
        if (b.classList.contains("voted")) return;
        d.querySelectorAll(".ai-fb button").forEach(x => x.classList.remove("voted"));
        b.classList.add("voted");
        applyFeedback(meta, b.dataset.v);
      });
    });
  }
  chatHistory.push({ role: "bot", text });
  if (persist) saveHistory();
}

function addUser(text, persist = true) {
  const c = byId("aiMsgs"); if (!c) return;
  const d = document.createElement("div");
  d.className = "ai-m user"; d.textContent = text;
  c.appendChild(d); c.scrollTop = c.scrollHeight;
  chatHistory.push({ role: "user", text });
  if (persist) saveHistory();
}

function showTyping(label = "Pensando...") {
  const c = byId("aiMsgs"); if (!c) return;
  const d = document.createElement("div");
  d.className = "ai-m bot typing"; d.id = "aiTyping"; d.textContent = label;
  c.appendChild(d); c.scrollTop = c.scrollHeight;
}
function hideTyping() { document.getElementById("aiTyping")?.remove(); }

function send() {
  const input = byId("aiIn"); if (!input) return;
  const text = input.value.trim(); if (!text) return;
  input.value = ""; addUser(text); processQuery(text);
}

function clearChat() {
  chatHistory = [];
  lastDataResult = null;
  const c = byId("aiMsgs"); if (c) c.innerHTML = "";
  saveHistory();
  greet();
}

// ============================== HISTÓRICO (sessão) ==============================

function histKey() { return `flowops_ai_chat_${state.organizationId || "local"}`; }
function saveHistory() {
  try { sessionStorage.setItem(histKey(), JSON.stringify(chatHistory.slice(-HIST_LIMIT))); } catch (e) { /* cheio/indisponível */ }
}
function restoreHistory() {
  try {
    const raw = sessionStorage.getItem(histKey());
    if (!raw) return;
    const items = JSON.parse(raw);
    if (!Array.isArray(items) || !items.length) return;
    for (const m of items) {
      if (m.role === "user") addUser(m.text, false); else addBot(m.text, null, null, null, false);
    }
    chatHistory = items;
  } catch (e) { /* ignora histórico corrompido */ }
}

// ============================== PIPELINE ==============================

async function processQuery(query) {
  const trimmed = query.trim();

  // CAMADA 0: comandos
  if (trimmed.startsWith("/")) { handleCommand(trimmed); return; }

  // CAMADA 0.5: follow-up de período ("e essa semana?")
  if (lastDataResult?.dq?.period && isPeriodOnly(trimmed)) {
    const period = detectPeriod(trimmed);
    const r = runDataQuery(lastDataResult.dq, state, period);
    if (r && r.type === "data") {
      lastDataResult = r;
      const interaction = logInteraction(query, "data", r.text);
      addBot(r.text, r.action, "Seus dados", { query, layer: "data", interaction });
      return;
    }
  }

  // CAMADA 0.6: vigilância de preços (linguagem natural)
  const qn0 = normalize(trimmed);
  const watchAdd = qn0.match(/^(?:vigiar|monitorar|acompanhar)\s+(?:o\s+)?preco\s+(?:de|do|da|dos|das)?\s*(.{3,80})$/);
  if (watchAdd) { const r = await addWatch(watchAdd[1]); addBot(r.message, r.ok ? { view: "marketplace" } : null, "Vigilância de preços"); return; }
  const watchDel = qn0.match(/^(?:parar de vigiar|remover alerta|parar de monitorar)\s+(?:o\s+)?(?:preco\s+)?(?:de|do|da)?\s*(.{2,80})$/);
  if (watchDel) { const r = await removeWatch(watchDel[1]); addBot(r.message); return; }
  if (/^(?:meus alertas|alertas de preco|o que estou vigiando|lista de alertas)\b/.test(qn0)) {
    addBot(await describeWatches(), { view: "marketplace" }, "Vigilância de preços"); return;
  }

  // CAMADA 0.7: pergunta "como fazer" → base de conhecimento tem prioridade
  if (/^(como|o que e|oque e|pra que serve|para que serve|onde fica|onde encontro)\b/.test(normalize(trimmed))) {
    const howTo = searchKnowledge(trimmed);
    if (howTo && howTo.confidence >= 45) {
      const interaction = logInteraction(query, "faq", howTo.text);
      addBot(howTo.text, howTo.action, "Base de conhecimento", { query, layer: "faq", confidence: howTo.confidence, interaction });
      return;
    }
  }

  // CAMADA 1: respostas aprendidas (reforço)
  const learned = await searchLearned(query);
  if (learned) {
    const interaction = logInteraction(query, "learned", learned.entry.answer);
    addBot(learned.entry.answer, learned.entry.action_view ? { view: learned.entry.action_view } : null, "Resposta aprendida", { query, layer: "learned", ref: learned.entry, interaction });
    return;
  }

  // CAMADA 2: entidades (cliente/produto pelo nome)
  const entity = searchEntityQuery(query, state);
  if (entity) {
    const interaction = logInteraction(query, "entity", entity.text);
    addBot(entity.text, entity.action, "Seus dados", { query, layer: "entity", interaction });
    return;
  }

  // CAMADA 3: dados do negócio
  const dataResult = searchDataQuery(query, state);
  if (dataResult && dataResult.type === "data") {
    lastDataResult = dataResult;
    const interaction = logInteraction(query, "data", dataResult.text);
    addBot(dataResult.text, dataResult.action, "Seus dados", { query, layer: "data", interaction });
    return;
  }

  // CAMADA 4: pesquisa de mercado (API pública do Mercado Livre — sem IA).
  // Antes da KB: "preço médio de X" é intenção específica com termo de produto.
  const marketTerm = detectMarketQuery(query);
  if (marketTerm) {
    showTyping("Pesquisando no Mercado Livre...");
    const market = await searchMercadoLivre(marketTerm);
    hideTyping();
    if (market) {
      const interaction = logInteraction(query, "market", market);
      addBot(market, { view: "marketplace" }, "Mercado Livre (tempo real)", { query, layer: "market", interaction });
      return;
    }
  }

  // CAMADA 5: base de conhecimento
  const faq = searchKnowledge(query);
  if (faq && faq.confidence >= 45) {
    const interaction = logInteraction(query, "faq", faq.text);
    const extra = faq.related ? `\n\n_Relacionado: ${faq.related.k[0]}_` : "";
    addBot(faq.text + extra, faq.action, "Base de conhecimento", { query, layer: "faq", confidence: faq.confidence, interaction });
    return;
  }

  // CAMADA 6: KB parcial (baixa confiança)
  if (faq && faq.confidence >= 25) {
    const interaction = logInteraction(query, "faq_partial", faq.text);
    addBot(faq.text + "\n\n_Se não era isso, reformule ou vote 👎 que eu aprendo._", faq.action, "Base de conhecimento", { query, layer: "faq", confidence: faq.confidence, interaction });
    return;
  }

  // CAMADA 7: conteúdo externo (Edge Function própria — Wikipedia PT, sem IA)
  showTyping("Buscando conteúdo externo...");
  const web = await searchWeb(query);
  hideTyping();
  if (web) {
    const interaction = logInteraction(query, "web", web.answer);
    addBot(web.answer, null, web.source || "Conteúdo externo", { query, layer: "web", interaction });
    return;
  }

  // MISS: registra e oferece ensinar
  logInteraction(query, "miss", null);
  addBot("Não encontrei resposta. 🤔\n\n• Reformule a pergunta\n• Veja as sugestões abaixo\n• Use o **Suporte** pra falar com a equipe", { view: "support" });
  if (state.canEdit) offerTeach(query);
}

async function handleCommand(cmd) {
  const rest = cmd.slice(1).trim();
  const c = normalize(rest).split(" ")[0];
  if (c === "limpar") { clearChat(); return; }
  if (c === "ensinar") {
    if (!state.canEdit) { addBot("Apenas usuários com permissão de edição podem me ensinar."); return; }
    offerTeach("");
    return;
  }
  if (c === "vigiar") {
    const term = rest.replace(/^\S+\s*/, "");
    const r = await addWatch(term);
    addBot(r.message, r.ok ? { view: "marketplace" } : null, "Vigilância de preços");
    return;
  }
  addBot("**Comandos:**\n\n• **/ajuda** — esta lista\n• **/ensinar** — cadastrar uma resposta nova (admins)\n• **/vigiar [produto]** — alerta quando a concorrência baixar o preço\n• **/limpar** — limpar a conversa\n\n**O que sei fazer:**\n\n• Dados: \"lucro do mês\", \"atrasados\", \"estoque crítico\", \"pedidos do [cliente]\"\n• Previsão: \"previsão de demanda\", \"o que comprar\"\n• Follow-up: depois de uma consulta, \"e essa semana?\"\n• Sistema: \"como criar encomenda\", \"como funciona o kanban\"\n• Mercado: \"preço médio de [produto]\" · \"vigiar preço de [produto]\" · \"meus alertas de preço\"\n• Resumo proativo do dia ao abrir o chat\n• Aprendo com 👍/👎 e com respostas ensinadas");
}

// ============================== APRENDIZADO (reforço) ==============================

function localLearnedKey() { return `flowops_ai_learned_${state.organizationId || "local"}`; }
function readLocalLearned() {
  try { const v = JSON.parse(localStorage.getItem(localLearnedKey()) || "[]"); return Array.isArray(v) ? v : []; } catch (e) { return []; }
}
function writeLocalLearned(list) {
  try { localStorage.setItem(localLearnedKey(), JSON.stringify(list.slice(0, 200))); } catch (e) { /* cheio */ }
}
function isMissingTable(error) {
  const m = `${error?.code || ""} ${error?.message || ""}`;
  return m.includes("42P01") || m.includes("PGRST205") || /does not exist|schema cache/i.test(m);
}

async function loadLearned() {
  if (learnedCache) return learnedCache;
  const local = readLocalLearned();
  if (aiAnswersOk && state.supabase && state.organizationId) {
    try {
      const { data, error } = await state.supabase
        .from("ai_custom_answers")
        .select("id, keywords, answer, action_view, weight, source")
        .eq("organization_id", state.organizationId)
        .eq("active", true)
        .limit(300);
      if (error) throw error;
      learnedCache = [...(data || []), ...local];
      return learnedCache;
    } catch (e) {
      if (isMissingTable(e)) aiAnswersOk = false;
    }
  }
  learnedCache = local;
  return learnedCache;
}

async function searchLearned(query) {
  const list = await loadLearned();
  if (!list.length) return null;
  const qt = tokenize(query);
  if (!qt.length) return null;
  let best = null, bs = 0;
  for (const e of list) {
    // Keywords separadas por vírgula são ALTERNATIVAS: basta uma casar bem
    const phrases = String(e.keywords || "").split(",").map(p => tokenize(p)).filter(p => p.length);
    if (!phrases.length) continue;
    let cov = 0;
    for (const pt of phrases) { const c = coverage(pt, qt); if (c > cov) cov = c; }
    const weight = Number(e.weight || 0);
    const score = cov * (1 + 0.1 * Math.max(-3, Math.min(10, weight)));
    if (score > bs) { bs = score; best = e; }
  }
  if (!best || bs < 0.62) return null;
  return { entry: best, score: bs };
}

async function saveLearnedAnswer({ keywords, answer, actionView = null, source = "manual" }) {
  const record = { keywords, answer, action_view: actionView, source, weight: source === "auto" ? 1 : 0 };
  if (aiAnswersOk && state.supabase && state.organizationId && state.canEdit) {
    try {
      const { data, error } = await state.supabase
        .from("ai_custom_answers")
        .insert({ organization_id: state.organizationId, created_by: state.activeUserEmail || "", ...record })
        .select("id")
        .single();
      if (error) throw error;
      learnedCache = null;
      recordAudit("create", "ai_custom_answer", data?.id || null, null, null, { keywords, source }, "ai-assistant");
      return true;
    } catch (e) {
      if (isMissingTable(e)) aiAnswersOk = false; else return false;
    }
  }
  // Fallback local (antes da migração ou sem permissão de tabela)
  const local = readLocalLearned();
  local.unshift({ id: "l" + Date.now(), ...record });
  writeLocalLearned(local);
  learnedCache = null;
  return true;
}

async function reinforce(entry, delta) {
  const newWeight = Number(entry.weight || 0) + delta;
  const deactivate = newWeight <= -3;
  if (String(entry.id).startsWith("l")) {
    const local = readLocalLearned();
    const i = local.findIndex(x => x.id === entry.id);
    if (i >= 0) { local[i].weight = newWeight; if (deactivate) local.splice(i, 1); writeLocalLearned(local); }
    learnedCache = null;
    return;
  }
  if (!aiAnswersOk || !state.supabase) return;
  try {
    await state.supabase
      .from("ai_custom_answers")
      .update(deactivate ? { weight: newWeight, active: false } : { weight: newWeight })
      .eq("id", entry.id)
      .eq("organization_id", state.organizationId);
    learnedCache = null;
  } catch (e) { /* silencioso */ }
}

// Registro de interações — retorna Promise<id|null> p/ feedback por id
function logInteraction(query, type, answer) {
  if (!aiLogOk || !state.supabase || !state.organizationId) return Promise.resolve(null);
  return state.supabase
    .from("ai_interactions")
    .insert({
      organization_id: state.organizationId,
      user_email: state.activeUserEmail || "",
      query: query.slice(0, 500),
      query_normalized: normalize(query).slice(0, 500),
      result_type: type,
      answer_preview: (answer || "").slice(0, 300),
    })
    .select("id")
    .single()
    .then(({ data, error }) => {
      if (error) { if (isMissingTable(error)) aiLogOk = false; return null; }
      return data?.id || null;
    })
    .catch(() => null);
}

async function applyFeedback(meta, vote) {
  // 1) marca a interação (por id — corrige update inválido da v2)
  try {
    const id = await meta.interaction;
    if (id && aiLogOk && state.supabase) {
      await state.supabase.from("ai_interactions").update({ feedback: vote }).eq("id", id).eq("organization_id", state.organizationId);
    }
  } catch (e) { /* silencioso */ }

  // 2) reforço
  if (meta.layer === "learned" && meta.ref) {
    await reinforce(meta.ref, vote === "up" ? 1 : -1);
    return;
  }
  // 👍 em resposta fraca da KB ou em conteúdo web → aprende as palavras da pergunta
  if (vote === "up" && state.canEdit && meta.query) {
    const weak = (meta.layer === "faq" && Number(meta.confidence || 100) < 70) || meta.layer === "web";
    if (weak) {
      const kws = tokenize(meta.query).slice(0, 6).join(", ");
      const lastBot = [...chatHistory].reverse().find(m => m.role === "bot");
      if (kws && lastBot) await saveLearnedAnswer({ keywords: kws, answer: lastBot.text.replace(/\n\n_[^_]+_$/, ""), source: "auto" });
    }
  }
}

// ============================== ENSINAR ==============================

function offerTeach(query) {
  const c = byId("aiMsgs"); if (!c) return;
  if (c.querySelector(".ai-teach")) return;
  const d = document.createElement("div");
  d.className = "ai-teach";
  const kws = query ? tokenize(query).slice(0, 6).join(", ") : "";
  d.innerHTML = `<label>💡 Ensinar resposta — palavras-chave (separadas por vírgula)</label><input type="text" class="tkw" value="${html(kws)}" placeholder="ex: garantia, troca, prazo"/><label>Resposta</label><textarea class="tans" placeholder="O que devo responder quando perguntarem isso?"></textarea><div class="ai-teach-b"><button type="button" class="tcancel">Cancelar</button><button type="button" class="tsave">Salvar</button></div>`;
  c.appendChild(d); c.scrollTop = c.scrollHeight;
  d.querySelector(".tcancel").addEventListener("click", () => d.remove());
  d.querySelector(".tsave").addEventListener("click", async () => {
    const kw = d.querySelector(".tkw").value.trim();
    const ans = d.querySelector(".tans").value.trim();
    if (!kw || !ans) return;
    const ok = await saveLearnedAnswer({ keywords: kw, answer: ans, source: "manual" });
    d.remove();
    addBot(ok ? `Aprendi! ✅ Quando perguntarem sobre **${kw}**, vou responder isso.` : "Não consegui salvar agora. Tente de novo mais tarde.");
  });
}

// ============================== CONTEÚDO EXTERNO (sem IA) ==============================

function detectMarketQuery(q) {
  const qn = normalize(q);
  const m = qn.match(/(?:preco medio|preco de mercado|quanto custa|quanto cobram|quanto esta|pesquisa de preco|preco no ml|preco no mercado livre|concorrencia)\s*(?:de|do|da|dos|das|para|pra|um|uma)?\s+(.{3,60})$/);
  return m ? m[1].trim() : null;
}

async function searchMercadoLivre(term) {
  // 1) Tenta a API pública direto (CSP já permite api.mercadolibre.com)
  try {
    const res = await fetch(`https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(term)}&limit=24`);
    if (res.ok) {
      const d = await res.json();
      const rs = (d.results || []).filter(r => Number(r.price) > 0);
      if (rs.length) return formatMarketAnswer(term, rs, Number(d.paging?.total || 0));
    }
  } catch (e) { /* segue pro fallback */ }
  // 2) Fallback: Edge Function com o token da conta ML da organização
  //    (a busca pública do ML passou a exigir autenticação)
  const viaEdge = await edgeMarketSearch(term);
  return viaEdge?.answer || null;
}

function formatMarketAnswer(term, rs, total) {
  const prices = rs.map(r => Number(r.price)).sort((a, b) => a - b);
  const min = prices[0], max = prices[prices.length - 1];
  const median = prices[Math.floor(prices.length / 2)];
  const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
  const free = Math.round(rs.filter(r => r.shipping?.free_shipping).length / rs.length * 100);
  const fmt = n => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const top = rs.slice(0, 3).map(r => `• ${String(r.title).slice(0, 55)} — R$ ${fmt(Number(r.price))}`).join("\n");
  return `🔎 **"${term}" no Mercado Livre** (${rs.length} anúncios, ${total.toLocaleString("pt-BR")} no total):\n\n• Mínimo: R$ ${fmt(min)}\n• **Mediana: R$ ${fmt(median)}**\n• Média: R$ ${fmt(avg)}\n• Máximo: R$ ${fmt(max)}\n• ${free}% com frete grátis\n\n**Exemplos:**\n${top}\n\n_Use a Calculadora da Inteligência pra definir seu preço com margem._`;
}

// Chama a Edge Function ai-web-search. Se não estiver publicada, falha em silêncio.
async function callEdge(body) {
  if (!state.supabase) return null;
  try {
    const { data: session } = await state.supabase.auth.getSession();
    const token = session?.session?.access_token;
    if (!token) return null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(supabaseFunctionUrl("ai-web-search"), {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.ok || !data.answer) return null;
    return data;
  } catch (e) { return null; }
}

async function searchWeb(query) {
  const data = await callEdge({ query });
  return data ? { answer: data.answer, source: data.source || "Conteúdo externo" } : null;
}

// ============================== SUGESTÕES ==============================

function updateSuggestions() {
  const c = byId("aiSug"); if (!c) return;
  const view = state.currentView || "dashboard";
  const sug = getContextualSuggestions(view);
  c.innerHTML = sug.map(s => `<span class="ai-sg">${html(s)}</span>`).join("");
  c.querySelectorAll(".ai-sg").forEach(el => {
    el.addEventListener("click", () => { byId("aiIn").value = el.textContent; send(); });
  });
}
