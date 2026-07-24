// Busca de conteúdo externo pro Assistente IA — SEM nenhuma API de IA.
// mode "web" (default): proxy da Wikipedia PT (opensearch + summary).
// mode "market": pesquisa de preços no Mercado Livre usando o token da conta
//   ML conectada da organização (a busca pública do ML passou a exigir auth).
// POST { query: string, mode?: "web"|"market", organization_id?: string }
//   → { ok, answer, source, url? }

import { createClient } from "supabase";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...(init.headers || {}) },
  });
}

function adminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const WIKI_API = "https://pt.wikipedia.org/w/api.php";
const WIKI_SUMMARY = "https://pt.wikipedia.org/api/rest_v1/page/summary/";

async function webSearch(term: string) {
  const osRes = await fetch(
    `${WIKI_API}?action=opensearch&search=${encodeURIComponent(term)}&limit=1&namespace=0&format=json`,
    { headers: { "User-Agent": "FlowOps-Assistant/1.0" } },
  );
  if (!osRes.ok) return json({ ok: false, error: "wikipedia indisponivel" }, { status: 502 });
  const osData = await osRes.json();
  const title = osData?.[1]?.[0];
  if (!title) return json({ ok: false, error: "sem resultado" }, { status: 404 });

  const sumRes = await fetch(WIKI_SUMMARY + encodeURIComponent(title), {
    headers: { "User-Agent": "FlowOps-Assistant/1.0" },
  });
  if (!sumRes.ok) return json({ ok: false, error: "resumo indisponivel" }, { status: 502 });
  const sum = await sumRes.json();
  const extract = String(sum?.extract || "").trim();
  if (!extract) return json({ ok: false, error: "sem resumo" }, { status: 404 });

  return json({
    ok: true,
    answer: `**${title}**\n\n${extract.slice(0, 900)}`,
    source: `Wikipedia — ${title}`,
    url: sum?.content_urls?.desktop?.page || "",
  });
}

