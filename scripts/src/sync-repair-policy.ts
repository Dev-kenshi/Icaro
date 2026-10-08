export type ApiAccess = "available" | "unavailable" | "unknown";
export type Authorization = "authorized" | "missing" | "denied" | "unknown";
export type RemoteBranch = "absent" | "present" | "unknown";
export type RepairOutcome = "ready" | "manual" | "blocked";

export interface SyncRepairInput {
  actualRepository: string | null;
  expectedRepository?: string;
  targetBranch: string;
  apiAccess: ApiAccess;
  authorization: Authorization;
  targetBranchState: RemoteBranch;
  baseVerified: boolean;
  hasConflict: boolean;
  includeUncommitted: boolean;
  workingTreeDirty?: boolean;
}

export interface SyncRepairPlan {
  outcome: RepairOutcome;
  targetBranch: string;
  reason: string;
  actions: string[];
  warnings: string[];
  createCommit: boolean;
  createBranch: boolean;
  updateMain: false;
  force: false;
  includeUncommitted: false;
}

function normalizeRepository(value: string) {
  return value
    .trim()
    .replace(/^https?:\/\/github\.com\//i, "")
    .replace(/^git@github\.com:/i, "")
    .replace(/^ssh:\/\/git@github\.com\//i, "")
    .replace(/\.git$/i, "")
    .replace(/^\/+|\/+$/g, "")
    .toLowerCase();
}

export function parseGitHubRemote(value: string) {
  const remote = value.trim();
  let host: string | null = null;
  let repository: string | null = null;
  let hasEmbeddedCredentials = false;

  try {
    const parsed = new URL(remote);
    host = parsed.hostname.toLowerCase();
    repository = parsed.pathname
      .replace(/^\/+|\/+$/g, "")
      .replace(/\.git$/i, "");
    hasEmbeddedCredentials = Boolean(
      parsed.password || (parsed.username && parsed.protocol !== "ssh:"),
    );
  } catch {
    const scpStyle = /^(?:[^@/]+@)?([^:/]+):(.+)$/.exec(remote);
    if (scpStyle) {
      host = scpStyle[1].toLowerCase();
      repository = scpStyle[2]
        .replace(/^\/+|\/+$/g, "")
        .replace(/\.git$/i, "");
    }
  }

  return {
    host,
    repository,
    hasEmbeddedCredentials,
  };
}

export function isSafeGitBranchName(branch: string) {
  const normalized = branch.replace(/^refs\/heads\//, "");
  return Boolean(
    normalized &&
      normalized.length <= 240 &&
      /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(normalized) &&
      !normalized.includes("..") &&
      !normalized.includes("//") &&
      !normalized.includes("@{") &&
      !normalized.endsWith("/") &&
      !normalized.endsWith(".") &&
      !normalized.endsWith(".lock"),
  );
}

function plan(
  outcome: RepairOutcome,
  targetBranch: string,
  reason: string,
  actions: string[] = [],
  warnings: string[] = [],
): SyncRepairPlan {
  return {
    outcome,
    targetBranch,
    reason,
    actions,
    warnings,
    createCommit: outcome === "ready",
    createBranch: outcome === "ready",
    updateMain: false,
    force: false,
    includeUncommitted: false,
  };
}

export function planSyncRepair(input: SyncRepairInput): SyncRepairPlan {
  const targetBranch = input.targetBranch.replace(/^refs\/heads\//, "");
  const expectedRepository = normalizeRepository(
    input.expectedRepository ?? "Dev-kenshi/Icaro",
  );
  const actualRepository = input.actualRepository
    ? normalizeRepository(input.actualRepository)
    : "";

  if (!isSafeGitBranchName(input.targetBranch)) {
    return plan("blocked", targetBranch, "Nome de branch inválido.");
  }

  if (["main", "master"].includes(targetBranch.toLowerCase())) {
    return plan(
      "blocked",
      targetBranch,
      "A rotina não altera branches protegidas.",
    );
  }

  if (!actualRepository) {
    return plan(
      "blocked",
      targetBranch,
      "Não foi possível confirmar o repositório remoto.",
    );
  }

  if (actualRepository !== expectedRepository) {
    return plan(
      "blocked",
      targetBranch,
      "O remoto não corresponde ao repositório esperado.",
    );
  }

  if (input.includeUncommitted) {
    return plan(
      "manual",
      targetBranch,
      "Alterações não commitadas não serão incluídas automaticamente.",
      ["Revise e decida separadamente quais alterações devem ser commitadas."],
    );
  }

  if (input.apiAccess !== "available" || input.authorization !== "authorized") {
    return plan(
      "manual",
      targetBranch,
      "A API GitHub não está autenticada e disponível para esta execução.",
      ["Conecte a integração GitHub no Repl antes de qualquer escrita remota."],
    );
  }

  if (input.targetBranchState === "unknown") {
    return plan(
      "manual",
      targetBranch,
      "A existência da branch remota não foi verificada.",
      ["Consulte a branch remota antes de criar ou alterar qualquer ref."],
    );
  }

  if (input.targetBranchState === "present") {
    return plan(
      "manual",
      targetBranch,
      "A branch de destino já existe; a rotina não a substituirá.",
      ["Compare o conteúdo remoto e decida como resolver a divergência."],
    );
  }

  if (!input.baseVerified) {
    return plan(
      "manual",
      targetBranch,
      "O commit-base comum não foi verificado.",
      ["Verifique a base e a árvore local antes de preparar um commit."],
    );
  }

  if (input.hasConflict) {
    return plan(
      "manual",
      targetBranch,
      "Há conflitos que exigem revisão humana.",
      ["Resolva os conflitos sem descartar alterações locais."],
    );
  }

  const warnings = input.workingTreeDirty
    ? ["A árvore de trabalho tem alterações; somente commits existentes serão considerados."]
    : [];

  return plan(
    "ready",
    targetBranch,
    "As verificações de segurança permitem preparar uma branch nova.",
    [
      `Crie ${targetBranch} a partir da base verificada.`,
      "Avance somente a nova branch, sem force update.",
    ],
    warnings,
  );
}
