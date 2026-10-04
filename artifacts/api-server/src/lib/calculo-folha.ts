import { normalizeKnowledgeText } from "./knowledge-bank";

/**
 * Cálculos determinísticos de folha para o roteiro do evento: custo mensal de
 * um funcionário CLT e o lançamento contábil correspondente. Sem IA remota,
 * para a resposta sair igual e correta em toda apresentação.
 */

export type Regime = "geral" | "simples";

export type PainelLinha = { conta: string; debito: number; credito: number };
export type Painel = {
  titulo: string;
  linhas: PainelLinha[];
  totais: { debito: number; credito: number };
  destaque?: { rotulo: string; valor: number };
};

export type CalculoFolha = {
  id: "calc-custo-funcionario" | "calc-lancamento-folha";
  answer: string;
  painel: Painel;
};

// Encargos patronais usuais (empresas fora do Simples). RAT varia de 1% a 3%
// conforme o grau de risco; terceiros 5,8% é o caso mais comum.
const INSS_PATRONAL = 0.2;
const RAT = 0.02;
const TERCEIROS = 0.058;
const FGTS = 0.08;

const round2 = (n: number) => Math.round(n * 100) / 100;

export function formatBRL(value: number): string {
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function custoFuncionario(salario: number, regime: Regime) {
  const inss = regime === "geral" ? round2(salario * INSS_PATRONAL) : 0;
  const rat = regime === "geral" ? round2(salario * RAT) : 0;
  const terceiros = regime === "geral" ? round2(salario * TERCEIROS) : 0;
  const fgts = round2(salario * FGTS);
  const decimoTerceiro = round2(salario / 12);
  const ferias = round2((salario * 4) / 3 / 12);
  const taxaEncargos = regime === "geral" ? INSS_PATRONAL + RAT + TERCEIROS + FGTS : FGTS;
  const encargosProvisoes = round2((decimoTerceiro + ferias) * taxaEncargos);
  const total = round2(salario + inss + rat + terceiros + fgts + decimoTerceiro + ferias + encargosProvisoes);
  return { salario, inss, rat, terceiros, fgts, decimoTerceiro, ferias, encargosProvisoes, total };
}

const UNITS: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9,
  dez: 10, onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16,
  dezessete: 17, dezoito: 18, dezenove: 19, vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50,
  sessenta: 60, setenta: 70, oitenta: 80, noventa: 90, cem: 100, cento: 100, duzentos: 200,
  duzentas: 200, trezentos: 300, quatrocentos: 400, quinhentos: 500, seiscentos: 600,
  setecentos: 700, oitocentos: 800, novecentos: 900,
};

/** Converte "dois mil e quinhentos" em 2500 dentro de um texto normalizado. */
function wordsToNumber(text: string): number | null {
  let total = 0;
  let current = 0;
  let seen = false;
  // Lê cada sequência numérica por extenso e devolve a primeira que pareça um
  // salário; "um" de "um funcionário" vira uma sequência curta e é descartado.
  for (const word of [...text.split(" "), "."]) {
    if (word === "e" && seen) continue;
    if (word in UNITS) { current += UNITS[word]; seen = true; continue; }
    if (word === "mil") { total += (current || 1) * 1000; current = 0; seen = true; continue; }
    if (seen && total + current >= 100) return total + current;
    total = 0; current = 0; seen = false;
  }
  return null;
}

/** Extrai um valor de salário da pergunta original (não normalizada). */
export function extrairSalario(question: string): number | null {
  const text = question.toLowerCase();
  // "2,5 mil", "2 mil e 500", "3 mil"
  const mil = text.match(/(\d+(?:[.,]\d+)?)\s*mil(?:\s*e\s*(\d{1,3}))?/);
  if (mil) {
    const base = Number(mil[1].replace(",", ".")) * 1000;
    const extra = mil[2] ? Number(mil[2]) : 0;
    if (base + extra >= 100) return round2(base + extra);
  }
  // "R$ 2.500,00", "2.500", "2500", "2,500" (transcrição de voz com vírgula de milhar)
  const numeric = text.match(/\d{1,3}(?:[.,]\d{3})+(?:,\d{2})?|\d{3,6}(?:,\d{2})?/);
  if (numeric) {
    let raw = numeric[0];
    const centavos = raw.match(/,(\d{2})$/);
    let cents = 0;
    if (centavos) { cents = Number(centavos[1]) / 100; raw = raw.slice(0, -3); }
    const value = Number(raw.replace(/[.,]/g, "")) + cents;
    if (value >= 100) return round2(value);
  }
  return wordsToNumber(normalizeKnowledgeText(question));
}

