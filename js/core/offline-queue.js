// Fila de escritas offline (PWA) — por organização, em localStorage.
// Guarda persist/remove que falharam por falta de conexão e reaplica quando
// a conexão volta. NUNCA enfileira antes do load remoto ter sucesso (evitaria
// gravar dados demo/incompletos — mesmo critério do gate em remote.js).

const CAP = 100;                     // máximo de escritas pendentes
const MAX_AGE_MS = 7 * 86400000;     // descarta entradas com mais de 7 dias

function queueKey(orgId) { return `flowops_offline_queue_${orgId || "anon"}`; }
function deadLetterKey(orgId) { return `flowops_offline_dead_letter_${orgId || "anon"}`; }

function readStorage(key) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(v) ? v : [];
  } catch (e) { return []; }
}

function writeStorage(key, list) {
  try {
    localStorage.setItem(key, JSON.stringify(list.slice(-CAP)));
    return { stored: true, error: null };
  } catch (error) {
    return { stored: false, error };
  }
}

function readRaw(orgId) { return readStorage(queueKey(orgId)); }

export function enqueueWrite(orgId, entry) {
  if (!orgId) return { stored: false, error: new Error("organization_id obrigatorio") };
  const list = readRaw(orgId);
  // Dedup: última escrita do mesmo registro vence (upsert é idempotente)
  const filtered = list.filter(x => !(x.op === entry.op && x.kind === entry.kind && String(x.itemId) === String(entry.itemId)));
  filtered.push({ ...entry, ts: Date.now() });
  return writeStorage(queueKey(orgId), filtered);
}

export function readQueue(orgId) {
  const cutoff = Date.now() - MAX_AGE_MS;
  return readRaw(orgId).filter(x => Number(x.ts || 0) >= cutoff);
}

export function replaceQueue(orgId, list) { return writeStorage(queueKey(orgId), list); }

export function queueSize(orgId) { return readQueue(orgId).length; }

export function readDeadLetters(orgId) { return readStorage(deadLetterKey(orgId)); }

export function replaceDeadLetters(orgId, list) { return writeStorage(deadLetterKey(orgId), list); }

export function appendDeadLetters(orgId, entries) {
  if (!entries.length) return { stored: true, error: null };
  return replaceDeadLetters(orgId, [...readDeadLetters(orgId), ...entries]);
}

export function clearOfflineData(orgId) {
  if (!orgId) return;
  localStorage.removeItem(queueKey(orgId));
  localStorage.removeItem(deadLetterKey(orgId));
}

function isTransientError(error) {
  const status = Number(error?.status || error?.statusCode || 0);
  if (status) return status >= 500 || status === 408 || status === 429;
  const code = String(error?.code || "");
  if (/^(22|23|PGRST)/.test(code)) return false;
  return true;
}

export async function processOfflineEntries(entries, applyEntry) {
  const pending = [];
  const failed = [];
  let flushed = 0;
  for (const entry of entries) {
    try {
      await applyEntry(entry);
      flushed += 1;
    } catch (error) {
      if (isTransientError(error)) {
        pending.push(entry);
      } else {
        failed.push({ ...entry, failed_at: new Date().toISOString(), error: String(error?.message || error) });
      }
    }
  }
  return { flushed, pending, failed };
}
