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
  detectPeriod, isPeriodOnly, buildDailyDigest, searchSmallTalk, pick, searchComposite,
  weeklySales, knowledgeCandidates,
} from "../data/knowledge-base.js";
import { addWatch, removeWatch, describeWatches, checkWatchesDaily, edgeMarketSearch } from "./market-watch.js";
import { markOrderDelivered } from "./orders.js";
import { ensureCanEdit } from "../core/permissions.js";
import { saveData } from "../core/state.js";
import { nextId } from "../core/dom.js";
import { persist } from "../data/remote.js";
import { render } from "../core/router.js";

let chatHistory = [];
let isOpen = false;
let lastDataResult = null;      // p/ follow-up "e essa semana?"
let lastEntity = null;          // p/ correferência: { name, query } → "e da Maria?"
let voiceReplyPending = false;  // pergunta veio por voz → responde falando também
let learnedCache = null;        // respostas aprendidas (org)
let aiAnswersOk = true;         // tabela ai_custom_answers disponível?
let aiLogOk = true;             // tabela ai_interactions disponível?

const HIST_LIMIT = 40;

export function initAssistant() {
  if (document.getElementById("aiBtn")) return;
  const s = document.createElement("style"); s.id = "aiCSS";
  s.textContent = `#aiBtn{position:fixed;bottom:20px;right:20px;z-index:400;width:48px;height:48px;border-radius:50%;background:#0EA5E9;color:#fff;border:none;cursor:pointer;font-size:22px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(14,165,233,.4);transition:transform .2s}#aiBtn:hover{transform:scale(1.1)}#aiPanel{position:fixed;bottom:80px;right:20px;z-index:401;width:390px;max-height:560px;border-radius:12px;background:var(--panel,#1a2332);border:.5px solid var(--line,#2d3748);box-shadow:0 8px 32px rgba(0,0,0,.4);display:none;flex-direction:column;overflow:hidden;font-family:var(--font,system-ui)}.ai-hd{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:.5px solid var(--line,#2d3748)}.ai-hd-t{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:500;color:var(--ink,#edf2f7)}.ai-hd-t i{font-size:18px;color:#0EA5E9}.ai-hd .ai-hd-a{display:flex;gap:6px}.ai-hd button{background:none;border:none;color:var(--muted,#8896a6);cursor:pointer;font-size:16px}.ai-msgs{flex:1;overflow-y:auto;padding:12px 16px;max-height:340px;min-height:200px;display:flex;flex-direction:column;gap:8px}.ai-m{max-width:88%;padding:8px 12px;border-radius:10px;font-size:12px;line-height:1.6;word-wrap:break-word}.ai-m.bot{background:var(--canvas,#0f1923);color:var(--ink,#edf2f7);align-self:flex-start;border-bottom-left-radius:2px}.ai-m.user{background:#0EA5E9;color:#fff;align-self:flex-end;border-bottom-right-radius:2px}.ai-m.typing{opacity:.6;font-style:italic}.ai-act{display:inline-block;margin-top:6px;font-size:11px;color:var(--accent-text,#38bdf8);cursor:pointer;text-decoration:underline}.ai-fb{display:flex;gap:4px;margin-top:6px}.ai-fb button{background:none;border:.5px solid var(--line,#2d3748);border-radius:4px;padding:2px 6px;font-size:10px;color:var(--muted);cursor:pointer}.ai-fb button:hover,.ai-fb button.voted{background:rgba(14,165,233,.12);color:#38bdf8;border-color:#0EA5E9}.ai-src{font-size:9px;color:var(--muted);margin-top:4px;opacity:.7}.ai-sug{padding:8px 16px;display:flex;flex-wrap:wrap;gap:4px;border-top:.5px solid var(--line,#2d3748)}.ai-sg{font-size:11px;padding:4px 10px;border-radius:12px;background:var(--canvas,#0f1923);color:#38bdf8;cursor:pointer;border:.5px solid var(--line,#2d3748);transition:background .15s}.ai-sg:hover{background:rgba(14,165,233,.12)}.ai-iw{display:flex;gap:8px;padding:12px 16px;border-top:.5px solid var(--line,#2d3748)}.ai-iw input{flex:1;background:var(--canvas,#0f1923);border:.5px solid var(--line,#2d3748);border-radius:8px;padding:8px 12px;color:var(--ink,#edf2f7);font-size:12px;outline:none;font-family:inherit}.ai-iw input:focus{border-color:#0EA5E9}.ai-iw input::placeholder{color:var(--muted)}.ai-iw button{background:#0EA5E9;color:#fff;border:none;border-radius:8px;width:36px;height:36px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:16px}.ai-teach{background:var(--canvas,#0f1923);border:.5px solid var(--line,#2d3748);border-radius:10px;padding:10px;display:flex;flex-direction:column;gap:6px;align-self:stretch}.ai-teach label{font-size:10px;color:var(--muted)}.ai-teach input,.ai-teach textarea{background:var(--panel,#1a2332);border:.5px solid var(--line,#2d3748);border-radius:6px;padding:6px 8px;color:var(--ink,#edf2f7);font-size:11px;outline:none;font-family:inherit;resize:vertical}.ai-teach textarea{min-height:52px}.ai-teach .ai-teach-b{display:flex;gap:6px;justify-content:flex-end}.ai-teach button{border:none;border-radius:6px;padding:5px 12px;font-size:11px;cursor:pointer}.ai-teach .tsave{background:#0EA5E9;color:#fff}.ai-teach .tcancel{background:none;color:var(--muted);border:.5px solid var(--line,#2d3748)}.ai-fu{display:flex;flex-wrap:wrap;gap:4px;margin-top:8px}#aiMic{background:var(--canvas,#0f1923)!important;color:var(--muted,#8896a6)!important;border:.5px solid var(--line,#2d3748)!important}#aiMic.listening{background:#dc2626!important;color:#fff!important;animation:aiPulse 1s infinite}@keyframes aiPulse{50%{opacity:.55}}`;
  document.head.appendChild(s);

  const btn = document.createElement("button");
  btn.id = "aiBtn"; btn.type = "button"; btn.setAttribute("aria-label", "Assistente");
  btn.innerHTML = '<i class="ti ti-message-chatbot"></i>';
  btn.addEventListener("click", toggle);
  document.body.appendChild(btn);

  const panel = document.createElement("div");
  panel.id = "aiPanel";
  panel.innerHTML = '<div class="ai-hd"><div class="ai-hd-t"><i class="ti ti-message-chatbot"></i><span>Assistente FlowOps</span></div><div class="ai-hd-a"><button type="button" id="aiClear" title="Limpar conversa"><i class="ti ti-eraser"></i></button><button type="button" id="aiClose"><i class="ti ti-x"></i></button></div></div><div class="ai-msgs" id="aiMsgs"></div><div class="ai-sug" id="aiSug"></div><div class="ai-iw"><input type="text" id="aiIn" placeholder="Pergunte algo... (/ajuda)" autocomplete="off"/><button type="button" id="aiMic" title="Falar (pt-BR)" hidden><i class="ti ti-microphone"></i></button><button type="button" id="aiSend"><i class="ti ti-send"></i></button></div>';
  document.body.appendChild(panel);
  panel.querySelector("#aiClose").addEventListener("click", toggle);
  panel.querySelector("#aiClear").addEventListener("click", clearChat);
  panel.querySelector("#aiSend").addEventListener("click", send);
  panel.querySelector("#aiIn").addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } });
  setupVoiceInput(panel);

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
  const h = new Date().getHours();
  const sauda = h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
  const name = String(state.activeUserEmail || "").split("@")[0];
  const oi = name ? `${sauda}, **${name.charAt(0).toUpperCase() + name.slice(1)}**! 👋` : `${sauda}! 👋`;
  addBot(`${oi} Sou o assistente do FlowOps.\n\n• **Seus números** — "lucro do mês", "atrasados", "a receber"\n• **Dicas pro negócio** — "como melhorar?" (analiso seus dados)\n• **Mercado** — "preço médio de [produto]" · "vigiar preço de [produto]"\n• **Sistema** — "como criar encomenda", "como funciona o kanban"\n\nE eu aprendo com você: vote 👍/👎 nas respostas. **/ajuda** mostra tudo.`, null, null, null, true,
    ["Como está meu negócio?", "Como melhorar?", "Lucro do mês"]);
}

