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
  console.warn("SUPABASE_SERVICE_ROLE_KEY ausente; checagens privadas foram ignoradas.");
  process.exit(0);
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
console.log(`Saude operacional valida. Backup mais recente ha ${Math.round(ageHours)} hora(s).`);
