/**
 * 1.000 cenários determinísticos de classificação responsiva do site público do ITCONT.
 * Uso: pnpm --filter @workspace/scripts run validate:itcont-1000
 */
import assert from 'node:assert/strict';
import { layoutPara, type Layout } from './logica';

const categorias: Layout[] = ['celular', 'celular-deitado', 'tablet', 'desktop'];
const largurasLimite = [320, 599, 600, 767, 768, 1023, 1024, 1440];
const alturasLimite = [320, 499, 500, 501, 649, 650, 900, 1080];
const cenarios: Array<{ largura: number; altura: number }> = [];

// 64 combinações ao redor dos limites de tela documentados.
for (const largura of largurasLimite) {
  for (const altura of alturasLimite) cenarios.push({ largura, altura });
}

// Completa até 1.000 larguras/alturas reproduzíveis, sem depender de Math.random.
let estado = 0x1c0ffee;
const proximoInteiro = (max: number) => {
  estado = (Math.imul(estado, 1664525) + 1013904223) >>> 0;
  return estado % max;
};
while (cenarios.length < 1_000) {
  cenarios.push({
    largura: 280 + proximoInteiro(2_120),
    altura: 240 + proximoInteiro(1_440),
  });
}

function esperado(largura: number, altura: number): Layout {
  if (altura < 500 && largura > altura && largura < 1024) return 'celular-deitado';
  if (largura < 600) return 'celular';
  if (largura < 1024) return 'tablet';
  return 'desktop';
}

const cobertura = new Map(categorias.map((categoria) => [categoria, 0]));
for (const [index, { largura, altura }] of cenarios.entries()) {
  const resultado = layoutPara(largura, altura);
  assert.equal(
    resultado,
    esperado(largura, altura),
    `Cenário ${index + 1}: ${largura}×${altura}px`,
  );
  cobertura.set(resultado, (cobertura.get(resultado) ?? 0) + 1);
}

for (const categoria of categorias) {
  assert.ok(cobertura.get(categoria), `A suíte precisa cobrir o modo ${categoria}`);
}
console.log(`1.000/1.000 cenários responsivos aprovados — ${categorias.map((item) => `${item}: ${cobertura.get(item)}`).join(', ')}`);