// ============================== RENDER ==============================

function fmtText(text) {
  // Escapa HTML antes de aplicar negrito/quebras (evita injeção via respostas aprendidas)
  return html(String(text)).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>");
}

function addBot(text, action, source, meta = null, persist = true, followups = null) {
  const c = byId("aiMsgs"); if (!c) return;
  const id = "m" + Date.now() + Math.floor(Math.random() * 999);
  const actHtml = action?.view ? `<span class="ai-act" data-view="${html(action.view)}">Ir para ${html(action.view)} →</span>` : "";
  const srcHtml = source ? `<div class="ai-src">📎 ${html(source)}</div>` : "";
  const fbHtml = meta ? `<div class="ai-fb"><button data-v="up" title="Útil">👍</button><button data-v="down" title="Não ajudou">👎</button></div>` : "";
  const fuHtml = followups?.length ? `<div class="ai-fu">${followups.slice(0, 3).map(s => `<span class="ai-sg">${html(s)}</span>`).join("")}</div>` : "";
  const d = document.createElement("div");
  d.className = "ai-m bot"; d.id = id;
  d.innerHTML = fmtText(text) + actHtml + fuHtml + srcHtml + fbHtml;
  c.appendChild(d); c.scrollTop = c.scrollHeight;
  d.querySelector(".ai-act")?.addEventListener("click", e => {
    const v = e.target.dataset.view;
    if (v) { const tab = document.querySelector(`[data-view="${v}"]`); if (tab) tab.click(); }
  });
  d.querySelectorAll(".ai-fu .ai-sg").forEach(el => {
    el.addEventListener("click", () => { const input = byId("aiIn"); if (input) { input.value = el.textContent; send(); } });
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
  // Pergunta falada → resposta falada (speechSynthesis nativo, pt-BR)
  if (voiceReplyPending) { voiceReplyPending = false; speakText(text); }
}

// Fala a resposta em voz alta (sem serviço externo). Remove markdown/emoji.
function speakText(text) {
  try {
    if (!window.speechSynthesis) return;
    const clean = String(text)
      .replace(/\*\*/g, "")
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
      .replace(/R\$\s*/g, "reais ")
      .slice(0, 400);
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = "pt-BR";
    u.rate = 1.05;
    window.speechSynthesis.speak(u);
  } catch (e) { /* voz é opcional */ }
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

  // CAMADA 0.3: small talk (oi, obrigado, quem é você...)
  const chat = searchSmallTalk(trimmed);
  if (chat) { addBot(chat, null, null, null, true, ["Como está meu negócio?", "Como melhorar?"]); return; }

  // CAMADA 0.4: "por quê?" — explica como a última resposta foi calculada
  if (/^(por ?que|pq\b|porque|como (voce |vc )?(calculou|chegou|sabe)|explica( isso| esse)?[\s?]*$)/.test(normalize(trimmed)) && lastDataResult?.dq?.explain) {
    addBot(`🧮 ${lastDataResult.dq.explain}`, null, "Como eu calculo", null, true, ["Como melhorar?", "E essa semana?"]);
    return;
  }

  // CAMADA 0.45: AÇÕES pelo chat (sempre com confirmação explícita)
  if (await tryAction(trimmed)) return;

  // CAMADA 0.5: follow-up de período ("e essa semana?")
  if (lastDataResult?.dq?.period && isPeriodOnly(trimmed)) {
    const period = detectPeriod(trimmed);
    const r = runDataQuery(lastDataResult.dq, state, period);
    if (r && r.type === "data") {
      lastDataResult = r;
      presentDataAnswer(r, query);
      return;
    }
  }

  // CAMADA 0.55: correferência — "e da Maria?", "e o vaso groot?" reusa a
  // última consulta por entidade trocando o nome
  const corefMatch = normalize(trimmed).match(/^e\s+(?:d?[oa]s?\s+)?(.{2,40}?)\??$/);
  if (corefMatch && lastEntity && !isPeriodOnly(trimmed)) {
    const synth = lastEntity.query.replace(new RegExp(escapeRegex(lastEntity.name), "i"), corefMatch[1]);
    const swapped = searchEntityQuery(synth, state);
    if (swapped) {
      lastEntity = { name: swapped.entityName, query: synth };
      const interaction = logInteraction(query, "entity", swapped.text);
      addBot(swapped.text, swapped.action, "Seus dados", { query, layer: "entity", interaction });
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

  // CAMADA 0.65: conteúdo externo rápido — câmbio, tendências do ML, CEP
  if ((/\b(dolar|euro)\b/.test(qn0) && /(cotacao|cambio|hoje|agora|quanto|valor|preco|ta|esta)/.test(qn0)) || /^(cotacao|cambio)\b/.test(qn0)) {
    await answerExternal(query, { query: "USD-BRL,EUR-BRL", mode: "currency" }, "Consultando câmbio...", "câmbio");
    return;
  }
  if (/tendencia/.test(qn0) && /(ml\b|mercado livre|mercado|venda|busca)/.test(qn0)) {
    await answerExternal(query, { query: "MLB", mode: "trends", organization_id: state.organizationId }, "Buscando tendências do Mercado Livre...", "tendências (requer conta ML conectada)");
    return;
  }
  const cepMatch = qn0.match(/\bcep\s*(\d{5})\s*-?\s*(\d{3})\b/);
  if (cepMatch) {
    await answerExternal(query, { query: `${cepMatch[1]}${cepMatch[2]}`, mode: "cep" }, "Consultando CEP...", "CEP");
    return;
  }

  // CAMADA 0.68: gráfico inline ("gráfico de vendas", "evolução das vendas")
  if (/(grafico|evolucao|historico|curva)/.test(qn0) && /(venda|faturamento|encomenda|pedido)/.test(qn0)) {
    const series = weeklySales(state, 8);
    if (series.some(x => x.total > 0)) {
      addChartMessage(series, "Vendas por semana (últimas 8)");
      logInteraction(query, "data", "grafico vendas");
      addBot("Cada barra é uma semana (passe o mouse pra ver o valor). Quer a análise? Pergunte **\"como melhorar?\"**.", { view: "reports" }, "Seus dados", null, true, ["Como melhorar?", "Previsão de demanda"]);
    } else {
      addBot("Ainda não há vendas nas últimas 8 semanas pra desenhar o gráfico.");
    }
    return;
  }

  // CAMADA 0.69: "meu preço tá bom?" — compara seu anúncio com a mediana do ML
  if (/(meu preco|meus precos|meu anuncio)/.test(qn0) && /(bom|ok|competitivo|justo|certo|caro|barato|analisa|compara)/.test(qn0)) {
    const listings = (state.data.marketplaceListings || []).filter(l => Number(l.price) > 0 && l.title);
    if (!listings.length) { addBot("Não achei anúncios com preço cadastrado. Conecte o Mercado Livre em **Marketplace → Integrações**.", { view: "marketplace" }); return; }
    let target = listings.find(l => qn0.includes(normalize(l.title).slice(0, 25))) ||
      listings.find(l => normalize(l.title).split(" ").filter(w => w.length > 3).some(w => qn0.includes(w)));
    if (!target && listings.length === 1) target = listings[0];
    if (!target) {
      addBot("Qual anúncio você quer analisar?", null, null, null, true,
        listings.slice(0, 3).map(l => `meu preço de ${String(l.title).slice(0, 40)} tá bom?`));
      return;
    }
    showTyping("Comparando com o mercado...");
    const market = await edgeMarketSearch(String(target.title).slice(0, 60));
    hideTyping();
    const median = Number(market?.stats?.median || 0);
    const fmt = n => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (!(median > 0)) { addBot(`Não consegui puxar o mercado agora (função externa indisponível). Seu preço atual: **R$ ${fmt(Number(target.price))}**.`); return; }
    const price = Number(target.price);
    const diff = (price - median) / median * 100;
    const verdict = diff > 15 ? `🔺 **${diff.toFixed(0)}% acima da mediana.** Ou seu diferencial justifica, ou você está perdendo conversão — confira as visitas do anúncio.`
      : diff < -15 ? `🔻 **${Math.abs(diff).toFixed(0)}% abaixo da mediana.** Se está vendendo bem, há espaço pra subir o preço e ganhar margem.`
      : `✅ **Na faixa do mercado** (${diff >= 0 ? "+" : ""}${diff.toFixed(0)}% vs mediana). Preço competitivo.`;
    const text = `**${String(target.title).slice(0, 60)}**\n\nSeu preço: **R$ ${fmt(price)}**\nMediana do ML: R$ ${fmt(median)} (${market.stats.sample} anúncios)\n\n${verdict}`;
    const interaction = logInteraction(query, "market", text);
    addBot(text, { view: "marketplace" }, "Análise de preço (ML tempo real)", { query, layer: "market", interaction }, true, [`vigiar preço de ${String(target.title).slice(0, 40)}`, "Como melhorar?"]);
    return;
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
    if (entity.entityName) lastEntity = { name: entity.entityName, query };
    const interaction = logInteraction(query, "entity", entity.text);
    addBot(entity.text, entity.action, "Seus dados", { query, layer: "entity", interaction });
    return;
  }

  // CAMADA 2.5: pergunta composta ("lucro e atrasados", "vendas, estoque")
  const composite = searchComposite(query, state);
  if (composite) {
    const interaction = logInteraction(query, "data", composite.text);
    addBot(composite.text, composite.action, "Seus dados (resposta combinada)", { query, layer: "data", interaction });
    return;
  }

  // CAMADA 3: dados do negócio
  const dataResult = searchDataQuery(query, state);
  if (dataResult && dataResult.type === "data") {
    lastDataResult = dataResult;
    presentDataAnswer(dataResult, query);
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

  // MISS: registra, sugere aproximações ("você quis dizer?") e oferece ensinar
  logInteraction(query, "miss", null);
  const guesses = knowledgeCandidates(query, 3);
  addBot(guesses.length
    ? "Não achei uma resposta exata. 🤔 **Você quis dizer:**"
    : "Não encontrei resposta. 🤔\n\n• Reformule a pergunta\n• Use o **Suporte** pra falar com a equipe",
  guesses.length ? null : { view: "support" }, null, null, true,
  guesses.length ? guesses.map(g => `como funciona ${g}?`) : null);
  if (state.canEdit) offerTeach(query);
}

function escapeRegex(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

// ============================== AÇÕES PELO CHAT ==============================
// Toda ação exige: permissão de edição + confirmação explícita (botões).

function confirmBox(summary, onConfirm) {
  const c = byId("aiMsgs"); if (!c) return;
  const d = document.createElement("div");
  d.className = "ai-teach";
  d.innerHTML = `<label>⚡ Confirmar ação</label><div style="font-size:12px;line-height:1.6">${fmtText(summary)}</div><div class="ai-teach-b"><button type="button" class="tcancel">Cancelar</button><button type="button" class="tsave">Confirmar</button></div>`;
  c.appendChild(d); c.scrollTop = c.scrollHeight;
  d.querySelector(".tcancel").addEventListener("click", () => { d.remove(); addBot("Ação cancelada. Nada foi alterado. 👍"); });
  d.querySelector(".tsave").addEventListener("click", async () => {
    d.remove();
    try { await onConfirm(); } catch (e) { addBot("Não consegui executar a ação agora. Tente pela tela correspondente."); }
  });
}

// Detecta e prepara ações. Retorna true se a mensagem era uma ação.
async function tryAction(text) {
  const qn = normalize(text);

  // --- marcar pedido como entregue ---
  const deliver = qn.match(/^(?:marca|marcar|conclui|concluir|finaliza|finalizar)\s+(?:o\s+|a\s+)?(?:pedido\s+|encomenda\s+)?(.{2,60}?)\s+como\s+entregue\s*$/) ||
    qn.match(/^entregar?\s+(?:o\s+)?pedido\s+(.{2,60})$/);
  if (deliver) {
    if (!ensureCanEdit()) return true;
    const term = deliver[1].trim();
    const open = state.data.orders.filter(o => o.status !== "Entregue");
    const matches = open.filter(o =>
      normalize(o.orderCode || "").includes(term) || term.includes(normalize(o.orderCode || "x-none")) ||
      normalize(o.description || "").includes(term) || term.includes(normalize(o.description || "x-none")));
    if (!matches.length) { addBot(`Não achei pedido aberto parecido com **"${term}"**. Veja a lista em Encomendas.`, { view: "orders" }); return true; }
    if (matches.length > 1) {
      addBot(`Achei ${matches.length} pedidos. Qual deles?`, null, null, null, true,
        matches.slice(0, 3).map(o => `marcar ${o.orderCode || o.description} como entregue`));
      return true;
    }
    const item = matches[0];
    confirmBox(`Marcar **${item.orderCode || item.id} — ${item.description}** como **Entregue**?\nIsso atualiza histórico, produção e o pagamento no caixa.`, async () => {
      const r = await markOrderDelivered(item.id, "ai-assistant");
      addBot(r.message, r.ok ? { view: "orders" } : null, "Ação executada");
    });
    return true;
  }

  // --- lançar entrada/saída no caixa ---
  // Parse sobre texto com acentos removidos MAS pontuação preservada: o
  // normalize() global apaga a vírgula e quebraria "42,50" em "42 50".
  const qc = String(text).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
  const cash = qc.match(/^lanca(?:r|)\s+(entrada|saida)\s+(?:de\s+)?(?:r\$\s*)?(\d+(?:\.\d{3})*(?:[.,]\d{1,2})?)\s*(?:reais\s*)?(?:\s*(?:em|na|no|categoria|de)\s+)?(.*)$/);
  if (cash) {
    if (!ensureCanEdit()) return true;
    const type = cash[1] === "entrada" ? "Entrada" : "Saída";
    const rawNum = cash[2];
    const amount = Number(rawNum.includes(",") ? rawNum.replace(/\./g, "").replace(",", ".") : rawNum);
    if (!(amount > 0)) { addBot("Não entendi o valor. Ex.: **lançar entrada de 150 em vendas**"); return true; }
    const category = (cash[3] || "").trim() || (type === "Entrada" ? "Vendas" : "Outros");
    const fmt = n => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    confirmBox(`Lançar **${type} de R$ ${fmt(amount)}** na categoria **"${category}"** com a data de hoje?`, async () => {
      const item = {
        id: nextId("CX", state.data.cash),
        date: new Date().toISOString().split("T")[0],
        type,
        category: category.charAt(0).toUpperCase() + category.slice(1),
        description: "Lançado pelo assistente",
        method: "",
        income: type === "Entrada" ? amount : 0,
        expense: type === "Saída" ? amount : 0,
      };
      state.data.cash.push(item);
      await persist("cash", item);
      await recordAudit("create", "cash_entry", item.id, null, null, { type, amount, category }, "ai-assistant");
      saveData();
      render();
      addBot(`✅ ${type} de **R$ ${fmt(amount)}** lançada em "${item.category}" (${item.id}).`, { view: "cash" }, "Ação executada");
    });
    return true;
  }
  return false;
}

// ============================== GRÁFICO INLINE ==============================
// SVG gerado só com números do state — sem lib, sem HTML externo.
function addChartMessage(series, title) {
  const c = byId("aiMsgs"); if (!c) return;
  const max = Math.max(...series.map(x => x.total), 1);
  const W = 300, H = 110, pad = 4, bw = Math.floor((W - pad * 2) / series.length) - 4;
  const bars = series.map((x, i) => {
    const h = Math.max(2, Math.round((x.total / max) * (H - 34)));
    const bx = pad + i * (bw + 4);
    return `<rect x="${bx}" y="${H - 22 - h}" width="${bw}" height="${h}" rx="2" fill="#0EA5E9" opacity="${0.45 + 0.55 * (x.total / max)}"><title>R$ ${x.total.toFixed(2)} (${x.count} pedidos)</title></rect><text x="${bx + bw / 2}" y="${H - 10}" text-anchor="middle" font-size="8" fill="#8896a6">${x.label}</text>`;
  }).join("");
  const d = document.createElement("div");
  d.className = "ai-m bot";
  d.innerHTML = `<strong>${html(title)}</strong><br><svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px;margin-top:6px" role="img" aria-label="${html(title)}">${bars}</svg>`;
  c.appendChild(d); c.scrollTop = c.scrollHeight;
  chatHistory.push({ role: "bot", text: title });
  saveHistory();
}

// Entrada por voz — Web Speech API do navegador (pt-BR), sem serviço externo.
// O botão só aparece quando o navegador suporta (Chrome/Edge/Android).
function setupVoiceInput(panel) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const mic = panel.querySelector("#aiMic");
  if (!SR || !mic) return;
  mic.hidden = false;
  let listening = false;
  mic.addEventListener("click", () => {
    if (listening) return;
    try {
      const recog = new SR();
      recog.lang = "pt-BR";
      recog.interimResults = false;
      recog.maxAlternatives = 1;
      listening = true;
      mic.classList.add("listening");
      recog.onresult = (e) => {
        const text = e.results?.[0]?.[0]?.transcript || "";
        const input = byId("aiIn");
        if (text && input) { voiceReplyPending = true; input.value = text; send(); }
      };
      recog.onend = () => { listening = false; mic.classList.remove("listening"); };
      recog.onerror = () => { listening = false; mic.classList.remove("listening"); };
      recog.start();
    } catch (e) { listening = false; mic.classList.remove("listening"); }
  });
}

// Consulta externa via Edge Function com typing + fallback honesto
async function answerExternal(query, body, typingLabel, what) {
  showTyping(typingLabel);
  const r = await callEdge(body);
  hideTyping();
  if (r?.answer) {
    const interaction = logInteraction(query, "web", r.answer);
    addBot(r.answer, null, r.source || "Conteúdo externo (tempo real)", { query, layer: "web", interaction });
  } else {
    logInteraction(query, "miss", null);
    addBot(`Não consegui consultar ${what} agora. 😕\n\nA função externa **ai-web-search** precisa estar publicada no Supabase (e no caso de tendências, a conta ML conectada).`);
  }
}

// Resposta de dados "com vida": número + análise (vs período anterior) + dica
// contextual + chips de próxima pergunta. Insights vêm de dq.ins (regras
// locais sobre os dados) — nunca quebram a resposta principal.
function presentDataAnswer(result, query) {
  let text = result.text;
  let followups = result.dq?.next || null;
  try {
    const insights = result.dq?.ins ? result.dq.ins(state, result.period) : [];
    if (insights?.length) text += `\n\n${insights.join("\n\n")}`;
  } catch (e) { /* insight nunca derruba a resposta */ }
  const interaction = logInteraction(query, "data", text);
  addBot(text, result.action, "Seus dados", { query, layer: "data", interaction }, true, followups);
}

async function handleCommand(cmd) {
  const rest = cmd.slice(1).trim();
  const c = normalize(rest).split(" ")[0];
  if (c === "limpar") { clearChat(); return; }
  if (c === "ensinar") {
    if (!state.canEdit) { addBot("Apenas usuários com permissão de edição podem me ensinar."); return; }
    offerTeach(rest.replace(/^\S+\s*/, ""));
    return;
  }
  if (c === "vigiar") {
    const term = rest.replace(/^\S+\s*/, "");
    const r = await addWatch(term);
    addBot(r.message, r.ok ? { view: "marketplace" } : null, "Vigilância de preços");
    return;
  }
  if (c === "misses" || c === "duvidas") {
    if (!state.canEdit) { addBot("Apenas usuários com permissão de edição veem as perguntas sem resposta."); return; }
    if (!aiLogOk || !state.supabase || !state.organizationId) { addBot("Registro de interações indisponível (rode a migração ai_assistant_learning)."); return; }
    try {
      const { data, error } = await state.supabase
        .from("ai_interactions")
        .select("query, query_normalized, created_at")
        .eq("organization_id", state.organizationId)
        .eq("result_type", "miss")
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      const seen = new Set(); const uniq = [];
      for (const row of data || []) { if (!seen.has(row.query_normalized)) { seen.add(row.query_normalized); uniq.push(row); } if (uniq.length >= 8) break; }
      if (!uniq.length) { addBot("Nenhuma pergunta sem resposta registrada. 🎉 A equipe está encontrando tudo!"); return; }
      addBot(`🧠 **Perguntas que eu não soube responder** (${uniq.length} recentes):\n\n${uniq.map((r, i) => `${i + 1}. "${r.query}"`).join("\n")}\n\nClique numa opção abaixo pra me ensinar a resposta:`, null, "Cérebro da IA", null, true,
        uniq.slice(0, 3).map(r => `/ensinar ${r.query.slice(0, 50)}`));
    } catch (e) { addBot("Não consegui carregar as perguntas agora."); }
    return;
  }
  addBot("**Comandos:**\n\n• **/ajuda** — esta lista\n• **/ensinar** — cadastrar resposta nova · **/misses** — o que eu não soube responder\n• **/vigiar [produto]** — alerta quando a concorrência baixar o preço\n• **/limpar** — limpar a conversa\n\n**O que sei fazer:**\n\n• Dados: \"lucro do mês\", \"atrasados\", \"pedidos do [cliente]\" — e combinadas: \"lucro e atrasados\"\n• 📊 Gráfico: \"gráfico de vendas\" (últimas 8 semanas)\n• ⚡ Ações (com confirmação): \"marcar [pedido] como entregue\" · \"lançar entrada de 150 em vendas\"\n• Continuação: \"e essa semana?\" · \"e da Maria?\" · \"por quê?\" (explico o cálculo)\n• Análise: \"como melhorar?\" · \"previsão de demanda\" · \"meu preço tá bom?\"\n• Mercado: \"preço médio de [produto]\" · \"vigiar preço de X\" · \"tendências do ML\"\n• Externo: \"cotação do dólar\" · \"cep 01310-100\" · \"próximo feriado\" · \"o que é PLA?\"\n• Sistema: \"como criar encomenda\", \"como funciona o kanban\"\n• 🎤 Voz: clique no microfone e fale — falou, eu respondo falando\n• Aprendo com 👍/👎 e com respostas ensinadas");
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
