// Valida a cadeia de escuta do palco: microfone → "Ok, Ícaro" → pergunta → resposta → volta a ouvir.
// Foco nas regressões possíveis do streaming (fala frase por frase) e no ciclo de vida do turno.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WakeTurnGate, QUESTION_WINDOW_MS, resemblesPlayback } from '../../artifacts/icaro/src/lib/wake-turn-gate';
import { wakeAccessBlockReason, wakeAccessErrorMessage } from '../../artifacts/icaro/src/lib/wake-access';

const root = new URL('../../', import.meta.url).pathname;
const stage = readFileSync(root + 'artifacts/icaro/src/pages/stage.tsx', 'utf8');
const hook = readFileSync(root + 'artifacts/icaro/src/hooks/use-wake-listener.ts', 'utf8');
const speech = readFileSync(root + 'artifacts/icaro/src/lib/speech.ts', 'utf8');

/** Simula um turno completo: ativação, pergunta e fim da resposta (como o palco faz). */
function fullTurn(answerText: string, playedAudio: boolean) {
  const gate = new WakeTurnGate();
  const now = 1_000;
  const wakeEvents = gate.receive('Ok, Ícaro', true, 0, now, false);
  assert.ok(wakeEvents.some((e) => e.type === 'wake'), 'wake deveria ativar');
  const qEvents = gate.receive('o que é auditoria?', true, 1, now + 500, false);
  assert.ok(qEvents.some((e) => e.type === 'question'), 'pergunta deveria ser despachada');
  gate.complete(now + 3000, playedAudio);
  return gate;
}

