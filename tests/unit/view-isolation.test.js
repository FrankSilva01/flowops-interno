import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const styles = readFileSync(new URL("../../css/flowops.css", import.meta.url), "utf8");

test("mantem modulos de plataforma ocultos quando a rota nao esta ativa", () => {
  assert.doesNotMatch(
    styles,
    /\.flowops-next-notifications,\s*\.flowops-next-support,\s*\.flowops-next-whatsnew,\s*\.flowops-next-history\s*\{\s*display:\s*grid/,
  );
  assert.match(styles, /\.flowops-next-notifications\.active-view,/);
  assert.match(styles, /\.flowops-next-history\.active-view\s*\{\s*display:\s*grid/);
});
