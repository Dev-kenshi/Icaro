import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ITCONT } from './dados';
import { responderSobreItcont } from './inteligencia';

const componente = readFileSync(fileURLToPath(new URL('./secoes/InteligenciaEvento.tsx', import.meta.url)), 'utf8');
const casos: Array<[string, string]> = [
  ['A inscrição é gratuita?', ITCONT.faq[0].r],
  ['Onde acontece?', ITCONT.faq[1].r],
  ['Quando é o evento?', ITCONT.faq[1].r],
  ['Onde fica?', ITCONT.faq[1].r],
  ['O evento é presencial ou online?', ITCONT.faq[2].r],
  ['Quem pode participar?', ITCONT.faq[3].r],
  ['Quem organiza o evento?', ITCONT.faq[4].r],
  ['Até quando posso me inscrever?', ITCONT.faq[5].r],
];

for (const [pergunta, resposta] of casos) {
  const resultado = responderSobreItcont(pergunta);
  assert.equal(resultado.texto, resposta, `Resposta deve vir do FAQ: ${pergunta}`);
  assert.equal(resultado.fonte, 'FAQ oficial');
}

const programacao = responderSobreItcont('Qual é a programação e o horário das palestras?');
assert.ok(ITCONT.sessoes.every(({ titulo }) => programacao.texto.includes(titulo)));
assert.equal(programacao.fonte, 'dados oficiais do evento');

const convidados = responderSobreItcont('Quem são os convidados palestrantes?');
assert.ok(ITCONT.convidados.every(({ nome }) => convidados.texto.includes(nome)));

for (const pergunta of ['Tem certificado?', 'Qual ônibus pega no aeroporto?', 'Quanto custa o estacionamento?']) {
  const resultado = responderSobreItcont(pergunta);
  assert.match(resultado.texto, /Não sei responder/);
  assert.equal(resultado.fonte, 'Even3');
  assert.equal(resultado.url, ITCONT.fonteUrl);
}

assert.match(responderSobreItcont('valor da inscrição').texto, /gratuitas/);
assert.equal(responderSobreItcont('qual é o tema da imersão').texto, ITCONT.resumo);
assert.doesNotMatch(componente, /\bfetch\s*\(|requestAiChatStream|Authorization|localStorage/);
const total = casos.length * 2 + 2 + 1 + 3 * 3 + 1 + 1 + 1;
console.log(`${total}/${total} validações do assistente local aprovadas`);
