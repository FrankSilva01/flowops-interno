import { state, saveData, normalizeOrderStatus, order } from "./state.js";
import { render } from "./router.js";
import { nextId, today, showAppMessage } from "./dom.js";
import { ensureCanEdit } from "./permissions.js";
import { persist } from "../data/remote.js";
import { recordAudit } from "../features/logs.js";
import { normalizeImportedOrder } from "../features/orders.js";
export { parseCsv, parseCsvRecords, splitCsvLine } from "./csv.js";
import { parseCsv } from "./csv.js";
export function exportJson() {
  const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "3d-aft-dados.json";
  link.click();
  URL.revokeObjectURL(link.href);
  recordAudit("export", "system", "json", "", null, { orders: state.data.orders.length }, "manual");
}

export async function importFile(event) {
  if (!ensureCanEdit()) {
    event.target.value = "";
    return;
  }
  const file = event.target.files?.[0];
  if (!file) return;
  let imported = false;
  try {
    if (file.name.toLowerCase().endsWith(".json")) {
      await importJson(await file.text());
    } else if (file.name.toLowerCase().endsWith(".csv")) {
      await importRows(parseCsv(await file.text()));
    } else if (file.name.toLowerCase().endsWith(".xlsx") || file.name.toLowerCase().endsWith(".xls")) {
      await loadXlsx();
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      await importRows(XLSX.utils.sheet_to_json(sheet, { defval: "" }));
    } else {
      showAppMessage("Formato não suportado", "Use um arquivo JSON, CSV, XLSX ou XLS.", "warning");
      return;
    }
    saveData();
    render();
    imported = true;
    showAppMessage("Importação concluída", "Os dados foram processados com sucesso.", "success");
  } catch (error) {
    showAppMessage("Falha na importação", error.message, "error");
  } finally {
    if (imported) await recordAudit("import", "system", file.name, "", null, { file: file.name, size: file.size }, "manual");
    event.target.value = "";
  }
}

export async function importJson(text) {
  const parsed = JSON.parse(text);
  const incoming = {
    orders: Array.isArray(parsed.orders) ? parsed.orders : [],
    cash: Array.isArray(parsed.cash) ? parsed.cash : [],
    materials: Array.isArray(parsed.materials) ? parsed.materials : []
  };
  await importCollection("orders", incoming.orders);
  await importCollection("cash", incoming.cash);
  await importCollection("materials", incoming.materials);
}

export async function importCollection(kind, rows) {
  for (const row of rows) {
    const item = normalizeImportedItem(kind, row);
    upsertLocal(kind, item);
    await persist(kind, item);
  }
}

export async function importRows(rows) {
  const orders = rows.map((row) => normalizeImportedOrder(row)).filter(Boolean);
  if (!orders.length) throw new Error("Não encontrei colunas de encomenda no arquivo.");
  await importCollection("orders", orders);
}

export function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function normalizeImportedItem(kind, row) {
  if (kind === "orders") return normalizeImportedOrder(row) || order(row.id || nextId("ENC", state.data.orders), row.description || "Importado", row.material || "", row.deliveryDate || "", row.charged || 0, row.received || 0, normalizeOrderStatus(row.status || "A preparar"), row.notes || "");
  if (kind === "cash") return {
    id: row.id || nextId("CX", state.data.cash),
    date: normalizeDate(row.date) || today(),
    type: row.type || "Entrada",
    category: row.category || "Importado",
    description: row.description || "Importado",
    method: row.method || "",
    income: Number(row.income || 0),
    expense: Number(row.expense || 0)
  };
  return {
    id: row.id || nextId("MAT", state.data.materials),
    date: normalizeDate(row.date) || today(),
    supplier: row.supplier || "Importado",
    type: row.type || "Material",
    spec: row.spec || "",
    quantity: Number(row.quantity || 0),
    unitCost: Number(row.unitCost || row.unit_cost || 0)
  };
}

function upsertLocal(kind, item) {
  const key = kind === "cash" ? "cash" : kind;
  const index = state.data[key].findIndex((row) => row.id === item.id);
  if (index >= 0) state.data[key][index] = item;
  else state.data[key].push(item);
}

export function pick(row, keys) {
  const entries = Object.entries(row || {});
  for (const key of keys) {
    const found = entries.find(([name]) => normalizeKey(name) === normalizeKey(key));
    if (found && String(found[1]).trim()) return String(found[1]).trim();
  }
  return "";
}

export function normalizeKey(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function normalizeDate(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const br = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  return "";
}

export function loadXlsx() {
  if (window.XLSX) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
    script.onload = resolve;
    script.onerror = () => reject(new Error("Não foi possível carregar o leitor de XLSX."));
    document.head.appendChild(script);
  });
}
