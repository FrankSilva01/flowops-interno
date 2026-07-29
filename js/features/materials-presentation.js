function numberValue(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || value.trim() === "") return null;
  const number = Number(value.trim());
  return Number.isFinite(number) ? number : null;
}

function unitCost(item) {
  return numberValue(item?.unitCost ?? item?.unit_cost);
}

function lineTotal(item) {
  const quantity = numberValue(item?.quantity);
  const cost = unitCost(item);
  return quantity === null || cost === null ? null : quantity * cost;
}

function total(values) {
  return values.some((value) => value === null)
    ? null
    : values.reduce((sum, value) => sum + value, 0);
}

function supplierSummary(purchases) {
  const suppliers = new Map();
  for (const purchase of purchases) {
    const supplier = typeof purchase?.supplier === "string" ? purchase.supplier.trim() : "";
    if (!supplier) continue;
    const current = suppliers.get(supplier) || { supplier, purchaseCount: 0, totals: [] };
    current.purchaseCount += 1;
    current.totals.push(lineTotal(purchase));
    suppliers.set(supplier, current);
  }
  return [...suppliers.values()]
    .map(({ supplier, purchaseCount, totals }) => ({ supplier, purchaseCount, total: total(totals) }))
    .sort((left, right) => left.supplier.localeCompare(right.supplier, "pt-BR"));
}

export function buildMaterialsModel({ purchases = [], inventory = [] } = {}) {
  const sourcePurchases = Array.isArray(purchases) ? purchases : [];
  const sourceInventory = Array.isArray(inventory) ? inventory : [];
  const purchaseTotal = total(sourcePurchases.map(lineTotal));
  const lowStock = sourceInventory.map((item) => {
    const quantity = numberValue(item?.quantity);
    const minimum = numberValue(item?.minimum_quantity);
    return quantity === null || minimum === null ? null : quantity <= minimum;
  });

  return {
    summary: {
      purchaseTotal,
      purchaseCount: sourcePurchases.length,
      averageTicket: purchaseTotal === null ? null : (sourcePurchases.length ? purchaseTotal / sourcePurchases.length : 0),
      inventoryCount: sourceInventory.length,
      lowStockCount: lowStock.some((value) => value === null)
        ? null
        : lowStock.filter(Boolean).length,
      estimatedStockValue: total(sourceInventory.map(lineTotal)),
    },
    suppliers: supplierSummary(sourcePurchases),
    purchases: sourcePurchases,
    inventory: sourceInventory,
  };
}
