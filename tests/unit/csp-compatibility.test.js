import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

async function filesUnder(directory, extensions) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(target, extensions));
    else if (extensions.includes(path.extname(entry.name))) files.push(target);
  }
  return files;
}

test("active UI contains no inline event handlers blocked by CSP", async () => {
  const files = [
    ...await filesUnder("js", [".js"]),
    ...((await readdir(".")).filter((file) => file.endsWith(".html"))),
  ];
  const violations = [];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    if (/\son(?:click|change|input|submit|load|error)\s*=/i.test(source)) violations.push(file);
  }
  assert.deepEqual(violations, []);
});

test("public tracking page uses a same-origin external script", async () => {
  const source = await readFile("tracking.html", "utf8");
  assert.match(source, /<script src="\/js\/tracking\.js" defer><\/script>/);
  const inlineScripts = [...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1].trim())
    .filter(Boolean);
  assert.deepEqual(inlineScripts, []);
});

test("active modules avoid native blocking dialogs", async () => {
  const files = (await filesUnder("js", [".js"]))
    .filter((file) => path.normalize(file) !== path.normalize("js/core/dom.js"));
  const violations = [];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    if (/\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/.test(source)) violations.push(file);
  }
  assert.deepEqual(violations, []);
});

test("accessible confirmations receive a title and message", async () => {
  const files = await filesUnder("js", [".js"]);
  const violations = [];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    if (/showAppConfirm\(\s*[^,]+,\s*\{/.test(source)) violations.push(file);
  }
  assert.deepEqual(violations, []);
});

test("application messages do not pass a tone as the message body", async () => {
  const files = await filesUnder("js", [".js"]);
  const violations = [];
  const invalidCall = /showAppMessage\(\s*(?:"[^"]*"|'[^']*'|`[^`]*`)\s*,\s*["'](?:info|success|warning|error)["']\s*\)/s;
  for (const file of files) {
    const source = await readFile(file, "utf8");
    if (invalidCall.test(source)) violations.push(file);
  }
  assert.deepEqual(violations, []);
});

test("service worker never stores authenticated API responses", async () => {
  const source = await readFile("sw.js", "utf8");
  const apiBranch = source.slice(source.indexOf("if (url.pathname.includes(\"/api\")"), source.indexOf("request.mode === \"navigate\""));
  assert.doesNotMatch(apiBranch, /cache\.put|caches\.match/);
  assert.match(apiBranch, /Cache-Control.*no-store/);
});

test("realtime subscriptions are tenant-scoped and debounced", async () => {
  const source = await readFile("js/data/remote.js", "utf8");
  assert.match(source, /filter:\s*`organization_id=eq\.\$\{state\.organizationId\}`/);
  assert.doesNotMatch(source, /\.on\([^\n]+,\s*refreshRemote\)/);
  assert.match(source, /setTimeout\(\(\) => refreshRemote\(\)/);
  assert.match(source, /ownOrganizationChanges\("calendar_events"\)/);
});

test("local user preferences recover from malformed JSON", async () => {
  for (const file of ["js/features/calendar-persistence.js", "js/features/push-notifications.js", "js/features/accounting-integration.js"]) {
    const source = await readFile(file, "utf8");
    assert.match(source, /JSON\.parse/);
    assert.match(source, /catch\s*\{/);
  }
});

test("calendar cache is scoped by organization and cleared at logout", async () => {
  const persistence = await readFile("js/features/calendar-persistence.js", "utf8");
  const session = await readFile("js/core/session.js", "utf8");
  assert.match(persistence, /\$\{LEGACY_STORAGE_KEY\}:\$\{state\.organizationId\}/);
  assert.match(session, /startsWith\("calendarCustomEvents:"\)/);
});

test("critical client mutations keep an explicit organization scope", async () => {
  const expectations = new Map([
    ["js/data/remote.js", [/delete\(\)\.eq\("id", id\)\.eq\("organization_id", state\.organizationId\)/]],
    ["js/core/router.js", [/from\("inventory_items"\)\.delete\(\).*eq\("organization_id", state\.organizationId\)/]],
    ["js/features/customers.js", [/from\("lead_files"\)\.delete\(\).*eq\("organization_id", state\.organizationId\)/]],
    ["js/features/orders.js", [/from\("custom_tags"\)\.delete\(\).*eq\("organization_id", state\.organizationId\)/]],
    ["js/features/pricing.js", [/from\("products"\)\.delete\(\).*eq\("organization_id", state\.organizationId\)/]],
    ["js/features/notifications.js", [/from\("notifications"\)\.update\([^\n]+\.eq\("organization_id", state\.organizationId\)/]],
  ]);
  for (const [file, patterns] of expectations) {
    const source = await readFile(file, "utf8");
    patterns.forEach((pattern) => assert.match(source, pattern, file));
  }
});

test("MFA uses native accessible dialogs and numeric one-time codes", async () => {
  const source = await readFile("js/features/pwa-onboarding.js", "utf8");
  assert.equal((source.match(/createElement\("dialog"\)/g) || []).length >= 2, true);
  assert.match(source, /aria-labelledby", "mfa-enroll-title"/);
  assert.doesNotMatch(source, /min-width:\s*400px/);
  assert.match(source, /width:\s*min\(420px, calc\(100vw - 32px\)\)/);
  assert.match(source, /autocomplete="one-time-code"/);
  assert.match(source, /\/\^\\d\{6\}\$\//);
});

test("marketplace export is bound only by the central router", async () => {
  const appSource = await readFile("js/app.js", "utf8");
  assert.doesNotMatch(appSource, /exportListingsBtn/);
});
