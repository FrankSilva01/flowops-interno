// Arredonda valores monetarios a 2 casas via centavos inteiros, evitando o erro
// de ponto flutuante binario (ex.: 0.1 + 0.2 = 0.30000000000000004). Modulo
// PURO (sem dependencias), para poder ser usado tambem em modulos testados
// isoladamente como pricing-math.js.
export function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}
