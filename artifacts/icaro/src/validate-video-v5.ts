/**
 * Regressão do palco do vídeo (porte do ÍCARO v5): comandos de painel, clima e planeta,
 * formatação do painel financeiro e títulos do globo, sem quebrar os comandos que já existiam.
 * Uso: pnpm --filter @workspace/scripts run validate:video-v5
 */
import assert from "node:assert/strict";
import { interpret, type CommandResult } from "./lib/commands";
import { fmt, iconeClima, reais, tendencia } from "./lib/ao-vivo";
import { subtituloLugar, zoomPara } from "./lib/globo";
import { cidadeUrl, parseCidade } from "./lib/geo-fly";

let total = 0;
const falhas: string[] = [];
function check(nome: string, fn: () => void) {
  total += 1;
  try { fn(); } catch (e) { falhas.push(`${nome}: ${e instanceof Error ? e.message : e}`); }
}
const kind = (q: string) => interpret(q).kind;
const como = <K extends CommandResult["kind"]>(q: string, k: K) => {
  const r = interpret(q);
  assert.equal(r.kind, k, `"${q}" virou ${r.kind}`);
  return r as Extract<CommandResult, { kind: K }>;
};

// Painel financeiro (frases do LEIA-ME do v5)
for (const q of ["Olá, Ícaro, mostre o painel financeiro", "Ícaro, abra o painel de cotações", "quanto está o dólar?", "qual a cotação do euro", "mostre o câmbio"])
  check(`abre o painel: ${q}`, () => assert.equal(como(q, "painel").abrir, true));
for (const q of ["Ícaro, feche o painel", "esconda o painel financeiro"])
  check(`fecha o painel: ${q}`, () => assert.equal(como(q, "painel").abrir, false));

// Clima
check("temperatura sem cidade = Feira de Santana (hoje)", () => { const r = como("Olá, Ícaro, qual a temperatura?", "tempo"); assert.equal(r.dia, "hoje"); assert.equal(r.cidade, null); });
check("previsão de amanhã em outra cidade", () => { const r = como("como está o tempo amanhã em salvador", "tempo"); assert.equal(r.dia, "amanha"); assert.equal(r.cidade, "Salvador"); });
check("vai chover hoje", () => assert.equal(como("vai chover hoje?", "tempo").dia, "hoje"));
check("clima em Montevidéu", () => assert.equal(como("qual o clima em montevideu", "tempo").cidade, "Montevideu"));
check("'clima organizacional' é pergunta de gestão, não previsão", () => assert.equal(kind("o que é clima organizacional?"), "ai"));

// Planeta
const acoes: Array<[string, string]> = [["aproxime", "mais"], ["afaste", "menos"], ["volte para o planeta", "planeta"], ["Olá, Ícaro, onde estamos?", "onde"], ["gire o planeta", "girar"], ["mostre o planeta inteiro", "planeta"]];
for (const [q, a] of acoes) check(`planeta: ${q}`, () => assert.equal(como(q, "globo").acao, a));

// Regressão: comandos que já existiam continuam iguais
check("'mostre Feira de Santana' continua voando", () => { const r = interpret("Ícaro, mostre Feira de Santana"); assert.ok(r.kind === "flyTo" || r.kind === "flyFeira", r.kind); });
check("'onde fica Montevidéu' continua voando", () => assert.equal(como("onde fica Montevidéu", "flyTo").query.toLowerCase(), "montevideu"));
check("'mostre a galáxia' continua trocando de cena", () => assert.equal(como("mostre a galáxia", "scene").scene, "galaxy"));
check("'que horas são' continua local", () => assert.equal(kind("que horas são"), "say"));
check("'calcule 30% de 200' = 60", () => assert.match(como("calcule 30% de 200", "say").text, /60/));
check("'quanto é 2 mais 2' = 4", () => assert.match(como("quanto é 2 mais 2", "say").text, /\b4\b/));
check("'calcule o custo de um funcionário' vai ao servidor (não à calculadora)", () => assert.equal(kind("Ícaro, calcule o custo de um funcionário de 2.500"), "ai"));
check("'temporizador de 5 minutos' continua", () => assert.equal(como("temporizador de 5 minutos", "timer").seconds, 300));
check("'mostre o Discipulus' continua abrindo o tour", () => assert.equal(como("mostre o discipulus", "openTour").tour, "discipulus"));
check("pergunta de contabilidade continua indo para a IA", () => assert.equal(kind("o que é DRE?"), "ai"));
check("'painel' de outra coisa não abre cotações", () => assert.notEqual(kind("o que é um painel de controle de custos?"), "painel"));

