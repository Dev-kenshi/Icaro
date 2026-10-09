import revisedResponses from "./conhecimento/respostas-revisadas.json";

export type KnowledgeCategory =
  | "evento" | "contabilidade" | "tecnologia" | "geral" | "historia"
  | "ia" | "matematica" | "pesquisa" | "universidades";

export type KnowledgeEntry = {
  id: string;
  category: KnowledgeCategory;
  title: string;
  triggers: string[][];
  answer: string;
};

export type KnowledgeMatch = {
  id: string;
  category: KnowledgeCategory;
  title: string;
  answer: string;
};

const EVENT_IDENTITY = [
  "A I ITCONT 2026 é a primeira Imersão Tecnológica Contábil da UEFS, realizada pelo Projeto de Extensão Contador do Amanhã.",
  "O evento reúne palestras, oficina prática e mesa-redonda sobre inteligência artificial e tecnologias digitais na profissão contábil.",
].join(" ");

/** Ordem importa: gatilhos específicos vêm antes do gatilho geral da sigla. */
export const KNOWLEDGE_BANK: KnowledgeEntry[] = [
  {
    id: "itcont-data",
    category: "evento",
    title: "Data do I ITCONT 2026",
    triggers: [
      ["itcont", "quando"],
      ["itcont", "data"],
      ["itcont", "dia"],
      ["imersao tecnologica contabil", "quando"],
      ["imersao tecnologica contabil", "data"],
      ["evento", "quando"],
      ["evento", "data"],
    ],
    answer: "O I ITCONT 2026 acontece nos dias 21 e 22 de outubro de 2026, quarta e quinta-feira, no turno da noite.",
  },
  {
    id: "itcont-local",
    category: "evento",
    title: "Local do I ITCONT 2026",
    triggers: [
      ["itcont", "onde"],
      ["itcont", "local"],
      ["imersao tecnologica contabil", "onde"],
      ["imersao tecnologica contabil", "local"],
      ["evento", "onde"],
      ["evento", "local"],
      ["auditorio", "itcont"],
    ],
    answer: "O I ITCONT 2026 será presencial no Auditório III, Módulo IV da UEFS, em Feira de Santana.",
  },
  {
    id: "itcont-formato",
    category: "evento",
    title: "Formato e transmissão",
    triggers: [
      ["itcont", "online"],
      ["itcont", "presencial"],
      ["itcont", "transmissao"],
      ["itcont", "ao vivo"],
      ["evento", "transmissao"],
      ["evento", "presencial"],
      ["imersao", "online"],
    ],
    answer: "O formato é presencial, com programação noturna e sem transmissão ao vivo. A participação acontece no Auditório III, Módulo IV da UEFS.",
  },
  {
    id: "itcont-carga-horaria",
    category: "evento",
    title: "Carga horária e turno",
    triggers: [
      ["itcont", "carga horaria"],
      ["itcont", "horas"],
      ["itcont", "turno"],
      ["evento", "carga horaria"],
      ["evento", "horas"],
      ["imersao", "carga horaria"],
    ],
    answer: "A carga horária proposta é de 8 horas, distribuída em duas noites de programação presencial.",
  },
  {
    id: "itcont-certificado",
    category: "evento",
    title: "Certificação e frequência",
    triggers: [
      ["itcont", "certificado"],
      ["itcont", "frequencia"],
      ["itcont", "presenca"],
      ["evento", "certificado"],
      ["evento", "frequencia"],
      ["imersao", "certificado"],
    ],
    answer: "O certificado de participação exige frequência mínima de 75 por cento. A organização prevê emitir todos os certificados até 30 de outubro de 2026.",
  },
  {
    id: "itcont-publico",
    category: "evento",
    title: "Público-alvo",
    triggers: [
      ["itcont", "quem pode participar"],
      ["itcont", "publico"],
      ["evento", "quem pode participar"],
      ["evento", "publico"],
      ["imersao", "quem pode participar"],
    ],
    answer: "O evento é voltado a estudantes de Ciências Contábeis e Administração, docentes, profissionais da contabilidade e comunidade externa interessada.",
  },
  {
    id: "itcont-objetivos",
    category: "evento",
    title: "Objetivos do evento",
    triggers: [
      ["itcont", "objetivo"],
      ["itcont", "finalidade"],
      ["evento", "objetivo"],
      ["imersao", "objetivo"],
      ["itcont", "para que serve"],
    ],
    answer: "O objetivo é aproximar a formação contábil das tecnologias que já transformam a profissão. A programação combina conceitos, aplicações de inteligência artificial e uso prático de ferramentas.",
  },
  {
    id: "itcont-organizacao",
    category: "evento",
    title: "Realização e vínculo institucional",
    triggers: [
      ["itcont", "quem organiza"],
      ["itcont", "realizacao"],
      ["itcont", "organizacao"],
      ["evento", "quem organiza"],
      ["imersao", "realizacao"],
      ["contador do amanha", "itcont"],
    ],
    answer: "A realização é do Projeto de Extensão Contador do Amanhã, vinculado ao Colegiado de Ciências Contábeis e ao Departamento de Ciências Sociais Aplicadas da UEFS.",
  },
  {
    id: "itcont-coordenacao",
    category: "evento",
    title: "Coordenação Geral",
    triggers: [
      ["itcont", "coordenacao"],
      ["itcont", "coordenadores"],
      ["evento", "coordenacao"],
      ["quem coordena", "itcont"],
    ],
    answer: "A Coordenação Geral é formada por Rômulo Benício, Iracema, Thiago, Jadiane e Thiago Valério. Ela responde pela direção, representação institucional, programação, orçamento e certificação.",
  },
  {
    id: "itcont-comissoes",
    category: "evento",
    title: "Comissões organizadoras",
    triggers: [
      ["itcont", "comissoes"],
      ["itcont", "equipe"],
      ["evento", "comissoes"],
      ["evento", "equipe organizadora"],
      ["imersao", "comissoes"],
    ],
    answer: "A equipe tem 23 integrantes distribuídos em seis frentes: Coordenação Geral, Apresentação, Tecnológica e de Suporte, Apoio, Mídia e Patrocínio.",
  },
  {
    id: "itcont-comissao-tecnologica",
    category: "evento",
    title: "Comissão Tecnológica e de Suporte",
    triggers: [
      ["comissao tecnologica", "itcont"],
      ["comissao tecnologica", "funcao"],
      ["suporte tecnico", "itcont"],
      ["quem cuida", "audio", "itcont"],
      ["quem cuida", "internet", "itcont"],
    ],
    answer: "A Comissão Tecnológica e de Suporte é formada por Emanuel, Rosevaldo, Jadson e Kawan. Ela cuida de projeção, áudio, internet, laboratório da oficina e contingência técnica.",
  },
  {
    id: "itcont-metas",
    category: "evento",
    title: "Metas do evento",
    triggers: [
      ["itcont", "meta"],
      ["itcont", "inscritos"],
      ["evento", "meta"],
      ["evento", "inscritos"],
    ],
    answer: "As metas incluem 250 inscritos, presença efetiva de 70 por cento por noite, pelo menos quatro acordos de patrocínio ou apoio e avaliação média igual ou superior a 4,5 em escala de 1 a 5.",
  },
  {
    id: "itcont-contingencia-audio",
    category: "evento",
    title: "Contingência de áudio",
    triggers: [
      ["itcont", "falha de audio"],
      ["itcont", "microfone"],
      ["evento", "falha de audio"],
      ["evento", "microfone reserva"],
    ],
    answer: "Em caso de falha de áudio, o plano é substituir imediatamente pelo microfone reserva. Também fica um microfone com fio disponível no palco como segunda alternativa.",
  },
  {
    id: "itcont-contingencia-internet",
    category: "evento",
    title: "Contingência de internet",
    triggers: [
      ["itcont", "internet"],
      ["itcont", "sem conexao"],
      ["evento", "internet"],
      ["oficina", "sem internet"],
    ],
    answer: "Se a internet cair durante a oficina, a equipe executa uma versão preparada para uso sem conexão, com materiais e exemplos previamente baixados.",
  },
  {
    id: "itcont-identidade",
    category: "evento",
    title: "O que é o I ITCONT 2026",
    triggers: [
      ["o que e", "itcont"],
      ["o que e", "imersao tecnologica contabil"],
      ["fale sobre", "itcont"],
      ["apresente", "itcont"],
    ],
    answer: EVENT_IDENTITY,
  },
  {
    id: "contabilidade-conceito",
    category: "contabilidade",
    title: "Conceito de contabilidade",
    triggers: [
      ["o que e", "contabilidade"],
      ["defina", "contabilidade"],
      ["explique", "contabilidade"],
    ],
    answer: "Contabilidade é o sistema que registra, organiza e interpreta os fatos econômicos de uma entidade. Ela transforma operações em informação útil para controle, prestação de contas e decisão.",
  },
  {
    id: "contabilidade-ativo-passivo-pl",
    category: "contabilidade",
    title: "Ativo, passivo e patrimônio líquido",
    triggers: [
      ["ativo", "passivo", "patrimonio liquido"],
      ["diferenca", "ativo", "passivo"],
      ["o que e", "patrimonio liquido"],
      ["o que e", "ativo"],
      ["o que e", "passivo"],
    ],
    answer: "Ativo representa bens e direitos. Passivo representa obrigações. Patrimônio líquido é a diferença entre ativos e passivos e mostra a parte que pertence aos sócios ou proprietários.",
  },
  {
    id: "contabilidade-dre",
    category: "contabilidade",
    title: "DRE",
    triggers: [
      ["o que e", "dre"],
      ["demonstracao do resultado"],
      ["demonstrativo do resultado"],
      ["para que serve", "dre"],
    ],
    answer: "A DRE é a Demonstração do Resultado do Exercício. Ela resume receitas, custos, despesas e resultado do período, mostrando se houve lucro ou prejuízo.",
  },
  {
    id: "contabilidade-fluxo-caixa",
    category: "contabilidade",
    title: "Fluxo de caixa",
    triggers: [
      ["fluxo de caixa", "o que e"],
      ["para que serve", "fluxo de caixa"],
      ["diferenca", "fluxo de caixa", "lucro"],
    ],
    answer: "Fluxo de caixa acompanha entradas e saídas de dinheiro. Ele mostra liquidez e capacidade de pagamento, enquanto o lucro apura o resultado econômico do período.",
  },
  {
    id: "contabilidade-regime-competencia",
    category: "contabilidade",
    title: "Regime de competência",
    triggers: [
      ["regime de competencia"],
      ["competencia", "caixa", "diferenca"],
      ["regime de caixa", "regime de competencia"],
    ],
    answer: "No regime de competência, receitas e despesas são reconhecidas quando ocorrem, mesmo que o dinheiro entre ou saia depois. No regime de caixa, o reconhecimento acompanha a movimentação financeira.",
  },
  {
    id: "contabilidade-custos",
    category: "contabilidade",
    title: "Custos fixos e variáveis",
    triggers: [
      ["custos fixos", "variaveis"],
      ["custo fixo", "custo variavel"],
      ["contabilidade de custos"],
      ["o que e", "custo"],
    ],
    answer: "Custos são recursos consumidos para produzir bens ou serviços. Custos fixos tendem a se manter no período, enquanto custos variáveis mudam conforme o volume produzido ou vendido.",
  },
  {
    id: "contabilidade-auditoria",
    category: "contabilidade",
    title: "Auditoria contábil",
    triggers: [
      ["o que e", "auditoria contabil"],
      ["para que serve", "auditoria"],
      ["auditoria", "contabilidade"],
    ],
    answer: "Auditoria contábil é o exame independente de registros, controles e demonstrações. Ela aumenta a confiabilidade da informação e pode apontar riscos, inconsistências e melhorias de controle.",
  },
  {
    id: "contabilidade-pericia",
    category: "contabilidade",
    title: "Perícia contábil",
    triggers: [
      ["o que e", "pericia contabil"],
      ["pericia", "contabilidade"],
      ["para que serve", "pericia"],
    ],
    answer: "Perícia contábil é a investigação técnica de fatos contábeis em disputa. O perito analisa documentos e cálculos para produzir uma prova técnica que auxilie a decisão.",
  },
  {
    id: "tecnologia-ia-contabilidade",
    category: "tecnologia",
    title: "Inteligência artificial na contabilidade",
    triggers: [
      ["inteligencia artificial", "contabilidade"],
      ["ia", "contabilidade"],
      ["ia", "rotina contabil"],
      ["como a ia", "contabil"],
    ],
    answer: "A inteligência artificial pode classificar documentos, conciliar dados, resumir relatórios e apontar anomalias. O contador continua responsável pelo julgamento profissional, pela revisão e pela decisão.",
  },
  {
    id: "tecnologia-ia-auditoria",
    category: "tecnologia",
    title: "Inteligência artificial na auditoria",
    triggers: [
      ["inteligencia artificial", "auditoria"],
      ["ia", "auditoria"],
      ["como a ia", "auditoria"],
    ],
    answer: "Na auditoria, a IA ajuda a analisar grandes volumes, localizar transações atípicas e priorizar amostras. Ela não substitui evidências, testes de controle nem o ceticismo profissional do auditor.",
  },
  {
    id: "tecnologia-ciencia-vs-analise",
    category: "tecnologia",
    title: "Ciência de dados e análise de dados",
    triggers: [
      ["ciencia de dados", "analise de dados"],
      ["diferenca", "ciencia de dados", "analise"],
      ["dados", "contabilidade", "analise"],
    ],
    answer: "Análise de dados explica o que aconteceu e ajuda a decidir com indicadores. Ciência de dados vai além, usando estatística, programação e modelos para prever ou automatizar decisões.",
  },
  {
    id: "tecnologia-analise-financeira",
    category: "tecnologia",
    title: "IA na análise financeira",
    triggers: [
      ["inteligencia artificial", "analise financeira"],
      ["ia", "analise financeira"],
      ["ia", "mercado financeiro"],
    ],
    answer: "Na análise financeira, a IA pode comparar indicadores, resumir relatórios e detectar padrões em séries de dados. As conclusões precisam ser revisadas com contexto, premissas e fontes confiáveis.",
  },
];

