import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const handler = readFileSync(new URL("../../supabase-functions/ai-web-search/src/index.ts", import.meta.url), "utf8");
const authorization = (() => {
  try {
    return readFileSync(new URL("../../supabase-functions/ai-web-search/src/authorization.ts", import.meta.url), "utf8");
  } catch {
    return "";
  }
})();

test("autoriza o usuario na organizacao antes de usar credenciais de marketplace", () => {
  assert.match(handler, /authorizeOrganizationRequest\(req, organizationId/);
  assert.match(authorization, /headers\.get\("Authorization"\)/);
  assert.match(authorization, /auth\.getUser\(token\)/);
  assert.match(authorization, /from\("organization_members"\)/);
  assert.match(authorization, /eq\("organization_id", organizationId\)/);
  assert.match(authorization, /eq\("status", "active"\)/);
});

test("usa o campo vigente de conexao do marketplace", () => {
  assert.doesNotMatch(handler, /\.eq\("status", "connected"\)/);
  assert.match(handler, /\.eq\("connection_status", "connected"\)/);
});

test("configura a funcao com verificacao de JWT", () => {
  const config = readFileSync(new URL("../../supabase/config.toml", import.meta.url), "utf8");
  assert.match(config, /\[functions\.ai-web-search\]\s+verify_jwt = true/);
});

test("expoe a funcao no diretorio canonico de deploy do Supabase", () => {
  let entry = "";
  try {
    entry = readFileSync(new URL("../../supabase/functions/ai-web-search/index.ts", import.meta.url), "utf8");
  } catch {
    entry = "";
  }
  assert.match(entry, /supabase-functions\/ai-web-search\/src\/index\.ts/);
});