function fmtBRL(n: number) {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function marketSearch(term: string, organizationId: string) {
  if (!organizationId) return json({ ok: false, error: "organization_id obrigatorio" }, { status: 400 });
  const supabase = adminClient();
  const { data: account } = await supabase
    .from("marketplace_accounts")
    .select("access_token")
    .eq("organization_id", organizationId)
    .eq("marketplace", "Mercado Livre")
    .eq("status", "connected")
    .maybeSingle();
  if (!account?.access_token) return json({ ok: false, error: "conta ML nao conectada" }, { status: 404 });

  const res = await fetch(
    `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(term)}&limit=24`,
    { headers: { Authorization: `Bearer ${account.access_token}` } },
  );
  if (!res.ok) return json({ ok: false, error: `ML respondeu ${res.status}` }, { status: 502 });
  const d = await res.json();
  const rs = (d.results || []).filter((r: any) => Number(r.price) > 0);
  if (!rs.length) return json({ ok: false, error: "sem resultados" }, { status: 404 });

  const prices = rs.map((r: any) => Number(r.price)).sort((a: number, b: number) => a - b);
  const min = prices[0], max = prices[prices.length - 1];
  const median = prices[Math.floor(prices.length / 2)];
  const avg = prices.reduce((a: number, b: number) => a + b, 0) / prices.length;
  const free = Math.round(rs.filter((r: any) => r.shipping?.free_shipping).length / rs.length * 100);
  const top = rs.slice(0, 3).map((r: any) => `• ${String(r.title).slice(0, 55)} — R$ ${fmtBRL(Number(r.price))}`).join("\n");

  return json({
    ok: true,
    answer: `🔎 **"${term}" no Mercado Livre** (${rs.length} anúncios, ${Number(d.paging?.total || 0).toLocaleString("pt-BR")} no total):\n\n• Mínimo: R$ ${fmtBRL(min)}\n• **Mediana: R$ ${fmtBRL(median)}**\n• Média: R$ ${fmtBRL(avg)}\n• Máximo: R$ ${fmtBRL(max)}\n• ${free}% com frete grátis\n\n**Exemplos:**\n${top}\n\n_Use a Calculadora da Inteligência pra definir seu preço com margem._`,
    source: "Mercado Livre (tempo real)",
    // stats numéricos crus — usados pela vigilância de preços (market-watch)
    stats: { median, min, max, avg, total: Number(d.paging?.total || 0), sample: rs.length, free_pct: free },
  });
}

// Câmbio em tempo real (AwesomeAPI — pública, sem chave). term: "USD-BRL,EUR-BRL"
async function currencySearch(term: string) {
  const pairs = term.replace(/[^A-Z,-]/gi, "").slice(0, 40) || "USD-BRL,EUR-BRL";
  const res = await fetch(`https://economia.awesomeapi.com.br/json/last/${encodeURIComponent(pairs)}`);
  if (!res.ok) return json({ ok: false, error: "cambio indisponivel" }, { status: 502 });
  const data = await res.json();
  const rows = Object.values(data || {}) as Record<string, string>[];
  if (!rows.length) return json({ ok: false, error: "sem cotacao" }, { status: 404 });
  const icon: Record<string, string> = { USD: "💵", EUR: "💶", GBP: "💷" };
  const lines = rows.map((r) => {
    const chg = Number(r.pctChange || 0);
    const arrow = chg > 0 ? `▲ +${chg.toFixed(2)}%` : chg < 0 ? `▼ ${chg.toFixed(2)}%` : "estável";
    return `${icon[r.code] || "💱"} **${r.name?.split("/")[0] || r.code}**: R$ ${Number(r.bid).toFixed(4).replace(".", ",")} (${arrow} hoje · mín R$ ${Number(r.low).toFixed(2).replace(".", ",")} · máx R$ ${Number(r.high).toFixed(2).replace(".", ",")})`;
  });
  return json({
    ok: true,
    answer: `**Câmbio agora:**\n\n${lines.join("\n")}\n\n_Dólar alto encarece filamento importado — vale comparar fornecedor nacional._`,
    source: "AwesomeAPI (tempo real)",
  });
}

// CEP via ViaCEP (pública, sem chave). term: 8 dígitos
async function cepSearch(term: string) {
  const cep = term.replace(/\D/g, "").slice(0, 8);
  if (cep.length !== 8) return json({ ok: false, error: "cep invalido" }, { status: 400 });
  const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
  if (!res.ok) return json({ ok: false, error: "viacep indisponivel" }, { status: 502 });
  const d = await res.json();
  if (d?.erro) return json({ ok: false, error: "cep nao encontrado" }, { status: 404 });
  return json({
    ok: true,
    answer: `📍 **CEP ${cep.slice(0, 5)}-${cep.slice(5)}:**\n\n${[d.logradouro, d.bairro].filter(Boolean).join(", ") || "(logradouro não informado)"}\n**${d.localidade} – ${d.uf}**${d.ddd ? `\nDDD ${d.ddd}` : ""}`,
    source: "ViaCEP",
  });
}

// Tendências de busca do Mercado Livre (requer token da conta da organização)
async function trendsSearch(organizationId: string) {
  if (!organizationId) return json({ ok: false, error: "organization_id obrigatorio" }, { status: 400 });
  const supabase = adminClient();
  const { data: account } = await supabase
    .from("marketplace_accounts")
    .select("access_token")
    .eq("organization_id", organizationId)
    .eq("marketplace", "Mercado Livre")
    .eq("status", "connected")
    .maybeSingle();
  if (!account?.access_token) return json({ ok: false, error: "conta ML nao conectada" }, { status: 404 });
  const res = await fetch("https://api.mercadolibre.com/trends/MLB", {
    headers: { Authorization: `Bearer ${account.access_token}` },
  });
  if (!res.ok) return json({ ok: false, error: `ML respondeu ${res.status}` }, { status: 502 });
  const data = await res.json();
  const list = (Array.isArray(data) ? data : []).slice(0, 12);
  if (!list.length) return json({ ok: false, error: "sem tendencias" }, { status: 404 });
  return json({
    ok: true,
    answer: `🔥 **Buscas em alta no Mercado Livre agora:**\n\n${list.map((t: any, i: number) => `${i + 1}. ${t.keyword}`).join("\n")}\n\n_Tem algo aí que você consegue produzir? Pergunte "preço médio de [termo]" pra ver se vale a pena._`,
    source: "Mercado Livre Trends (tempo real)",
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "use POST" }, { status: 405 });

  try {
    const body = await req.json().catch(() => ({}));
    const term = String(body.query || "").trim().slice(0, 120);
    if (!term) return json({ ok: false, error: "query obrigatoria" }, { status: 400 });
    if (body.mode === "market") return await marketSearch(term, String(body.organization_id || ""));
    if (body.mode === "currency") return await currencySearch(term);
    if (body.mode === "cep") return await cepSearch(term);
    if (body.mode === "trends") return await trendsSearch(String(body.organization_id || ""));
    return await webSearch(term);
  } catch (error) {
    return json({ ok: false, error: String(error) }, { status: 500 });
  }
});
