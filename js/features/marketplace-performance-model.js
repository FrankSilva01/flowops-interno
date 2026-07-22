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

function classifyEntryPriority(entry) {
  const analytics = entry.analytics || {};
  const profitability = entry.profitability;
  const sales = firstFinite(analytics.sales_30d, analytics.sold_quantity, analytics.sales) ?? 0;
  const visits30d = firstFinite(analytics.visits_30d, analytics.visits) ?? 0;
  const conversion = firstFinite(analytics.conversion_rate);
  const intentScore = firstFinite(analytics.intent_score, analytics.intentScore) ?? 0;
  const health = firstFinite(analytics.health_score, analytics.healthScore);
  const blockingIssue = Boolean(
    analytics.blocking_issue
    || analytics.blockingIssue
    || analytics.marketplace_issue
    || analytics.marketplaceIssue
    || entry.listing?.blocking_issue
    || entry.listing?.blockingIssue,
  );

  if (sales === 0 && intentScore >= 80) {
    return priority(entry, "intent", 1, intentScore, "attention", "Alta intencao de compra sem venda recente.", "Revisar anuncio");
  }

  if (visits30d >= 100 && conversion != null && conversion < 1) {
    return priority(entry, "conversion", 2, visits30d - conversion, "warning", "O anuncio recebe trafego, mas converte pouco.", "Melhorar conversao");
  }

  if (blockingIssue || (health != null && health < 40)) {
    return priority(entry, "risk", 3, blockingIssue ? 100 : 40 - health, "critical", "O anuncio tem risco de saude ou bloqueio no marketplace.", "Resolver risco");
  }

  if (health != null && health >= 70 && visits30d >= 100 && conversion != null && conversion >= 5) {
    return priority(entry, "opportunity", 4, health + conversion, "positive", "O anuncio saudavel tem sinais de potencial para investimento.", "Avaliar investimento");
  }

  if (profitability == null) {
    return priority(entry, "cost", 5, visits30d, "warning", "Sem custo cadastrado, a rentabilidade nao pode ser analisada.", "Cadastrar custo");
  }

  return null;
}

export function selectPerformancePriorities(entries = [], limit = PRIORITY_LIMIT) {
  const safeLimit = Math.max(0, Math.floor(finite(limit) ?? PRIORITY_LIMIT));
  return (Array.isArray(entries) ? entries : [])
    .map(classifyEntryPriority)
    .filter(Boolean)
    .sort((a, b) => a.rank - b.rank || b.score - a.score || a.title.localeCompare(b.title, "pt-BR"))
    .slice(0, safeLimit);
}

export function buildMarketplacePerformanceSnapshot(entries = [], options = {}) {
  const normalizedEntries = Array.isArray(entries) ? entries : [];
  const analytics = normalizedEntries.map((entry) => entry.analytics).filter(Boolean);
  const profitability = normalizedEntries.map((entry) => entry.profitability).filter(Boolean);
  const totals = analytics.reduce((result, item) => ({
    visits: result.visits + (firstFinite(item.visits_30d, item.visits) ?? 0),
    questions: result.questions + (firstFinite(item.questions_30d, item.questions_total, item.questions) ?? 0),
    sales: result.sales + (firstFinite(item.sales_30d, item.sold_quantity, item.sales) ?? 0),
  }), { visits: 0, questions: 0, sales: 0 });
  const conversion = totals.visits > 0 ? (totals.sales / totals.visits) * 100 : null;
  const margins = profitability
    .map((item) => finite(item.marginPct))
    .filter((value) => value != null);
  const healthScores = analytics
    .map((item) => firstFinite(item.health_score, item.healthScore))
    .filter((value) => value != null);

  return {
    indicators: {
      revenue: normalizedEntries.reduce((sum, entry) => sum + (finite(entry.salesRevenue) ?? 0), 0),
      conversion,
      averageMargin: average(margins),
      health: average(healthScores),
    },
    totals,
    priorities: selectPerformancePriorities(normalizedEntries, options.priorityLimit ?? PRIORITY_LIMIT),
    defaultSection: profitability.length ? "profitability" : "listings",
  };
}
