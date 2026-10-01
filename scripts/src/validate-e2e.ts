/**
 * Validação de ponta a ponta do Ícaro: 10 checagens reais da API + 40 cenários
 * em Chromium headless com microfone (SpeechRecognition) simulado.
 * Total: exatamente 50 testes. Uso: pnpm --filter @workspace/scripts run validate:e2e
 */
import { chromium, type Page, type Route } from 'playwright-core';

const BASE = process.env.ICARO_URL ?? 'http://localhost:80/';
const API = new URL('api/', BASE).toString();
const CHROME = process.env.CHROMIUM_PATH ?? '/repl/tools/bin/chromium';

type Mode = { chat: 'mock' | 'real' | 'fail'; chatDelay: number; tts: 'mock' | 'real' | 'fail' };
const mode: Mode = { chat: 'mock', chatDelay: 150, tts: 'mock' };
const chatCalls: string[] = [];
let ttsFails = 0;
const pageErrors: string[] = [];
const ANSWER = 'Ativo são bens e direitos da empresa. Passivo são as obrigações com terceiros.';

function wav(seconds: number) {
  const rate = 24000, n = Math.floor(rate * seconds), buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const env = 0.5 + 0.5 * Math.sin(2 * Math.PI * 4 * i / rate); // sílabas
    buf.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 180 * i / rate) * env * 9000), 44 + i * 2);
  }
  return buf;
}

const INIT = `
(() => {
  window.__rec = { current: null, results: [], started: 0, failStarts: 0 };
  class FakeRec {
    constructor() { this.lang=''; this.interimResults=false; this.continuous=false; this.maxAlternatives=1; this.onstart=this.onend=this.onerror=this.onresult=null; this.alive=false; }
    start() { if(window.__rec.failStarts>0){window.__rec.failStarts--;throw new DOMException('recognizer restarting','InvalidStateError');} window.__rec.current=this; window.__rec.results=[]; window.__rec.started++; this.alive=true; setTimeout(() => { if (this.alive && this.onstart) this.onstart(); }, 20); }
    abort() { if (!this.alive) return; this.alive=false; setTimeout(() => this.onend && this.onend(), 10); }
    stop() { this.abort(); }
  }
  window.SpeechRecognition = FakeRec; window.webkitSpeechRecognition = FakeRec;
  window.__say = (text, final = true, index) => {
    const r = window.__rec.current; if (!r || !r.alive) return -1;
    const res = window.__rec.results; const i = index ?? res.length;
    res[i] = { isFinal: final, length: 1, 0: { transcript: text, confidence: 0.9 } };
    if (r.onresult) r.onresult({ resultIndex: i, results: res });
    return i;
  };
  window.__recError = (error) => { const r = window.__rec.current; if (!r) return; r.onerror && r.onerror({ error }); if (r.alive) { r.alive=false; r.onend && r.onend(); } };
  window.__recEnd = () => { const r = window.__rec.current; if (!r || !r.alive) return; r.alive=false; r.onend && r.onend(); };
  window.__avatars = [];
  let C;
  Object.defineProperty(window, 'IcaroAvatar', { configurable: true, get: () => C, set: (K) => {
    C = new Proxy(K, { construct(t, a) { const i = Reflect.construct(t, a); window.__avatars.push(i); return i; } });
  } });
  window.__m = { states: [], mouthMax: 0, idleMouthMax: 0, blinks: 0, nods: 0, brows: 0, words: 0, captions: [] };
  let lastState = '', idleSince = 0, lastBlink = 0, lastNod = -1, lastWord = '', lastCaption = '';
  setInterval(() => {
    const m = window.__m, st = document.querySelector('.stage')?.getAttribute('data-state') || '';
    if (st !== lastState) { m.states.push(st); lastState = st; idleSince = performance.now(); }
    const cap = document.querySelector('[data-testid="text-caption"]')?.textContent?.trim() || '';
    if (cap && cap !== lastCaption) m.captions.push(cap); lastCaption = cap;
    const now = document.querySelector('.caption-word.now')?.textContent || '';
    if (now && now !== lastWord) { m.words++; lastWord = now; }
    const a = window.__avatars[window.__avatars.length - 1]; if (!a || !a.mouth) return;
    const open = a.mouth.open.x;
    if (st === 'talking') m.mouthMax = Math.max(m.mouthMax, open); else if (st === 'idle' && performance.now() - idleSince > 400) m.idleMouthMax = Math.max(m.idleMouthMax, open);
    if (a.blink.t && a.blink.t !== lastBlink) { m.blinks++; lastBlink = a.blink.t; }
    if (a.nod.t !== lastNod && a.nod.t > 0) { m.nods++; lastNod = a.nod.t; }
    if (a.brow.amt > 0.05) m.brows++;
  }, 15);
})();`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => Promise<boolean>, timeout = 8000, what = 'condição') {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await fn()) return; await sleep(40); }
  throw new Error(`tempo esgotado esperando ${what}`);
}
const state = (p: Page) => p.evaluate(() => document.querySelector('.stage')?.getAttribute('data-state') ?? '');
const voiceActive = (p: Page) => p.evaluate(() => document.querySelector('.stage')?.getAttribute('data-voice-active') === 'true');
const caption = (p: Page) => p.evaluate(() => document.querySelector('[data-testid="text-caption"]')?.textContent?.trim() ?? '');
const waitState = (p: Page, s: string, t = 8000) => until(async () => (await state(p)) === s, t, `estado ${s}`);
const say = (p: Page, text: string, final = true, index?: number) => p.evaluate(([t, f, i]) => (window as any).__say(t, f, i ?? undefined), [text, final, index ?? null] as const);
/** Fala realista: parciais palavra a palavra, depois o resultado final. */
async function speakLike(p: Page, text: string, gap = 70) {
  const words = text.split(' ');
  let idx = -1;
  for (let k = 1; k <= words.length; k++) { idx = await say(p, words.slice(0, k).join(' '), false, idx < 0 ? undefined : idx); await sleep(gap); }
  await say(p, text, true, idx);
}
const metrics = (p: Page) => p.evaluate(() => (window as any).__m as { states: string[]; mouthMax: number; idleMouthMax: number; blinks: number; nods: number; brows: number; words: number; captions: string[] });
async function fullTurn(p: Page, question: string, timeout = 15000) {
  const before = chatCalls.length;
  await speakLike(p, `Ok Ícaro, ${question}`);
  await until(async () => ['thinking', 'talking'].includes(await state(p)), 4000, 'início da resposta');
  await waitState(p, 'talking', timeout);
  await waitState(p, 'idle', timeout);
  return chatCalls.length - before;
}

