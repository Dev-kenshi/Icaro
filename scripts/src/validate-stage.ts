import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { WakeTurnGate, QUESTION_WINDOW_MS, resemblesPlayback } from '../../artifacts/icaro/src/lib/wake-turn-gate';
import { applyTtsPronunciation } from '../../artifacts/api-server/src/lib/tts-timestamps';

const root = path.resolve(import.meta.dirname, '../..');
const app = path.join(root, 'artifacts/icaro');
const read = (file: string) => readFileSync(path.join(app, file), 'utf8');
const checks: Array<[string, () => void | Promise<void>]> = [];
const check = (title: string, fn: () => void | Promise<void>) => checks.push([title, fn]);
const questions = (events: ReturnType<WakeTurnGate['receive']>) => events.filter((e) => e.type === 'question');

check('Conversas do ambiente não acionam respostas', () => {
  const gate = new WakeTurnGate();
  for (const [i, text] of ['bom dia turma', 'o Ícaro está aqui', 'ele disse ok icaro na aula'].entries()) {
    assert.equal(questions(gate.receive(text, true, i, i * 100, false)).length, 0);
    assert.equal(gate.active, false);
  }
});

check('Ativação sem pergunta expira em silêncio', () => {
  const gate = new WakeTurnGate();
  assert.equal(questions(gate.receive('Ok Ícaro', true, 0, 0, false)).length, 0);
  assert.equal(gate.expire(QUESTION_WINDOW_MS - 1), false);
  assert.equal(gate.expire(QUESTION_WINDOW_MS), true);
  assert.equal(gate.pending, false);
  assert.equal(questions(gate.receive('frase atrasada', true, 1, QUESTION_WINDOW_MS + 1, false)).length, 0);
});

check('Uma ativação permite uma pergunta, sem duplicação', () => {
  const gate = new WakeTurnGate();
  gate.receive('Ok Ícaro calcule', false, 0, 0, false);
  assert.equal(questions(gate.receive('Ok Ícaro calcule 30% de 200', true, 0, 1, false)).length, 1);
  assert.equal(gate.active, false);
  assert.deepEqual(gate.receive('Ok Ícaro calcule 30% de 200', true, 0, 2, false), []);
  gate.complete(10);
  assert.equal(questions(gate.receive('outra conversa', true, 1, 11, false)).length, 0);
});

check('O próprio áudio e transcrições tardias são ignorados', () => {
  const gate = new WakeTurnGate();
  gate.receive('Ok Ícaro esta é minha resposta', false, 0, 0, true);
  gate.complete(100, true);
  assert.deepEqual(gate.receive('Ok Ícaro esta é minha resposta', true, 0, 3000, false), []);
  const echo = resemblesPlayback('ok icaro esta é minha resposta', 'Ok Ícaro, esta é minha resposta.');
  assert.equal(echo, true);
  assert.deepEqual(gate.receive('Ok Ícaro esta é minha resposta', true, 1, 4000, false, echo), []);
});

check('Stop cancela a ativação e permite uma nova pergunta', () => {
  const gate = new WakeTurnGate();
  gate.receive('Ok Ícaro pergunta', true, 0, 0, false);
  assert.equal(gate.pending, true);
  assert.deepEqual(gate.receive('Stop Ícaro', false, 1, 1, true), [{ type: 'stop' }]);
  assert.equal(gate.pending, false); assert.equal(gate.active, false);
  assert.equal(questions(gate.receive('Ok Ícaro qual é a hora', true, 2, 2, false)).length, 1);
});

check('A boca permanece fechada em repouso e silêncio', () => {
  const context = {
    self: { IcaroVisemes: { sample: () => ({ open: .7, width: .5, press: false }) } },
    window: { devicePixelRatio: 1 }, performance: { now: () => 1000 },
    requestAnimationFrame: () => 0, Image: class {}, document: {}, Math, Set, Object, Promise,
    fetch: () => { throw new Error('Nenhuma rede é necessária para esta validação'); },
  };
  vm.runInNewContext(read('public/avatar/avatar-engine.js'), context);
  const proto = (context.self as unknown as { IcaroAvatar: { prototype: {
    _mouthTarget: (now: number) => { open: number }
  } } }).IcaroAvatar.prototype;
  for (const state of ['idle', 'listening', 'thinking', 'speaking']) {
    const target = proto._mouthTarget.call({
      state, tl: { emphasis: [] }, clock: () => .4, neutralWidth: .45,
      useLevelGate: true, level: 0, levelAt: 900, _silentSince: 700, _t: () => 1000,
    }, 1000);
    assert.equal(target.open, 0, state);
  }
});

