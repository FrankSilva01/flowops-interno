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
