import assert from "node:assert/strict";
import { pool } from "@workspace/db";
import {
  createCalculationLookup,
  numbersFromQuestion,
  parseCalculationRequest,
} from "./lib/calculos-db";

async function main() {
  assert.deepEqual(
    numbersFromQuestion("R$ 1.500,00, 2,5% e 10 mil"),
    ["1500", "2.5", "10000"],
  );
  assert.deepEqual(
    parseCalculationRequest("Qual a taxa anual equivalente a 0,1% ao mês?"),
    { familia: "te", numeros: ["0.1"], termos: ["taxa", "anual", "equivalente", "mes"] },
  );

  const count = await pool.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM public.icaro_calculos",
  );
  assert.equal(Number(count.rows[0]?.count), 1_000_000, "A tabela deve conter um milhão de cálculos.");

  const lookup = createCalculationLookup(pool);
  const familySamples = await pool.query<{ id: string; familia: string; pergunta: string }>(
    `SELECT DISTINCT ON (familia) id, familia, pergunta
       FROM public.icaro_calculos
      ORDER BY familia, id`,
  );
  const expectedFamilies = [
    "ah", "cf", "dc", "dep", "eg", "ga", "jc", "js", "lanc", "lc",
    "mk", "ml", "pe", "price", "roa", "roe", "sac", "te", "vp",
  ];
  assert.deepEqual(
    familySamples.rows.map((sample) => sample.familia).sort(),
    expectedFamilies,
    "A base deve conter todas as 19 famílias esperadas.",
  );
  for (const sample of familySamples.rows) {
    const result = await lookup(sample.pergunta);
    assert.equal(result?.id, sample.id, `Busca representativa da família ${sample.familia}`);
  }

  const samples = [
    {
      question: "Qual a taxa anual equivalente a 0,1% ao mês?",
      expectedId: "gc-te-0p1",
    },
    {
      question: "Quanto rende R$ 1.000,00 a juros compostos de 2% ao mês por 12 meses?",
      expectedId: "gc-jc-1000-2-12",
    },
    {
      question: "Quanto custa um funcionário com salário de R$ 2.000,00 no Simples Nacional?",
      expectedId: "gc-cf-2000-simples",
    },
    {
      question: "Como lançar compra de mercadorias a prazo de R$ 5.000,00?",
      expectedId: "gc-lanc-compra-prazo-5000",
    },
  ];

  for (const sample of samples) {
    const result = await lookup(sample.question);
    assert.equal(result?.id, sample.expectedId, `Correspondência exata para ${sample.expectedId}`);
    assert.ok(result?.resposta.length, `Resposta não vazia para ${sample.expectedId}`);
  }

  console.log(
    `Banco de cálculos validado: 1.000.000 de registros, 19 famílias e ${samples.length} buscas exatas adicionais.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
