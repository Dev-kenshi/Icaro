/**
 * Confere se o pacote do vídeo (ÍCARO v5) foi instalado por inteiro: arquivos, dependência,
 * rotas e ligações no palco. Roda sem internet e sem banco.
 * Uso: pnpm --filter @workspace/scripts run validate:video-v5-instalacao
 * Desenvolvedor do projeto: Emanuel Macêdo Luz
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ler = (p: string) => (existsSync(resolve(raiz, p)) ? readFileSync(resolve(raiz, p), "utf8") : "");

let total = 0;
const falhas: string[] = [];
function check(nome: string, ok: boolean) {
  total += 1;
  if (!ok) falhas.push(nome);
}

const ARQUIVOS = [
  "artifacts/api-server/src/lib/ao-vivo.ts",
  "artifacts/api-server/src/routes/ao-vivo.ts",
  "artifacts/api-server/src/validate-ao-vivo.ts",
  "artifacts/icaro/src/components/stage/globo-terra.tsx",
  "artifacts/icaro/src/components/stage/painel-ao-vivo.tsx",
  "artifacts/icaro/src/lib/ao-vivo.ts",
  "artifacts/icaro/src/lib/globo.ts",
  "artifacts/icaro/src/validate-video-v5.ts",
];
for (const a of ARQUIVOS) check(`arquivo presente: ${a}`, existsSync(resolve(raiz, a)));

const pkg = JSON.parse(ler("artifacts/icaro/package.json") || "{}");
// 5.24.0 vem empacotado em vendor/ (o firewall de pacotes bloqueia o tarball do npm): aceita a versão direta ou o arquivo local.
const maplibreSpec = String(pkg.dependencies?.["maplibre-gl"] ?? pkg.devDependencies?.["maplibre-gl"] ?? "");
check("maplibre-gl 5.24.0 no package.json do ícaro", maplibreSpec === "5.24.0" || /^file:vendor\/maplibre-gl-5\.24\.0\.tgz$/.test(maplibreSpec));
check("maplibre-gl no pnpm-lock.yaml", /maplibre-gl@5\.24\.0|maplibre-gl-5\.24\.0\.tgz/.test(ler("pnpm-lock.yaml")));
check("maplibre-gl instalado em node_modules", existsSync(resolve(raiz, "artifacts/icaro/node_modules/maplibre-gl/package.json")));

const rotas = ler("artifacts/api-server/src/routes/index.ts");
check("rota ao-vivo importada", /import\s+aoVivoRouter\s+from\s+["']\.\/ao-vivo/.test(rotas));
check("rota ao-vivo registrada", /router\.use\(aoVivoRouter\)/.test(rotas));
check("/ao-vivo protegido por login", /["']\/ao-vivo["'][^\n]*\]\s*,\s*requireAuth\(\)/.test(rotas));

const rotaAoVivo = ler("artifacts/api-server/src/routes/ao-vivo.ts");
check("GET /ao-vivo/financas", rotaAoVivo.includes('"/ao-vivo/financas"'));
check("GET /ao-vivo/tempo", rotaAoVivo.includes('"/ao-vivo/tempo"'));

const palco = ler("artifacts/icaro/src/pages/stage.tsx");
check("palco importa GloboTerra", palco.includes("@/components/stage/globo-terra"));
check("palco importa PainelAoVivo", palco.includes("@/components/stage/painel-ao-vivo"));
check("palco renderiza <GloboTerra", palco.includes("<GloboTerra"));
check("palco renderiza <PainelAoVivo", palco.includes("<PainelAoVivo"));
check("palco trata comando 'painel'", /case ['"]painel['"]/.test(palco));
check("palco trata comando 'tempo'", /case ['"]tempo['"]/.test(palco));
check("palco trata comando 'globo'", /case ['"]globo['"]/.test(palco));
check("palco usa geocoder de cidades (Montevidéu)", palco.includes("buscarLugar(") || (palco.includes("cidadeUrl(") && palco.includes("parseCidade(")));
check("globo cai para o cosmos se o WebGL falhar", palco.includes("globoFalhou"));

const cmds = ler("artifacts/icaro/src/lib/commands.ts");
check("commands.ts exporta GloboAcao", /export type GloboAcao/.test(cmds));
check("commands.ts chama interpretV5", /interpretV5\(/.test(cmds));

const geo = ler("artifacts/icaro/src/lib/geo-fly.ts");
check("geo-fly.ts exporta cidadeUrl e parseCidade", /export function cidadeUrl/.test(geo) && /export function parseCidade/.test(geo));

const css = ler("artifacts/icaro/src/pages/stage.css");
for (const c of [".globo-terra", ".lugar-titulo", ".globo-controles", ".painel-vivo", ".pino"]) check(`estilo ${c}`, css.includes(c));

const scripts = JSON.parse(ler("scripts/package.json") || "{}").scripts ?? {};
check("script validate:video-v5", typeof scripts["validate:video-v5"] === "string");
check("script validate:video-v5-tudo", typeof scripts["validate:video-v5-tudo"] === "string");

for (const f of falhas) console.log("✗", f);
console.log(`${total - falhas.length}/${total} validações de instalação do pacote do vídeo`);
process.exit(falhas.length ? 1 : 0);