// Painel: formatação igual à do v5
check("dólar R$ 4,99", () => assert.equal(reais(4.99), "R$ 4,99"));
check("peso uruguaio com 3 casas", () => assert.equal(reais(0.121), "R$ 0,121"));
check("bitcoin em mil", () => assert.equal(reais(415_000), "R$ 415 mil"));
check("queda em vermelho", () => assert.deepEqual(tendencia(-0.52), { classe: "desce", texto: "▼ 0,52%" }));
check("alta em verde", () => assert.equal(tendencia(0.79).classe, "sobe"));
check("estável", () => assert.equal(tendencia(0).texto, "■ 0,00%"));
check("sem dado mostra traço", () => assert.equal(reais(null), "–"));
check("R$ 1 = 8,25 UYU", () => assert.equal(fmt(1 / 0.1212, 2), "8,25"));
check("ícone de céu limpo", () => assert.equal(iconeClima(0), "☀"));
check("ícone de chuva", () => assert.equal(iconeClima(63), "🌧"));

// Globo: título como no vídeo
check("FEIRA DE SANTANA / Bahia · Brasil", () => assert.equal(subtituloLugar({ nome: "Feira de Santana", regiao: "Bahia", pais: "Brasil", lat: -12.27, lon: -38.97 }), "Bahia · Brasil"));
check("MONTEVIDÉU / Uruguai (não repete o departamento)", () => assert.equal(subtituloLugar({ nome: "Montevidéu", regiao: "Departamento de Montevidéu", pais: "Uruguai", lat: -34.9, lon: -56.2 }), "Uruguai"));
check("cidade aparece inteira, endereço chega mais perto", () => { assert.equal(zoomPara({ nome: "x", lat: 0, lon: 0, tipo: "cidade" }), 11); assert.equal(zoomPara({ nome: "x", lat: 0, lon: 0, tipo: "local" }), 15); });

// Bug achado no QA: "onde fica Montevidéu" caía num vilarejo da Bahia (Photon)
check("Montevidéu vai pelo geocoder de cidades", () => assert.match(cidadeUrl("montevideu") ?? "", /open-meteo.*montevideu/));
check("endereço continua no Photon", () => { assert.equal(cidadeUrl("Rua Direita, 100"), null); assert.equal(cidadeUrl("Feira de Santana, Bahia, Brasil"), null); });
check("capital uruguaia vira MONTEVIDÉU / Uruguai", () => {
  const g = parseCidade({ results: [{ name: "Montevidéu", admin1: "Department de Montevidéu", country: "Uruguai", latitude: -34.9, longitude: -56.19 }] });
  assert.ok(g); assert.equal(g.city, "Montevidéu"); assert.equal(g.country, "Uruguai");
  assert.equal(subtituloLugar({ nome: g.city!, regiao: g.state, pais: g.country, lat: g.latitude, lon: g.longitude }), "Uruguai");
});
check("sem resultado devolve null (cai no Photon)", () => assert.equal(parseCidade({}), null));

for (const f of falhas) console.log("✗", f);
console.log(`${total - falhas.length}/${total} validações do palco do vídeo (web)`);
process.exit(falhas.length ? 1 : 0);
