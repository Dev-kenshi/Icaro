/**
 * Workspace-wide audit runner.
 *
 * Runs compilation, production builds, deterministic contract/regression suites,
 * and read-only integration checks. Every step runs even if an earlier one fails.
 *
 * Deliberately excludes live AI/provider billing tests, real-user browser flows,
 * and database-backed validators that could inspect or modify shared data.
 *
 * Usage: pnpm --filter @workspace/scripts run validate:full-project
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type Check = {
  name: string;
  args: string[];
  env?: Record<string, string>;
  external?: boolean;
};

const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const checks: Check[] = [
  { name: 'TypeScript de todos os pacotes', args: ['run', 'typecheck'] },
  {
    name: 'Build de produção do workspace',
    args: ['run', 'build'],
    env: { PORT: '25428', BASE_PATH: '/' },
  },
  { name: 'Health e contratos básicos (100 checks)', args: ['--filter', '@workspace/scripts', 'run', 'validate:health-100'] },
  { name: 'Contratos da API (1.000 casos)', args: ['--filter', '@workspace/scripts', 'run', 'validate:api-1000'] },
  { name: 'Comandos legados e Ícaro v5', args: ['--filter', '@workspace/scripts', 'run', 'validate:icaro-command-maze'] },
  { name: 'Voz sintetizada com provedores simulados', args: ['--filter', '@workspace/scripts', 'run', 'validate:voice'] },
  { name: 'Reconhecimento de fala com credencial falsa e servidor local', args: ['--filter', '@workspace/scripts', 'run', 'validate:stt'] },
  { name: 'Base de conhecimento local', args: ['--filter', '@workspace/scripts', 'run', 'validate:knowledge'] },
  { name: 'Avatar holográfico e assets servidos pelo app', args: ['--filter', '@workspace/scripts', 'run', 'validate:hologram'] },
  { name: 'Painel financeiro e palco v5', args: ['--filter', '@workspace/scripts', 'run', 'validate:video-v5'] },
  { name: 'Contratos e regressões web v5', args: ['--filter', '@workspace/scripts', 'run', 'validate:zip-v5'] },
  { name: 'Auditoria visual responsiva do ITCONT', args: ['--filter', '@workspace/scripts', 'run', 'audit:itcont-layout'] },
  { name: 'Site público do ITCONT', args: ['--filter', '@workspace/scripts', 'run', 'validate:itcont-site'] },
  { name: 'Regressões do ITCONT (1.000 checks)', args: ['--filter', '@workspace/scripts', 'run', 'validate:itcont-1000'] },
  { name: 'Assistente do evento ITCONT', args: ['--filter', '@workspace/scripts', 'run', 'validate:itcont-assistant'] },
  {
    name: 'Geocodificação ao vivo (Open-Meteo/Photon; somente leitura)',
    args: ['--filter', '@workspace/scripts', 'run', 'validate:geo'],
    external: true,
  },
];

const failures: string[] = [];
const failureDetails: Array<{ name: string; reason: string; output: string }> = [];
let passed = 0;

process.stdout.write(`AUDITORIA GERAL DO WORKSPACE · ${checks.length} etapas\n`);
process.stdout.write('Cada etapa será executada mesmo que outra falhe.\n\n');

for (const [index, check] of checks.entries()) {
  process.stdout.write(`[${String(index + 1).padStart(2, '0')}/${checks.length}] ${check.name}${check.external ? ' [internet, somente leitura]' : ''}\n`);
  const result = spawnSync('pnpm', check.args, {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ...check.env },
    maxBuffer: 16 * 1024 * 1024,
    timeout: 300_000,
  });

  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  const lines = output.split(/\r?\n/).filter(Boolean);

  if (!result.error && result.status === 0) {
    passed += 1;
    process.stdout.write('  OK\n');
    const details = lines.slice(-7).join('\n').slice(-3_500);
    if (details) process.stdout.write(`${details}\n`);
  } else {
    const reason = result.error?.message ?? `processo terminou com status ${result.status ?? 'desconhecido'}`;
    failures.push(`${check.name}: ${reason}`);
    const diagnosticLines = lines.filter((line) =>
      /✗|NOK|FAIL|AssertionError|Error:|ERR_[A-Z_]+|processo terminou/i.test(line),
    );
    const details = [...new Set([...diagnosticLines.slice(-8), ...lines.slice(-5)])]
      .join('\n')
      .slice(-6_000);
    failureDetails.push({ name: check.name, reason, output: details });
    process.stdout.write(`  NOK: ${reason}\n`);
    if (details) process.stdout.write(`${details}\n`);
  }
  process.stdout.write('\n');
}

const status = failures.length === 0 ? 'OK' : 'NOK';
process.stdout.write(`ETAPAS CONCLUÍDAS: ${passed}/${checks.length}\n`);
process.stdout.write(`RESULTADO FINAL: ${status}\n`);
if (failures.length > 0) {
  process.stdout.write('ETAPAS COM FALHA:\n');
  for (const failure of failureDetails) {
    process.stdout.write(`- ${failure.name}: ${failure.reason}\n`);
    if (failure.output) process.stdout.write(`${failure.output}\n`);
  }
  process.exitCode = 1;
}
