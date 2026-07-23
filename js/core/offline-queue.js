// Fila de escritas offline (PWA) — por organização, em localStorage.
// Guarda persist/remove que falharam por falta de conexão e reaplica quando
// a conexão volta. NUNCA enfileira antes do load remoto ter sucesso (evitaria
// gravar dados demo/incompletos — mesmo critério do gate em remote.js).

const CAP = 100;                     // máximo de escritas pendentes
const MAX_AGE_MS = 7 * 86400000;     // descarta entradas com mais de 7 dias

function queueKey(orgId) { return `flowops_offline_queue_${orgId || "anon"}`; }

function readRaw(orgId) {
  try {
    const v = JSON.parse(localStorage.getItem(queueKey(orgId)) || "[]");
    return Array.isArray(v) ? v : [];
  } catch (e) { return []; }
}

function writeRaw(orgId, list) {
  try { localStorage.setItem(queueKey(orgId), JSON.stringify(list.slice(-CAP))); } catch (e) { /* storage cheio */ }
}

export function enqueueWrite(orgId, entry) {
  if (!orgId) return false;
  const list = readRaw(orgId);
  // Dedup: última escrita do mesmo registro vence (upsert é idempotente)
  const filtered = list.filter(x => !(x.op === entry.op && x.kind === entry.kind && String(x.itemId) === String(entry.itemId)));
  filtered.push({ ...entry, ts: Date.now() });
  writeRaw(orgId, filtered);
  return true;
}

export function readQueue(orgId) {
  const cutoff = Date.now() - MAX_AGE_MS;
  return readRaw(orgId).filter(x => Number(x.ts || 0) >= cutoff);
}

export function replaceQueue(orgId, list) { writeRaw(orgId, list); }

export function queueSize(orgId) { return readQueue(orgId).length; }
