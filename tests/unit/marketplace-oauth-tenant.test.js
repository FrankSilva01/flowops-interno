import assert from "node:assert/strict";
import test from "node:test";

const oauth = await import("../../supabase/functions/_shared/marketplace-oauth-tenant.mjs").catch(() => ({}));
const branding = await import("../../js/core/app-message-brand.js").catch(() => ({}));

test("impede que a mesma conta externa seja vinculada silenciosamente a outra empresa", () => {
  assert.equal(typeof oauth.marketplaceAccountLinkStatus, "function");
  assert.equal(oauth.marketplaceAccountLinkStatus("org-3daft", "org-distrito"), "already_linked");
  assert.equal(oauth.marketplaceAccountLinkStatus("org-distrito", "org-distrito"), "reconnected");
  assert.equal(oauth.marketplaceAccountLinkStatus(null, "org-distrito"), "connected");
});

test("modal usa o nome da empresa ativa sem marca legada", () => {
  assert.equal(typeof branding.appMessageBrand, "function");
  assert.equal(branding.appMessageBrand("Distrito Geek"), "Distrito Geek");
  assert.equal(branding.appMessageBrand(""), "FlowOps");
});
