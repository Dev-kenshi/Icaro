import assert from 'node:assert/strict';
import { parseWakeCommand } from '../../artifacts/icaro/src/lib/wake-commands';
import { WakeTurnGate, QUESTION_WINDOW_MS, resemblesPlayback } from '../../artifacts/icaro/src/lib/wake-turn-gate';
import { wakeAccessBlockReason, wakeAccessErrorMessage } from '../../artifacts/icaro/src/lib/wake-access';

const checks: Array<[string, () => void]> = [
  ['Conversa ambiente não ativa nem envia perguntas', () => assert.equal(parseWakeCommand('qual é a hora?', false).question, '')],
  ['Ok, Ícaro ativa com acento', () => assert.equal(parseWakeCommand('Ok, Ícaro', false).wake, true)],
  ['Aceita caixa alta e nome sem acento', () => assert.equal(parseWakeCommand('OK ICARO', false).wake, true)],
  ['Okay também é reconhecido', () => assert.equal(parseWakeCommand('Okay, Ícaro.', false).wake, true)],
  ['Extrai a pergunta junto à ativação', () => assert.equal(parseWakeCommand('Ok, Ícaro, o que é patrimônio?', false).question, 'o que é patrimônio?')],
  ['Ativação sozinha não gera uma pergunta', () => assert.equal(parseWakeCommand('Ok, Ícaro!', false).question, '')],
  ['Conversa ativa aceita a próxima frase', () => assert.equal(parseWakeCommand('O que é ativo?', true).question, 'O que é ativo?')],
  ['Stop funciona na conversa ativa', () => assert.equal(parseWakeCommand('Stop, Ícaro', true).stop, true)],
  ['Stop funciona também em espera', () => assert.equal(parseWakeCommand('stop icaro', false).stop, true)],
  ['Stop tem prioridade e não envia pergunta', () => assert.deepEqual(parseWakeCommand('Ok, Ícaro, stop, Ícaro', true), { stop: true, wake: false, question: '' })],
  ['Nome sozinho não ativa', () => assert.equal(parseWakeCommand('Ícaro', false).wake, false)],
  ['Outros nomes não ativam', () => assert.equal(parseWakeCommand('Ok, Carlos', false).wake, false)],
  ['Palavra semelhante não ativa', () => assert.equal(parseWakeCommand('ok icarolina', false).wake, false)],
  ['Frase vazia não envia perguntas', () => assert.equal(parseWakeCommand('', true).question, '')],
  ['Pare, Ícaro também interrompe', () => assert.equal(parseWakeCommand('Pare, Ícaro!', true).stop, true)],
  ['Ambiente em espera não autoriza fala', () => {
    const gate = new WakeTurnGate();
    assert.deepEqual(gate.receive('fale sobre ativo', true, 0, 0, false), []);
    assert.equal(gate.pending, false);
  }],
  ['Ativação sem pergunta nunca gera resposta', () => {
    const gate = new WakeTurnGate();
    assert.deepEqual(gate.receive('Ok, Ícaro', true, 0, 0, false), [{ type: 'wake' }]);
    assert.equal(gate.pending, false);
  }],
  ['Ativação vazia expira em silêncio', () => {
    const gate = new WakeTurnGate(); gate.arm(0);
    assert.equal(gate.expire(QUESTION_WINDOW_MS - 1), false);
    assert.equal(gate.expire(QUESTION_WINDOW_MS), true);
    assert.equal(gate.active, false);
    assert.deepEqual(gate.receive('esta frase chegou tarde', true, 1, QUESTION_WINDOW_MS + 1, false), []);
  }],
  ['Cada ativação permite exatamente uma pergunta', () => {
    const gate = new WakeTurnGate();
    const events = gate.receive('Ok Ícaro, qual é a hora?', true, 0, 0, false);
    assert.equal(events.filter((x) => x.type === 'question').length, 1);
    assert.equal(gate.active, false);
    gate.complete(1);
    assert.deepEqual(gate.receive('conversa ao fundo', true, 1, 2, false), []);
  }],
  ['Eco final após terminar o áudio é ignorado', () => {
    const gate = new WakeTurnGate();
    assert.deepEqual(gate.receive('Ok Ícaro o ativo representa bens', false, 0, 0, true), []);
    gate.complete(100, true);
    assert.deepEqual(gate.receive('Ok Ícaro o ativo representa bens', true, 0, 2000, false), []);
    assert.equal(gate.active, false);
  }],
  ['Mesmo eco entregue só depois da fala é ignorado', () => {
    const gate = new WakeTurnGate();
    const echo = resemblesPlayback('diga ok icaro para perguntar', 'Você pode dizer: diga “Ok, Ícaro” para perguntar.');
    assert.equal(echo, true);
    assert.deepEqual(gate.receive('diga ok icaro para perguntar', true, 0, 4000, false, echo), []);
  }],
  ['Stop interrompe mesmo durante a fala', () => {
    const gate = new WakeTurnGate(); gate.arm(0);
    gate.receive('pergunta', true, 0, 1, false);
    assert.deepEqual(gate.receive('Stop Ícaro', false, 1, 2, true), [{ type: 'stop' }]);
    assert.equal(gate.active, false); assert.equal(gate.pending, false);
  }],
  ['Parcial “pare” durante a fala ainda vira Stop no mesmo resultado', () => {
    const gate = new WakeTurnGate(); gate.arm(0);
    gate.receive('pergunta', true, 0, 1, false);
    assert.deepEqual(gate.receive('pare', false, 1, 2, true), []);
    assert.deepEqual(gate.receive('pare Ícaro', true, 1, 3, true), [{ type: 'stop' }]);
    const echo = new WakeTurnGate();
    assert.deepEqual(echo.receive('pare', false, 0, 2, true, true), []);
    assert.deepEqual(echo.receive('pare Ícaro', true, 0, 3, true), []);
  }],
  ['Interim e final não duplicam perguntas', () => {
    const gate = new WakeTurnGate();
    gate.receive('Ok Ícaro qual é a hora', false, 0, 0, false);
    assert.equal(gate.receive('Ok Ícaro qual é a hora', true, 0, 1, false).filter((x) => x.type === 'question').length, 1);
    assert.deepEqual(gate.receive('Ok Ícaro qual é a hora', true, 0, 2, false), []);
  }],
  ['Resposta rápida libera uma nova ativação sem trava artificial', () => {
    const gate = new WakeTurnGate();
    gate.receive('Ok Ícaro hora', true, 0, 0, false); gate.complete(10);
    assert.equal(gate.receive('Ok Ícaro data', true, 1, 20, false).filter((x) => x.type === 'question').length, 1);
  }],
  ['Silêncio e pontuação não viram perguntas', () => {
    const gate = new WakeTurnGate(); gate.arm(0);
    assert.deepEqual(gate.receive('...', true, 0, 1, false), []);
    assert.equal(gate.pending, false);
  }],
  ['Reconectar não transforma ambiente em pergunta', () => {
    const gate = new WakeTurnGate(); gate.newRecognitionSession();
    assert.deepEqual(gate.receive('continuando a conversar', true, 0, 0, false), []);
  }],
  ['Mencionar ativação em uma conversa não chama o assistente', () => {
    const gate = new WakeTurnGate();
    assert.deepEqual(gate.receive('ele disse ok icaro durante a aula', true, 0, 0, false), []);
    assert.equal(gate.active, false);
  }],
];
for (const phrase of ['O.K. Ícaro', 'O K Icaro', 'Okey, Ícaro', 'Ok I\u0301caro']) {
  checks.push([`Variação de transcrição "${phrase}" ativa sem enviar pergunta`, () => {
    const result = parseWakeCommand(phrase, false);
    assert.equal(result.wake, true);
    assert.equal(result.question, '');
  }]);
}
checks.push(
  ['Prefixo interim incompleto pode evoluir para uma ativação na espera', () => {
    const gate = new WakeTurnGate();
    gate.receive('Ok Ícaro explique custos', true, 0, 0, false);
    assert.deepEqual(gate.receive('Ok', false, 1, 2000, true, false, true), []);
    const actions = gate.receive('Ok Ícaro explique receitas', true, 1, 2100, true, false, true);
    assert.equal(actions.filter((event) => event.type === 'wake').length, 1);
    assert.equal(actions.filter((event) => event.type === 'question').length, 1);
  }],
  ['Interim e final ambiente na espera não abrem a escuta', () => {
    const gate = new WakeTurnGate();
    gate.receive('Ok Ícaro explique custos', true, 0, 0, false);
    assert.deepEqual(gate.receive('continua', false, 1, 2000, true, false, true), []);
    assert.deepEqual(gate.receive('continuando a conversa', true, 1, 2100, true, false, true), []);
    assert.equal(gate.pending, true);
    assert.equal(gate.active, false);
  }],
  ['Interim de eco na espera continua suprimido quando o final chega', () => {
    const gate = new WakeTurnGate();
    gate.receive('Ok Ícaro explique custos', true, 0, 0, false);
    assert.deepEqual(gate.receive('Ok', false, 1, 2000, true, true, true), []);
    assert.deepEqual(gate.receive('Ok Ícaro', true, 1, 2100, true, false, true), []);
    assert.equal(gate.pending, true);
    assert.equal(gate.active, false);
  }],
  ['Uma nova ativação interrompe a espera por resposta ou preparação da voz', () => {
    const gate = new WakeTurnGate();
    gate.receive('Ok Ícaro explique custos', true, 0, 0, false);
    assert.equal(gate.pending, true);
    assert.deepEqual(gate.receive('Ok Ícaro', true, 1, 2000, true, false, true), [{ type: 'wake' }]);
    assert.equal(gate.pending, false);
    assert.equal(gate.active, true);
    assert.equal(gate.receive('Explique receitas', true, 2, 2100, true, false, true).filter((event) => event.type === 'question').length, 1);
  }],
  ['Fala ambiente durante a espera não cancela nem autoriza uma pergunta', () => {
    const gate = new WakeTurnGate();
    gate.receive('Ok Ícaro explique custos', true, 0, 0, false);
    assert.deepEqual(gate.receive('conversa na sala', true, 1, 2000, true, false, true), []);
    assert.equal(gate.pending, true);
    assert.equal(gate.active, false);
  }],
  ['Nova ativação junto da pergunta na espera envia uma única pergunta', () => {
    const gate = new WakeTurnGate();
    gate.receive('Ok Ícaro explique custos', true, 0, 0, false);
    const actions = gate.receive('Ok Ícaro explique receitas', true, 1, 2000, true, false, true);
    assert.equal(actions.filter((event) => event.type === 'wake').length, 1);
    assert.equal(actions.filter((event) => event.type === 'question').length, 1);
    assert.equal(gate.pending, true);
  }],
  ['Revisões do interim na espera não cancelam a nova ativação', () => {
    const gate = new WakeTurnGate();
    gate.receive('Ok Ícaro explique custos', true, 0, 0, false);
    gate.receive('Ok Ícaro', false, 1, 2000, true, false, true);
    assert.deepEqual(gate.receive('O K Ícaro', true, 1, 2100, true, false, true), []);
    assert.equal(gate.active, true);
  }],
  ['Reprodução de áudio continua sem aceitar ativações por eco', () => {
    const gate = new WakeTurnGate();
    gate.receive('Ok Ícaro explique custos', true, 0, 0, false);
    assert.deepEqual(gate.receive('Ok Ícaro', true, 1, 2000, true, false, false), []);
    assert.equal(gate.pending, true);
    assert.equal(gate.active, false);
  }],
  ['Eco identificado não interrompe sequer uma espera', () => {
    const gate = new WakeTurnGate();
    gate.receive('Ok Ícaro explique custos', true, 0, 0, false);
    assert.deepEqual(gate.receive('Ok Ícaro', true, 1, 2000, true, true, true), []);
    assert.equal(gate.pending, true);
  }],
  ['Variação reconhecida preserva a pergunta depois do nome', () => {
    assert.deepEqual(parseWakeCommand('O.K., Ícaro, explique custos', false),
      { stop: false, wake: true, question: 'explique custos' });
  }],
  ['Correção do interim para O K não transforma ativação vazia em pergunta', () => {
    const gate = new WakeTurnGate();
    gate.receive('Ok Ícaro', false, 0, 100, false);
    const actions = gate.receive('O K Ícaro', true, 0, 200, false);
    assert.equal(actions.some((event) => event.type === 'question'), false);
    assert.equal(gate.active, true);
  }],
  ['Variantes dentro de conversa ambiente continuam sem autorizar perguntas', () => {
    for (const text of ['ele disse O.K. Ícaro', 'o que aconteceu com Ícaro', 'O que Ícaro faz?', 'Om Ícaro', 'o que custa isso']) {
      assert.equal(parseWakeCommand(text, false).wake, false);
      assert.equal(parseWakeCommand(text, false).question, '');
    }
  }],
  ['Bloqueio do iframe é identificado antes de iniciar captura', () => {
    assert.equal(wakeAccessBlockReason({ permissionsPolicy: { allowsFeature: () => false } }), 'iframe-policy');
  }],
  ['Política antiga do navegador também detecta bloqueio', () => {
    assert.equal(wakeAccessBlockReason({ featurePolicy: { allowsFeature: () => false } }), 'iframe-policy');
  }],
  ['Página insegura não anuncia captura de microfone', () => {
    assert.equal(wakeAccessBlockReason({}, false), 'insecure-context');
  }],
  ['Política ausente ou permissiva deixa o navegador decidir a permissão', () => {
    assert.equal(wakeAccessBlockReason({}), null);
    assert.equal(wakeAccessBlockReason({ permissionsPolicy: { allowsFeature: () => true } }), null);
  }],
  ['Falha ao consultar política não derruba o reconhecimento', () => {
    assert.equal(wakeAccessBlockReason({ permissionsPolicy: { allowsFeature: () => { throw new Error('unsupported'); } } }), null);
  }],
  ['Avisos distinguem bloqueio de permissão, dispositivo e serviço do navegador', () => {
    assert.match(wakeAccessErrorMessage('not-allowed'), /Permita o acesso/);
    assert.match(wakeAccessErrorMessage('audio-capture'), /dispositivo/);
    assert.match(wakeAccessErrorMessage('iframe-policy'), /nova aba/);
    assert.match(wakeAccessErrorMessage('network'), /não da Groq/);
    assert.match(wakeAccessErrorMessage('start-failed'), /tentando novamente automaticamente/);
  }],
);
let failures = 0;
for (const [i, [label, run]] of checks.entries()) {
  try { run(); console.log(`✓ ${String(i + 1).padStart(2, '0')}. ${label}`); }
  catch (error) { failures++; console.error(`✗ ${label}`, error); }
}
console.log(`\n${checks.length - failures}/${checks.length} validações da ativação por voz passaram.`);
process.exitCode = failures ? 1 : 0;