check('Palavras têm tempos ordenados e UEFS mantém a grafia', () => {
  type V = {
    synthAlignment: (text: string, rate: number) => unknown;
    buildTimeline: (alignment: unknown) => { words: { text: string; t0: number; t1: number }[] };
  };
  const context: { self: { IcaroVisemes?: V }; Math: Math } = { self: {}, Math };
  vm.runInNewContext(read('public/avatar/visemes-ptbr.js'), context);
  const v = context.self.IcaroVisemes!;
  const text = 'Olá turma da UEFS. Bem-vindos!';
  const timeline = v.buildTimeline(v.synthAlignment(text, 13));
  assert.ok(timeline.words.length >= 5);
  timeline.words.forEach((word, i, words) => {
    assert.ok(word.t1 >= word.t0);
    if (i) assert.ok(word.t0 >= words[i - 1].t0);
  });
  assert.equal(applyTtsPronunciation('Olá UEFS!'), 'Olá Uéfis!');
  assert.match(text, /UEFS/);
  assert.match(read('src/lib/speech.ts'), /onWords/);
});

check('Rosto em canvas sem máscaras de corte ou vídeo facial', () => {
  const face = read('src/components/stage/holo-face.tsx');
  const css = read('src/pages/stage.css');
  assert.match(face, /<canvas/);
  assert.doesNotMatch(face, /<video\b/);
  assert.doesNotMatch(face, /maxHeight:\s*'100%'/);
  assert.match(css, /mask-image:\s*none/);
  assert.match(css, /container-type:\s*size/);
  assert.match(css, /100cqh/);
  assert.match(css, /prefers-reduced-motion/);
  // P10 extension files may carry expression/speech additions; everything else must match the vendor package.
  for (const file of ['visemes-ptbr.js', 'assets/base.jpg']) {
    assert.deepEqual(
      readFileSync(path.join(app, 'public/avatar', file)),
      readFileSync(path.join(root, 'vendor/icaro-humano/avatar', file)),
    );
  }
  const engine = read('public/avatar/avatar-engine.js');
  assert.match(engine, /setEmotion\(/);
  assert.match(engine, /setListeningActivity\(/);
  const player = read('public/avatar/speech-player.js');
  assert.match(player, /gapAfter/);
  assert.match(player, /playbackRate/);
});

check('API rejeita pedidos vazios e inválidos, sem chamar a voz', async () => {
  const domain = process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS?.split(',')[0];
  assert.ok(domain, 'Domínio de desenvolvimento necessário para a validação HTTP');
  const password = process.env.ICARO_USER1_PASSWORD;
  assert.ok(password, 'ICARO_USER1_PASSWORD é necessária para o login de validação');
  const login = await fetch(`https://${domain}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'user1', password }), signal: AbortSignal.timeout(10_000),
  });
  assert.equal(login.status, 200, `Login de validação falhou: ${login.status}`);
  const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0];
  assert.ok(cookie.startsWith('icaro_session='), 'Sessão de validação não criada');
  for (const body of [{ text: '' }, { text: 'a'.repeat(601) }, { text: 42 }]) {
    const response = await fetch(`https://${domain}/api/tts-ts`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify(body), signal: AbortSignal.timeout(10_000),
    });
    assert.ok([400, 413].includes(response.status), `Código inesperado: ${response.status}`);
    const data = await response.text();
    assert.doesNotMatch(data, /audio_base64|xi-api-key|Bearer\s/i);
  }
});

check('Frontend e validações compilam sem erros', () => {
  for (const pkg of ['@workspace/icaro', '@workspace/scripts']) {
    const run = spawnSync('pnpm', ['--filter', pkg, 'run', 'typecheck'], {
      cwd: root, encoding: 'utf8', timeout: 60_000,
    });
    assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  }
});

let failed = 0;
for (const [i, [name, fn]] of checks.entries()) {
  try {
    await fn();
    console.log(`PASSOU ${String(i + 1).padStart(2, '0')}: ${name}`);
  } catch (error) {
    failed++;
    console.error(`FALHOU ${String(i + 1).padStart(2, '0')}: ${name}\n${error instanceof Error ? error.message : error}`);
  }
}
console.log(`\n${checks.length - failed}/${checks.length} validações passaram.`);
console.log('Limite: esta suíte não comprova reconhecimento acústico real, precisão fonética ou igualdade com um vídeo pré-gravado.');
process.exitCode = failed ? 1 : 0;