const PESSOA = /\b(?:funcionario|funcionaria|funcionarios|empregado|empregada|colaborador|colaboradora|trabalhador|trabalhadora|clt|contratar|contratacao|salario)\b/;
const CUSTO = /\b(?:custo|custa|custaria|custar|gasto|gasta|gastaria|encargos|sai por|fica)\b/;
const LANCAMENTO = /\b(?:lancamento|lancamentos|lance|lancar|contabilize|contabilizar|contabilizacao|escriture|escriturar|razonete|razonetes)\b/;
const PAINEL = /\b(?:dashboard|painel|grafico)\b/;
const FOLHA = /\b(?:folha|salario|salarios|funcionario|funcionaria|empregado|colaborador|desse|dele|dela)\b/;

// Mantém o último salário calculado para que "faça o lançamento desse
// funcionário" funcione logo depois da pergunta de custo.
let ultimoSalario = 2500;
let ultimoRegime: Regime = "geral";

function regimeDe(normalized: string): Regime {
  return /\bsimples\b|\bmei\b/.test(normalized) ? "simples" : "geral";
}

function respostaCusto(salario: number, regime: Regime): CalculoFolha {
  const c = custoFuncionario(salario, regime);
  const percentual = Math.round((c.total / salario - 1) * 100);
  const anual = round2(c.total * 12);
  const answer = regime === "geral"
    ? [
      `Para um salário de ${formatBRL(salario)}, numa empresa do Lucro Presumido ou do Lucro Real, o custo mensal estimado é de ${formatBRL(c.total)}, cerca de ${percentual}% acima do salário.`,
      `Entram o INSS patronal de 20%, o RAT de 2% e as contribuições de terceiros de 5,8%, que somam ${formatBRL(c.inss + c.rat + c.terceiros)}, mais o FGTS de 8%, ${formatBRL(c.fgts)}.`,
      `Todo mês também provisionamos o décimo terceiro, ${formatBRL(c.decimoTerceiro)}, e as férias com um terço, ${formatBRL(c.ferias)}, com ${formatBRL(c.encargosProvisoes)} de encargos sobre essas provisões.`,
      `No ano, esse funcionário custa cerca de ${formatBRL(anual)}.`,
      `No Simples Nacional, na maioria dos anexos, o custo cairia para ${formatBRL(custoFuncionario(salario, "simples").total)}. Benefícios como vale-transporte e vale-alimentação entram à parte.`,
    ].join(" ")
    : [
      `Para um salário de ${formatBRL(salario)}, numa empresa do Simples Nacional, o custo mensal estimado é de ${formatBRL(c.total)}, cerca de ${percentual}% acima do salário.`,
      `Na maioria dos anexos do Simples, a contribuição patronal já está no DAS, então o encargo direto é o FGTS de 8%, ${formatBRL(c.fgts)}.`,
      `Somam-se as provisões de décimo terceiro, ${formatBRL(c.decimoTerceiro)}, e de férias com um terço, ${formatBRL(c.ferias)}, mais ${formatBRL(c.encargosProvisoes)} de FGTS sobre elas.`,
      `No ano, são cerca de ${formatBRL(anual)}. Benefícios como vale-transporte e vale-alimentação entram à parte.`,
    ].join(" ");
  const linhas: PainelLinha[] = [
    { conta: "Salário", debito: c.salario, credito: 0 },
    ...(regime === "geral" ? [{ conta: "INSS patronal + RAT + terceiros", debito: round2(c.inss + c.rat + c.terceiros), credito: 0 }] : []),
    { conta: "FGTS 8%", debito: c.fgts, credito: 0 },
    { conta: "Provisão de 13º", debito: c.decimoTerceiro, credito: 0 },
    { conta: "Provisão de férias + 1/3", debito: c.ferias, credito: 0 },
    { conta: "Encargos sobre provisões", debito: c.encargosProvisoes, credito: 0 },
  ];
  return {
    id: "calc-custo-funcionario",
    answer,
    painel: {
      titulo: `Custo mensal do funcionário · ${regime === "geral" ? "Lucro Presumido/Real" : "Simples Nacional"}`,
      linhas,
      totais: { debito: c.total, credito: 0 },
      destaque: { rotulo: "Custo total por mês", valor: c.total },
    },
  };
}

