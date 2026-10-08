import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ApproveCerebroCandidateBody,
  SendAiMessageBody,
  SpeakAiTextBody,
  SynthesizeTtsTimestampsBody,
} from "../../lib/api-zod/src/generated/api";
import {
  isSafeGitBranchName,
  parseGitHubRemote,
  planSyncRepair,
} from "./sync-repair-policy";

export const PROJECT_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);

type Area = "icaro" | "sync";
type Check = { id: string; area: Area; name: string; run: () => void };
export type CheckResult = Check & {
  passed: boolean;
  error?: string;
};

const checks: Check[] = [];
let icaroCount = 0;
let syncCount = 0;

function add(area: Area, name: string, run: () => void) {
  const sequence = area === "icaro" ? ++icaroCount : ++syncCount;
  const prefix = area === "icaro" ? "IC" : "GH";
  checks.push({
    id: `${prefix}-${String(sequence).padStart(2, "0")}`,
    area,
    name,
    run,
  });
}

function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function fileExists(path: string) {
  return existsSync(resolve(PROJECT_ROOT, path));
}

function readText(path: string) {
  const absolute = resolve(PROJECT_ROOT, path);
  if (!existsSync(absolute)) throw new Error(`Arquivo ausente: ${path}`);
  return readFileSync(absolute, "utf8");
}

function readJson(path: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(readText(path));
  expect(
    typeof parsed === "object" && parsed !== null && !Array.isArray(parsed),
    `${path} não contém um objeto JSON.`,
  );
  return parsed as Record<string, unknown>;
}

function hasScript(packagePath: string, scriptName: string) {
  const pkg = readJson(packagePath);
  const scripts = pkg.scripts;
  return (
    typeof scripts === "object" &&
    scripts !== null &&
    !Array.isArray(scripts) &&
    typeof (scripts as Record<string, unknown>)[scriptName] === "string"
  );
}

