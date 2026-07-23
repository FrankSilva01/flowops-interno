// Vigilância de preços de mercado (Mercado Livre) — sem IA externa.
// Guarda termos vigiados por organização (market_price_watches, RLS) e checa
// 1x/dia a mediana via Edge Function ai-web-search (mode market). Quando a
// concorrência baixa além do limiar, cria notificação. Comandos no assistente:
// "vigiar preço de X", "parar de vigiar X", "meus alertas de preço".
import { state } from "../core/state.js";
import { supabaseFunctionUrl } from "../core/config.js";
import { createNotification } from "./notifications.js";
import { normalize } from "../data/knowledge-base.js";

const DEFAULT_THRESHOLD_PCT = 10;
const MAX_WATCHES = 15;

function fmt(n) { return Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function isMissingTable(error) {
  const m = `${error?.code || ""} ${error?.message || ""}`;
  return m.includes("42P01") || m.includes("PGRST205") || /does not exist|schema cache/i.test(m);
}

// Chama a Edge Function em modo market. Retorna { answer, stats } ou null.
export async function edgeMarketSearch(term) {
  if (!state.supabase || !state.organizationId) return null;
  try {
    const { data: session } = await state.supabase.auth.getSession();
    const token = session?.session?.access_token;
    if (!token) return null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(supabaseFunctionUrl("ai-web-search"), {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ query: term, mode: "market", organization_id: state.organizationId }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    return data?.ok ? data : null;
  } catch (e) { return null; }
}

export async function listWatches() {
  if (!state.supabase || !state.organizationId) return [];
  try {
    const { data, error } = await state.supabase
      .from("market_price_watches")
      .select("id, term, last_median, baseline_median, threshold_pct, last_checked_at")
      .eq("organization_id", state.organizationId)
      .eq("active", true)
      .order("term");
    if (error) throw error;
    return data || [];
  } catch (e) { return []; }
}

export async function addWatch(term) {
  const clean = String(term || "").trim().slice(0, 80);
  if (!clean) return { ok: false, message: "Informe o produto. Ex.: **vigiar preço de suporte headset**" };
  if (!state.canEdit) return { ok: false, message: "Apenas usuários com permissão de edição podem criar alertas." };
  if (!state.supabase || !state.organizationId) return { ok: false, message: "Sessão indisponível." };
  const existing = await listWatches();
  if (existing.length >= MAX_WATCHES) return { ok: false, message: `Limite de ${MAX_WATCHES} termos vigiados. Remova algum antes ("parar de vigiar ...").` };
  if (existing.some(w => normalize(w.term) === normalize(clean))) return { ok: false, message: `Já estou vigiando **${clean}**.` };
  try {
    const { error } = await state.supabase.from("market_price_watches").insert({
      organization_id: state.organizationId,
      term: clean,
      threshold_pct: DEFAULT_THRESHOLD_PCT,
      created_by: state.activeUserEmail || "",
    });
    if (error) throw error;
  } catch (e) {
    if (isMissingTable(e)) return { ok: false, message: "A tabela de vigilância ainda não existe no banco — rode a migração market_price_watch no Supabase." };
    return { ok: false, message: "Não consegui salvar o alerta agora." };
  }
  // Primeira medição vira a linha de base (se a Edge Function estiver publicada)
  const first = await edgeMarketSearch(clean);
  const median = Number(first?.stats?.median || 0);
  if (median > 0) {
    try {
      await state.supabase.from("market_price_watches")
        .update({ baseline_median: median, last_median: median, last_total: first.stats.total ?? null, last_checked_at: new Date().toISOString() })
        .eq("organization_id", state.organizationId)
        .eq("term", clean);
    } catch (e) { /* baseline fica pra checagem diária */ }
    return { ok: true, message: `👁️ Vigiando **${clean}**. Mediana atual: R$ ${fmt(median)}. Aviso se cair mais de ${DEFAULT_THRESHOLD_PCT}%.` };
  }
  return { ok: true, message: `👁️ Vigiando **${clean}**. A primeira medição acontece na próxima checagem diária.` };
}

export async function removeWatch(term) {
  if (!state.canEdit) return { ok: false, message: "Apenas usuários com permissão de edição podem remover alertas." };
  const watches = await listWatches();
  const target = watches.find(w => normalize(w.term) === normalize(term) || normalize(w.term).includes(normalize(term)));
  if (!target) return { ok: false, message: `Não encontrei alerta pra "${term}".` };
  try {
    const { error } = await state.supabase.from("market_price_watches")
      .update({ active: false })
      .eq("id", target.id)
      .eq("organization_id", state.organizationId);
    if (error) throw error;
    return { ok: true, message: `Parei de vigiar **${target.term}**.` };
  } catch (e) { return { ok: false, message: "Não consegui remover agora." }; }
}

export async function describeWatches() {
  const watches = await listWatches();
  if (!watches.length) return "Nenhum alerta de preço ativo.\n\nCrie um com: **vigiar preço de [produto]**";
  const lines = watches.map(w => {
    const med = Number(w.last_median || 0);
    const base = Number(w.baseline_median || 0);
    const delta = base > 0 && med > 0 ? ((med - base) / base * 100) : null;
    const deltaTxt = delta === null ? "" : delta <= -1 ? ` (▼${Math.abs(delta).toFixed(0)}% desde o início)` : delta >= 1 ? ` (▲${delta.toFixed(0)}%)` : " (estável)";
    return `• **${w.term}** — ${med > 0 ? `mediana R$ ${fmt(med)}${deltaTxt}` : "aguardando 1ª medição"}`;
  });
  return `👁️ **Alertas de preço ativos:**\n\n${lines.join("\n")}\n\n_Checagem diária. "parar de vigiar [termo]" remove._`;
}

// Checagem diária (day-gate em localStorage). Chamada pelo assistente no load.
export async function checkWatchesDaily({ force = false } = {}) {
  if (!state.supabase || !state.organizationId) return null;
  const gateKey = `flowops_mw_check_${state.organizationId}`;
  const today = new Date().toISOString().slice(0, 10);
  if (!force && localStorage.getItem(gateKey) === today) return null;
  const watches = await listWatches();
  localStorage.setItem(gateKey, today);
  if (!watches.length) return null;
  const alerts = [];
  for (const w of watches.slice(0, MAX_WATCHES)) {
    const r = await edgeMarketSearch(w.term);
    const median = Number(r?.stats?.median || 0);
    if (!(median > 0)) continue;
    const prev = Number(w.last_median || 0);
    const threshold = Number(w.threshold_pct || DEFAULT_THRESHOLD_PCT);
    if (prev > 0) {
      const dropPct = (prev - median) / prev * 100;
      if (dropPct >= threshold) {
        await createNotification("marketplace", "Concorrência baixou o preço",
          `"${w.term}": mediana caiu pra R$ ${fmt(median)} (era R$ ${fmt(prev)}, -${dropPct.toFixed(0)}%). Revise seu preço/anúncio.`,
          "marketplace", `mw-${w.id}-${today}`, "high");
        alerts.push({ term: w.term, direction: "down", pct: dropPct, median });
      } else if (dropPct <= -threshold) {
        await createNotification("marketplace", "Mercado subiu o preço",
          `"${w.term}": mediana subiu pra R$ ${fmt(median)} (era R$ ${fmt(prev)}, +${Math.abs(dropPct).toFixed(0)}%). Pode haver espaço pra reajustar.`,
          "marketplace", `mw-${w.id}-${today}`);
        alerts.push({ term: w.term, direction: "up", pct: Math.abs(dropPct), median });
      }
    }
    await state.supabase.from("market_price_watches")
      .update({
        last_median: median,
        last_total: r.stats.total ?? null,
        last_checked_at: new Date().toISOString(),
        baseline_median: Number(w.baseline_median || 0) > 0 ? w.baseline_median : median,
      })
      .eq("id", w.id)
      .eq("organization_id", state.organizationId);
  }
  return alerts;
}
