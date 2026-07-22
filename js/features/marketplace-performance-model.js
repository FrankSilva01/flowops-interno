const PRIORITY_LIMIT = 4;

function finite(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function firstFinite(...values) {
  for (const value of values) {
    const number = finite(value);
    if (number != null) return number;
  }
  return null;
}

function average(values) {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
}

function sumKnown(items, valueFor) {
  let known = false;
  let total = 0;
  for (const item of items) {
    const value = finite(valueFor(item));
    if (value == null) continue;
    known = true;
    total += value;
  }
  return known ? total : null;
}

function entryIdentity(entry) {
  const listing = entry.listing || {};
  return {
    marketplace: listing.marketplace ?? null,
    externalId: listing.external_id ?? listing.externalId ?? null,
    title: listing.title || listing.name || listing.external_id || listing.externalId || "Anuncio sem titulo",
  };
}

function priority(entry, kind, rank, score, severity, reason, actionLabel) {
  const identity = entryIdentity(entry);
  return {
    kind,
    rank,
    score,
    severity,
    title: identity.title,
    reason,
    actionLabel,
    marketplace: identity.marketplace,
    externalId: identity.externalId,
  };
}

function classifyEntryPriority(entry, context) {
  const analytics = entry.analytics || {};
  const profitability = entry.profitability;
  const sales = firstFinite(analytics.sales_30d, analytics.sold_quantity, analytics.sales);
  const salesKnown = sales != null;
  const visits30d = firstFinite(analytics.visits_30d, analytics.visits);
  const conversion = firstFinite(analytics.conversion_rate);
  const intentScore = firstFinite(entry.intent?.score);
  const health = firstFinite(analytics.health_score, analytics.healthScore);
  const blockingIssue = Boolean(
    analytics.blocking_issue
    || analytics.blockingIssue
    || analytics.marketplace_issue
    || analytics.marketplaceIssue
    || entry.listing?.blocking_issue
    || entry.listing?.blockingIssue,
  );

  if (salesKnown && sales === 0 && intentScore != null && intentScore >= 80) {
    return priority(entry, "intent", 1, intentScore, "attention", "Alta intencao de compra sem venda recente.", "Revisar anuncio");
  }

  const highTraffic = context.maxVisits != null
    && context.maxVisits > 0
    && visits30d != null
    && visits30d >= context.maxVisits * 0.7;
  const lowConversion = context.portfolioAvgConversion != null
    && conversion != null
    && conversion < context.portfolioAvgConversion * 0.6;

  if (highTraffic && lowConversion) {
    return priority(entry, "conversion", 2, visits30d - conversion, "warning", "O anuncio recebe trafego, mas converte pouco.", "Melhorar conversao");
  }

  if (blockingIssue || (health != null && health < 0.5)) {
    return priority(entry, "risk", 3, blockingIssue ? 100 : 40 - health, "critical", "O anuncio tem risco de saude ou bloqueio no marketplace.", "Resolver risco");
  }

  if (health != null && health >= 0.8 && highTraffic && conversion != null
    && context.portfolioAvgConversion != null
    && conversion >= context.portfolioAvgConversion) {
    return priority(entry, "opportunity", 4, health + conversion, "positive", "O anuncio saudavel tem sinais de potencial para investimento.", "Avaliar investimento");
  }

  if (profitability == null || profitability.hasCost === false) {
    return priority(entry, "cost", 5, visits30d ?? 0, "warning", "Sem custo cadastrado, a rentabilidade nao pode ser analisada.", "Cadastrar custos em lote");
  }

  return null;
}

export function selectPerformancePriorities(entries = [], limit = PRIORITY_LIMIT, options = {}) {
  const normalizedEntries = Array.isArray(entries) ? entries : [];
  const knownConversions = normalizedEntries
    .map((entry) => finite(entry.analytics && entry.analytics.conversion_rate))
    .filter((value) => value != null);
  const knownVisits = normalizedEntries
    .map((entry) => firstFinite(entry.analytics?.visits_30d, entry.analytics?.visits))
    .filter((value) => value != null);
  const portfolioAvgConversion = finite(options.portfolioAvgConversion) ?? average(knownConversions);
  const maxVisits = finite(options.maxVisits) ?? (knownVisits.length ? Math.max(...knownVisits) : null);
  const safeLimit = Math.max(0, Math.floor(finite(limit) ?? PRIORITY_LIMIT));
  const context = { portfolioAvgConversion, maxVisits };
  const seen = new Set();
  return normalizedEntries
    .map((entry) => classifyEntryPriority(entry, context))
    .filter(Boolean)
    .filter((item) => {
      if (item.kind === "cost") {
        if (seen.has("cost")) return false;
        seen.add("cost");
        item.title = "Cobertura de custos";
        item.marketplace = null;
        item.externalId = null;
        return true;
      }
      const key = `${item.kind}:${item.marketplace ?? ""}:${item.externalId ?? item.title}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.rank - b.rank || b.score - a.score || a.title.localeCompare(b.title, "pt-BR"))
    .slice(0, safeLimit);
}

export function buildMarketplacePerformanceSnapshot(entries = [], options = {}) {
  const normalizedEntries = Array.isArray(entries) ? entries : [];
  const totals = {
    visits: sumKnown(normalizedEntries, (entry) => firstFinite(entry.analytics?.visits_30d, entry.analytics?.visits)),
    questions: sumKnown(normalizedEntries, (entry) => firstFinite(entry.analytics?.questions_30d, entry.analytics?.questions_total, entry.analytics?.questions)),
    sales: sumKnown(normalizedEntries, (entry) => firstFinite(entry.analytics?.sales_30d, entry.analytics?.sold_quantity, entry.analytics?.sales)),
  };
  const conversion = totals.visits != null && totals.sales != null && totals.visits > 0
    ? (totals.sales / totals.visits) * 100
    : null;
  const margins = normalizedEntries
    .map((entry) => entry.profitability)
    .filter((item) => item && item.hasCost !== false)
    .map((item) => finite(item.marginPct))
    .filter((value) => value != null);
  const healthScores = normalizedEntries
    .map((entry) => entry.analytics)
    .filter(Boolean)
    .map((item) => firstFinite(item.health_score, item.healthScore))
    .filter((value) => value != null);

  return {
    indicators: {
      revenue: sumKnown(normalizedEntries, (entry) => entry.salesRevenue),
      conversion,
      averageMargin: average(margins),
      health: average(healthScores),
    },
    totals,
    priorities: selectPerformancePriorities(normalizedEntries, options.priorityLimit ?? PRIORITY_LIMIT, options),
    defaultSection: normalizedEntries.some((entry) => entry.profitability && entry.profitability.hasCost !== false)
      ? "profitability"
      : "listings",
  };
}
