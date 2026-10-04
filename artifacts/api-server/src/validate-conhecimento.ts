/**
 * Valida os bancos de conhecimento ampliados (lib/conhecimento/*.ts).
 * Uso: npx tsx src/validate-conhecimento.ts [arquivo opcional]
 */
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { normalizeKnowledgeText, type KnowledgeEntry } from "./lib/knowledge-bank";

const FILLER = new Set([
  "a", "o", "e", "de", "da", "do", "em", "no", "na", "um", "uma", "para", "por", "com",
  "que", "qual", "quais", "como", "sobre", "explique", "defina", "fale", "diga", "apresente",
  "informe", "me", "pode", "poderia", "os", "as", "dos", "das", "nos", "nas", "se", "ao",
  "quem", "quanto", "quantos", "onde", "porque", "por que", "e o", "o que", "significa", "serve",
]);
// Siglas conhecidas podem ser gatilho sozinhas ("o que é DRE").
const ACRONYMS = new Set(["dre", "dmpl", "dlpa", "dfc", "dva", "roa", "roe", "ebitda", "pmre", "pmrv", "pmpc", "ncg", "mei", "ibs", "cbs", "pcasp", "mcasp", "eva", "coso", "sox", "sped", "ecd", "ecf", "efd", "esocial", "xbrl", "cmv", "enade", "crase", "pix", "llm"]);
const REMOTE_ONLY = /\b(?:lei|legislacao|norma|aliquota|vigente|atual|hoje|agora|noticia|cotacao|previsao do tempo|prazo legal)\b/;

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "lib", "conhecimento");
const only = process.argv[2];
const files = (await readdir(dir)).filter((f) => f.endsWith(".ts") && f !== "index.ts" && (!only || f.includes(only)));

const errors: string[] = [];
const warnings: string[] = [];
const ids = new Map<string, string>();
const triggerOwners = new Map<string, string>();
let total = 0;

for (const file of files) {
  const mod = await import(pathToFileURL(path.join(dir, file)).href);
  const entries = Object.values(mod).find(Array.isArray) as KnowledgeEntry[] | undefined;
  if (!entries) { errors.push(`${file}: nenhum array exportado`); continue; }
  for (const e of entries) {
    total += 1;
    const where = `${file}:${e.id}`;
    if (!e.id || !/^[a-z0-9-]+$/.test(e.id)) errors.push(`${where}: id inválido`);
    if (ids.has(e.id)) errors.push(`${where}: id duplicado (também em ${ids.get(e.id)})`);
    ids.set(e.id, file);
    if (!e.title || e.title.length < 3) errors.push(`${where}: título vazio`);
    if (!Array.isArray(e.triggers) || e.triggers.length < 2) errors.push(`${where}: precisa de pelo menos 2 gatilhos`);
    const a = e.answer ?? "";
    if (a.length < 80) errors.push(`${where}: resposta curta demais (${a.length})`);
    if (a.length > 700) errors.push(`${where}: resposta longa demais (${a.length})`);
    if (/[*#|`]|\[[a-z]+\]|^\s*-\s/m.test(a)) errors.push(`${where}: resposta contém markdown/etiquetas`);
    for (const t of e.triggers ?? []) {
      const terms = t.map((x) => normalizeKnowledgeText(x));
      if (terms.some((x) => !x)) { errors.push(`${where}: termo vazio em ${JSON.stringify(t)}`); continue; }
      const joined = terms.join(" ");
      if (REMOTE_ONLY.test(joined)) errors.push(`${where}: gatilho usa palavra bloqueada ${JSON.stringify(t)}`);
      const content = joined.split(" ").filter((w) => w.length >= 3 && !FILLER.has(w));
      const singleSpecific = terms.length === 1 && (ACRONYMS.has(terms[0]) || (terms[0].includes(" ") ? content.length >= 2 || terms[0].split(" ").length >= 3 : terms[0].length >= 8));
      if (content.length < 2 && !singleSpecific) errors.push(`${where}: gatilho fraco ${JSON.stringify(t)}`);
      const key = [...terms].sort().join("+");
      const owner = triggerOwners.get(key);
      if (owner && owner !== e.id) warnings.push(`${where}: gatilho ${JSON.stringify(t)} repetido em ${owner}`);
      triggerOwners.set(key, e.id);
    }
  }
}

console.log(`${files.length} arquivo(s), ${total} entradas, ${errors.length} erro(s), ${warnings.length} aviso(s)`);
for (const w of warnings.slice(0, 40)) console.log("AVISO", w);
for (const e of errors.slice(0, 80)) console.log("ERRO", e);
process.exit(errors.length ? 1 : 0);
