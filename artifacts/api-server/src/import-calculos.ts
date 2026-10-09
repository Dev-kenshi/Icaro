import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { once } from "node:events";
import path from "node:path";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import { pool } from "@workspace/db";
import { normalizeKnowledgeText } from "./lib/knowledge-bank";

const EXPECTED_ROWS = 1_000_000;
const ARCHIVE_MEMBER =
  "Icaro-banco-de-dados/01-dados-1-milhao/base-contabil-1-milhao.jsonl.gz";
const COPY_COMMAND =
  "COPY public.icaro_calculos (id, familia, titulo, pergunta, resposta, numeros, chave) "
  + "FROM STDIN WITH (FORMAT csv, DELIMITER E'\\t', QUOTE '\"', ESCAPE '\"');\n";

type ImportRow = {
  id: string;
  familia: string;
  titulo: string;
  pergunta: string;
  resposta: string;
  numeros: string[];
};

function csvCell(value: string): string {
  if (value.includes("\0")) throw new Error("O arquivo contém um caractere NUL inválido.");
  return `"${value.replace(/"/g, '""')}"`;
}

function toCopyRecord(value: unknown): string {
  if (!value || typeof value !== "object") throw new Error("Registro JSON inválido.");
  const row = value as Partial<ImportRow>;
  if (
    typeof row.id !== "string"
    || typeof row.familia !== "string"
    || typeof row.titulo !== "string"
    || typeof row.pergunta !== "string"
    || typeof row.resposta !== "string"
    || !Array.isArray(row.numeros)
    || !row.numeros.every((number) => typeof number === "string" && /^-?\d+(?:\.\d+)?$/.test(number))
  ) {
    throw new Error("Um registro da base não corresponde ao formato esperado.");
  }

  const postgresArray = `{${row.numeros.map((number) => `"${number}"`).join(",")}}`;
  const key = normalizeKnowledgeText(`${row.titulo} ${row.pergunta}`);
  return [
    row.id,
    row.familia,
    row.titulo,
    row.pergunta,
    row.resposta,
    postgresArray,
    key,
  ].map(csvCell).join("\t") + "\n";
}

async function writeCopyData(child: ChildProcessWithoutNullStreams, text: string): Promise<void> {
  if (!child.stdin.write(text, "utf8")) await once(child.stdin, "drain");
}

function waitForExit(child: ChildProcessWithoutNullStreams): Promise<number> {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolve(code ?? 1));
  });
}

async function main() {
  const archivePath = path.resolve(
    process.argv[2] || path.join(process.cwd(), "../attached_assets/Icaro-banco-de-dados_1791507546029.zip"),
  );
  if (!existsSync(archivePath)) {
    throw new Error(`Arquivo de origem não encontrado: ${archivePath}`);
  }

  const { rows } = await pool.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM public.icaro_calculos",
  );
  const currentCount = Number(rows[0]?.count ?? 0);
  if (currentCount === EXPECTED_ROWS) {
    console.log(`A base já está completa: ${EXPECTED_ROWS.toLocaleString("pt-BR")} registros.`);
    return;
  }
  if (currentCount !== 0) {
    throw new Error(
      `A tabela já contém ${currentCount} registros. A importação só inicia em tabela vazia ou completa; nenhum dado foi alterado.`,
    );
  }

  const unzip = spawn("unzip", ["-p", archivePath, ARCHIVE_MEMBER], {
    stdio: ["ignore", "pipe", "inherit"],
  });
  const unzipExit = new Promise<number>((resolve, reject) => {
    unzip.once("error", reject);
    unzip.once("close", (code) => resolve(code ?? 1));
  });
  const gunzip = createGunzip();
  unzip.stdout.pipe(gunzip);
  const lines = createInterface({ input: gunzip, crlfDelay: Infinity });

  const psql = spawn("psql", ["-X", "--quiet", "--set=ON_ERROR_STOP=1"], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  psql.stdout.pipe(process.stdout);
  psql.stderr.pipe(process.stderr);
  const psqlExit = waitForExit(psql);
  let imported = 0;

  try {
    await writeCopyData(psql, COPY_COMMAND);
    for await (const line of lines) {
      if (!line.trim()) continue;
      const row: unknown = JSON.parse(line);
      await writeCopyData(psql, toCopyRecord(row));
      imported += 1;
      if (imported % 100_000 === 0) {
        console.log(`Importados ${imported.toLocaleString("pt-BR")} de ${EXPECTED_ROWS.toLocaleString("pt-BR")} registros.`);
      }
    }

    const unzipCode = await unzipExit;
    if (unzipCode !== 0) throw new Error(`A extração do JSONL terminou com código ${unzipCode}.`);
    if (imported !== EXPECTED_ROWS) {
      throw new Error(`Esperados ${EXPECTED_ROWS} registros, mas foram lidos ${imported}.`);
    }

    await writeCopyData(psql, "\\.\n");
    psql.stdin.end();
    const psqlCode = await psqlExit;
    if (psqlCode !== 0) throw new Error(`O PostgreSQL encerrou a cópia com código ${psqlCode}.`);
  } catch (error) {
    psql.kill("SIGTERM");
    unzip.kill("SIGTERM");
    void unzipExit.catch(() => undefined);
    void psqlExit.catch(() => undefined);
    throw error;
  }

  await pool.query("ANALYZE public.icaro_calculos");
  const verification = await pool.query<{ count: string; total_size: string }>(
    `SELECT count(*)::text AS count,
            pg_size_pretty(pg_total_relation_size('public.icaro_calculos')) AS total_size
       FROM public.icaro_calculos`,
  );
  const actualCount = Number(verification.rows[0]?.count ?? 0);
  if (actualCount !== EXPECTED_ROWS) {
    throw new Error(`Verificação falhou: esperados ${EXPECTED_ROWS}, encontrados ${actualCount}.`);
  }
  console.log(`Importação verificada: ${actualCount.toLocaleString("pt-BR")} registros; tabela e índices ocupam ${verification.rows[0]?.total_size}.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Falha na importação.");
    process.exitCode = 1;
  })
  .finally(() => pool.end());
