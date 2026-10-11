/**
 * Regressão do clima e do painel financeiro (porte do ÍCARO v5), com respostas gravadas das
 * APIs: nada depende da internet. Uso: pnpm --filter @workspace/scripts run validate:video-v5
 */
import assert from "node:assert/strict";
import { CLIMA, falaFinancas, financas, montarTempo } from "./lib/ao-vivo";

let total = 0;
const falhas: string[] = [];
async function check(nome: string, fn: () => unknown) {
  total += 1;
  try { await fn(); } catch (e) { falhas.push(`${nome}: ${e instanceof Error ? e.message : e}`); }
}

const FEIRA = { name: "Feira de Santana", admin1: "Bahia", country: "Brasil", latitude: -12.2664, longitude: -38.9663 };
const previsaoHoje = {
  current: { temperature_2m: 24.3, relative_humidity_2m: 67, weather_code: 0 },
  daily: { temperature_2m_max: [32.2, 30], temperature_2m_min: [21.4, 20], precipitation_probability_max: [0, 40], weather_code: [1, 61] },
};

await check("fala igual à do vídeo", () => assert.equal(montarTempo(FEIRA, previsaoHoje, "hoje").fala,
  "Agora em Feira de Santana faz 24 graus, céu limpo. Hoje a máxima é de 32 e a mínima de 21 graus, sem previsão de chuva."));
await check("cartão do clima: 24 °C, máx 32, mín 21, umidade 67, chuva 0", () => {
  const t = montarTempo(FEIRA, previsaoHoje, "hoje");
  assert.deepEqual([t.atual, t.max, t.min, t.umidade, t.chuva, t.desc], [24, 32, 21, 67, 0, "céu limpo"]);
});
await check("amanhã com chance de chuva", () => assert.equal(montarTempo(FEIRA, previsaoHoje, "amanha").fala,
  "Amanhã em Feira de Santana: chuva fraca, máxima de 30 e mínima de 20 graus, com 40 por cento de chance de chuva."));
await check("sem dado de chuva não inventa", () => {
  const sem = { ...previsaoHoje, daily: { ...previsaoHoje.daily, precipitation_probability_max: [null, null] } };
  assert.ok(montarTempo(FEIRA, sem, "hoje").fala.endsWith("21 graus."));
});
await check("código desconhecido vira 'tempo variável'", () => assert.equal(montarTempo(FEIRA, { daily: { ...previsaoHoje.daily, weather_code: [77] }, current: {} }, "hoje").desc, "tempo variável"));
await check("tabela WMO cobre céu limpo e trovoada", () => { assert.equal(CLIMA[0], "céu limpo"); assert.equal(CLIMA[95], "trovoada"); });

// Painel financeiro com APIs simuladas
const respostas: Record<string, unknown> = {
  "economia.awesomeapi.com.br/json/last/": {
    USDBRL: { bid: "4.9912", pctChange: "-0.52" }, EURBRL: { bid: "5.5843", pctChange: "-0.79" },
    UYUBRL: { bid: "0.1212", pctChange: "-0.16" }, ARSBRL: { bid: "0.0031", pctChange: "-0.52" }, BTCBRL: { bid: "415230", pctChange: "0.62" },
  },
  "economia.awesomeapi.com.br/json/daily/": [{ bid: "4.99", timestamp: "1791600000" }, { bid: "5.01", timestamp: "1791513600" }, { bid: "5.05", timestamp: "1791427200" }],
  "bcdata.sgs.432": [{ data: "08/10/2026", valor: "14.25" }],
  "bcdata.sgs.13522": [{ data: "01/09/2026", valor: "4.62" }],
  "bcdata.sgs.4389": [{ data: "08/10/2026", valor: "14.15" }],
};
let chamadas = 0;
const fetchFalso = (async (url: string) => {
  chamadas += 1;
  const chave = Object.keys(respostas).find((k) => String(url).includes(k));
  if (!chave) return new Response("{}", { status: 500 });
  return new Response(JSON.stringify(respostas[chave]), { status: 200, headers: { "Content-Type": "application/json" } });
}) as typeof fetch;

const fin = await financas(fetchFalso);
await check("5 moedas na ordem do v5", () => assert.deepEqual(fin.moedas.map((m) => m.codigo), ["USD", "EUR", "UYU", "ARS", "BTC"]));
await check("dólar e variação lidos", () => { assert.equal(fin.moedas[0].valor, 4.9912); assert.equal(fin.moedas[0].variacao, -0.52); });
await check("Selic, IPCA 12 meses e CDI do Banco Central", () => { assert.equal(fin.indices.selic?.valor, 14.25); assert.equal(fin.indices.ipca12?.valor, 4.62); assert.equal(fin.indices.cdi?.valor, 14.15); });
await check("série do dólar em ordem cronológica", () => assert.deepEqual(fin.serieDolar.map((p) => p.v), [5.05, 5.01, 4.99]));
await check("sem falhas quando todas as fontes respondem", () => assert.deepEqual(fin.falhas, []));
await check("fala do painel", () => assert.match(falaFinancas(fin), /^O dólar está a 4,99 reais, o euro a 5,58, a Selic está em 14,25 por cento ao ano/));
await check("cache de 5 minutos: segunda consulta não chama as APIs", async () => { const antes = chamadas; await financas(fetchFalso); assert.equal(chamadas, antes); });
await check("sem cotações, a fala avisa em vez de inventar", () => assert.equal(falaFinancas({ moedas: [], indices: {}, serieDolar: [], atualizado: "", falhas: ["x"] }), "Não consegui consultar as cotações agora."));

for (const f of falhas) console.log("✗", f);
console.log(`${total - falhas.length}/${total} validações do clima e do painel (servidor)`);
process.exit(falhas.length ? 1 : 0);
