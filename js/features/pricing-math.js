export function classifyProfitability(marginPct, thresholds) {
  if (marginPct < thresholds.critical) return { key: "loss", label: "Prejuízo", className: "danger-badge" };
  if (marginPct < thresholds.attention) return { key: "critical", label: "Crítico", className: "danger-badge" };
  if (marginPct < thresholds.healthy) return { key: "attention", label: "Atenção", className: "queue" };
  if (marginPct < thresholds.excellent) return { key: "healthy", label: "Saudável", className: "done" };
  return { key: "excellent", label: "Excelente", className: "done" };
}

export function computeMarginBreakdown(inputs, thresholds) {
  const { cost, revenue, feePct = 0, taxPct = 0, shipping = 0, packaging = 0, fixedFee = 0 } = inputs;
  const normalizedCost = Number(cost || 0);
  const normalizedRevenue = Number(revenue || 0);
  const normalizedFixedFee = Number(fixedFee || 0);
  const normalizedShipping = shipping !== null && shipping !== undefined ? Number(shipping || 0) : null;
  const normalizedPackaging = Number(packaging || 0);
  if (normalizedRevenue <= 0) {
    return {
      revenue: 0, cost: normalizedCost, feePct, feeAmount: 0, fixedFee: normalizedFixedFee,
      taxPct, taxAmount: 0, shipping: normalizedShipping, packaging: normalizedPackaging,
      netProfit: -normalizedCost - normalizedFixedFee, marginPct: 0,
      level: classifyProfitability(0, thresholds),
    };
  }
  const feeAmount = normalizedRevenue * (feePct / 100);
  const taxAmount = normalizedRevenue * (taxPct / 100);
  const shippingForCalc = normalizedShipping !== null ? normalizedShipping : 0;
  const netProfit = normalizedRevenue - normalizedCost - feeAmount - normalizedFixedFee
    - taxAmount - shippingForCalc - normalizedPackaging;
  const marginPct = (netProfit / normalizedRevenue) * 100;
  return {
    revenue: normalizedRevenue, cost: normalizedCost, feePct, feeAmount,
    fixedFee: normalizedFixedFee, taxPct, taxAmount, shipping: normalizedShipping,
    packaging: normalizedPackaging, netProfit, marginPct,
    level: classifyProfitability(marginPct, thresholds),
  };
}

export function calculatePriceSuggestion({
  cost, feePct = 0, taxPct = 0, shipping = 0, packaging = 0,
  fixedFee = 0, fixedFeeThreshold = 0, targetMarginPct,
}) {
  const denominator = 1 - (feePct / 100) - (taxPct / 100) - (targetMarginPct / 100);
  if (denominator <= 0) return null;
  const base = Number(cost || 0) + Number(shipping || 0) + Number(packaging || 0);
  let price = base / denominator;
  if (fixedFeeThreshold > 0 && fixedFee > 0 && price < fixedFeeThreshold) {
    price = (base + Number(fixedFee)) / denominator;
  }
  return Math.round(price * 100) / 100;
}