const REMOTE_ONLY_RE = /\b(?:lei|legislacao|norma|aliquota|vigente|atual|hoje|agora|noticia|cotacao|previsao do tempo|prazo legal)\b/;
const FILLER_WORDS = new Set([
  "a", "o", "e", "de", "da", "do", "em", "no", "na", "um", "uma", "para", "por", "com",
  "que", "qual", "quais", "como", "sobre", "explique", "defina", "fale", "diga", "apresente",
  "informe", "me", "pode", "poderia",
]);

type RevisedKnowledgeRow = {
  id: string;
  category: string;
  title: string;
  triggers: string[][];
  answer: string;
};

export const REVISED_KNOWLEDGE_BANK: KnowledgeEntry[] = (revisedResponses as RevisedKnowledgeRow[]).map((entry) => ({
  ...entry,
  category: entry.category as KnowledgeCategory,
}));

const SEARCHABLE_KNOWLEDGE_BANK = [...KNOWLEDGE_BANK, ...REVISED_KNOWLEDGE_BANK].map((entry) => ({
  entry,
  triggers: entry.triggers.map((trigger) => {
    const terms = trigger.map(normalizeKnowledgeText).filter(Boolean);
    return {
      terms,
      contentWords: meaningfulTerms(terms.join(" ")).length,
      score: meaningfulTerms(terms.join(" ")).length * 10 + terms.length,
    };
  }),
}));

