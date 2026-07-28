import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const landingErrors = await import("../../landing/error-message.js").catch(() => ({}));
const backendErrors = await import("../../supabase/functions/_shared/public-error.js").catch(() => ({}));
const onboarding = readFileSync(new URL("../../supabase/functions/public-onboarding/index.ts", import.meta.url), "utf8");

for (const [name, formatter] of [
  ["landing", landingErrors.publicErrorMessage],
  ["backend", backendErrors.publicErrorMessage],
]) {
  test(`${name} apresenta mensagem de objetos de erro`, () => {
    assert.equal(typeof formatter, "function");
    assert.equal(formatter({ message: "Falha ao criar usuário" }, "Falha inesperada"), "Falha ao criar usuário");
    assert.equal(formatter({ error_description: "Senha recusada" }, "Falha inesperada"), "Senha recusada");
    assert.equal(formatter({}, "Falha inesperada"), "Falha inesperada");
    assert.notEqual(formatter({}, "Falha inesperada"), "[object Object]");
  });
}

test("onboarding usa gravacoes idempotentes no provisionamento", () => {
  const provisioning = onboarding.slice(
    onboarding.indexOf('admin.from("organization_members")', onboarding.indexOf("let createdUserId")),
    onboarding.indexOf("const rowError", onboarding.indexOf("let createdUserId")),
  );
  assert.match(provisioning, /organization_members"\)\.upsert\(/);
  assert.match(provisioning, /approved_users"\)\.upsert\(/);
  assert.match(provisioning, /organization_subscriptions"\)\.upsert\(/);
});

test("rollback remove dependencias antes da organizacao", () => {
  assert.match(onboarding, /async function rollbackOrganization/);
  const rollback = onboarding.slice(onboarding.indexOf("async function rollbackOrganization"));
  const childDelete = rollback.indexOf('from("organization_members").delete()');
  const organizationDelete = rollback.indexOf('from("organizations").delete()');
  assert.ok(childDelete >= 0);
  assert.ok(organizationDelete > childDelete);
});
