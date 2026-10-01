import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { check, done } from "./_check";
console.log("5. Cérebro, base de conhecimento e segredos fora do front");
const root = new URL("../../", import.meta.url).pathname;
const run = (f: string) => spawnSync("node", [root + f], { encoding: "utf8" });
const t = run("icaro-cinema/cerebro/test.js");
check(t.status === 0 && /TUDO OK/.test(t.stdout), "icaro-cinema/cerebro/test.js → TUDO OK");
const a = run("icaro-cinema/conhecimento/avaliar.js");
check(a.status === 0 && /APROVADO/.test(a.stdout), "icaro-cinema/conhecimento/avaliar.js → APROVADO");
const same = (p: string, q: string) => readFileSync(root + p, "utf8") === readFileSync(root + q, "utf8");
check(same("icaro-cinema/conhecimento/base.json", "artifacts/api-server/src/lib/conhecimento/base.json"), "base.json do servidor igual à de icaro-cinema");
check(same("icaro-cinema/cerebro/banco-respostas.json", "artifacts/api-server/src/lib/cerebro/banco-respostas.json"), "banco-respostas.json do servidor igual");
// segredos
const names = ["gemine", "gpt", "grok", "SESSION_SECRET", "ICARO_USER1_CODE", "ICARO_ADMIN_CODE"];
const values = names.map((n) => process.env[n]).filter((v): v is string => !!v && v.length >= 5);
const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => e.name === "node_modules" ? [] : e.isDirectory() ? walk(d + "/" + e.name) : [d + "/" + e.name]);
const dirs = ["artifacts/icaro/src", "artifacts/icaro/public", "artifacts/icaro/dist"].filter((d) => existsSync(root + d));
let leaks = 0;
for (const d of dirs) for (const f of walk(root + d)) { if (/\.(png|jpg|webp|mp3|mp4|onnx|wasm|glb)$/i.test(f)) continue; const c = readFileSync(f, "utf8"); for (const v of values) if (c.includes(v)) { leaks++; console.log("  vazamento em", f); } }
check(leaks === 0, `nenhum segredo/código de acesso no front (${dirs.join(", ")})`);
const envUse = walk(root + "artifacts/icaro/src").filter((f) => /\.(ts|tsx)$/.test(f)).some((f) => /VITE_[A-Z_]*(KEY|SECRET|TOKEN)/.test(readFileSync(f, "utf8")));
check(!envUse, "front não lê variáveis VITE_ com chave/segredo");
done("validate-conhecimento");
