const appUrl = (process.env.FLOWOPS_APP_URL || "https://rainbow-lokum-1fad14.netlify.app").replace(/\/$/, "");
const supabaseUrl = (process.env.FLOWOPS_SUPABASE_URL || "https://djvrhvzjvnyensbobtby.supabase.co").replace(/\/$/, "");
for (const [path, marker] of [["/", "FlowOps"], ["/termos.html", "Termos de Uso"], ["/privacidade.html", "Política de Privacidade"]]) {
  const response = await fetch(`${appUrl}${path}`);
  const body = await response.text();
  if (!response.ok || !body.includes(marker)) throw new Error(`${path} indisponivel ou sem marcador esperado.`);
}
for (const name of ["marketplace-sync", "get-real-shipping-cost", "nfe-sync", "system-maintenance", "mercadopago-subscriptions", "public-onboarding"]) {
  const response = await fetch(`${supabaseUrl}/functions/v1/${name}`, { method: "OPTIONS" });
  if (response.status >= 500) throw new Error(`${name} respondeu ${response.status}.`);
}
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceKey) {
  if (process.env.FLOWOPS_ALLOW_PUBLIC_HEALTH === "true") {
    console.warn("SUPABASE_SERVICE_ROLE_KEY ausente; somente checagens publicas foram executadas.");
    process.exit(0);
  }
  throw new Error("SUPABASE_SERVICE_ROLE_KEY ausente; a saude privada nao pode ser validada.");
}
async function rest(path) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || `REST ${response.status}`);
  return data;
}
const [latestBackup] = await rest("backup_runs?select=status,started_at,finished_at,error_message&order=started_at.desc&limit=1");
if (!latestBackup) throw new Error("Nenhuma execucao de backup encontrada.");
if (latestBackup.status !== "success") throw new Error(`Ultimo backup esta em ${latestBackup.status}: ${latestBackup.error_message || "sem detalhe"}`);
const ageHours = (Date.now() - new Date(latestBackup.finished_at || latestBackup.started_at).getTime()) / 3_600_000;
if (ageHours > 192) throw new Error(`Ultimo backup tem ${Math.round(ageHours)} horas.`);
const accounts = await rest("marketplace_accounts?select=marketplace,status,expires_at,last_sync_at");
const activeAccounts = accounts.filter((item) => item.status === "connected" || item.status === "active");
const expiring = activeAccounts.filter((item) => item.expires_at && new Date(item.expires_at).getTime() < Date.now() + 24 * 3_600_000);
if (expiring.length) throw new Error(`${expiring.length} integracao(oes) expiram em menos de 24 horas.`);
const since = encodeURIComponent(new Date(Date.now() - 60 * 60_000).toISOString());
const recentErrors = await rest(`marketplace_sync_log?select=marketplace,event,message,created_at&status=eq.error&created_at=gte.${since}&limit=20`);
if (recentErrors.length >= 5) throw new Error(`${recentErrors.length} erros de integracao na ultima hora.`);
console.log(`Saude operacional valida. Backup ha ${Math.round(ageHours)}h; ${activeAccounts.length} integracao(oes) ativa(s); ${recentErrors.length} erro(s) na ultima hora.`);
