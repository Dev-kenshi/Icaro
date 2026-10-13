import { ITCONT } from './dados';
import { dataExtenso, horaCurta, sessoesOrdenadas } from './logica';

export type RespostaInteligencia = {
  texto: string;
  fonte: 'FAQ oficial' | 'dados oficiais do evento' | 'Even3';
  url?: string;
};

type Conhecimento = {
  termos: string[];
  resposta: () => string;
  fonte: RespostaInteligencia['fonte'];
};

const aliasesFaq: string[][] = [
  ['inscricao', 'inscrever', 'pagamento', 'paga', 'pago', 'preco', 'valor', 'gratuita', 'gratuito', 'custa'],
  ['quando', 'data', 'datas', 'dia', 'dias', 'onde', 'local', 'endereco', 'acontece', 'acontecer', 'fica', 'lugar', 'auditorio'],
  ['presencial', 'online', 'remoto', 'virtual', 'formato'],
  ['participar', 'participacao', 'publico', 'estudante', 'estudantes', 'professor', 'professores', 'profissional'],
  ['realiza', 'realizacao', 'organiza', 'organizacao', 'organizador', 'projeto'],
  ['prazo', 'encerramento', 'inscricao', 'inscrever', 'ate', 'ultimo', 'limite'],
];

const palavrasVazias = new Set([
  'a', 'as', 'o', 'os', 'um', 'uma', 'uns', 'umas', 'de', 'do', 'da', 'dos', 'das',
  'em', 'no', 'na', 'nos', 'nas', 'para', 'por', 'com', 'e', 'ou', 'que', 'qual',
  'quais', 'quem', 'como', 'me', 'posso', 'vai', 'ser', 'ter',
  'sobre', 'evento', 'itcont', 'eu', 'voce', 'vocês', 'sao', 'pode', 'podem', 'quantos', 'quantas', 'quanto',
]);

function normalizar(texto: string): string[] {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter((palavra) => palavra && !palavrasVazias.has(palavra));
}

function respostasConhecidas(): Conhecimento[] {
  const faq = ITCONT.faq.map((item, index): Conhecimento => ({
    termos: [
      ...normalizar(`${item.p} ${item.r}`).filter((termo) => index !== 5 || termo !== 'quando'),
      ...(aliasesFaq[index] ?? []),
    ],
    resposta: () => item.r,
    fonte: 'FAQ oficial',
  }));

  const sessoes = sessoesOrdenadas();
  const convidados = ITCONT.convidados.map(({ nome }) => nome).join(', ');

  return [
    ...faq,
    {
      termos: ['programacao', 'agenda', 'cronograma', 'palestra', 'palestras', 'sessao', 'sessoes', 'hora', 'horas', 'horario', 'horarios', 'tema', 'bate', 'papo'],
      resposta: () => `A programação oficial é:\n${sessoes.map((sessao) => `• ${dataExtenso(sessao.data)}, ${horaCurta(sessao.inicio)}–${horaCurta(sessao.fim)} — ${sessao.titulo}`).join('\n')}`,
      fonte: 'dados oficiais do evento',
    },
    {
      termos: ['convidado', 'convidados', 'palestrante', 'palestrantes', 'participacao', 'nomes'],
      resposta: () => `Os convidados divulgados são: ${convidados}.`,
      fonte: 'dados oficiais do evento',
    },
    {
      termos: ['tema', 'assunto', 'objetivo', 'imersao', 'tecnologia', 'inteligencia', 'contabilidade', 'sobre'],
      resposta: () => ITCONT.resumo,
      fonte: 'dados oficiais do evento',
    },
  ];
}

const conhecimento = respostasConhecidas();

function respostaNaoEncontrada(): RespostaInteligencia {
  return {
    texto: 'Não sei responder isso com os dados oficiais do ITCONT e o FAQ disponível. Confira os detalhes diretamente na página oficial do Even3.',
    fonte: 'Even3',
    url: ITCONT.fonteUrl,
  };
}

/** Busca local e determinística. Nunca gera fatos fora de dados.ts e do FAQ oficial. */
export function responderSobreItcont(pergunta: string): RespostaInteligencia {
  const termosPergunta = [...new Set(normalizar(pergunta))];
  if (!termosPergunta.length) return respostaNaoEncontrada();

  const candidatos = conhecimento
    .map((item) => {
      const termosItem = new Set(item.termos);
      const acertos = termosPergunta.filter((termo) => termosItem.has(termo)).length;
      return { item, acertos, cobertura: acertos / termosPergunta.length };
    })
    .filter(({ acertos, cobertura }) =>
      (termosPergunta.length === 1 && acertos === 1) ||
      (acertos >= 2 && cobertura >= 0.5),
    )
    .sort((a, b) => b.cobertura - a.cobertura || b.acertos - a.acertos);

  const melhor = candidatos[0];
  const segunda = candidatos[1];
  if (!melhor || (segunda && melhor.cobertura - segunda.cobertura < 0.12 && melhor.acertos < 3)) {
    return respostaNaoEncontrada();
  }

  return {
    texto: melhor.item.resposta(),
    fonte: melhor.item.fonte,
  };
}
