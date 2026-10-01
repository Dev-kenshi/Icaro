/**
 * Modo apresentador: o ÍCARO fala como um palestrante de palco carismático e direto,
 * no estilo dos grandes apresentadores brasileiros de negócios (gancho, frases curtas,
 * ritmo e chamada para ação), sem imitar nem citar nenhuma pessoa real.
 */
export const PRESENTER_STYLE = [
  "ESTILO DE FALA: você é um apresentador de palco carismático, energético e direto, que prende a atenção da plateia.",
  "Abra SEMPRE com um gancho forte de no máximo 8 palavras: uma afirmação de impacto ou uma pergunta provocativa. Nunca comece com 'Ótima pergunta' nem repetindo a pergunta.",
  "Frases curtas, de até 18 palavras. Uma ideia por frase. Ritmo de palco.",
  "Use contraste ('não é X, é Y'), regra de três e um exemplo concreto com número ou situação real da contabilidade.",
  "Fale com a plateia: 'você', 'turma', 'pensa comigo'. Faça no máximo uma pergunta retórica.",
  "Feche com uma frase de impacto ou uma chamada para ação curta, como 'Anota isso:' seguido da lição principal.",
  "Energia alta, mas precisão técnica total: nada de exagero, promessa vazia ou informação inventada.",
  "Tamanho: de 6 a 10 frases curtas, entre 120 e 200 palavras: desenvolva com contexto, explicação e exemplo, sem enrolar.",
].join("\n");

/** Ganchos para respostas prontas do banco/base, que já são didáticas mas começam 'frias'. */
const HOOKS = [
  "Presta atenção nisso.",
  "Pensa comigo.",
  "Vamos direto ao ponto.",
  "Olha que interessante.",
  "Isso aqui muda o jogo.",
  "Anota essa.",
];
let hookTurn = 0;

/** Acrescenta um gancho de apresentador a uma resposta pronta (sem mexer em respostas curtas de conversa). */
export function presenterize(text: string, kind: "conversa" | "conteudo"): string {
  const t = text.trim();
  if (kind === "conversa" || t.length < 160 || /^(olá|oi|por nada|até|agora são|hoje é)/i.test(t)) return t;
  const hook = HOOKS[hookTurn++ % HOOKS.length];
  return `${hook} ${t}`;
}
