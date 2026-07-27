import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = (() => {
  try {
    return readFileSync(new URL("../../supabase/migrations/20260727090000_secure_system_maintenance_cron.sql", import.meta.url), "utf8");
  } catch {
    return "";
  }
})();

test("cron autentica system-maintenance com segredo guardado no Vault", () => {
  assert.match(migration, /vault\.decrypted_secrets/);
  assert.match(migration, /name = 'flowops_system_maintenance_token'/);
  assert.match(migration, /'Authorization'/);
  assert.match(migration, /'Bearer ' \|\|/);
  assert.match(migration, /cron\.unschedule\('3daft-daily-maintenance'\)/);
  assert.match(migration, /cron\.schedule\(/);
});

test("migration nao contem uma credencial literal", () => {
  assert.doesNotMatch(migration, /eyJ[A-Za-z0-9_-]{20,}/);
  assert.doesNotMatch(migration, /sb_secret_[A-Za-z0-9_-]+/);
  assert.doesNotMatch(migration, /service_role\s*[:=]\s*['"][^'"]+/i);
});
