import test from "node:test";
import assert from "node:assert/strict";
import { createZip } from "../../supabase/functions/_shared/zip.mjs";

test("gera pacote ZIP armazenado com nomes e conteudos validos", () => {
  const zip = createZip([
    { name: "pedido-1/etiqueta.pdf", bytes: new TextEncoder().encode("PDF TESTE") },
    { name: "pedido-2/declaracao.xml", bytes: new TextEncoder().encode("<dce>ok</dce>") },
  ]);
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  assert.equal(view.getUint32(0, true), 0x04034b50);
  assert.equal(view.getUint32(zip.length - 22, true), 0x06054b50);
  assert.equal(view.getUint16(zip.length - 12, true), 2);
  const text = new TextDecoder().decode(zip);
  assert.match(text, /pedido-1\/etiqueta\.pdf/);
  assert.match(text, /PDF TESTE/);
  assert.match(text, /pedido-2\/declaracao\.xml/);
  assert.match(text, /<dce>ok<\/dce>/);
});
