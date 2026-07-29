function moneyValue(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function total(rows, field) {
  const values = rows.map((row) => moneyValue(row?.[field]));
  return values.some((value) => value === null)
    ? null
    : values.reduce((sum, value) => sum + value, 0);
}

function validDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function buildDailySeries(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const income = moneyValue(row?.income);
    const expense = moneyValue(row?.expense);
    if (!validDate(row?.date) || income === null || expense === null) continue;
    const total = grouped.get(row.date) || { date: row.date, income: 0, expense: 0, balance: 0 };
    total.income += income;
    total.expense += expense;
    total.balance += income - expense;
    grouped.set(row.date, total);
  }
  return [...grouped.values()].sort((left, right) => left.date.localeCompare(right.date));
}

export function buildFinanceModel({ cash = [], orders = [] } = {}) {
  const sourceCash = Array.isArray(cash) ? cash : [];
  const sourceOrders = Array.isArray(orders) ? orders : [];
  const income = total(sourceCash, "income");
  const expense = total(sourceCash, "expense");
  const receivables = sourceOrders.map((order) => {
    const charged = moneyValue(order?.charged);
    const received = moneyValue(order?.received);
    return { order, amount: charged === null || received === null ? null : Math.max(0, charged - received) };
  });
  const receivable = receivables.some((item) => item.amount === null)
    ? null
    : receivables.reduce((sum, item) => sum + item.amount, 0);
  const rows = sourceCash
    .map((row, index) => ({ row, index }))
    .sort((left, right) => {
      const leftDate = validDate(left.row?.date) ? left.row.date : null;
      const rightDate = validDate(right.row?.date) ? right.row.date : null;
      if (leftDate && rightDate) return leftDate.localeCompare(rightDate) || left.index - right.index;
      if (leftDate) return -1;
      if (rightDate) return 1;
      return left.index - right.index;
    })
    .map(({ row }) => row);

  return {
    summary: {
      income,
      expense,
      balance: income === null || expense === null ? null : income - expense,
      receivable,
    },
    rows,
    dailySeries: buildDailySeries(rows),
    receivables,
  };
}
