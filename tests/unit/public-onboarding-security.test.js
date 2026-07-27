import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const config = readFileSync(new URL("../../supabase/config.toml", import.meta.url), "utf8");
const onboarding = config.match(/\[functions\.public-onboarding\][\s\S]*?(?=\n\[|$)/)?.[0] || "";
const privateFunction = config.match(/\[functions\.user-access\][\s\S]*?(?=\n\[|$)/)?.[0] || "";

test("public-onboarding aceita visitantes anonimos", () => {
  assert.match(onboarding, /verify_jwt\s*=\s*false/);
});

test("funcoes privadas continuam protegidas", () => {
  assert.match(privateFunction, /verify_jwt\s*=\s*true/);
});
