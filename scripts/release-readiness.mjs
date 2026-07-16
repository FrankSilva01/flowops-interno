import { access, readFile } from "node:fs/promises";

const requiredFiles = [
  "supabase/migrations/20260715233000_saas_governance_and_resilience.sql",
  ".github/workflows/production-health.yml",
  ".github/workflows/authenticated-quality.yml",
  ".github/workflows/rls-isolation.yml",
  "scripts/staging-restore-drill.mjs",
];
for (const file of requiredFiles) await access(file);

const shopeeExport = await readFile("js/features/shopee-template-export.js", "utf8");
for (const requirement of ["weight", "length", "width", "height", "Sem marca"]) {
  if (!shopeeExport.includes(requirement)) throw new Error(`Exportação Shopee perdeu o requisito '${requirement}'.`);
}
const migration = await readFile(requiredFiles[0], "utf8");
for (const requirement of ["force row level security", "integration_jobs", "dead_letter"]) {
  if (!migration.toLowerCase().includes(requirement)) throw new Error(`Migration de governança não contém '${requirement}'.`);
}
console.log(`Gate de prontidão aprovado: ${requiredFiles.length} artefatos e requisitos críticos presentes.`);
