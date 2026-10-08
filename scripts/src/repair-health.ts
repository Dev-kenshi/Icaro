import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  PROJECT_ROOT,
  runHealth100,
} from "./health-100";
import {
  parseGitHubRemote,
  planSyncRepair,
} from "./sync-repair-policy";

const generatedOutputs = [
  "lib/api-zod/src/generated/api.ts",
  "lib/api-client-react/src/generated/api.ts",
];

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

function runCommand(command: string, args: string[]) {
  execFileSync(command, args, {
    cwd: PROJECT_ROOT,
    stdio: "inherit",
  });
}

function inspectRepo() {
  const remoteUrl = git(["remote", "get-url", "github"]);
  const remote = remoteUrl ? parseGitHubRemote(remoteUrl) : null;
  const status = git(["status", "--porcelain=v1", "--untracked-files=all"]);
  return {
    repository: remote?.repository ?? null,
    workingTreeDirty: Boolean(status),
  };
}

function repairMissingGeneratedClients() {
  const missing = generatedOutputs.filter(
    (path) => !existsSync(resolve(PROJECT_ROOT, path)),
  );
  if (missing.length === 0) {
    console.log("Correção local: nenhum cliente OpenAPI gerado está faltando.");
    return false;
  }

  const sourceFiles = [
    "lib/api-spec/openapi.yaml",
    "lib/api-spec/orval.config.ts",
  ];
  const sourceFilesReady = sourceFiles.every((path) =>
    existsSync(resolve(PROJECT_ROOT, path)),
  );
  if (!sourceFilesReady) {
    console.error("Correção local ignorada: a fonte OpenAPI ou a configuração do gerador está ausente.");
    return false;
  }

  for (const path of generatedOutputs) {
    if (existsSync(resolve(PROJECT_ROOT, path)) && git(["status", "--porcelain=v1", "--", path])) {
      console.error("Correção local ignorada: há alterações nos clientes gerados que precisam ser preservadas.");
      return false;
    }
  }

  console.log("Correção local: regenerando clientes ausentes a partir do contrato OpenAPI.");
  runCommand("pnpm", ["--filter", "@workspace/api-spec", "run", "codegen"]);
  return true;
}

let localRepairApplied = false;
try {
  localRepairApplied = repairMissingGeneratedClients();
} catch (error) {
  console.error(
    `Falha na correção local: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}

if (process.exitCode !== 1) {
  try {
    runCommand("pnpm", ["run", "typecheck"]);
  } catch {
    console.error("Typecheck falhou; nenhuma correção de código ou histórico Git foi aplicada.");
    process.exitCode = 1;
  }
}

const validation = runHealth100();
console.log(
  `Resultado após rotina: Ícaro ${validation.icaroPassed}/50 · Git/sync ${validation.syncPassed}/50 · total ${validation.total}/100.`,
);
for (const failure of validation.failures) {
  console.error(`✗ ${failure.id} [${failure.area}] ${failure.name}: ${failure.error}`);
}

const repo = inspectRepo();
const syncPlan = planSyncRepair({
  actualRepository: repo.repository,
  targetBranch: "replit-sync",
  apiAccess: "unavailable",
  authorization: "unknown",
  targetBranchState: "unknown",
  baseVerified: false,
  hasConflict: false,
  includeUncommitted: false,
  workingTreeDirty: repo.workingTreeDirty,
});
console.log(`Correção automática local aplicada: ${localRepairApplied ? "sim" : "não"}.`);
console.log(`Sincronização GitHub: ${syncPlan.outcome} — ${syncPlan.reason}`);
for (const action of syncPlan.actions) console.log(`Ação necessária: ${action}`);
for (const warning of syncPlan.warnings) console.log(`Aviso: ${warning}`);
console.log("A rotina não altera branches, remotos, credenciais ou histórico Git.");

if (validation.failures.length > 0 || validation.total !== 100) {
  process.exitCode = 1;
} else if (syncPlan.outcome !== "ready" && process.exitCode !== 1) {
  process.exitCode = 2;
}
