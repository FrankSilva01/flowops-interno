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
console.log(`Simulacao valida: ${simulation.totals?.rows || 0} registros.`);
if (process.env.FLOWOPS_ALLOW_STAGING_RESTORE === "true") {
  const restored = await maintenance({ action: "restore", snapshot: exported.snapshot });
  console.log(`Restore concluido: ${restored.restored_rows} registros em ${restored.restored_tables} tabelas.`);
}
