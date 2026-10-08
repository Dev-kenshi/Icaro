/**
 * Sync Doctor — validações da sincronização deste checkout e rotina segura de envio.
 *
 *   pnpm --filter @workspace/scripts run sync:check        # só diagnostica
 *   pnpm --filter @workspace/scripts run sync:fix          # valida e sincroniza
 *   pnpm --filter @workspace/scripts run sync:fix -- --abort  # desfaz um merge pendente
 *
 * `sync:check` é somente leitura. `sync:fix` só altera o Git local/de destino depois
 * de autenticação, verificações do doctor e suítes críticas aprovadas. Nunca usa
 * force-push nem altera a configuração Git. O token só existe no processo Git.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseGitHubRemote, planSyncRepair } from "./sync-repair-policy";
import { KNOWLEDGE_BANK, normalizeKnowledgeText, resolveKnowledgeAnswer } from "../../artifacts/api-server/src/lib/knowledge-bank";
import { parseWakeCommand } from "../../artifacts/icaro/src/lib/wake-commands";
import { WakeTurnGate } from "../../artifacts/icaro/src/lib/wake-turn-gate";
import { shouldActivateStageShortcut, type ShortcutEvent } from "../../artifacts/icaro/src/lib/stage-shortcuts";

const REPO = path.resolve(import.meta.dirname, "../..");
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

const CURRENT_BRANCH = git(["branch", "--show-current"]).out;
const REMOTE = CURRENT_BRANCH
  ? git(["config", "--get", `branch.${CURRENT_BRANCH}.remote`]).out
  : "";
const MERGE_REF = CURRENT_BRANCH
  ? git(["config", "--get", `branch.${CURRENT_BRANCH}.merge`]).out
  : "";
const BRANCH = MERGE_REF.replace(/^refs\/heads\//, "");
const UPSTREAM = REMOTE && BRANCH ? `${REMOTE}/${BRANCH}` : "";
const remoteUrl = () => REMOTE ? git(["remote", "get-url", REMOTE]).out : "";
const remoteDetails = () => parseGitHubRemote(remoteUrl());

function trackedFiles(): string[] {
  const r = git(["ls-files"]);
  return r.code === 0 ? r.out.split(/\r?\n/).filter(Boolean) : [];
}
// Commit automático: tudo do projeto, menos logs, .env e a pasta exportada.
const SAFE_ADD = ["add", "-A", "--", ".", ":!*.log", ":!.env", ":!.env.*", ":!.sync-out/**"];
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
type NetworkState = {
  plain: boolean;
  auth: boolean;
  plainErr: string;
  authErr: string;
  remoteSha: string;
};
let net: NetworkState | null = null;
function network() {
  if (!net) {
    const readHead = (auth: boolean) => {
      if (!REMOTE || !BRANCH) {
        return { code: 1, out: "", err: "upstream da branch atual não está configurado" };
      }
      return git(["ls-remote", "--heads", REMOTE, `refs/heads/${BRANCH}`], { auth, timeout: 30_000 });
    };
    const shaFrom = (result: Run) => {
      const ref = `refs/heads/${BRANCH}`;
      const line = result.out.split(/\r?\n/).find((entry) => entry.trim().split(/\s+/).at(-1) === ref);
      return line?.trim().split(/\s+/)[0] ?? "";
    };
    const plain = readHead(false);
    const plainSha = shaFrom(plain);
    const authenticated = token ? readHead(true) : null;
    const authSha = authenticated ? shaFrom(authenticated) : "";
    net = {
      plain: plain.code === 0 && Boolean(plainSha),
      auth: Boolean(authenticated && authenticated.code === 0 && authSha),
      plainErr: plain.err || (plainSha ? "" : "branch do upstream não encontrada"),
      authErr: authenticated?.err || (authSha ? "" : token ? "branch do upstream não encontrada" : "token ausente"),
      remoteSha: authSha || plainSha,
    };
  }
  return net;
}
const remoteRef = () => UPSTREAM
  ? git(["rev-parse", "-q", "--verify", `refs/remotes/${UPSTREAM}`])
  : { code: 1, out: "", err: "upstream ausente" };

let pushProbe: { ok: boolean; detail: string; auth: boolean } | null = null;
function testPushPermission() {
  if (pushProbe) return pushProbe;
  if (!REMOTE || !BRANCH) {
    pushProbe = { ok: false, detail: "upstream da branch atual não está configurado", auth: false };
    return pushProbe;
  }
  const modes = network().plain ? [false, ...(token ? [true] : [])] : token ? [true] : [false];
  const failures: string[] = [];
  for (const auth of modes) {
    const result = git(
      ["-c", "core.hooksPath=/dev/null", "push", "--dry-run", REMOTE, `HEAD:refs/heads/${BRANCH}`],
      { auth, timeout: 60_000 },
    );
    if (result.code === 0) {
      pushProbe = { ok: true, detail: "push --dry-run aprovado; nenhuma ref foi alterada", auth };
      return pushProbe;
    }
    failures.push(result.err || result.out);
  }
  pushProbe = {
    ok: false,
    detail: failures[0]?.split("\n")[0] || "GitHub não aprovou o push --dry-run",
    auth: false,
  };
  return pushProbe;
}

// A. Ambiente Git (12)
add("A. Ambiente Git", "git instalado", () => { const r = git(["--version"]); return expect(r.code === 0, "git não encontrado no PATH"); });
add("A. Ambiente Git", "pasta é um repositório", () => expect(gitOk(["rev-parse", "--git-dir"]), "não é um repositório git"));
add("A. Ambiente Git", "raiz do repositório correta", () => { const r = git(["rev-parse", "--show-toplevel"]); return expect(r.code === 0 && path.resolve(r.out) === REPO, `raiz inesperada: ${r.out}`); });
add("A. Ambiente Git", "remoto configurado no upstream existe", () => expect(Boolean(REMOTE) && gitOk(["remote", "get-url", REMOTE]), "upstream sem remoto configurado"));
add("A. Ambiente Git", "upstream aponta para Dev-kenshi/Icaro", () => {
  const details = remoteDetails();
  return expect(details.host === "github.com" && details.repository?.toLowerCase() === "dev-kenshi/icaro", "o remoto do upstream não é o repositório esperado");
});
add("A. Ambiente Git", "URL do remoto não contém credenciais embutidas", () => expect(!remoteDetails().hasEmbeddedCredentials, "a URL do remoto contém credencial; remova-a"));
add("A. Ambiente Git", "branch atual e branch upstream estão configuradas", () => {
  const safe = Boolean(CURRENT_BRANCH && BRANCH && REMOTE && gitOk(["check-ref-format", "--branch", BRANCH]));
  return expect(safe, `branch/upstream inválidos: ${CURRENT_BRANCH || "(HEAD destacado)"} → ${UPSTREAM || "(ausente)"}`);
});
add("A. Ambiente Git", "sem merge pendente", () => expect(!exists(".git/MERGE_HEAD"), "há um merge em andamento"));
add("A. Ambiente Git", "sem rebase pendente", () => expect(!exists(".git/rebase-merge") && !exists(".git/rebase-apply"), "há um rebase em andamento"));
add("A. Ambiente Git", "sem trava .git/index.lock", () => expect(!exists(".git/index.lock"), "arquivo .git/index.lock preso (outro git rodando ou travado)"));
add("A. Ambiente Git", "identidade de commit definida", () => expect(git(["config", "user.name"]).out && git(["config", "user.email"]).out, "falta git config user.name / user.email"));
add("A. Ambiente Git", ".gitignore ignora node_modules e dist", () => expect(has(".gitignore", /^node_modules/m) && has(".gitignore", /^dist/m), ".gitignore incompleto"));

// B. Conexão e autenticação (10)
add("B. Conexão", "github.com alcançável", () => { const r = spawnSync(process.execPath, ["-e", "require('dns').lookup('github.com',e=>process.exit(e?1:0))"], { timeout: 15_000 }); return expect(r.status === 0, "sem DNS/internet para github.com"); });
add("B. Conexão", "leitura do upstream com a credencial do workspace", () => { const n = network(); return n.plain ? pass() : fail(`ls-remote falhou: ${n.plainErr.split("\n")[0]}`); }, "aviso");
add("B. Conexão", "token GITHUB_TOKEN/GH_TOKEN disponível", () => expect(token.length > 0, "nenhum token no ambiente (opcional se a credencial do workspace funcionar)"), "aviso");
add("B. Conexão", "token com formato válido", () => (!token ? pass("sem token") : expect(/^(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]{20,}$/.test(token), "formato de token desconhecido")), "aviso");
add("B. Conexão", "leitura do upstream com o token", () => (!token ? pass("sem token") : expect(network().auth, `o GitHub recusou o token (${network().authErr.split("\n")[0]})`)));
add("B. Conexão", "existe ao menos uma credencial que funciona", () => { const n = network(); return expect(n.plain || n.auth, "nenhuma credencial lê o upstream configurado"); });
add("B. Conexão", "branch configurada existe no GitHub sem fetch local", () => expect(Boolean(network().remoteSha), `branch ${UPSTREAM || "(upstream ausente)"} não foi encontrada no GitHub`));
add("B. Conexão", "ref de acompanhamento corresponde ao tip remoto", () => {
  const localSha = remoteRef().out;
  const current = network();
  return expect(Boolean(localSha && localSha === current.remoteSha), "a ref local está ausente ou desatualizada; o check não executa fetch");
}, "aviso");
add("B. Conexão", "permissão de escrita aceita push --dry-run sem alterar refs", () => {
  const result = testPushPermission();
  return result.ok ? pass(result.detail) : fail(`sem permissão de push: ${result.detail}`);
}, "aviso");
add("B. Conexão", "sem pedido interativo de senha", () => expect(!/terminal prompts disabled|could not read Username/i.test(network().plainErr), "o git pede usuário/senha: a credencial do workspace não está configurada"), "aviso");

// C. Divergência entre os lados (9)
const counts = () => {
  if (!UPSTREAM) return { ahead: 0, behind: 0, ok: false };
  const r = git(["rev-list", "--left-right", "--count", `HEAD...${UPSTREAM}`]);
  const [a, b] = r.out.split(/\s+/).map(Number);
  return { ahead: a || 0, behind: b || 0, ok: r.code === 0 };
};
add("C. Divergência", "base comum com o upstream do GitHub", () => expect(Boolean(UPSTREAM) && gitOk(["merge-base", "HEAD", UPSTREAM]), "históricos sem ancestral comum"));
add("C. Divergência", "não está atrás do GitHub", () => { const c = counts(); return expect(c.ok && c.behind === 0, `${c.behind} commit(s) do GitHub ainda não trazidos`); }, "aviso");
add("C. Divergência", "sem commits locais não enviados", () => { const c = counts(); return expect(c.ok && c.ahead === 0, `${c.ahead} commit(s) locais ainda não enviados`); }, "aviso");
add("C. Divergência", "lados não divergiram ao mesmo tempo", () => { const c = counts(); return expect(!(c.ahead > 0 && c.behind > 0), `divergência: ${c.ahead} local × ${c.behind} remoto (precisa de merge)`); }, "aviso");
add("C. Divergência", "sem alterações não commitadas", () => expect(git(["status", "--porcelain", "--untracked-files=no"]).out === "", "há arquivos modificados sem commit"), "aviso");
add("C. Divergência", "sem arquivos novos esquecidos", () => { const u = git(["ls-files", "--others", "--exclude-standard"]).out.split("\n").filter(Boolean); return expect(u.length === 0, `${u.length} arquivo(s) novo(s) fora do git: ${u.slice(0, 3).join(", ")}`); }, "aviso");
add("C. Divergência", "sem stash esquecido", () => expect(git(["stash", "list"]).out === "", "há alterações guardadas no stash"), "aviso");
add("C. Divergência", "sem arquivos em conflito no índice", () => expect(git(["diff", "--name-only", "--diff-filter=U"]).out === "", "arquivos em conflito no índice"));
add("C. Divergência", "merge simulado sem conflitos", () => {
  const r = git(["merge-tree", "--write-tree", "--name-only", "HEAD", UPSTREAM]);
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
add("D. Integridade", ".sync-out ignorado recursivamente", () => expect(git(["check-ignore", "-q", ".sync-out/LEIA-ME.txt"]).code === 0, ".sync-out/ não está ignorado"));
add("D. Integridade", "manifesto do artefato Ícaro presente", () => expect(exists("artifacts/icaro/.replit-artifact/artifact.toml"), "manifesto do artefato ausente"));

// E. Funcionalidades atuais do Ícaro continuam no código (30)
const feat = (name: string, rel: string, re?: RegExp) => add("E. Funcionalidades", name, () => (re ? expect(has(rel, re), `${rel}: trecho esperado não encontrado`) : expect(exists(rel), `${rel} ausente`)));
feat("manifesto raiz do workspace", "package.json", /"private"\s*:\s*true/);
feat("configuração do pnpm workspace", "pnpm-workspace.yaml", /artifacts\/\*/);
feat("manifesto do artefato Ícaro", "artifacts/icaro/.replit-artifact/artifact.toml");
feat("aplicação da API", "artifacts/api-server/src/app.ts", /app\.use\("\/api"/);
feat("rota de autenticação", "artifacts/api-server/src/routes/auth.ts");
feat("rota de IA", "artifacts/api-server/src/routes/ai.ts");
feat("rota de cosmos", "artifacts/api-server/src/routes/cosmos.ts");
feat("rota pública do ITCONT", "artifacts/api-server/src/routes/itcont.ts");
feat("contrato OpenAPI", "lib/api-spec/openapi.yaml");
feat("tipos Zod gerados", "lib/api-zod/src/generated/api.ts");
feat("cliente HTTP gerado", "lib/api-client-react/src/generated/api.ts");
feat("entrada React", "artifacts/icaro/src/App.tsx");
feat("bootstrap React", "artifacts/icaro/src/main.tsx");
feat("shell do app", "artifacts/icaro/src/components/app-shell.tsx");
feat("palco do Ícaro", "artifacts/icaro/src/pages/stage.tsx");
feat("visão geral", "artifacts/icaro/src/pages/overview.tsx");
feat("análise", "artifacts/icaro/src/pages/analysis.tsx");
feat("copiloto", "artifacts/icaro/src/pages/assistant.tsx");
feat("administração do cérebro", "artifacts/icaro/src/pages/admin-cerebro.tsx");
feat("tela de login", "artifacts/icaro/src/components/login/login-gate.tsx");
feat("limite de erros da interface", "artifacts/icaro/src/components/error-boundary.tsx");
feat("login usa senha de administrador configurada", "artifacts/api-server/src/lib/auth.ts", /ICARO_ADMIN_PASSWORD/);
feat("login usa senha de usuário configurada", "artifacts/api-server/src/lib/auth.ts", /ICARO_USER1_PASSWORD/);
feat("roteamento de provedores", "artifacts/api-server/src/lib/provider-router.ts");
feat("banco de conhecimento atual", "artifacts/api-server/src/lib/knowledge-bank.ts");
feat("camadas do cérebro", "artifacts/api-server/src/lib/cerebro-camadas.ts");
feat("fala do avatar", "artifacts/icaro/src/lib/speech.ts");
feat("controle do turno de wake", "artifacts/icaro/src/lib/wake-turn-gate.ts");
feat("atalhos do palco", "artifacts/icaro/src/lib/stage-shortcuts.ts");
feat("rosto holográfico em canvas", "artifacts/icaro/src/components/stage/holo-face.tsx", /<canvas/);

// F. Comportamento atual (20)
add("F. Comportamento", "banco tem categorias e cobertura mínima", () => expect(
  KNOWLEDGE_BANK.length >= 24
    && KNOWLEDGE_BANK.some((entry) => entry.category === "evento")
    && KNOWLEDGE_BANK.some((entry) => entry.category === "contabilidade")
    && KNOWLEDGE_BANK.some((entry) => entry.category === "tecnologia"),
  `entradas=${KNOWLEDGE_BANK.length}`,
));
add("F. Comportamento", "IDs do banco são únicos", () => {
  const ids = KNOWLEDGE_BANK.map((entry) => entry.id);
  return expect(new Set(ids).size === ids.length, "IDs duplicados");
});
add("F. Comportamento", "normalização de conhecimento preserva o sentido", () => expect(
  normalizeKnowledgeText(" QUANDO será o I-ITCONT?! ") === "quando sera o itcont",
  "normalização inesperada",
));
add("F. Comportamento", "data do ITCONT é resolvida localmente", () => expect(
  resolveKnowledgeAnswer("Quando será o I ITCONT?")?.id === "itcont-data",
  "pergunta de data não foi resolvida",
));
add("F. Comportamento", "local do ITCONT é resolvido localmente", () => expect(
  resolveKnowledgeAnswer("Onde vai acontecer a imersão tecnológica contábil?")?.id === "itcont-local",
  "pergunta de local não foi resolvida",
));
add("F. Comportamento", "certificação responde com frequência mínima", () => expect(
  /75 por cento/.test(resolveKnowledgeAnswer("Como recebo o certificado do ITCONT?")?.answer ?? ""),
  "resposta de certificação ausente ou incompleta",
));
add("F. Comportamento", "DRE responde com explicação curta e falável", () => {
  const hit = resolveKnowledgeAnswer("O que é DRE?");
  return expect(hit?.id === "contabilidade-dre" && hit.answer.length <= 420 && !/[#*_`>\[]/.test(hit.answer), "resposta DRE inválida");
});
add("F. Comportamento", "pergunta vaga não é adivinhada", () => expect(
  resolveKnowledgeAnswer("E onde será?") === null && resolveKnowledgeAnswer("Me fale mais sobre isso") === null,
  "pergunta contextual foi respondida sem contexto",
));
add("F. Comportamento", "tema legal atual segue para provedor remoto", () => expect(
  resolveKnowledgeAnswer("Qual é a alíquota atual?") === null
    && resolveKnowledgeAnswer("Qual é a cotação do dólar hoje?") === null,
  "tema atual foi respondido pelo banco local",
));
add("F. Comportamento", "pergunta específica vence gatilho genérico", () => {
  const hit = resolveKnowledgeAnswer("Ícaro, explique contabilidade de custos");
  return expect(hit?.id === "contabilidade-custos", `foi para ${hit?.id ?? "nada"}`);
});
add("F. Comportamento", "contrato não oferece provedor local como entrada", () => {
  const spec = read("lib/api-spec/openapi.yaml");
  const input = spec.slice(spec.indexOf("AiChatInput:"), spec.indexOf("AiChatResponse:"));
  const providers = input.match(/^\s+enum:\s*\[([^\]]+)\]/m)?.[1].split(",").map((value) => value.trim()) ?? [];
  return expect(
    providers.includes("auto") && providers.includes("groq") && providers.includes("claude") && !providers.includes("local"),
    "provedor local alterou o contrato de entrada",
  );
});
add("F. Comportamento", "contrato permite provider local apenas na resposta", () => {
  const spec = read("lib/api-spec/openapi.yaml");
  const response = spec.slice(spec.indexOf("AiChatResponse:"));
  const providers = response.match(/^\s+enum:\s*\[([^\]]+)\]/m)?.[1].split(",").map((value) => value.trim()) ?? [];
  return expect(
    providers.includes("auto") && providers.includes("groq") && providers.includes("local"),
    "provider local ausente da resposta OpenAPI",
  );
});
add("F. Comportamento", "fala de Ícaro mantém limite de tokens", () => expect(
  has("artifacts/api-server/src/routes/ai.ts", /const responseTokenLimit = input\.persona === "icaro" \? 1024 : 8192/),
  "limite de tokens não encontrado",
));
add("F. Comportamento", "comando wake reconhece ativação sem pergunta", () => {
  const parsed = parseWakeCommand("Ok, Ícaro", false);
  return expect(parsed.wake && parsed.question === "", "ativação vazia gerou pergunta");
});
add("F. Comportamento", "fala ambiente não ativa o turno", () => {
  const gate = new WakeTurnGate();
  return expect(gate.receive("bom dia turma", true, 0, 0, false).length === 0 && !gate.active, "fala ambiente abriu um turno");
});
add("F. Comportamento", "uma ativação permite exatamente uma pergunta", () => {
  const gate = new WakeTurnGate();
  gate.receive("Ok Ícaro", true, 0, 0, false);
  const first = gate.receive("Qual é a data?", true, 1, 100, false);
  const second = gate.receive("Qual é a data?", true, 1, 200, false);
  return expect(first.filter((event) => event.type === "question").length === 1 && second.length === 0, "pergunta duplicada ou perdida");
});
add("F. Comportamento", "pergunta parcial completa sem duplicação", () => {
  const gate = new WakeTurnGate();
  gate.arm(0);
  gate.receive("Ok Ícaro quando será", false, 3, 10, false);
  const partial = gate.commitInterim(3, "quando será o ITCONT", 560);
  const final = gate.receive("Ok Ícaro quando será o ITCONT", true, 3, 900, false);
  return expect(partial.filter((event) => event.type === "question").length === 1 && final.length === 0, "interim e final não foram deduplicados");
});
add("F. Comportamento", "atalho Enter é desativado em campo de texto", () => {
  const base: ShortcutEvent = {
    key: "Enter", repeat: false, ctrlKey: false, metaKey: false, altKey: false,
    shiftKey: false, defaultPrevented: false, target: { tagName: "INPUT" },
  };
  return expect(!shouldActivateStageShortcut(base, { panelOpen: false, helpOpen: false }), "atalho capturou Enter de um input");
});
add("F. Comportamento", "atalhos respeitam painel e ajuda abertos", () => {
  const base: ShortcutEvent = {
    key: "Enter", repeat: false, ctrlKey: false, metaKey: false, altKey: false,
    shiftKey: false, defaultPrevented: false, target: null,
  };
  return expect(
    !shouldActivateStageShortcut(base, { panelOpen: true, helpOpen: false })
      && !shouldActivateStageShortcut(base, { panelOpen: false, helpOpen: true }),
    "atalho ativo com painel/ajuda abertos",
  );
});
add("F. Comportamento", "política de segurança bloqueia escrita direta em main", () => {
  const plan = planSyncRepair({
    actualRepository: remoteDetails().repository,
    targetBranch: "main",
    apiAccess: "available",
    authorization: "authorized",
    targetBranchState: "absent",
    baseVerified: true,
    hasConflict: false,
    includeUncommitted: false,
  });
  return expect(plan.outcome === "blocked" && plan.updateMain === false, "a política permitiu escrita direta em main");
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
  const base = remoteRef().code === 0 ? UPSTREAM : git(["rev-list", "--max-parents=0", "HEAD"]).out.split("\n")[0];
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

const REQUIRED_VALIDATIONS: Array<{ name: string; args: string[] }> = [
  { name: "typecheck completo do workspace", args: ["run", "typecheck"] },
  { name: "100 validações de saúde atuais", args: ["--filter", "@workspace/scripts", "run", "validate:health-100"] },
  { name: "reconhecimento wake", args: ["--filter", "@workspace/scripts", "exec", "tsx", "./src/validate-wake.ts"] },
  { name: "atalhos do palco", args: ["--filter", "@workspace/scripts", "exec", "tsx", "./src/validate-stage-shortcuts.ts"] },
  { name: "saída de voz", args: ["--filter", "@workspace/scripts", "run", "validate:voice"] },
  { name: "avatar e holograma", args: ["--filter", "@workspace/scripts", "run", "validate:hologram"] },
];

function safeValidationOutput(output: string) {
  return mask(output)
    .replace(/\b(?:gh[pousr]_|github_pat_|gsk_|AIza)[A-Za-z0-9_-]{20,}/g, "***")
    .replace(/\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}/g, "***");
}

function runRequiredValidations() {
  let passed = true;
  for (const validation of REQUIRED_VALIDATIONS) {
    const result = spawnSync("pnpm", validation.args, {
      cwd: REPO,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      encoding: "utf8",
      timeout: 180_000,
      maxBuffer: 16 * 1024 * 1024,
    });
    if (result.status === 0) {
      console.log(`  ✓ ${validation.name}`);
      continue;
    }
    passed = false;
    const detail = result.error?.message || `código ${result.status ?? "indisponível"}`;
    console.log(`  ✗ ${validation.name} — ${detail}`);
    const output = safeValidationOutput(`${result.stdout ?? ""}\n${result.stderr ?? ""}`).trim();
    if (output) {
      for (const line of output.split(/\r?\n/).slice(-20)) console.log(`    ${line}`);
    }
  }
  return passed;
}

/** Commita o que houver de alteração local segura; devolve false se não havia nada. */
function commitLocal(): boolean {
  gitOk(SAFE_ADD);
  if (gitOk(["diff", "--cached", "--quiet"])) return false; // só arquivos ignorados (ex.: .log)
  const c = git(["commit", "-q", "-m", `sync: alterações locais ${new Date().toISOString().slice(0, 16)}`]);
  if (c.code !== 0) stop(`não consegui commitar: ${c.err || c.out}`);
  return true;
}

async function fix() {
  if (exists(".git/index.lock")) stop("Há um .git/index.lock: confirme que nenhum git está rodando e apague o arquivo.");
  if (exists(".git/rebase-merge") || exists(".git/rebase-apply")) stop("Há um rebase pendente: termine com `git rebase --continue` ou desfaça com `git rebase --abort`.");
  if (exists(".git/MERGE_HEAD")) stop("Há um merge pendente: resolva os conflitos e faça commit, ou rode sync:fix -- --abort.");
  if (!CURRENT_BRANCH || git(["branch", "--show-current"]).out !== CURRENT_BRANCH) stop("A branch atual mudou durante a execução; nada foi sincronizado.");
  if (!REMOTE || !BRANCH || !UPSTREAM) stop("A branch atual não tem um upstream remoto configurado; nada foi alterado.");

  log("1/7 Preflight somente leitura");
  const preflight = await runChecks();
  report(preflight);
  const preflightErrors = preflight.filter((result) => !result.ok && result.severity === "erro");
  if (preflightErrors.length) {
    stop("Preflight reprovado. Nenhum commit, fetch ou push foi executado.", 2);
  }

  log("2/7 Suítes críticas");
  if (!runRequiredValidations()) {
    stop("Uma ou mais validações críticas falharam. Nenhum commit, fetch ou push foi executado.", 2);
  }

  log("3/7 Credenciais");
  const n = network();
  const auth = !n.plain && n.auth;
  if (!n.plain && !n.auth) {
    stop(`Sem acesso de leitura ao upstream: ${n.plainErr || n.authErr}. Nenhum commit, fetch ou push foi executado.`, 3);
  }
  if (token && !n.auth) stop(`O token não foi aceito pelo GitHub: ${n.authErr}. Nenhum commit, fetch ou push foi executado.`, 3);
  console.log(`  usando ${auth ? "o token GITHUB_TOKEN (só neste comando)" : "a credencial do workspace"}.`);

  log("4/7 Alterações locais");
  console.log(commitLocal() ? "  alterações locais guardadas num commit." : "  nada pendente.");

  log("5/7 Buscando o upstream configurado");
  const f = git(["fetch", REMOTE, BRANCH], { auth, timeout: 120_000 });
  if (f.code !== 0) { exportChanges(`fetch falhou: ${f.err}`); stop(`fetch falhou: ${f.err}`, 3); }
  const { ahead, behind } = counts();
  console.log(`  local à frente: ${ahead} · GitHub à frente: ${behind}`);

  log("6/7 Juntando os dois lados (sem descartar nada)");
  if (behind > 0) {
    const m = git(["merge", "--no-ff", "--no-commit", UPSTREAM]);
    const conflicts = git(["diff", "--name-only", "--diff-filter=U"]).out.split("\n").filter(Boolean);
    if (conflicts.length) {
      console.log("  conflitos que precisam de decisão:");
      for (const c of conflicts) console.log(`    • ${c}`);
      stop("Resolva os conflitos (mantendo as duas versões), faça commit e rode sync:fix de novo. Para desfazer: sync:fix -- --abort.", 2);
    }
    if (m.code !== 0 && !exists(".git/MERGE_HEAD")) stop(`merge falhou: ${m.err}`);
    // Antes de concluir: o resultado não pode ter perdido funcionalidades entregues.
    const guard = await runChecks((c) => c.group.startsWith("D.") || c.group.startsWith("E.") || c.group.startsWith("F."));
    const lost = guard.filter((r) => !r.ok && r.severity === "erro");
    const validationsPass = runRequiredValidations();
    if (lost.length || !validationsPass) {
      git(["merge", "--abort"]);
      for (const r of lost) console.log(`    ✗ ${r.name} — ${r.detail}`);
      stop("As verificações após o merge falharam. Merge desfeito; nada foi enviado.", 2);
    }
    if (exists(".git/MERGE_HEAD")) gitOk(["commit", "-q", "--no-edit"]);
    console.log("  merge concluído e conferido.");
  } else console.log("  o GitHub não tem nada novo.");

  log("7/7 Enviando ao upstream");
  if (counts().ahead > 0) {
    pushProbe = null;
    const permission = testPushPermission();
    if (!permission.ok) {
      exportChanges(`push --dry-run falhou: ${permission.detail}`);
      stop(`Push não aprovado pelo GitHub: ${permission.detail}. Nenhum envio foi feito.`, 3);
    }
    const p = git(["push", REMOTE, `HEAD:${BRANCH}`], { auth: permission.auth, timeout: 120_000 });
    if (p.code !== 0) {
      exportChanges(`push falhou: ${p.err}`);
      stop(`push falhou: ${p.err.split("\n")[0]}`, 3);
    }
    console.log("  enviado.");
  } else console.log("  nada a enviar.");

  log("Conferência final");
  const final = await runChecks();
  report(final);
  const errors = final.filter((r) => !r.ok && r.severity === "erro").length;
  stop(errors ? "Sincronizado, mas há erros acima para revisar." : "Sincronização do upstream concluída.", errors ? 1 : 0);
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