const results: { n: number; name: string; ok: boolean; info: string }[] = [];
async function test(name: string, fn: () => Promise<string | void>) {
  const n = results.length + 1;
  const t0 = Date.now();
  try {
    const info = (await fn()) || '';
    results.push({ n, name, ok: true, info });
    console.log(`✔ ${String(n).padStart(2)} ${name} (${Date.now() - t0} ms)${info ? ` — ${info}` : ''}`);
  } catch (e) {
    results.push({ n, name, ok: false, info: (e as Error).message });
    console.log(`✘ ${String(n).padStart(2)} ${name} — ${(e as Error).message}`);
  }
}
function assert(cond: unknown, msg: string): asserts cond { if (!cond) throw new Error(msg); }

let sessionCookie = '';
async function api(path: string, init?: RequestInit) {
  if (!sessionCookie) {
    const l = await fetch(API + 'auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'user1', password: process.env.ICARO_USER1_CODE ?? '' }) });
    if (!l.ok) throw new Error(`Login de teste falhou: ${l.status}`);
    sessionCookie = (l.headers.get('set-cookie') ?? '').split(';')[0];
  }
  const r = await fetch(API + path, { ...init, headers: { ...(init?.headers as Record<string, string> | undefined), Cookie: sessionCookie } });
  const type = r.headers.get('content-type') ?? '';
  const body = type.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer());
  return { r, body: body as any };
}
const chat = (question: string, provider = 'groq') => api('ai/chat', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ provider, persona: 'icaro', question, history: [], dataset: null }),
});

