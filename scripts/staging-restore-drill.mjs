const required = ["FLOWOPS_STAGING_URL", "FLOWOPS_STAGING_ANON_KEY", "FLOWOPS_STAGING_ADMIN_EMAIL", "FLOWOPS_STAGING_ADMIN_PASSWORD"];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) throw new Error(`Variaveis ausentes: ${missing.join(", ")}`);
const base = process.env.FLOWOPS_STAGING_URL.replace(/\/$/, "");
const anon = process.env.FLOWOPS_STAGING_ANON_KEY;
const authResponse = await fetch(`${base}/auth/v1/token?grant_type=password`, {
  method: "POST", headers: { apikey: anon, "Content-Type": "application/json" },
  body: JSON.stringify({ email: process.env.FLOWOPS_STAGING_ADMIN_EMAIL, password: process.env.FLOWOPS_STAGING_ADMIN_PASSWORD }),
});
const auth = await authResponse.json();
if (!authResponse.ok || !auth.access_token) throw new Error(`Login staging falhou: ${auth.error_description || auth.msg || authResponse.status}`);
async function maintenance(body) {
  const response = await fetch(`${base}/functions/v1/system-maintenance`, {
    method: "POST", headers: { apikey: anon, Authorization: `Bearer ${auth.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error || `system-maintenance retornou ${response.status}`);
  return data;
}
const exported = await maintenance({ action: "export", scope: "database" });
const simulation = await maintenance({ action: "simulate-restore", snapshot: exported.snapshot });
if (!simulation.can_restore) throw new Error(`Snapshot nao restauravel: ${JSON.stringify(simulation.totals || simulation)}`);
const requiredTables = ["organizations", "organization_members", "orders", "cash_entries", "materials", "marketplace_accounts"];
const snapshotTables = Object.keys(exported.snapshot?.tables || exported.snapshot || {});
const missingTables = requiredTables.filter((table) => !snapshotTables.includes(table));
if (missingTables.length) throw new Error(`Snapshot incompleto; tabelas ausentes: ${missingTables.join(", ")}`);
if (exported.snapshot?.unavailable_tables?.length) {
  console.warn(`Tabelas opcionais indisponíveis no staging: ${exported.snapshot.unavailable_tables.join(", ")}`);
}
const encoded = new TextEncoder().encode(JSON.stringify(exported.snapshot));
const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", encoded))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
console.log(`Simulacao valida: ${simulation.totals?.rows || 0} registros, ${snapshotTables.length} tabelas, SHA-256 ${digest.slice(0, 16)}...`);
if (process.env.FLOWOPS_ALLOW_STAGING_RESTORE === "true") {
  const restored = await maintenance({ action: "restore", snapshot: exported.snapshot });
  console.log(`Restore concluido: ${restored.restored_rows} registros em ${restored.restored_tables} tabelas.`);
}
