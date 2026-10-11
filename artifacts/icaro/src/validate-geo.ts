/**
 * Valida "localize X no mapa" de ponta a ponta: comando de voz → nome limpo → serviços reais de geocodificação.
 *   tsx artifacts/icaro/src/validate-geo.ts            (usa a internet: Open-Meteo, Photon, Nominatim)
 *   tsx artifacts/icaro/src/validate-geo.ts --offline  (só regras locais)
 */
import { interpret } from "./lib/commands";
import { limparLugar } from "./lib/geo-fly";
import { buscarLugar, escolher, lerOpenMeteo, norm, type Candidato } from "./lib/geo-busca";
import { zoomPara } from "./lib/globo";

let ok = 0, falha = 0;
const check = (cond: unknown, msg: string) => { if (cond) { ok++; console.log("  ok  ", msg); } else { falha++; console.log("  FALHA", msg); } };
const consulta = (frase: string) => { const r = interpret(frase); return r.kind === "flyTo" ? r.query : `(${r.kind})`; };
const km = (a: { latitude: number; longitude: number }, lat: number, lon: number) => {
  const r = Math.PI / 180, dLat = (lat - a.latitude) * r, dLon = (lon - a.longitude) * r;
  return 12742 * Math.asin(Math.sqrt(Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * r) * Math.cos(lat * r) * Math.sin(dLon / 2) ** 2));
};

console.log("1. Comando de voz → nome do lugar");
check(consulta("Localize Salvador no mapa.") === "salvador", `"Localize Salvador no mapa." → "${consulta("Localize Salvador no mapa.")}"`);
check(consulta("Localize o distrito de Bom Fim de Feira no mapa. Amém.") === "bom fim de feira", `distrito + "Amém" → "${consulta("Localize o distrito de Bom Fim de Feira no mapa. Amém.")}"`);
check(consulta("Localize bom fim de feira no mapa.") === "bom fim de feira", "\"bom fim de feira\" não vira Feira de Santana");
check(interpret("Vá para Bonfim de Feira").kind === "flyTo", "\"Vá para Bonfim de Feira\" não vira Feira de Santana");
check(interpret("Voe para Feira de Santana").kind === "flyFeira", "\"Voe para Feira de Santana\" continua indo para casa");
check(consulta("Ícaro, mostre Feira de Santana no mapa") === "Feira de Santana, Bahia, Brasil", "\"mostre Feira de Santana no mapa\" = Feira");
check(consulta("onde fica Montevidéu") === "montevideu", "\"onde fica Montevidéu\" continua");
check(limparLugar("a cidade de Lisboa pra mim por favor") === "Lisboa", "limpa \"a cidade de … pra mim por favor\"");
check(zoomPara({ nome: "x", lat: 0, lon: 0, tipo: "pais" }) === 4 && zoomPara({ nome: "x", lat: 0, lon: 0, tipo: "bairro" }) === 13.5 && zoomPara({ nome: "x", lat: 0, lon: 0, tipo: "local" }) === 15, "zoom por tipo (país 4, bairro 13,5, rua 15)");

console.log("2. Escolha entre homônimos (offline)");
const om = lerOpenMeteo({ results: [
  { name: "El Salvador", latitude: 13.7, longitude: -89.2, country: "El Salvador", country_code: "SV", feature_code: "PCLI", population: 6_300_000 },
  { name: "Salvador", latitude: -12.97, longitude: -38.5, admin1: "Bahia", country: "Brasil", country_code: "BR", feature_code: "PPLA", population: 2_900_000 },
] });
const sv = escolher(om, "salvador");
check(sv?.country === "Brasil", `"salvador": a capital baiana vence o país El Salvador (escolheu ${sv?.label})`);
const elSv = escolher(om, "El Salvador");
check(elSv?.country === "El Salvador", `"El Salvador" continua indo para o país (escolheu ${elSv?.label})`);

if (process.argv.includes("--offline")) { fim(); }
else {
  console.log("3. Serviços reais (internet)");
  type Caso = [frase: string, espera: (c: Candidato) => boolean, descricao: string];
  const perto = (lat: number, lon: number, raio: number) => (c: Candidato) => km(c, lat, lon) < raio;
  const casos: Caso[] = [
    ["Localize Salvador no mapa.", perto(-12.97, -38.50, 40), "Salvador (BA), não El Salvador"],
    ["Localize o distrito de Bom Fim de Feira no mapa. Amém.", perto(-12.27, -38.97, 45), "Bonfim de Feira, perto de Feira"],
    ["onde fica Tóquio", (c) => norm(c.country ?? "").includes("jap"), "Tóquio, Japão"],
    ["mostre Paris no mapa", (c) => norm(c.country ?? "").includes("fran"), "Paris, França (não Texas)"],
    ["onde fica Montevidéu", (c) => norm(c.country ?? "").includes("uruguai"), "Montevidéu, Uruguai"],
    ["mostre Portugal no mapa", (c) => c.tipo === "pais" || (km(c, 39.6, -8.0) < 350 && norm(c.country ?? "").includes("portugal")), "Portugal (país)"],
    ["localize a Bahia", (c) => c.tipo === "estado" && norm(c.label).startsWith("bahia"), "estado da Bahia (não Salvador nem rua Bahia)"],
    ["mostre o Japão no mapa", (c) => c.tipo === "pais" && norm(c.label).includes("jap"), "Japão (país)"],
    ["localize Rua Direita, Salvador", perto(-12.97, -38.51, 20), "rua em Salvador"],
    ["localize a Avenida Paulista, São Paulo", perto(-23.56, -46.65, 15), "Av. Paulista, São Paulo"],
    ["localize Avenida Getúlio Vargas, Feira de Santana", perto(-12.26, -38.96, 15), "Av. Getúlio Vargas, Feira de Santana"],
    ["onde fica a Chapada Diamantina", perto(-12.6, -41.4, 250), "Chapada Diamantina (região)"],
    ["localize Times Square, Nova York", perto(40.758, -73.985, 10), "Times Square, Nova York"],
    ["localize Humildes", perto(-12.36, -38.88, 40), "distrito de Humildes (Feira)"],
    ["onde fica Lagos", (c) => norm(c.country ?? "").includes("nigeria") || norm(c.country ?? "").includes("portugal"), "Lagos (Nigéria ou Portugal, não um vilarejo)"],
  ];
  const testar = async ([frase, espera, desc]: Caso) => {
    const q = consulta(frase);
    const t0 = Date.now();
    const c = await buscarLugar(q);
    const ms = Date.now() - t0;
    check(c && espera(c), `${desc}: "${frase}" → ${c ? `${c.label} [${c.tipo}/${c.fonte}]` : "nada"} (${ms} ms)`);
  };
  (async () => {
    // em série: Nominatim pede no máximo 1 requisição por segundo
    for (const caso of casos) { await testar(caso); await new Promise((r) => setTimeout(r, 1100)); }
    fim();
  })();
}

function fim() {
  console.log(`\nvalidate-geo: ${ok} ok, ${falha} falha(s)`);
  process.exit(falha ? 1 : 0);
}