export function normalizeKnowledgeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\bi\s+itcont\b/g, "itcont")
    .replace(/\s+/g, " ")
    .trim();
}

function hasTerm(question: string, term: string, words: ReadonlySet<string>): boolean {
  if (!term) return false;
  if (term.includes(" ")) return question.includes(term);
  return words.has(term);
}

function meaningfulTerms(question: string): string[] {
  return question.split(" ").filter((word) => word.length >= 3 && !FILLER_WORDS.has(word));
}

/** Resolve somente fatos explícitos e estáveis. Perguntas vagas, contextuais,
 * dependentes de dataset ou sobre regra atual seguem para o provedor remoto. */
export function resolveKnowledgeAnswer(question: string): KnowledgeMatch | null {
  const normalized = normalizeKnowledgeText(question);
  if (normalized.length < 3 || meaningfulTerms(normalized).length === 0) return null;
  if (REMOTE_ONLY_RE.test(normalized)) return null;
  const questionWords = new Set(normalized.split(" "));

  let best: { entry: KnowledgeEntry; score: number } | null = null;
  for (const { entry, triggers } of SEARCHABLE_KNOWLEDGE_BANK) {
    for (const trigger of triggers) {
      if (!trigger.contentWords || !trigger.terms.every((term) => hasTerm(normalized, term, questionWords))) continue;
      // Content words decide specificity; interrogative/filler words only make
      // a generic trigger eligible and must not outrank a more specific topic.
      if (!best || trigger.score > best.score) best = { entry, score: trigger.score };
    }
  }
  if (!best) return null;
  return {
    id: best.entry.id,
    category: best.entry.category,
    title: best.entry.title,
    answer: best.entry.answer,
  };
}