async function main() {
  // ---------------- API real (10) ----------------
  await test('API /healthz responde', async () => { const { r } = await api('healthz'); assert(r.status === 200, `status ${r.status}`); });
  await test('API /ai/status lista provedores', async () => {
    const { r, body } = await api('ai/status'); assert(r.status === 200, `status ${r.status}`);
    return JSON.stringify(body).slice(0, 120);
  });
  await test('API banco local: ITCONT 2026', async () => {
    const t = Date.now(); const { r, body } = await chat('O que é o ITCONT 2026?');
    assert(r.status === 200 && /ITCONT|Imersão/i.test(body.answer), `status ${r.status}: ${body.answer ?? body.error}`);
    assert(body.provider === 'local', `provedor ${body.provider}`);
    return `${Date.now() - t} ms`;
  });
  await test('API banco local: contabilidade de custos', async () => {
    const { r, body } = await chat('Explique contabilidade de custos');
    assert(r.status === 200 && /custo/i.test(body.answer) && body.provider === 'local', `status ${r.status} ${body.provider}: ${body.answer ?? body.error}`);
  });
  await test('API Groq real responde pergunta aberta', async () => {
    const t = Date.now(); const { r, body } = await chat('Em uma frase, por que a conciliação bancária mensal ajuda uma padaria pequena?');
    assert(r.status === 200 && body.answer?.length > 20 && body.provider === 'groq', `status ${r.status} ${body.provider}: ${body.error}`);
    return `${Date.now() - t} ms · "${body.answer.slice(0, 70)}…"`;
  });
  await test('API rejeita corpo inválido (400)', async () => {
    const { r } = await api('ai/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"foo":1}' });
    assert(r.status === 400, `status ${r.status}`);
  });
  await test('API rejeita pergunta vazia (400)', async () => { const { r } = await chat(''); assert(r.status === 400, `status ${r.status}`); });
  await test('API voz neural real (Gemini Charon)', async () => {
    const t = Date.now();
    const { r, body } = await api('ai/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'Olá, turma. Eu sou o Ícaro.' }) });
    assert(r.status === 200, `status ${r.status} ${JSON.stringify(body).slice(0, 100)}`);
    assert(Buffer.isBuffer(body) && body.length > 2000, 'áudio vazio');
    const voice = r.headers.get('x-speech-voice'); assert(/charon/i.test(voice ?? ''), `voz ${voice}`);
    return `${Date.now() - t} ms · ${r.headers.get('content-type')} · ${voice} · ${r.headers.get('x-speech-model')} · cache ${r.headers.get('x-speech-cache')}`;
  });
  await test('API voz rejeita texto inválido (400)', async () => {
    const { r } = await api('ai/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"text":""}' });
    assert(r.status === 400, `status ${r.status}`);
  });
  await test('API voz com marcação rejeita texto acima do limite (413)', async () => {
    const { r } = await api('tts-ts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'a'.repeat(700) }) });
    assert(r.status === 413, `status ${r.status}`);
  });

  // ---------------- Navegador (40) ----------------
  const browser = await chromium.launch({
    executablePath: CHROME, headless: true,
    args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--no-sandbox'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 800 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  const loginRes = await ctx.request.post(new URL('api/auth/login', BASE).toString(), { data: { username: 'user1', password: process.env.ICARO_USER1_CODE ?? '' } });
  if (!loginRes.ok()) throw new Error(`Login de teste falhou: ${loginRes.status()}`);
  await ctx.addInitScript(INIT);
  await ctx.route('**/api/tts-ts', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"sem ElevenLabs"}' }));
  await ctx.route('**/api/ai/tts', async (route: Route) => {
    if (mode.tts === 'real') return route.continue();
    if (mode.tts === 'fail') { ttsFails++; return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"voz indisponível"}' }); }
    const text = String(route.request().postDataJSON()?.text ?? '');
    await sleep(120);
    return route.fulfill({ status: 200, contentType: 'audio/wav', body: wav(Math.min(2.2, Math.max(0.6, text.length * 0.03))) });
  });
  await ctx.route('**/api/ai/chat', async (route: Route) => {
    const q = String(route.request().postDataJSON()?.question ?? '');
    chatCalls.push(q); const n = chatCalls.length;
    if (mode.chat === 'real') return route.continue();
    await sleep(mode.chatDelay);
    if (mode.chat === 'fail') return route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"Falha simulada do provedor."}' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ answer: `${ANSWER} Resposta número ${n}.`, provider: 'groq', model: 'mock' }) });
  });

  let page!: Page;
  async function fresh() {
    if (page) await page.close();
    Object.assign(mode, { chat: 'mock', chatDelay: 150, tts: 'mock' });
    page = await ctx.newPage();
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.stage');
    await until(() => page.evaluate(() => (window as any).__rec.current?.alive === true && !!(window as any).__avatars[0]?.mouth), 15000, 'microfone e avatar prontos');
    await sleep(150);
  }

  await test('Página carrega em espera, avatar pronto, sem erros', async () => {
    const errs = pageErrors.length; await fresh();
    assert((await state(page)) === 'idle', 'estado inicial não é idle');
    assert(!(await voiceActive(page)), 'escuta ativa sem ativação');
    assert(!(await caption(page)), 'legenda não deveria aparecer');
    assert(pageErrors.length === errs, `erros: ${pageErrors.slice(errs).join('; ')}`);
  });
  await test('“Ok Ícaro” ativa a escuta (avatar acena)', async () => {
    await say(page, 'Ok Ícaro', true); await waitState(page, 'listening');
    assert(await voiceActive(page), 'escuta não ficou ativa');
    assert((await page.evaluate(() => (window as any).__avatars.at(-1).state)) === 'listening', 'avatar não entrou em escuta');
  });
  await test('Pergunta real ponta a ponta (banco local + voz Gemini real)', async () => {
    await fresh(); mode.chat = 'real'; mode.tts = 'real';
    const t = Date.now();
    await speakLike(page, 'Ok Ícaro, o que é o ITCONT 2026?');
    await waitState(page, 'talking', 30000); const talkAt = Date.now() - t;
    const cap = await caption(page);
    await waitState(page, 'idle', 60000);
    assert(chatCalls.at(-1)?.includes('ITCONT'), 'pergunta não enviada');
    assert(/ITCONT|Imersão/i.test(cap), `legenda: ${cap}`);
    return `começou a falar em ${talkAt} ms`;
  });
  await test('Legenda mostra só a resposta, nunca a transcrição', async () => {
    await fresh(); const q = 'qual a diferença entre ativo e passivo';
    assert((await fullTurn(page, q)) === 1, 'chamadas != 1');
    const m = await metrics(page);
    assert(m.captions.length > 0, 'nenhuma legenda');
    assert(m.captions.every((c) => !c.toLowerCase().includes('diferença entre ativo') && !/ícaro,/i.test(c)), `legenda com transcrição: ${m.captions.join(' | ')}`);
    assert(m.captions.some((c) => ANSWER.includes(c.split(' ')[0])), 'legenda não corresponde à resposta');
  });
  await test('Uma pergunta por ativação: fala seguinte é ignorada', async () => {
    const before = chatCalls.length; await sleep(600);
    await speakLike(page, 'e qual é o lucro líquido da empresa hoje'); await sleep(1500);
    assert(chatCalls.length === before && (await state(page)) === 'idle', 'respondeu sem nova ativação');
  });
  await test('Conversa ambiente sem palavra de ativação não dispara', async () => {
    const before = chatCalls.length;
    await speakLike(page, 'pessoal abram o caderno na página dez por favor'); await sleep(1200);
    assert(chatCalls.length === before && (await state(page)) === 'idle', 'respondeu à conversa ambiente');
  });
  await test('Mencionar “Ícaro” no meio da frase não ativa', async () => {
    const before = chatCalls.length;
    await speakLike(page, 'o Ícaro é muito legal turma, qual é a prova'); await sleep(1200);
    assert(chatCalls.length === before && !(await voiceActive(page)), 'ativou por menção');
  });
  await test('Ativação e pergunta em falas separadas', async () => {
    await say(page, 'Ok Ícaro', true); await waitState(page, 'listening'); await sleep(1500);
    const before = chatCalls.length;
    await speakLike(page, 'o que é patrimônio líquido');
    await waitState(page, 'talking', 10000); await waitState(page, 'idle', 15000);
    assert(chatCalls.length === before + 1, 'pergunta não respondida');
  });
  await test('Espera de 12 s expira e volta ao modo de espera', async () => {
    await sleep(600); await say(page, 'Ok Ícaro', true); await waitState(page, 'listening');
    await waitState(page, 'idle', 14000);
    const before = chatCalls.length; await speakLike(page, 'qual é a capital da Bahia hoje'); await sleep(1000);
    assert(chatCalls.length === before, 'respondeu depois da janela');
  });
  await test('“Pare Ícaro” interrompe a fala', async () => {
    mode.chatDelay = 100;
    await speakLike(page, 'Ok Ícaro, explique o balanço patrimonial');
    await waitState(page, 'talking', 10000); await sleep(300);
    await speakLike(page, 'pare Ícaro'); await waitState(page, 'idle', 2000);
    await sleep(200); assert(!(await caption(page)), 'legenda permaneceu após parar');
  });
  await test('“Pare Ícaro” durante a espera descarta resposta atrasada', async () => {
    mode.chatDelay = 2500; await sleep(600);
    await speakLike(page, 'Ok Ícaro, explique o regime de competência');
    await waitState(page, 'thinking', 3000);
    await speakLike(page, 'pare Ícaro'); await waitState(page, 'idle', 2000);
    await sleep(3000);
    assert((await state(page)) === 'idle' && !(await caption(page)), 'resposta atrasada foi falada');
  });
  await test('Eco da própria voz durante a fala é ignorado', async () => {
    mode.chatDelay = 100; await sleep(600);
    await speakLike(page, 'Ok Ícaro, o que é passivo');
    await waitState(page, 'talking', 10000); const before = chatCalls.length;
    await say(page, 'passivo são as obrigações com terceiros', true);
    await waitState(page, 'idle', 15000); await sleep(800);
    assert(chatCalls.length === before && (await state(page)) === 'idle', 'eco virou pergunta');
  });
  await test('Eco atrasado após nova ativação é ignorado', async () => {
    await sleep(600); await say(page, 'Ok Ícaro', true); await waitState(page, 'listening');
    const before = chatCalls.length;
    await say(page, 'ativo são bens e direitos da empresa', true); await sleep(1200);
    assert(chatCalls.length === before, 'eco atrasado foi respondido');
    await say(page, 'pare Ícaro', true); await waitState(page, 'idle');
  });
  await test('Espera resposta lenta (6 s) sem travar', async () => {
    mode.chatDelay = 6000; await sleep(600);
    await speakLike(page, 'Ok Ícaro, quais são as demonstrações contábeis obrigatórias');
    await waitState(page, 'thinking', 3000); await sleep(4000);
    assert((await state(page)) === 'thinking', 'saiu da espera antes da resposta');
    await waitState(page, 'talking', 8000); await waitState(page, 'idle', 15000);
  });
  await test('Nova ativação durante a espera cancela a anterior', async () => {
    mode.chatDelay = 3000; await sleep(600);
    await speakLike(page, 'Ok Ícaro, explique depreciação contábil');
    await waitState(page, 'thinking', 3000); const oldMarker = `Resposta número ${chatCalls.length}.`; await sleep(300);
    await say(page, 'Ok Ícaro', true); await waitState(page, 'listening', 2000);
    mode.chatDelay = 100; const before = chatCalls.length;
    await speakLike(page, 'o que é amortização');
    await waitState(page, 'talking', 10000); await waitState(page, 'idle', 15000);
    assert(chatCalls.length === before + 1, 'nova pergunta não enviada');
    await sleep(3200); assert((await state(page)) === 'idle', 'resposta antiga foi falada depois');
    const caps = (await metrics(page)).captions;
    assert(!caps.some((c) => c.includes(oldMarker)), `resposta cancelada apareceu: ${oldMarker}`);
    assert(caps.some((c) => c.includes(`Resposta número ${chatCalls.length}.`)), 'nova resposta não apareceu');
  });
  await test('Erro do provedor: legenda limpa, sem travar, próxima pergunta funciona', async () => {
    mode.chat = 'fail'; mode.chatDelay = 100; await sleep(600);
    await speakLike(page, 'Ok Ícaro, explique o fluxo de caixa');
    await waitState(page, 'idle', 5000); await sleep(200);
    assert(!(await caption(page)), 'erro apareceu na legenda');
    mode.chat = 'mock'; await sleep(300);
    assert((await fullTurn(page, 'o que é ativo circulante')) === 1, 'não se recuperou');
  });
  await test('Falha da voz neural não trava o Ícaro', async () => {
    mode.tts = 'fail'; const fails = ttsFails; await sleep(600);
    await speakLike(page, 'Ok Ícaro, o que é receita bruta');
    await until(async () => (await state(page)) !== 'listening', 4000, 'processamento');
    await waitState(page, 'idle', 15000);
    assert(ttsFails > fails, 'nenhuma falha de voz foi exercitada (áudio em cache?)');
    mode.tts = 'mock'; await sleep(600);
    assert((await fullTurn(page, 'o que é receita líquida')) === 1, 'não se recuperou');
  });
  await test('Parcial estável é enviada uma única vez (sem final)', async () => {
    await sleep(600); await say(page, 'Ok Ícaro', true); await waitState(page, 'listening');
    const before = chatCalls.length;
    const i = await say(page, 'qual é o conceito de ativo circulante', false);
    await waitState(page, 'thinking', 2000);
    await say(page, 'qual é o conceito de ativo circulante', true, i);
    await waitState(page, 'idle', 15000);
    assert(chatCalls.length === before + 1, `chamadas: ${chatCalls.length - before}`);
  });
  await test('Parcial incompleta (“…conceito de”) não é enviada', async () => {
    await sleep(600); await say(page, 'Ok Ícaro', true); await waitState(page, 'listening');
    const before = chatCalls.length;
    await say(page, 'qual é o conceito de', false); await sleep(1200);
    assert(chatCalls.length === before && (await state(page)) === 'listening', 'parcial incompleta foi enviada');
    await say(page, 'pare Ícaro', true); await waitState(page, 'idle');
  });
  await test('Tecla Enter ativa a escuta', async () => {
    await fresh(); await page.keyboard.press('Enter');
    await until(() => voiceActive(page), 2000, 'escuta ativa'); assert((await state(page)) === 'listening', 'estado');
  });
  await test('Enter + pergunta falada → resposta real (Groq)', async () => {
    mode.chat = 'real'; const before = chatCalls.length;
    await speakLike(page, 'em uma frase, para que serve o livro razão');
    await waitState(page, 'talking', 30000); const cap = await caption(page); await waitState(page, 'idle', 30000);
    assert(chatCalls.length === before + 1 && cap.length > 10, 'sem resposta');
    return `"${cap.slice(0, 60)}…"`;
  });
  await test('Seta para a direita (passador de slide) ativa e a pergunta é respondida', async () => {
    await fresh(); await page.keyboard.press('ArrowRight'); await until(() => voiceActive(page), 2000, 'escuta');
    assert((await state(page)) === 'listening', 'estado não é escuta');
    const before = chatCalls.length; await speakLike(page, 'o que é a DRE');
    await waitState(page, 'talking', 10000); await waitState(page, 'idle', 15000);
    assert(chatCalls.length === before + 1, 'não respondeu');
  });
  await test('PageDown (passador de slide) ativa a escuta', async () => {
    await fresh(); await page.keyboard.press('PageDown'); await until(() => voiceActive(page), 2000, 'escuta ativa');
  });
  await test('Seta funciona com o botão do microfone em foco', async () => {
    await fresh(); await page.click('[data-testid="button-mic"]'); await until(() => voiceActive(page), 2000, 'ativação');
    await page.click('[data-testid="button-mic"]'); await until(async () => !(await voiceActive(page)), 2000, 'espera');
    await page.keyboard.press('ArrowRight'); await until(() => voiceActive(page), 2000, 'ativação pela seta');
  });
  await test('Enter no campo de texto envia a pergunta, sem ativar o microfone', async () => {
    await fresh(); await page.click('[data-testid="button-toggle-typing"]');
    const before = chatCalls.length;
    await page.fill('[data-testid="input-question"]', 'O que é passivo circulante?'); await page.press('[data-testid="input-question"]', 'Enter');
    await waitState(page, 'talking', 10000);
    assert(!(await voiceActive(page)), 'Enter no campo ativou o microfone');
    await waitState(page, 'idle', 15000); assert(chatCalls.length === before + 1, 'não enviou');
  });
  await test('Shift+Enter e tecla repetida são ignorados', async () => {
    await fresh(); await page.keyboard.press('Shift+Enter');
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', repeat: true })));
    await sleep(500); assert(!(await voiceActive(page)), 'atalho com modificador/repetição ativou');
  });
  await test('Atalhos ignorados com o painel aberto', async () => {
    await page.click('[data-testid="button-open-panel"]'); await sleep(300);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('ArrowRight'); await sleep(400);
    assert(!(await voiceActive(page)), 'ativou com painel aberto');
    await page.click('[data-testid="button-close-panel"]');
  });
  await test('Botão do microfone alterna escuta e espera', async () => {
    await fresh(); await page.click('[data-testid="button-mic"]'); await until(() => voiceActive(page), 2000, 'ativa');
    assert((await state(page)) === 'listening', 'estado');
    await page.click('[data-testid="button-mic"]'); await until(async () => !(await voiceActive(page)), 2000, 'espera');
    assert((await state(page)) === 'idle', 'não voltou a idle');
  });
  await test('Pergunta digitada é respondida', async () => {
    await page.click('[data-testid="button-toggle-typing"]');
    await page.fill('[data-testid="input-question"]', 'Explique o ativo não circulante'); await page.click('[data-testid="button-send"]');
    await waitState(page, 'talking', 10000); await waitState(page, 'idle', 15000);
  });
  await test('Comando de voz: “que horas são”', async () => {
    await fresh(); const before = chatCalls.length;
    await speakLike(page, 'Ok Ícaro, que horas são'); await waitState(page, 'talking', 8000);
    const cap = await caption(page); await waitState(page, 'idle', 15000);
    assert(/\d{2}:\d{2}/.test(cap) && chatCalls.length === before, `legenda: ${cap}`); return cap;
  });
  await test('Comando de voz: cálculo 30% de 200', async () => {
    await sleep(600); await speakLike(page, 'Ok Ícaro, calcule 30% de 200'); await waitState(page, 'talking', 8000);
    const cap = await caption(page); await waitState(page, 'idle', 15000); assert(/60/.test(cap), cap); return cap;
  });
  await test('Comando de voz: temporizador de 3 segundos', async () => {
    await sleep(600); await speakLike(page, 'Ok Ícaro, temporizador de 3 segundos');
    await page.waitForSelector('[data-testid="text-timer-hud"]', { timeout: 5000 });
    await until(async () => /Tempo encerrado/i.test(await caption(page)), 12000, 'aviso de fim');
    await waitState(page, 'idle', 15000);
  });
  await test('Comando de voz: anotar e listar anotações', async () => {
    await sleep(600); await speakLike(page, 'Ok Ícaro, anote revisar depreciação na quinta');
    await waitState(page, 'talking', 8000); await waitState(page, 'idle', 15000); await sleep(600);
    await speakLike(page, 'Ok Ícaro, minhas notas'); await waitState(page, 'talking', 8000);
    await waitState(page, 'idle', 15000);
    const caps = (await metrics(page)).captions.slice(-4).join(' | ');
    assert(/revisar depreciação/i.test(caps), caps);
  });
  await test('Comando de voz: pesquisa na web', async () => {
    await sleep(600); await speakLike(page, 'Ok Ícaro, pesquise normas IFRS 18');
    await page.waitForSelector('[data-testid="link-search"]', { timeout: 8000 });
    const href = await page.getAttribute('[data-testid="link-search"]', 'href');
    assert(/ifrs/i.test(href ?? ''), String(href)); await waitState(page, 'idle', 15000);
  });
  await test('Lábios: boca abre ao falar e fica fechada em espera', async () => {
    await fresh(); await sleep(1500);
    await fullTurn(page, 'o que é ativo e passivo'); await sleep(800);
    const m = await metrics(page);
    assert((await page.evaluate(() => (window as any).__avatars.at(-1).state)) !== 'speaking', 'avatar continua falando em espera');
    assert(m.mouthMax > 0.2, `abertura máxima ${m.mouthMax.toFixed(2)}`);
    assert(m.idleMouthMax < 0.12, `boca em espera ${m.idleMouthMax.toFixed(2)}`);
    return `abertura falando ${m.mouthMax.toFixed(2)} · em espera ${m.idleMouthMax.toFixed(2)}`;
  });
  await test('Gestos: piscadas, acenos e sobrancelhas', async () => {
    await sleep(3000); const m = await metrics(page);
    assert(m.blinks >= 2 && m.nods >= 1 && m.brows > 0, `piscadas ${m.blinks}, acenos ${m.nods}, sobrancelha ${m.brows}`);
    return `piscadas ${m.blinks} · acenos ${m.nods} · quadros com sobrancelha ${m.brows}`;
  });
  await test('Legenda acompanha a fala palavra por palavra', async () => {
    const m = await metrics(page); assert(m.words >= 5, `palavras destacadas ${m.words}`); return `${m.words} palavras destacadas`;
  });
  await test('8 ciclos seguidos sem travar (1 chamada por ciclo)', async () => {
    await fresh(); mode.chatDelay = 80;
    for (let k = 0; k < 8; k++) { await sleep(600); const c = await fullTurn(page, `pergunta número ${k + 1} sobre custos fixos`); assert(c === 1, `ciclo ${k + 1}: ${c} chamadas`); }
  });
  await test('Reconhecimento encerrado pelo navegador reinicia sozinho', async () => {
    const started = await page.evaluate(() => (window as any).__rec.started);
    await page.evaluate(() => { (window as any).__rec.failStarts = 1; });
    await page.evaluate(() => (window as any).__recEnd());
    await until(() => page.evaluate((s) => (window as any).__rec.started > s && (window as any).__rec.current?.alive, started), 3000, 'reinício após falha temporária');
    await sleep(600); assert((await fullTurn(page, 'o que é provisão')) === 1, 'não respondeu após reinício');
  });
  await test('Erro de rede se recupera; microfone negado mostra ajuda', async () => {
    const started = await page.evaluate(() => (window as any).__rec.started);
    await page.evaluate(() => (window as any).__recError('network'));
    await until(() => page.evaluate((s) => (window as any).__rec.started > s && (window as any).__rec.current.alive, started), 4000, 'recuperação');
    await page.evaluate(() => (window as any).__recError('not-allowed'));
    await page.waitForSelector('[data-testid="status-listening"]', { timeout: 3000 });
    const label = await page.textContent('[data-testid="status-listening"]');
    assert(/indisponível/i.test(label ?? ''), String(label));
    await page.click('[data-testid="button-enable-listening"]');
    await until(() => page.evaluate(() => (window as any).__rec.current.alive), 3000, 'retomada');
  });

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  if (pageErrors.length) failed.push({ n: 0, name: 'erros de página', ok: false, info: pageErrors.join('; ') });
  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} testes aprovados. Erros de página: ${pageErrors.length}${pageErrors.length ? ` (${[...new Set(pageErrors)].join('; ')})` : ''}`);
  if (results.length !== 50) { console.log(`ERRO: esperados 50 testes, executados ${results.length}`); process.exit(1); }
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
