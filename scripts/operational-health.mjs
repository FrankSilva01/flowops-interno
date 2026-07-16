import { mkdir, writeFile } from "node:fs/promises";

const appUrl = (process.env.FLOWOPS_APP_URL || "https://rainbow-lokum-1fad14.netlify.app").replace(/\/$/, "");
const supabaseUrl = (process.env.FLOWOPS_SUPABASE_URL || "https://djvrhvzjvnyensbobtby.supabase.co").replace(/\/$/, "");
const reportPath = process.env.FLOWOPS_HEALTH_REPORT || "output/operational-health.json";
const report = { checkedAt: new Date().toISOString(), appUrl, supabaseUrl, status: "healthy", checks: [] };

async function check(name, action, remediation) {
  const startedAt = Date.now();
  try {
    const detail = await action();
    report.checks.push({ name, status: "pass", durationMs: Date.now() - startedAt, detail });
  } catch (error) {
    report.status = "unhealthy";
    report.checks.push({ name, status: "fail", durationMs: Date.now() - startedAt, error: error.message, remediation });
  }
}

async function persistReport() {
  await mkdir(reportPath.replace(/[\\/][^\\/]+$/, "") || ".", { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}

for (const [path, marker] of [["/", "FlowOps"], ["/termos.html", "Termos de Uso"], ["/privacidade.html", "Política de Privacidade"]]) {
  await check(`app:${path}`, async () => {
    const response = await fetch(`${appUrl}${path}`);
    const body = await response.text();
    if (!response.ok || !body.includes(marker)) throw new Error(`HTTP ${response.status}; marcador '${marker}' ausente`);
    return `HTTP ${response.status}`;
  }, "Validar o deploy Netlify, redirects e conteúdo publicado.");
}

for (const name of ["marketplace-sync", "get-real-shipping-cost", "nfe-sync", "system-maintenance", "mercadopago-subscriptions", "public-onboarding"]) {
  await check(`function:${name}`, async () => {
    const response = await fetch(`${supabaseUrl}/functions/v1/${name}`, { method: "OPTIONS" });
    if (response.status >= 500) throw new Error(`HTTP ${response.status}`);
    return `HTTP ${response.status}`;
  }, `Verificar deploy e logs da Edge Function ${name}.`);
}

const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceKey) {
  report.status = process.env.FLOWOPS_ALLOW_PUBLIC_HEALTH === "true" ? report.status : "unhealthy";
  report.checks.push({
    name: "private:credentials",
    status: process.env.FLOWOPS_ALLOW_PUBLIC_HEALTH === "true" ? "skip" : "fail",
    error: "SUPABASE_SERVICE_ROLE_KEY ausente",
    remediation: "Cadastrar o secret SUPABASE_SERVICE_ROLE_KEY no repositório GitHub e executar novamente o workflow.",
  });
} else {
  async function rest(path) {
    const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
    const text = await response.text();
    let data;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!response.ok) throw new Error(`${response.status}: ${data?.message || data?.hint || text}`);
    return data;
  }

  await check("database:required-tables", async () => {
    for (const table of ["backup_runs", "marketplace_accounts", "marketplace_sync_log", "integration_jobs", "fiscal_documents"]) {
      await rest(`${table}?select=*&limit=0`);
    }
    return "5 tabelas operacionais disponíveis";
  }, "Aplicar todas as migrations, incluindo 20260715233000_saas_governance_and_resilience.sql.");

  await check("backup:freshness", async () => {
    const [latest] = await rest("backup_runs?select=status,started_at,finished_at,error_message&order=started_at.desc&limit=1");
    if (!latest) throw new Error("Nenhuma execução encontrada");
    if (latest.status !== "success") throw new Error(`Último backup em '${latest.status}': ${latest.error_message || "sem detalhe"}`);
    const ageHours = (Date.now() - new Date(latest.finished_at || latest.started_at).getTime()) / 3_600_000;
    if (ageHours > 192) throw new Error(`Último backup há ${Math.round(ageHours)} horas`);
    return `Último backup há ${Math.round(ageHours)}h`;
  }, "Executar system-maintenance?action=backup e revisar a tabela backup_runs.");

  await check("marketplace:connections", async () => {
    const accounts = await rest("marketplace_accounts?select=marketplace,connection_status,token_expires_at,updated_at");
    const active = accounts.filter((item) => ["connected", "active"].includes(item.connection_status));
    const expiring = active.filter((item) => item.token_expires_at && new Date(item.token_expires_at).getTime() < Date.now() + 30 * 60_000);
    if (expiring.length) throw new Error(`${expiring.length} integração(ões) expiram em menos de 30 minutos`);
    return `${active.length} integração(ões) ativa(s)`;
  }, "Renovar os tokens na tela Marketplace > Integrações.");

  await check("marketplace:error-rate", async () => {
    const since = encodeURIComponent(new Date(Date.now() - 60 * 60_000).toISOString());
    const errors = await rest(`marketplace_sync_log?select=marketplace,kind,message,created_at&status=eq.error&created_at=gte.${since}&limit=20`);
    if (errors.length >= 5) throw new Error(`${errors.length} erros na última hora`);
    return `${errors.length} erro(s) na última hora`;
  }, "Revisar Marketplace > Logs e os logs da função marketplace-sync.");

  await check("jobs:dead-letter", async () => {
    const jobs = await rest("integration_jobs?select=id,marketplace,job_type,last_error,created_at&status=eq.dead_letter&limit=20");
    if (jobs.length) throw new Error(`${jobs.length} job(s) aguardam intervenção`);
    return "Fila sem dead letters";
  }, "Reprocessar ou cancelar os jobs na Central de governança após corrigir a causa.");
}

await persistReport();
for (const item of report.checks) console.log(`${item.status === "pass" ? "✓" : item.status === "skip" ? "-" : "✗"} ${item.name}: ${item.detail || item.error}`);
if (report.status !== "healthy") {
  const failures = report.checks.filter((item) => item.status === "fail");
  throw new Error(`${failures.length} verificação(ões) falharam. Consulte ${reportPath}.`);
}
console.log(`Saúde operacional válida. Relatório: ${reportPath}`);