function git(args: string[]) {
  try {
    return execFileSync("git", args, {
      cwd: PROJECT_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    return null;
  }
}

function hasGitPath(path: string) {
  const gitPath = git(["rev-parse", "--git-path", path]);
  if (!gitPath) return false;
  return existsSync(resolve(PROJECT_ROOT, gitPath));
}

function remoteDetails() {
  const remoteUrl = git(["remote", "get-url", "github"]);
  return remoteUrl ? parseGitHubRemote(remoteUrl) : null;
}

function gitStatusEntries() {
  const status = git(["status", "--porcelain=v1", "--untracked-files=all"]);
  return status === null ? null : status ? status.split("\n") : [];
}

function isValid(schema: { safeParse(value: unknown): { success: boolean } }, value: unknown) {
  return schema.safeParse(value).success;
}

function chatBody(overrides: Record<string, unknown> = {}) {
  return {
    provider: "groq",
    persona: "icaro",
    question: "Explique o fluxo contábil.",
    history: [],
    dataset: null,
    knowledgeMode: "auto",
    ...overrides,
  };
}

function textOfLength(length: number) {
  return "á".repeat(length);
}

const healthProviders = [
  "groq",
  "gemini",
  "cerebras",
  "openrouter",
  "mistral",
  "github",
  "nvidia",
  "cloudflare",
  "huggingface",
  "cohere",
  "openai",
  "claude",
] as const;

const validStatus = {
  geminiAvailable: false,
  openaiAvailable: false,
  groqAvailable: true,
  claudeAvailable: false,
  speechAvailable: false,
  providers: healthProviders.map((id) => ({
    id,
    name: id,
    configured: true,
    available: true,
    state: "ready",
    model: `${id}-model`,
    privacyNote: "estado de teste",
    averageFirstTokenMs: null,
    errorRate: 0,
    cooldownMs: 0,
  })),
};

function goodSyncInput(
  overrides: Partial<Parameters<typeof planSyncRepair>[0]> = {},
) {
  return {
    actualRepository: "Dev-kenshi/Icaro",
    targetBranch: "replit-sync",
    apiAccess: "available" as const,
    authorization: "authorized" as const,
    targetBranchState: "absent" as const,
    baseVerified: true,
    hasConflict: false,
    includeUncommitted: false,
    ...overrides,
  };
}

function addIcaroChecks() {
  add("icaro", "manifesto raiz é privado e válido", () => {
    const pkg = readJson("package.json");
    expect(pkg.name === "workspace" && pkg.private === true, "manifesto raiz incompatível.");
  });
  add("icaro", "instalação do workspace exige pnpm", () => {
    expect(readText("package.json").includes("Use pnpm"), "guarda de pnpm ausente.");
  });
  add("icaro", "workspace e configuração TypeScript existem", () => {
    expect(fileExists("pnpm-workspace.yaml") && fileExists("tsconfig.base.json"), "configuração do workspace incompleta.");
  });
  add("icaro", "manifesto do artefato Ícaro existe", () => {
    expect(readText("artifacts/icaro/.replit-artifact/artifact.toml").length > 20, "manifesto vazio.");
  });
  add("icaro", "pacotes do Ícaro, API e scripts declaram comandos essenciais", () => {
    expect(
      hasScript("artifacts/icaro/package.json", "dev") &&
        hasScript("artifacts/icaro/package.json", "typecheck") &&
        hasScript("artifacts/api-server/package.json", "start") &&
        hasScript("artifacts/api-server/package.json", "typecheck") &&
        hasScript("scripts/package.json", "typecheck"),
      "scripts essenciais de um ou mais pacotes estão ausentes.",
    );
  });
  add("icaro", "validadores E2E, API, cérebro, voz e holograma permanecem registrados", () => {
    expect(
      hasScript("scripts/package.json", "validate:e2e") &&
        hasScript("scripts/package.json", "validate:api-1000") &&
        hasScript("scripts/package.json", "validate:cerebro-200") &&
        hasScript("scripts/package.json", "validate:voice") &&
        hasScript("scripts/package.json", "validate:hologram"),
      "um ou mais validadores principais não estão registrados.",
    );
  });
  add("icaro", "validadores wake e atalhos existem", () => {
    expect(fileExists("scripts/src/validate-wake.ts") && fileExists("scripts/src/validate-stage-shortcuts.ts"), "validador de wake/atalhos ausente.");
  });
  add("icaro", "contrato OpenAPI e configuração de geração existem", () => {
    expect(fileExists("lib/api-spec/openapi.yaml") && fileExists("lib/api-spec/orval.config.ts"), "fonte de contrato ou gerador ausente.");
  });
  add("icaro", "clientes gerados existem", () => {
    expect(fileExists("lib/api-zod/src/generated/api.ts") && fileExists("lib/api-client-react/src/generated/api.ts"), "cliente gerado ausente.");
  });
  add("icaro", "entrada e shell do app existem", () => {
    expect(fileExists("artifacts/icaro/src/App.tsx") && fileExists("artifacts/icaro/src/main.tsx") && fileExists("artifacts/icaro/src/components/app-shell.tsx"), "estrutura principal do app incompleta.");
  });
  add("icaro", "visão geral e análise permanecem no app", () => {
    expect(fileExists("artifacts/icaro/src/pages/overview.tsx") && fileExists("artifacts/icaro/src/pages/analysis.tsx"), "páginas de visão geral/análise ausentes.");
  });
  add("icaro", "copiloto e administração permanecem no app", () => {
    expect(fileExists("artifacts/icaro/src/pages/assistant.tsx") && fileExists("artifacts/icaro/src/pages/admin-cerebro.tsx"), "página do copiloto ou administração ausente.");
  });
  add("icaro", "palco, login e tratamento de erro existem", () => {
    expect(fileExists("artifacts/icaro/src/pages/stage.tsx") && fileExists("artifacts/icaro/src/components/login/login-gate.tsx") && fileExists("artifacts/icaro/src/components/error-boundary.tsx"), "fluxo principal do app incompleto.");
  });
  add("icaro", "rotas essenciais da API existem", () => {
    expect(fileExists("artifacts/api-server/src/routes/ai.ts") && fileExists("artifacts/api-server/src/routes/auth.ts") && fileExists("artifacts/api-server/src/routes/health.ts"), "rotas essenciais ausentes.");
  });
  add("icaro", "API é montada sob o prefixo /api", () => {
    expect(readText("artifacts/api-server/src/app.ts").includes('app.use("/api", router)'), "prefixo /api não encontrado.");
  });
  add("icaro", "contrato declara chat, voz e status; login tem rota própria", () => {
    const spec = readText("lib/api-spec/openapi.yaml");
    const authRoutes = readText("artifacts/api-server/src/routes/auth.ts");
    for (const route of ["/healthz:", "/ai/chat:", "/ai/tts:", "/ai/status:"]) {
      expect(spec.includes(route), `rota ${route} ausente no OpenAPI.`);
    }
    expect(authRoutes.includes('router.post("/auth/login"'), "rota de login ausente no roteador de autenticação.");
  });
  add("icaro", "microfone possui nome acessível e identificador E2E", () => {
    const stage = readText("artifacts/icaro/src/pages/stage.tsx");
    expect(stage.includes('data-testid="button-mic"') && stage.includes("aria-label={recording"), "controle de microfone sem contrato acessível/E2E.");
  });
  add("icaro", "legenda é anunciada ao leitor de tela", () => {
    const stage = readText("artifacts/icaro/src/pages/stage.tsx");
    expect(stage.includes('data-testid="text-caption"') && stage.includes('aria-live="polite"'), "região viva da legenda ausente.");
  });
  add("icaro", "painel preserva navegação e controles acessíveis", () => {
    const stage = readText("artifacts/icaro/src/pages/stage.tsx");
    const shell = readText("artifacts/icaro/src/components/app-shell.tsx");
    expect(stage.includes('data-testid="button-open-panel"') && stage.includes('aria-controls="icaro-panel"') && shell.includes("'/overview'") && shell.includes("'/analysis'"), "controles ou navegação do painel incompletos.");
  });
  add("icaro", "boca usa a medição real do avatar", () => {
    const face = readText("artifacts/icaro/src/components/stage/holo-face.tsx");
    const avatar = readText("artifacts/icaro/src/lib/icaro-avatar.ts");
    expect(
      avatar.includes("mouth: { open: { x: number } }") &&
        face.includes("avatarRef.current?.mouth.open.x") &&
        face.includes("mouthOpen.toFixed(3)"),
      "medição da boca do avatar não chega ao controle visual.",
    );
  });
  add("icaro", "escuta local, banco de conhecimento e README permanecem", () => {
    const wake = readText("artifacts/icaro/src/hooks/use-wake-listener.ts");
    const bank = readText("artifacts/api-server/src/lib/knowledge-bank.ts");
    expect(wake.includes("processLocally") && fileExists("artifacts/icaro/src/lib/wake-turn-gate.ts"), "reconhecimento local ou gate de wake ausente.");
    expect(bank.includes("triggers") && bank.includes("answer:"), "estrutura do banco de conhecimento incompleta.");
    expect(fileExists("vendor/icaro-humano/README.md"), "README do avatar ausente.");
  });

  add("icaro", "TTS aceita texto curto", () => {
    expect(isValid(SpeakAiTextBody, { text: "Olá, Ícaro." }), "texto curto foi rejeitado.");
  });
  add("icaro", "TTS aceita acentos em português", () => {
    expect(isValid(SpeakAiTextBody, { text: "Contabilidade, patrimônio e conciliação." }), "texto acentuado foi rejeitado.");
  });
  add("icaro", "TTS aceita o limite de 1.200 caracteres", () => {
    expect(isValid(SpeakAiTextBody, { text: textOfLength(1_200) }), "limite de TTS foi rejeitado.");
  });
  add("icaro", "TTS rejeita texto vazio", () => {
    expect(!isValid(SpeakAiTextBody, { text: "" }), "texto vazio foi aceito.");
  });
  add("icaro", "TTS rejeita texto acima do limite", () => {
    expect(!isValid(SpeakAiTextBody, { text: textOfLength(1_201) }), "texto acima do limite foi aceito.");
  });
  add("icaro", "TTS rejeita null", () => {
    expect(!isValid(SpeakAiTextBody, { text: null }), "null foi aceito.");
  });
  add("icaro", "TTS rejeita tipo numérico", () => {
    expect(!isValid(SpeakAiTextBody, { text: 42 }), "número foi aceito como texto.");
  });
  add("icaro", "chat aceita provedor Groq e persona Ícaro", () => {
    expect(isValid(SendAiMessageBody, chatBody()), "envelope de chat válido foi rejeitado.");
  });
  add("icaro", "chat aceita provedor automático e persona analista", () => {
    expect(isValid(SendAiMessageBody, chatBody({ provider: "auto", persona: "analyst" })), "combinação válida de chat foi rejeitada.");
  });
  add("icaro", "chat rejeita provedor desconhecido", () => {
    expect(!isValid(SendAiMessageBody, chatBody({ provider: "unknown" })), "provedor desconhecido foi aceito.");
  });
  add("icaro", "chat rejeita pergunta vazia", () => {
    expect(!isValid(SendAiMessageBody, chatBody({ question: "" })), "pergunta vazia foi aceita.");
  });
  add("icaro", "chat aceita pergunta no limite", () => {
    expect(isValid(SendAiMessageBody, chatBody({ question: textOfLength(4_000) })), "pergunta no limite foi rejeitada.");
  });
  add("icaro", "chat rejeita pergunta acima do limite", () => {
    expect(!isValid(SendAiMessageBody, chatBody({ question: textOfLength(4_001) })), "pergunta acima do limite foi aceita.");
  });
  add("icaro", "chat aceita histórico vazio", () => {
    expect(isValid(SendAiMessageBody, chatBody({ history: [] })), "histórico vazio foi rejeitado.");
  });
  add("icaro", "chat aceita até 12 mensagens no histórico", () => {
    const history = Array.from({ length: 12 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: `mensagem ${i}` }));
    expect(isValid(SendAiMessageBody, chatBody({ history })), "histórico no limite foi rejeitado.");
  });
  add("icaro", "chat rejeita histórico acima de 12 mensagens", () => {
    const history = Array.from({ length: 13 }, () => ({ role: "user", content: "mensagem" }));
    expect(!isValid(SendAiMessageBody, chatBody({ history })), "histórico acima do limite foi aceito.");
  });
  add("icaro", "chat rejeita papel de sistema no histórico", () => {
    expect(!isValid(SendAiMessageBody, chatBody({ history: [{ role: "system", content: "não permitido" }] })), "papel system foi aceito.");
  });
  add("icaro", "chat rejeita mensagem individual muito longa", () => {
    expect(!isValid(SendAiMessageBody, chatBody({ history: [{ role: "user", content: textOfLength(4_001) }] })), "mensagem do histórico acima do limite foi aceita.");
  });
  add("icaro", "chat aceita dataset nulo", () => {
    expect(isValid(SendAiMessageBody, chatBody({ dataset: null })), "dataset nulo foi rejeitado.");
  });
  add("icaro", "chat aceita dataset tabular válido", () => {
    const dataset = { name: "Resumo", columns: ["receita"], sampleRows: [{ receita: "100" }] };
    expect(isValid(SendAiMessageBody, chatBody({ dataset })), "dataset válido foi rejeitado.");
  });
  add("icaro", "chat rejeita dataset com mais de 60 colunas", () => {
    const dataset = { name: "Dados", columns: Array.from({ length: 61 }, (_, i) => `coluna-${i}`), sampleRows: [] };
    expect(!isValid(SendAiMessageBody, chatBody({ dataset })), "dataset com excesso de colunas foi aceito.");
  });
  add("icaro", "chat rejeita dataset com mais de 50 linhas de amostra", () => {
    const dataset = { name: "Dados", columns: [], sampleRows: Array.from({ length: 51 }, () => ({})) };
    expect(!isValid(SendAiMessageBody, chatBody({ dataset })), "dataset com excesso de linhas foi aceito.");
  });
  add("icaro", "timestamps de voz aceitam envelope básico", () => {
    expect(isValid(SynthesizeTtsTimestampsBody, { text: "Olá, Ícaro.", previous_text: "" }), "envelope de timestamps válido foi rejeitado.");
  });
  add("icaro", "timestamps aceitam o limite de contexto anterior", () => {
    expect(isValid(SynthesizeTtsTimestampsBody, { text: "Olá", previous_text: textOfLength(1_200) }), "contexto anterior no limite foi rejeitado.");
  });
  add("icaro", "timestamps rejeitam texto acima de 600 caracteres", () => {
    expect(!isValid(SynthesizeTtsTimestampsBody, { text: textOfLength(601) }), "texto acima do limite foi aceito.");
  });
  add("icaro", "timestamps rejeitam contexto anterior acima de 1.200 caracteres", () => {
    expect(!isValid(SynthesizeTtsTimestampsBody, { text: "Olá", previous_text: textOfLength(1_201) }), "contexto acima do limite foi aceito.");
  });
  add("icaro", "aprovação aceita destino banco", () => {
    expect(isValid(ApproveCerebroCandidateBody, { destination: "bank" }), "destino bank foi rejeitado.");
  });
  add("icaro", "aprovação aceita destino base", () => {
    expect(isValid(ApproveCerebroCandidateBody, { destination: "base" }), "destino base foi rejeitado.");
  });
  add("icaro", "aprovação rejeita destino desconhecido", () => {
    expect(!isValid(ApproveCerebroCandidateBody, { destination: "remote" }), "destino remoto foi aceito.");
  });
}

function addSyncChecks() {
  const root = realpathSync(PROJECT_ROOT);
  const head = git(["rev-parse", "--verify", "HEAD^{commit}"]);
  const branch = git(["branch", "--show-current"]);
  const remotes = git(["remote"])?.split("\n").filter(Boolean) ?? [];
  const remote = remoteDetails();
  const statusEntries = gitStatusEntries();
  const mergeBase = git(["merge-base", "HEAD", "refs/remotes/github/main"]);
  const divergence = git([
    "rev-list",
    "--left-right",
    "--count",
    "refs/remotes/github/main...HEAD",
  ]);
  const gitDirValue = git(["rev-parse", "--git-dir"]);
  const gitDir = gitDirValue
    ? resolve(PROJECT_ROOT, gitDirValue)
    : resolve(PROJECT_ROOT, ".git");
  const gitMainPlan = planSyncRepair({
    actualRepository: remote?.repository ?? null,
    targetBranch: "main",
    apiAccess: "available",
    authorization: "authorized",
    targetBranchState: "absent",
    baseVerified: true,
    hasConflict: false,
    includeUncommitted: false,
  });
  const readyPlan = planSyncRepair({
    actualRepository: remote?.repository ?? null,
    targetBranch: "replit-sync",
    apiAccess: "available",
    authorization: "authorized",
    targetBranchState: "absent",
    baseVerified: true,
    hasConflict: false,
    includeUncommitted: false,
  });

  add("sync", "Git reconhece a raiz do workspace", () => {
    const top = git(["rev-parse", "--show-toplevel"]);
    expect(top !== null && realpathSync(top) === root, "a raiz Git não corresponde ao workspace.");
  });
  add("sync", "HEAD aponta para um commit válido", () => {
    expect(Boolean(head && /^[a-f0-9]{40,64}$/i.test(head)), "HEAD não é um SHA válido.");
  });
  add("sync", "objeto HEAD é commit", () => {
    expect(git(["cat-file", "-t", "HEAD"]) === "commit", "HEAD não resolve para commit.");
  });
  add("sync", "árvore de HEAD pode ser lida", () => {
    expect(Boolean(git(["rev-parse", "--verify", "HEAD^{tree}"])), "árvore do commit local ausente.");
  });
  add("sync", "branch local não está destacada", () => {
    expect(Boolean(branch), "HEAD está destacado.");
  });
  add("sync", "índice Git existe", () => {
    expect(hasGitPath("index"), "índice Git ausente.");
  });
  add("sync", "estado local pode ser lido sem expor nomes", () => {
    expect(statusEntries !== null, "git status falhou.");
  });
  add("sync", "há pelo menos um remoto configurado", () => {
    expect(remotes.length > 0, "nenhum remoto configurado.");
  });
  add("sync", "remoto GitHub está configurado", () => {
    expect(remotes.includes("github"), "remoto github ausente.");
  });
  add("sync", "ref de acompanhamento github/main existe", () => {
    expect(Boolean(git(["rev-parse", "--verify", "refs/remotes/github/main^{commit}"])), "ref github/main ausente.");
  });
  add("sync", "base comum com github/main pode ser calculada localmente", () => {
    expect(Boolean(mergeBase), "não foi encontrado um commit-base comum local.");
  });
  add("sync", "divergência local é numérica e legível", () => {
    expect(Boolean(divergence && /^\d+\s+\d+$/.test(divergence)), "contagem local/remota inválida.");
  });
  add("sync", "branch atual tem upstream", () => {
    expect(Boolean(git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"])), "upstream da branch atual ausente.");
  });
  add("sync", "índice não contém conflitos não resolvidos", () => {
    const conflicts = git(["diff", "--name-only", "--diff-filter=U"]);
    expect(conflicts === "", "há caminhos com conflito não resolvido.");
  });
  add("sync", "nenhum merge está em andamento", () => {
    expect(!existsSync(resolve(gitDir, "MERGE_HEAD")), "merge em andamento exige revisão.");
  });
  add("sync", "nenhum rebase está em andamento", () => {
    expect(!existsSync(resolve(gitDir, "rebase-apply")) && !existsSync(resolve(gitDir, "rebase-merge")), "rebase em andamento exige revisão.");
  });
  add("sync", "nenhum cherry-pick ou revert está em andamento", () => {
    expect(!existsSync(resolve(gitDir, "CHERRY_PICK_HEAD")) && !existsSync(resolve(gitDir, "REVERT_HEAD")), "operação de histórico em andamento.");
  });
  add("sync", "nome replit-sync segue formato seguro", () => {
    expect(isSafeGitBranchName("replit-sync"), "nome de destino inválido.");
  });
  add("sync", "main é recusada como destino de escrita", () => {
    expect(gitMainPlan.outcome === "blocked" && gitMainPlan.updateMain === false, "a política não bloqueou main.");
  });
  add("sync", "remoto github aponta para Dev-kenshi/Icaro", () => {
    expect(remote?.host === "github.com" && remote.repository?.toLowerCase() === "dev-kenshi/icaro", "remoto não corresponde ao repositório esperado.");
  });
  add("sync", "URL remota não contém credenciais embutidas", () => {
    expect(remote !== null && !remote.hasEmbeddedCredentials, "URL contém credenciais; elas não serão exibidas.");
  });
  add("sync", "alterações locais são contabilizadas sem limpar a árvore", () => {
    expect(Array.isArray(statusEntries), "snapshot de alterações locais indisponível.");
  });
  add("sync", "plano pronto não usa force update", () => {
    expect(readyPlan.outcome === "ready" && readyPlan.force === false, "plano de escrita não é fast-forward seguro.");
  });
  add("sync", "plano pronto nunca altera main", () => {
    expect(readyPlan.outcome === "ready" && readyPlan.updateMain === false, "plano pretende alterar main.");
  });
  add("sync", "auth/API indisponível exige ação manual", () => {
    const blocked = planSyncRepair({
      actualRepository: remote?.repository ?? null,
      targetBranch: "replit-sync",
      apiAccess: "unknown",
      authorization: "unknown",
      targetBranchState: "unknown",
      baseVerified: false,
      hasConflict: false,
      includeUncommitted: false,
    });
    expect(blocked.outcome === "manual" && !blocked.createBranch, "falta de OAuth deveria exigir ação manual sem escrita.");
  });
}

function addSyncPolicyCases() {
  const cases: Array<{ name: string; run: () => void }> = [
    {
      name: "bloqueia main",
      run: () => expect(planSyncRepair(goodSyncInput({ targetBranch: "main" })).outcome === "blocked", "main não foi bloqueada."),
    },
    {
      name: "bloqueia master",
      run: () => expect(planSyncRepair(goodSyncInput({ targetBranch: "master" })).outcome === "blocked", "master não foi bloqueada."),
    },
    {
      name: "bloqueia MAIN sem diferenciar maiúsculas",
      run: () => expect(planSyncRepair(goodSyncInput({ targetBranch: "MAIN" })).outcome === "blocked", "MAIN não foi bloqueada."),
    },
    {
      name: "bloqueia refs/heads/main",
      run: () => expect(planSyncRepair(goodSyncInput({ targetBranch: "refs/heads/main" })).outcome === "blocked", "ref protegida não foi bloqueada."),
    },
    {
      name: "bloqueia repositório diferente",
      run: () => expect(planSyncRepair(goodSyncInput({ actualRepository: "org/outro" })).outcome === "blocked", "remoto incorreto não foi bloqueado."),
    },
    {
      name: "bloqueia repositório desconhecido",
      run: () => expect(planSyncRepair(goodSyncInput({ actualRepository: null })).outcome === "blocked", "repositório desconhecido não foi bloqueado."),
    },
    {
      name: "pede ação manual quando API não está disponível",
      run: () => expect(planSyncRepair(goodSyncInput({ apiAccess: "unavailable" })).outcome === "manual", "API ausente não foi sinalizada."),
    },
    {
      name: "pede ação manual quando OAuth está ausente",
      run: () => expect(planSyncRepair(goodSyncInput({ authorization: "missing" })).outcome === "manual", "OAuth ausente não foi sinalizado."),
    },
    {
      name: "pede ação manual quando OAuth é negado",
      run: () => expect(planSyncRepair(goodSyncInput({ authorization: "denied" })).outcome === "manual", "OAuth negado não foi sinalizado."),
    },
    {
      name: "pede ação manual quando OAuth é desconhecido",
      run: () => expect(planSyncRepair(goodSyncInput({ authorization: "unknown" })).outcome === "manual", "OAuth desconhecido não foi sinalizado."),
    },
    {
      name: "não substitui branch existente",
      run: () => expect(planSyncRepair(goodSyncInput({ targetBranchState: "present" })).outcome === "manual", "branch existente seria substituída."),
    },
    {
      name: "não escreve sem confirmar se a branch existe",
      run: () => expect(planSyncRepair(goodSyncInput({ targetBranchState: "unknown" })).outcome === "manual", "branch não verificada seria alterada."),
    },
    {
      name: "pede revisão se a base não foi verificada",
      run: () => expect(planSyncRepair(goodSyncInput({ baseVerified: false })).outcome === "manual", "base não verificada foi aceita."),
    },
    {
      name: "pede revisão se houver conflito",
      run: () => expect(planSyncRepair(goodSyncInput({ hasConflict: true })).outcome === "manual", "conflito seria corrigido sem revisão."),
    },
    {
      name: "não inclui alterações não commitadas",
      run: () => expect(planSyncRepair(goodSyncInput({ includeUncommitted: true })).outcome === "manual", "alterações locais seriam incluídas."),
    },
    {
      name: "autoriza criar branch nova somente com todas as verificações",
      run: () => {
        const result = planSyncRepair(goodSyncInput());
        expect(result.outcome === "ready" && result.createCommit && result.createBranch, "plano seguro não ficou pronto.");
      },
    },
    {
      name: "plano seguro nunca usa force",
      run: () => expect(planSyncRepair(goodSyncInput()).force === false, "force update foi habilitado."),
    },
    {
      name: "plano seguro nunca atualiza main",
      run: () => expect(planSyncRepair(goodSyncInput()).updateMain === false, "main poderia ser alterada."),
    },
    {
      name: "plano seguro exclui alterações não commitadas",
      run: () => expect(planSyncRepair(goodSyncInput()).includeUncommitted === false, "alterações não commitadas foram incluídas."),
    },
    {
      name: "aceita a branch replit-sync",
      run: () => expect(planSyncRepair(goodSyncInput({ targetBranch: "replit-sync" })).outcome === "ready", "replit-sync foi recusada."),
    },
    {
      name: "aceita branch de trabalho não protegida",
      run: () => expect(planSyncRepair(goodSyncInput({ targetBranch: "feature/replit-sync" })).outcome === "ready", "branch segura foi recusada."),
    },
    {
      name: "bloqueia tentativa de escapar do namespace de refs",
      run: () => expect(planSyncRepair(goodSyncInput({ targetBranch: "../main" })).outcome === "blocked", "nome com traversal foi aceito."),
    },
    {
      name: "bloqueia nome de branch vazio",
      run: () => expect(planSyncRepair(goodSyncInput({ targetBranch: "" })).outcome === "blocked", "branch vazia foi aceita."),
    },
    {
      name: "compara o repositório sem diferenciar caixa",
      run: () => expect(planSyncRepair(goodSyncInput({ actualRepository: "dev-kenshi/icaro" })).outcome === "ready", "nome equivalente foi recusado."),
    },
    {
      name: "preserva alterações locais e avisa que serão excluídas do commit",
      run: () => {
        const result = planSyncRepair(goodSyncInput({ workingTreeDirty: true }));
        expect(result.outcome === "ready" && result.warnings.length === 1 && !result.includeUncommitted, "árvore suja não foi preservada com aviso.");
      },
    },
  ];

  for (const testCase of cases) add("sync", testCase.name, testCase.run);
}

export function buildHealthChecks() {
  checks.length = 0;
  icaroCount = 0;
  syncCount = 0;
  addIcaroChecks();
  addSyncChecks();
  addSyncPolicyCases();
  if (icaroCount !== 50 || syncCount !== 50 || checks.length !== 100) {
    throw new Error(
      `Contagem inválida: Ícaro=${icaroCount}, sync=${syncCount}, total=${checks.length}; esperado 50/50/100.`,
    );
  }
  return [...checks];
}

export function runHealth100() {
  const results: CheckResult[] = [];
  for (const check of buildHealthChecks()) {
    try {
      check.run();
      results.push({ ...check, passed: true });
    } catch (error) {
      results.push({
        ...check,
        passed: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    total: results.length,
    icaroPassed: results.filter((result) => result.area === "icaro" && result.passed).length,
    syncPassed: results.filter((result) => result.area === "sync" && result.passed).length,
    failures: results.filter((result) => !result.passed),
  };
}