const checks: Array<[string, () => void]> = [
  // --- Fiação do palco (estática) ---
  ['Palco liga onQuestion ao handle', () => assert.match(stage, /onQuestion:\s*\(question\)\s*=>\s*handleRef\.current\(question\)/)],
  ['Estado "talking" deixa a escuta ocupada', () => assert.match(stage, /busy:\s*state === 'talking' \|\| state === 'thinking' \|\| state === 'intro'/)],
  ['Espera da IA aceita nova ativação', () => assert.match(stage, /allowWakeDuringWait:\s*state === 'thinking'/)],
  ['onWake coloca o palco em "listening"', () => assert.match(stage, /onWake:[\s\S]{0,400}?setState\('listening'\)/)],
  ['onStop devolve o palco a "idle"', () => assert.match(stage, /onStop:[\s\S]{0,500}?setState\('idle'\)/)],
  ['Fim de comando devolve o controle à escuta (listener.complete)', () => assert.match(stage, /commandCompleteRef\.current = listener\.complete/)],
  ['Fala comum (say) libera a escuta no onEnd', () => assert.match(stage, /speak\(t, \{[\s\S]*?onEnd:[\s\S]*?commandCompleteRef\.current\(playedAudio\)/)],
  ['Fala em streaming libera a escuta no onEnd', () => assert.match(stage, /speakStream\(\{[\s\S]*?onEnd:[\s\S]*?commandCompleteRef\.current\(playedAudio\)/)],
  ['Erro no stream libera a escuta', () => assert.match(stage, /event === 'error'[\s\S]*?commandCompleteRef\.current\(false\)/)],
  ['Erro no caminho antigo (/ai/chat) libera a escuta', () => assert.match(stage, /viaChat[\s\S]*?onError[\s\S]*?commandCompleteRef\.current\(false\)/)],
  ['Fala em streaming sem áudio chama onEnd (não trava a escuta)', () => assert.match(speech, /options\.onError\?\.\(`Não foi possível iniciar o áudio[\s\S]*?options\.onEnd\(\)/)],
  ['speakStream.end() encerra fila vazia sem travar', () => assert.match(speech, /flush\(\) de uma fila vazia não dispara onEnd[\s\S]*?finishWhenDrained\(r\)/)],
  ['Botão de microfone alterna activate/standby', () => assert.match(stage, /listener\.active\) listener\.standby\(\); else listener\.activate\(\)/)],
  ['Sem suporte a voz, cai no modo digitação', () => assert.match(stage, /if \(!listener\.supported\) \{ setTyping\(true\)/)],

  // --- Hook de escuta (estático) ---
  ['Reconhecimento em pt-BR, contínuo e com interim', () => assert.match(hook, /next\.lang = 'pt-BR'; next\.interimResults = true; next\.continuous = true/)],
  ['Erro de permissão vira "blocked" e para de tentar', () => assert.match(hook, /'not-allowed', 'service-not-allowed', 'audio-capture', 'language-not-supported'[\s\S]*?setStatus\('blocked'\)/)],
  ['Reconhecimento reinicia sozinho ao terminar', () => assert.match(hook, /onend[\s\S]*?timer = window\.setTimeout\(start,/)],
  ['Mensagens de erro do microfone existem para cada bloqueio', () => {
    for (const k of ['iframe-policy', 'insecure-context', 'not-allowed', 'audio-capture', 'service-not-allowed', 'network', 'language-not-supported', 'unsupported']) {
      assert.ok(wakeAccessErrorMessage(k).length > 20, k);
    }
  }],
  ['iframe sem política de microfone é detectado', () => {
    assert.equal(wakeAccessBlockReason({ permissionsPolicy: { allowsFeature: () => false } }), 'iframe-policy');
    assert.equal(wakeAccessBlockReason({}, false), 'insecure-context');
    assert.equal(wakeAccessBlockReason({}), null);
  }],

  // --- Ciclo de vida do turno (lógico) ---
  ['Depois da resposta falada, nova ativação funciona', () => {
    const gate = fullTurn('Auditoria é a verificação independente das demonstrações.', true);
    const later = 1_000 + 3000 + 600; // após o guarda de eco (450 ms)
    const ev = gate.receive('Ok, Ícaro', true, 2, later, false);
    assert.ok(ev.some((e) => e.type === 'wake'), 'wake pós-resposta deveria ativar');
  }],
  ['Eco da própria resposta não vira pergunta', () => {
    const answer = 'Auditoria é a verificação independente das demonstrações e controles de uma empresa.';
    assert.ok(resemblesPlayback('auditoria é a verificação independente das', answer));
    const gate = fullTurn(answer, true);
    const ev = gate.receive('auditoria é a verificação independente das demonstrações', true, 2, 4600, false, true);
    assert.deepEqual(ev, []);
    assert.equal(gate.pending, false);
  }],
  ['Pergunta falada durante a resposta não é engolida para sempre', () => {
    const gate = new WakeTurnGate();
    gate.arm(0);
    gate.receive('o que é ativo?', true, 0, 100, false);
    gate.complete(2000, true);
    // durante a fala (busy), frase é suprimida…
    assert.deepEqual(gate.receive('e passivo?', true, 1, 2100, true), []);
    // …mas a próxima ativação após a fala funciona
    const ev = gate.receive('Ok, Ícaro, e passivo?', true, 2, 2600, false);
    assert.ok(ev.some((e) => e.type === 'question'), JSON.stringify(ev));
  }],
  ['Nova ativação durante o "pensando" cancela a espera e escuta', () => {
    const gate = new WakeTurnGate();
    gate.arm(0);
    gate.receive('pergunta longa que está sendo respondida', true, 0, 100, false);
    assert.equal(gate.pending, true);
    // palco está 'thinking' (busy=true) mas allowWakeDuringWait=true
    const ev = gate.receive('Ok, Ícaro', true, 1, 500, true, false, true);
    assert.ok(ev.some((e) => e.type === 'wake'), 'wake durante thinking deveria rearmar');
    assert.equal(gate.pending, false);
  }],
  ['Janela de 12 s após a ativação expira e não escuta mais', () => {
    const gate = new WakeTurnGate();
    gate.arm(0);
    assert.equal(gate.expire(QUESTION_WINDOW_MS), true);
    assert.deepEqual(gate.receive('qualquer frase', true, 0, QUESTION_WINDOW_MS + 10, false), []);
  }],
  ['Stop imediatamente após a resposta interrompe e libera', () => {
    const gate = fullTurn('Resposta qualquer com palavras suficientes para eco.', true);
    const ev = gate.receive('pare, Ícaro', true, 2, 4600, false);
    assert.ok(ev.some((e) => e.type === 'stop'));
    assert.equal(gate.active, false);
    assert.equal(gate.pending, false);
  }],

  // --- Transcrição visível ("eu falo e não transcreve") ---
  ['Transcrição ao vivo é exibida na legenda enquanto ele ouve', () => {
    assert.match(stage, /onTranscript: \(t\) => \{[^}]*setCaption\(t\)/, 'onTranscript precisa mostrar o texto ouvido');
    assert.match(stage, /hidden=\{!visibleCaption \|\| \(!captionsVisible && !listener\.active\)\}/, 'legenda precisa aparecer durante a escuta ativa');
  }],
  ['Frase ouvida após a ativação gera evento de transcrição', () => {
    const gate = new WakeTurnGate();
    gate.arm(0);
    const interim = gate.receive('o que é auditoria', false, 0, 100, false);
    assert.ok(interim.some((e) => e.type === 'transcript' && e.text.includes('auditoria')), JSON.stringify(interim));
    const final = gate.receive('o que é auditoria?', true, 0, 600, false);
    assert.ok(final.some((e) => e.type === 'question'), JSON.stringify(final));
  }],
];

// --- Página de diagnóstico do microfone (/mic-test) ---
const micPage = readFileSync(root + 'artifacts/icaro/src/pages/mic-test.tsx', 'utf8');
const appRoutes = readFileSync(root + 'artifacts/icaro/src/App.tsx', 'utf8');
const apiRoutes = readFileSync(root + 'artifacts/api-server/src/routes/index.ts', 'utf8');
const apiMicTest = readFileSync(root + 'artifacts/api-server/src/routes/mic-test.ts', 'utf8');
checks.push(
  ['Página /mic-test existe e está registrada no roteador', () => {
    assert.match(appRoutes, /path="\/mic-test" component=\{MicTest\}/);
    assert.match(micPage, /rec\.lang = 'pt-BR'; rec\.interimResults = true; rec\.continuous = true/);
  }],
  ['Página /mic-test grava cada transcrição final no servidor', () => {
    assert.match(micPage, /api\/mic-test[\s\S]{0,200}?credentials: 'include'/);
    assert.match(apiRoutes, /"\/mic-test"\], requireAuth\(\)/);
    assert.match(apiMicTest, /router\.post\("\/mic-test"/);
    assert.match(apiMicTest, /router\.get\("\/mic-test"/);
  }],
);

let failed = 0;
for (const [name, fn] of checks) {
  try { fn(); console.log('  ok  ', name); }
  catch (e) { failed++; console.log('  FALHA', name, '—', (e as Error).message.split('\n')[0]); }
}
console.log(`\nvalidate-listen: ${checks.length - failed} ok, ${failed} falha(s)`);
process.exit(failed ? 1 : 0);