function respostaLancamento(salario: number, regime: Regime): CalculoFolha {
  const c = custoFuncionario(salario, regime);
  const previdencia = round2(c.inss + c.rat + c.terceiros);
  const provisoes = round2(c.decimoTerceiro + c.ferias + c.encargosProvisoes);
  const linhas: PainelLinha[] = [
    { conta: "Despesa com salários", debito: salario, credito: 0 },
    { conta: "Salários a pagar", debito: 0, credito: salario },
    ...(regime === "geral" ? [
      { conta: "Despesa com INSS patronal", debito: previdencia, credito: 0 },
      { conta: "INSS a recolher", debito: 0, credito: previdencia },
    ] : []),
    { conta: "Despesa com FGTS", debito: c.fgts, credito: 0 },
    { conta: "FGTS a recolher", debito: 0, credito: c.fgts },
    { conta: "Despesa com 13º, férias e encargos", debito: provisoes, credito: 0 },
    { conta: "Provisão de 13º, férias e encargos", debito: 0, credito: provisoes },
  ];
  const total = round2(linhas.reduce((sum, linha) => sum + linha.debito, 0));
  const answer = [
    `Vamos contabilizar a folha do funcionário de ${formatBRL(salario)}.`,
    `Primeiro, debita-se Despesa com Salários e credita-se Salários a Pagar em ${formatBRL(salario)}.`,
    regime === "geral"
      ? `Depois, debita-se Despesa com INSS Patronal e credita-se INSS a Recolher em ${formatBRL(previdencia)}, e debita-se Despesa com FGTS e credita-se FGTS a Recolher em ${formatBRL(c.fgts)}.`
      : `Depois, debita-se Despesa com FGTS e credita-se FGTS a Recolher em ${formatBRL(c.fgts)}.`,
    `Por fim, debita-se Despesa com Décimo Terceiro e Férias e credita-se Provisões, já com os encargos, em ${formatBRL(provisoes)}.`,
    `O total de débitos é ${formatBRL(total)}, exatamente igual ao total de créditos, como manda o método das partidas dobradas, e igual ao custo mensal desse funcionário. O painel mostra cada conta.`,
  ].join(" ");
  return {
    id: "calc-lancamento-folha",
    answer,
    painel: {
      titulo: `Lançamento da folha · salário de ${formatBRL(salario)}`,
      linhas,
      totais: { debito: total, credito: total },
      destaque: { rotulo: "Débitos = Créditos", valor: total },
    },
  };
}

/** Responde perguntas de custo de funcionário e de lançamento da folha. */
export function resolverCalculoFolha(question: string): CalculoFolha | null {
  const normalized = normalizeKnowledgeText(question);
  const salario = extrairSalario(question);
  const querLancamento = LANCAMENTO.test(normalized) || (PAINEL.test(normalized) && /\b(?:debito|debitos|credito|creditos)\b/.test(normalized));

  if (querLancamento && (FOLHA.test(normalized) || PAINEL.test(normalized))) {
    // Sem salário na pergunta, segue o caso anterior ("desse funcionário").
    if (salario) { ultimoSalario = salario; ultimoRegime = regimeDe(normalized); }
    const regime = salario ? ultimoRegime : /\bsimples\b/.test(normalized) ? "simples" : ultimoRegime;
    return respostaLancamento(salario ?? ultimoSalario, regime);
  }

  if (PESSOA.test(normalized) && CUSTO.test(normalized) && salario) {
    ultimoSalario = salario;
    ultimoRegime = regimeDe(normalized);
    return respostaCusto(salario, ultimoRegime);
  }
  return null;
}
