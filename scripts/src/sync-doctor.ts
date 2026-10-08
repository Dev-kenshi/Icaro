/**
 * Sync Doctor — 100 validações da sincronização Replit ⇄ GitHub ⇄ Claude e uma
 * rotina que corrige o que for seguro corrigir.
 *
 *   pnpm --filter @workspace/scripts run sync:check        # só diagnostica
 *   pnpm --filter @workspace/scripts run sync:fix          # diagnostica e sincroniza
 *   pnpm --filter @workspace/scripts run sync:fix -- --abort  # desfaz um merge pendente
 *
 * Regras da rotina: nunca usa force-push, nunca descarta alterações de nenhum
 * lado e não conclui um merge que apague funcionalidades já entregues. Quando o
 * Git do workspace não autentica, usa o secret GITHUB_TOKEN (ou GH_TOKEN) só no
 * comando, sem gravá-lo na configuração. Sem nenhuma credencial, exporta as
 * alterações em .sync-out/ (patches + bundle) para aplicar do outro lado.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const REPO = path.resolve(import.meta.dirname, "../..");
const EXPECTED_REMOTE = /github\.com[/:]Dev-kenshi\/Icaro(?:\.git)?$/i;
const BRANCH = "main";
const args = new Set(process.argv.slice(2));
const MODE = args.has("--abort") ? "abort" : args.has("--fix") ? "fix" : "check";
const JSON_OUT = args.has("--json");

// ---------------------------------------------------------------- utilidades

type Run = { code: number; out: string; err: string };
const token = (process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "").trim();
const mask = (s: string) => (token ? s.split(token).join("***") : s);

function git(argv: string[], opts: { auth?: boolean; timeout?: number } = {}): Run {
  const env = { ...process.env, GIT_TERMINAL_PROMPT: "0" };
  if (opts.auth && token) {
    // Cabeçalho só neste processo: o token não vai para .git/config nem para os argumentos.
    const basic = Buffer.from(`x-access-token:${token}`).toString("base64");
    Object.assign(env, {
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader",
      GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${basic}`,
    });
  }
  const r = spawnSync("git", argv, { cwd: REPO, env, encoding: "utf8", timeout: opts.timeout ?? 60_000 });
  return { code: r.status ?? 1, out: mask((r.stdout ?? "").trim()), err: mask((r.stderr ?? r.error?.message ?? "").trim()) };
}
const gitOk = (argv: string[], opts?: { auth?: boolean; timeout?: number }) => git(argv, opts).code === 0;
const read = (rel: string) => readFileSync(path.join(REPO, rel), "utf8");
const exists = (rel: string) => existsSync(path.join(REPO, rel));
const has = (rel: string, re: RegExp) => exists(rel) && re.test(read(rel));

function trackedFiles(): string[] {
  const r = git(["ls-files"]);
  return r.code === 0 ? r.out.split(/\r?\n/).filter(Boolean) : [];
}
// Commit automático: tudo do projeto, menos logs, .env e a pasta exportada.
const SAFE_ADD = ["add", "-A", "--", ".", ":!*.log", ":!.env", ":!.env.*", ":!.sync-out"];
const TEXT_EXT = /\.(?:ts|tsx|js|mjs|cjs|json|ya?ml|md|css|html|toml|txt|sh)$/i;

// ------------------------------------------------------------- validações

type Severity = "erro" | "aviso";
type Result = { ok: boolean; detail?: string };
type Check = { group: string; name: string; severity: Severity; run: () => Result | Promise<Result> };
const checks: Check[] = [];
const add = (group: string, name: string, run: Check["run"], severity: Severity = "erro") =>
  checks.push({ group, name, severity, run });
const pass = (detail?: string): Result => ({ ok: true, detail });
const fail = (detail: string): Result => ({ ok: false, detail });
const expect = (cond: unknown, detail: string): Result => (cond ? pass() : fail(detail));

// Estado de rede calculado uma vez e reaproveitado pelas validações.
let net: { plain: boolean; auth: boolean; plainErr: string } | null = null;
function network() {
  if (!net) {
    const plain = git(["ls-remote", "--heads", "origin", BRANCH], { timeout: 30_000 });
    const auth = token ? gitOk(["ls-remote", "--heads", "origin", BRANCH], { auth: true, timeout: 30_000 }) : false;
    net = { plain: plain.code === 0, auth, plainErr: plain.err };
  }
  return net;
}
const remoteRef = () => git(["rev-parse", "-q", "--verify", `origin/${BRANCH}`]);

// A. Ambiente Git (12)
add("A. Ambiente Git", "git instalado", () => { const r = git(["--version"]); return expect(r.code === 0, "git não encontrado no PATH"); });
add("A. Ambiente Git", "pasta é um repositório", () => expect(gitOk(["rev-parse", "--git-dir"]), "não é um repositório git"));
add("A. Ambiente Git", "raiz do repositório correta", () => { const r = git(["rev-parse", "--show-toplevel"]); return expect(r.code === 0 && path.resolve(r.out) === REPO, `raiz inesperada: ${r.out}`); });
add("A. Ambiente Git", "remoto origin configurado", () => expect(gitOk(["remote", "get-url", "origin"]), "sem remoto origin"));
add("A. Ambiente Git", "origin aponta para Dev-kenshi/Icaro", () => { const u = git(["remote", "get-url", "origin"]).out; return expect(EXPECTED_REMOTE.test(u.replace(/^https:\/\/[^@]+@/, "https://")), `origin = ${u}`); });
add("A. Ambiente Git", "token não está gravado na URL do remoto", () => expect(!/https:\/\/[^/]*@github\.com/.test(git(["remote", "get-url", "origin"]).out), "a URL do origin contém credencial; remova-a"));
add("A. Ambiente Git", `ramo atual é ${BRANCH}`, () => { const b = git(["branch", "--show-current"]).out; return expect(b === BRANCH, `ramo atual: ${b || "(HEAD destacado)"}`); });
add("A. Ambiente Git", "sem merge pendente", () => expect(!exists(".git/MERGE_HEAD"), "há um merge em andamento"));
add("A. Ambiente Git", "sem rebase pendente", () => expect(!exists(".git/rebase-merge") && !exists(".git/rebase-apply"), "há um rebase em andamento"));
add("A. Ambiente Git", "sem trava .git/index.lock", () => expect(!exists(".git/index.lock"), "arquivo .git/index.lock preso (outro git rodando ou travado)"));
add("A. Ambiente Git", "identidade de commit definida", () => expect(git(["config", "user.name"]).out && git(["config", "user.email"]).out, "falta git config user.name / user.email"));
add("A. Ambiente Git", ".gitignore ignora node_modules e dist", () => expect(has(".gitignore", /^node_modules/m) && has(".gitignore", /^dist/m), ".gitignore incompleto"));

// B. Conexão e autenticação (10)
add("B. Conexão", "github.com alcançável", () => { const r = spawnSync(process.execPath, ["-e", "require('dns').lookup('github.com',e=>process.exit(e?1:0))"], { timeout: 15_000 }); return expect(r.status === 0, "sem DNS/internet para github.com"); });
add("B. Conexão", "leitura do remoto com a credencial do workspace", () => { const n = network(); return n.plain ? pass() : fail(`ls-remote falhou: ${n.plainErr.split("\n")[0]}`); }, "aviso");
add("B. Conexão", "token GITHUB_TOKEN/GH_TOKEN disponível", () => expect(token.length > 0, "nenhum token no ambiente (opcional se a credencial do workspace funcionar)"), "aviso");
add("B. Conexão", "token com formato válido", () => (!token ? pass("sem token") : expect(/^(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]{20,}$/.test(token), "formato de token desconhecido")), "aviso");
add("B. Conexão", "leitura do remoto com o token", () => (!token ? pass("sem token") : expect(network().auth, "o GitHub recusou o token (vencido ou sem acesso ao Icaro)")));
add("B. Conexão", "existe ao menos uma credencial que funciona", () => { const n = network(); return expect(n.plain || n.auth, "nenhuma credencial lê o repositório: reconecte o GitHub ou configure GITHUB_TOKEN"); });
add("B. Conexão", "fetch do main", () => { const n = network(); const r = git(["fetch", "-q", "origin", BRANCH], { auth: !n.plain && n.auth, timeout: 90_000 }); return expect(r.code === 0, `fetch falhou: ${r.err.split("\n")[0]}`); });
add("B. Conexão", `origin/${BRANCH} conhecido localmente`, () => expect(remoteRef().code === 0, `origin/${BRANCH} ausente (rode o fetch)`));
add("B. Conexão", "permissão de escrita (push --dry-run)", () => { const n = network(); const r = git(["push", "--dry-run", "origin", `HEAD:refs/heads/sync-doctor-probe`], { auth: !n.plain && n.auth, timeout: 60_000 }); return expect(r.code === 0, `sem permissão de push: ${r.err.split("\n")[0]}`); }, "aviso");
add("B. Conexão", "sem pedido interativo de senha", () => expect(!/terminal prompts disabled|could not read Username/i.test(network().plainErr), "o git pede usuário/senha: a credencial do workspace não está configurada"), "aviso");

// C. Divergência entre os lados (9)
const counts = () => { const r = git(["rev-list", "--left-right", "--count", `HEAD...origin/${BRANCH}`]); const [a, b] = r.out.split(/\s+/).map(Number); return { ahead: a || 0, behind: b || 0, ok: r.code === 0 }; };
add("C. Divergência", "base comum com o GitHub", () => expect(gitOk(["merge-base", "HEAD", `origin/${BRANCH}`]), "históricos sem ancestral comum"));
add("C. Divergência", "não está atrás do GitHub", () => { const c = counts(); return expect(c.ok && c.behind === 0, `${c.behind} commit(s) do GitHub ainda não trazidos`); }, "aviso");
add("C. Divergência", "sem commits locais não enviados", () => { const c = counts(); return expect(c.ok && c.ahead === 0, `${c.ahead} commit(s) locais ainda não enviados`); }, "aviso");
add("C. Divergência", "lados não divergiram ao mesmo tempo", () => { const c = counts(); return expect(!(c.ahead > 0 && c.behind > 0), `divergência: ${c.ahead} local × ${c.behind} remoto (precisa de merge)`); }, "aviso");
add("C. Divergência", "sem alterações não commitadas", () => expect(git(["status", "--porcelain", "--untracked-files=no"]).out === "", "há arquivos modificados sem commit"), "aviso");
add("C. Divergência", "sem arquivos novos esquecidos", () => { const u = git(["ls-files", "--others", "--exclude-standard"]).out.split("\n").filter(Boolean); return expect(u.length === 0, `${u.length} arquivo(s) novo(s) fora do git: ${u.slice(0, 3).join(", ")}`); }, "aviso");
add("C. Divergência", "sem stash esquecido", () => expect(git(["stash", "list"]).out === "", "há alterações guardadas no stash"), "aviso");
add("C. Divergência", "sem arquivos em conflito no índice", () => expect(git(["diff", "--name-only", "--diff-filter=U"]).out === "", "arquivos em conflito no índice"));
add("C. Divergência", "merge simulado sem conflitos", () => {
  const r = git(["merge-tree", "--write-tree", "--name-only", "HEAD", `origin/${BRANCH}`]);
  if (r.code === 0) return pass();
  if (/unknown option|usage: git merge-tree/i.test(r.err)) return pass("git antigo: simulação indisponível");
  return fail(`conflitos previstos: ${r.out.split("\n").slice(1).filter(Boolean).slice(0, 6).join(", ")}`);
}, "aviso");

// D. Integridade do conteúdo (19)
const tracked = () => trackedFiles();
add("D. Integridade", "nenhum marcador de conflito no código", () => {
  const bad = tracked().filter((f) => TEXT_EXT.test(f) && exists(f) && statSync(path.join(REPO, f)).size < 2_000_000)
    .filter((f) => /^(?:<{7}|>{7}) /m.test(read(f)) && /^={7}$/m.test(read(f)));
  return expect(bad.length === 0, `marcadores <<<<<<< em: ${bad.slice(0, 5).join(", ")}`);
});
const jsonFiles = ["package.json", "artifacts/api-server/package.json", "artifacts/icaro/package.json", "scripts/package.json", "tsconfig.json", "tsconfig.base.json", "artifacts/icaro/public/avatar-portrait/atlas.json"];
for (const f of jsonFiles) add("D. Integridade", `${f} é JSON válido`, () => { try { JSON.parse(read(f)); return pass(); } catch (e) { return fail(String(e)); } });
add("D. Integridade", "pnpm-lock.yaml presente e v9", () => expect(has("pnpm-lock.yaml", /^lockfileVersion: '9\.0'/m), "lockfile ausente ou de outra versão"));
add("D. Integridade", "pnpm-workspace inclui artifacts, lib e scripts", () => expect(has("pnpm-workspace.yaml", /artifacts\/\*/) && has("pnpm-workspace.yaml", /lib\/\*/), "pnpm-workspace.yaml incompleto"));
add("D. Integridade", "nenhum arquivo versionado acima de 50 MB", () => { const big = tracked().filter((f) => exists(f) && statSync(path.join(REPO, f)).size > 50 * 1024 * 1024); return expect(big.length === 0, `arquivos grandes: ${big.join(", ")}`); });
add("D. Integridade", "node_modules não versionado", () => expect(!tracked().some((f) => f.includes("node_modules/")), "node_modules entrou no git"));
add("D. Integridade", "dist não versionado", () => expect(!tracked().some((f) => /(^|\/)dist\//.test(f) && !f.startsWith("vendor/")), "pastas dist entraram no git"), "aviso");
add("D. Integridade", "cache .data do servidor não versionado", () => expect(!tracked().some((f) => f.includes("api-server/.data/")), "artifacts/api-server/.data entrou no git"));
add("D. Integridade", "nenhuma chave de API no código", () => {
  const re = /\b(?:gsk_[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{30,}|sk-(?:ant-|proj-)?[A-Za-z0-9_-]{30,}|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})/g;
  // Chaves de exemplo dos testes ("AIza1234567890abc...") não contam.
  const fake = /1234567890|abcdefghij|x{8,}|0{8,}/i;
  const bad = tracked().filter((f) => TEXT_EXT.test(f) && exists(f) && statSync(path.join(REPO, f)).size < 2_000_000
    && (read(f).match(re) ?? []).some((key) => !fake.test(key)));
  return expect(bad.length === 0, `possível chave exposta em: ${bad.slice(0, 5).join(", ")}`);
});
add("D. Integridade", "senhas de login fora do .replit", () => expect(!has(".replit", /ICARO_(?:ADMIN|USER1)_CODE\s*=\s*"\d+/), "o .replit tem códigos de login em texto: mova-os para Secrets"), "aviso");
add("D. Integridade", "sem arquivo .env versionado", () => expect(!tracked().some((f) => /(^|\/)\.env(\.|$)/.test(f) && !f.endsWith(".example")), ".env versionado"));
add("D. Integridade", "README presente", () => expect(exists("README.md"), "README.md ausente"));
add("D. Integridade", "render.yaml presente", () => expect(exists("render.yaml"), "render.yaml ausente"));

// E. Funcionalidades entregues continuam no código (30)
const feat = (name: string, rel: string, re?: RegExp) => add("E. Funcionalidades", name, () => (re ? expect(has(rel, re), `${rel}: trecho esperado não encontrado`) : expect(exists(rel), `${rel} ausente`)));
feat("render.yaml usa npx pnpm (corepack falha no Render)", "render.yaml", /npx -y pnpm@10/);
feat("render.yaml tem checagem /api/healthz", "render.yaml", /healthCheckPath: \/api\/healthz/);
feat("render.yaml no plano free", "render.yaml", /plan: free/);
feat("API serve o frontend buildado (STATIC_DIR)", "artifacts/api-server/src/app.ts", /STATIC_DIR/);
feat("login aceita ICARO_*_PASSWORD", "artifacts/api-server/src/lib/auth.ts", /ICARO_ADMIN_PASSWORD/);
feat("Claude aceita CLAUDE_API_KEY_ROMULA", "artifacts/api-server/src/routes/ai.ts", /CLAUDE_API_KEY_ROMULA/);
feat("calculadora de folha existe", "artifacts/api-server/src/lib/calculo-folha.ts", /export function resolverCalculoFolha/);
feat("cérebro chama o cálculo de folha", "artifacts/api-server/src/lib/cerebro-camadas.ts", /resolverCalculoFolha\(question\)/);
feat("stream envia o painel no evento done", "artifacts/api-server/src/routes/ai.ts", /painel: layered\.painel/);
feat("banco carrega os bancos ampliados", "artifacts/api-server/src/lib/knowledge-bank.ts", /CONHECIMENTO_AMPLIADO/);
feat("resposta de boas-vindas do evento", "artifacts/api-server/src/lib/knowledge-bank.ts", /id: "evento-boas-vindas"/);
feat("resposta 'substituir o contador'", "artifacts/api-server/src/lib/knowledge-bank.ts", /id: "evento-substituir-contador"/);
for (const area of ["contabilidade", "matematica", "pesquisa", "universidades", "geral", "ia", "historia"]) feat(`banco ${area}.ts`, `artifacts/api-server/src/lib/conhecimento/${area}.ts`);
feat("índice dos bancos", "artifacts/api-server/src/lib/conhecimento/index.ts", /CONTABILIDADE[\s\S]*HISTORIA/);
feat("validador dos bancos", "artifacts/api-server/src/validate-conhecimento.ts");
feat("componente do painel financeiro", "artifacts/icaro/src/components/stage/painel-financeiro.tsx", /export function PainelFinanceiro/);
feat("palco mostra o painel", "artifacts/icaro/src/pages/stage.tsx", /<PainelFinanceiro /);
feat("cliente do stream lê o painel", "artifacts/icaro/src/lib/ai-chat-stream.ts", /isPainel\(payload\.painel\)/);
feat("'calcule o custo...' não cai na calculadora local", "artifacts/icaro/src/lib/commands.ts", /isExpression/);
feat("Feirense com boca medida", "artifacts/icaro/src/lib/avatars.ts", /id: 'feirense',[\s\S]*?mouth: \{/);
feat("Clássico com boca medida", "artifacts/icaro/src/lib/avatars.ts", /id: 'classico',[\s\S]*?mouth: \{/);
feat("retrato desenha a cavidade da boca", "artifacts/icaro/src/components/stage/holo-portrait.tsx", /holo-avatar__mouth-cavity/);
feat("CSS anima a boca pelo --talk", "artifacts/icaro/src/pages/stage.css", /--mouth-open:calc\(var\(--talk,0\)/);
feat("README credita Emanuel Macêdo Luz", "README.md", /Emanuel Macêdo Luz/);

// F. Comportamento (20)
const api = (rel: string) => pathToFileURL(path.join(REPO, "artifacts/api-server/src", rel)).href;
type Folha = typeof import("../../artifacts/api-server/src/lib/calculo-folha");
type Banco = typeof import("../../artifacts/api-server/src/lib/knowledge-bank");
let folhaMod: Folha | null = null;
let bancoMod: Banco | null = null;
const folha = async () => (folhaMod ??= await import(api("lib/calculo-folha.ts")) as Folha);
const banco = async () => (bancoMod ??= await import(api("lib/knowledge-bank.ts")) as Banco);
const routes = async (q: string, id: string) => { const r = (await banco()).resolveKnowledgeAnswer(q); return expect(r?.id === id, `"${q}" → ${r?.id ?? "nada"} (esperado ${id})`); };

add("F. Comportamento", "custo de R$ 2.500 = R$ 4.055,14", async () => { const r = (await folha()).resolverCalculoFolha("calcule o custo de um funcionário de 2.500"); return expect(r?.painel.totais.debito === 4055.14, `deu ${r?.painel.totais.debito}`); });
add("F. Comportamento", "custo no Simples = R$ 3.225,00", async () => { const r = (await folha()).resolverCalculoFolha("quanto custa um funcionário de 2.500 no simples nacional"); return expect(r?.painel.totais.debito === 3225, `deu ${r?.painel.totais.debito}`); });
add("F. Comportamento", "entende '2,500' da transcrição", async () => expect((await folha()).extrairSalario("funcionário por 2,500") === 2500, "não leu 2,500"));
add("F. Comportamento", "entende 'dois mil e quinhentos'", async () => expect((await folha()).extrairSalario("custo de um empregado de dois mil e quinhentos") === 2500, "não leu por extenso"));
add("F. Comportamento", "lançamento fecha débito = crédito = R$ 4.055,14", async () => { const f = await folha(); f.resolverCalculoFolha("custo de um funcionário de 2.500"); const r = f.resolverCalculoFolha("faça o lançamento contábil da folha desse funcionário"); return expect(r?.painel.totais.debito === 4055.14 && r.painel.totais.credito === 4055.14, `D=${r?.painel.totais.debito} C=${r?.painel.totais.credito}`); });
add("F. Comportamento", "dashboard de débitos e créditos gera painel", async () => expect((await folha()).resolverCalculoFolha("monte um dashboard financeiro dos débitos e créditos")?.id === "calc-lancamento-folha", "sem painel"));
add("F. Comportamento", "pergunta conceitual não vira cálculo", async () => expect((await folha()).resolverCalculoFolha("o que é débito e crédito") === null, "'o que é débito e crédito' virou cálculo"));
add("F. Comportamento", "banco tem 800+ respostas", async () => { const n = (await banco()).KNOWLEDGE_BANK.length; return expect(n >= 800, `só ${n} respostas`); });
add("F. Comportamento", "ids do banco são únicos", async () => { const ids = (await banco()).KNOWLEDGE_BANK.map((e) => e.id); return expect(new Set(ids).size === ids.length, "ids duplicados"); });
add("F. Comportamento", "nenhuma resposta com markdown", async () => { const bad = (await banco()).KNOWLEDGE_BANK.filter((e) => /[*#|`]/.test(e.answer)); return expect(bad.length === 0, `markdown em ${bad.slice(0, 3).map((e) => e.id).join(", ")}`); });
add("F. Comportamento", "boas-vindas", () => routes("Ícaro, dê as boas-vindas ao público", "evento-boas-vindas"));
add("F. Comportamento", "substituir o contador", () => routes("A inteligência artificial vai substituir os contadores?", "evento-substituir-contador"));
add("F. Comportamento", "'Ícaro,' no começo não sequestra a pergunta", async () => { const r = (await banco()).resolveKnowledgeAnswer("Ícaro, como funciona a depreciação?"); return expect(!!r && !r.id.startsWith("geral-icaro"), `foi para ${r?.id}`); });
add("F. Comportamento", "sigla DRE", async () => { const r = (await banco()).resolveKnowledgeAnswer("o que é DRE"); return expect(!!r && /dre/.test(r.id), `foi para ${r?.id ?? "nada"}`); });
add("F. Comportamento", "matemática: Bhaskara", () => routes("o que é a fórmula de Bhaskara", "mat-bhaskara"));
add("F. Comportamento", "pesquisa: teoria da agência", () => routes("o que é a teoria da agência", "pesq-teoria-agencia"));
add("F. Comportamento", "universidades: ENADE", () => routes("o que é o ENADE", "univ-enade"));
add("F. Comportamento", "história: independência da Bahia", () => routes("quando foi a independência da Bahia", "hist-independencia-bahia"));
add("F. Comportamento", "perguntas sobre 'hoje' vão para a IA online", async () => expect((await banco()).resolveKnowledgeAnswer("Ícaro, qual a previsão do tempo hoje") === null, "respondeu do banco algo que muda"));
add("F. Comportamento", "palco envia 'calcule o custo' ao servidor", async () => {
  const mod = await import(pathToFileURL(path.join(REPO, "artifacts/icaro/src/lib/commands.ts")).href) as { interpret: (q: string) => { kind: string } };
  return expect(mod.interpret("Ícaro, calcule o custo de um funcionário de 2.500").kind === "ai", "caiu na calculadora local");
});

// ----------------------------------------------------------------- execução

type Outcome = Check & Result & { n: number };
async function runChecks(filter?: (c: Check) => boolean): Promise<Outcome[]> {
  const list = filter ? checks.filter(filter) : checks;
  const out: Outcome[] = [];
  for (const c of list) {
    let r: Result;
    try { r = await c.run(); } catch (e) { r = fail(e instanceof Error ? e.message.split("\n")[0] : String(e)); }
    out.push({ ...c, ...r, n: checks.indexOf(c) + 1 });
  }
  return out;
}

function report(results: Outcome[]) {
  if (JSON_OUT) { console.log(JSON.stringify(results.map(({ run: _r, ...r }) => r), null, 2)); return; }
  let group = "";
  for (const r of results) {
    if (r.group !== group) { group = r.group; console.log(`\n${group}`); }
    const icon = r.ok ? "✓" : r.severity === "erro" ? "✗" : "!";
    console.log(`  ${icon} ${String(r.n).padStart(3, "0")}. ${r.name}${!r.ok && r.detail ? ` — ${r.detail}` : r.ok && r.detail ? ` (${r.detail})` : ""}`);
  }
  const errors = results.filter((r) => !r.ok && r.severity === "erro").length;
  const warns = results.filter((r) => !r.ok && r.severity === "aviso").length;
  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} validações ok · ${errors} erro(s) · ${warns} aviso(s)`);
}

const log = (s: string) => console.log(`\n▶ ${s}`);
const stop = (s: string, code = 1): never => { console.log(`\n■ ${s}`); process.exit(code); };

function exportChanges(reason: string) {
  const dir = path.join(REPO, ".sync-out");
  mkdirSync(dir, { recursive: true });
  const base = remoteRef().code === 0 ? `origin/${BRANCH}` : git(["rev-list", "--max-parents=0", "HEAD"]).out.split("\n")[0];
  git(["format-patch", `${base}..HEAD`, "-o", dir]);
  git(["bundle", "create", path.join(dir, "alteracoes.bundle"), `${base}..HEAD`]);
  writeFileSync(path.join(dir, "LEIA-ME.txt"), [
    `Exportado em ${new Date().toISOString()} porque: ${reason}`,
    "Baixe esta pasta e entregue ao Claude (ou rode do outro lado):",
    "  git am .sync-out/*.patch        # aplica commit a commit",
    "  git pull .sync-out/alteracoes.bundle HEAD  # alternativa pelo bundle",
  ].join("\n"));
  const files = readdirSync(dir);
  console.log(`  alterações exportadas em .sync-out/ (${files.length} arquivo(s))`);
}

async function fix() {
  if (exists(".git/index.lock")) stop("Há um .git/index.lock: confirme que nenhum git está rodando e apague o arquivo.");
  if (exists(".git/rebase-merge") || exists(".git/rebase-apply")) stop("Há um rebase pendente: termine com `git rebase --continue` ou desfaça com `git rebase --abort`.");
  if (exists(".git/MERGE_HEAD")) stop("Há um merge pendente: resolva os conflitos e faça commit, ou rode sync:fix -- --abort.");
  if (git(["branch", "--show-current"]).out !== BRANCH) stop(`Mude para o ramo ${BRANCH} antes (git switch ${BRANCH}).`);

  log("1/6 Credenciais");
  const n = network();
  const auth = !n.plain && n.auth;
  if (!n.plain && !n.auth) {
    console.log(`  o GitHub recusou a credencial do workspace${token ? " e o token" : " e não há GITHUB_TOKEN"}.`);
    if (git(["status", "--porcelain"]).out) {
      gitOk(SAFE_ADD);
      gitOk(["commit", "-q", "-m", `sync: alterações locais ${new Date().toISOString().slice(0, 16)}`]);
    }
    exportChanges("sem credencial válida para o GitHub");
    stop("Sem acesso ao GitHub. Configure o secret GITHUB_TOKEN (token com acesso ao Dev-kenshi/Icaro) ou reconecte o GitHub, e rode de novo.", 3);
  }
  console.log(`  usando ${auth ? "o token GITHUB_TOKEN (só neste comando)" : "a credencial do workspace"}.`);

  log("2/6 Alterações locais");
  if (git(["status", "--porcelain"]).out) {
    gitOk(SAFE_ADD);
    const c = git(["commit", "-q", "-m", `sync: alterações locais ${new Date().toISOString().slice(0, 16)}`]);
    if (c.code !== 0) stop(`não consegui commitar: ${c.err}`);
    console.log("  alterações locais guardadas num commit.");
  } else console.log("  nada pendente.");

  log("3/6 Buscando o GitHub");
  const f = git(["fetch", "origin", BRANCH], { auth, timeout: 120_000 });
  if (f.code !== 0) { exportChanges(`fetch falhou: ${f.err}`); stop(`fetch falhou: ${f.err}`, 3); }
  const { ahead, behind } = counts();
  console.log(`  local à frente: ${ahead} · GitHub à frente: ${behind}`);

  log("4/6 Juntando os dois lados (sem descartar nada)");
  if (behind > 0) {
    const m = git(["merge", "--no-ff", "--no-commit", `origin/${BRANCH}`]);
    const conflicts = git(["diff", "--name-only", "--diff-filter=U"]).out.split("\n").filter(Boolean);
    if (conflicts.length) {
      console.log("  conflitos que precisam de decisão:");
      for (const c of conflicts) console.log(`    • ${c}`);
      stop("Resolva os conflitos (mantendo as duas versões), faça commit e rode sync:fix de novo. Para desfazer: sync:fix -- --abort.", 2);
    }
    if (m.code !== 0 && !exists(".git/MERGE_HEAD")) stop(`merge falhou: ${m.err}`);
    // Antes de concluir: o resultado não pode ter perdido funcionalidades entregues.
    const guard = await runChecks((c) => c.group.startsWith("D.") || c.group.startsWith("E."));
    const lost = guard.filter((r) => !r.ok && r.severity === "erro");
    if (lost.length) {
      git(["merge", "--abort"]);
      for (const r of lost) console.log(`    ✗ ${r.name} — ${r.detail}`);
      stop("O merge apagaria funcionalidades acima. Merge desfeito; nada foi enviado.", 2);
    }
    if (exists(".git/MERGE_HEAD")) gitOk(["commit", "-q", "--no-edit"]);
    console.log("  merge concluído e conferido.");
  } else console.log("  o GitHub não tem nada novo.");

  log("5/6 Enviando ao GitHub");
  if (counts().ahead > 0) {
    const p = git(["push", "origin", `HEAD:${BRANCH}`], { auth, timeout: 120_000 });
    if (p.code !== 0) {
      const side = `sync-${new Date().toISOString().slice(0, 10)}`;
      const b = git(["push", "origin", `HEAD:refs/heads/${side}`], { auth, timeout: 120_000 });
      if (b.code === 0) stop(`O main recusou (${p.err.split("\n")[0]}). Enviei para o ramo ${side}; peça ao Claude para juntar.`, 2);
      exportChanges(`push falhou: ${p.err}`);
      stop(`push falhou: ${p.err.split("\n")[0]}`, 3);
    }
    console.log("  enviado.");
  } else console.log("  nada a enviar.");

  log("6/6 Conferência final");
  const final = await runChecks();
  report(final);
  const errors = final.filter((r) => !r.ok && r.severity === "erro").length;
  stop(errors ? "Sincronizado, mas há erros acima para revisar." : "Tudo sincronizado: Replit, GitHub e Claude na mesma versão.", errors ? 1 : 0);
}

if (checks.length !== 100) throw new Error(`Sync Doctor deveria ter 100 validações, tem ${checks.length}.`);

if (MODE === "abort") {
  if (exists(".git/MERGE_HEAD")) { gitOk(["merge", "--abort"]); stop("Merge pendente desfeito. Nada foi perdido.", 0); }
  stop("Não há merge pendente.", 0);
} else if (MODE === "fix") {
  await fix();
} else {
  const results = await runChecks();
  report(results);
  process.exit(results.some((r) => !r.ok && r.severity === "erro") ? 1 : 0);
}
