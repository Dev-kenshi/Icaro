/**
 * 10 browser validations for Ícaro's audible output, activation control, and captions.
 * Uses a real headless Chromium AudioContext with simulated recognition and WAV TTS.
 */
import assert from 'node:assert/strict';
import { chromium, type Page, type Route } from 'playwright-core';

const BASE = process.env.ICARO_URL ?? 'http://localhost:80/';
const STAGE_URL = process.env.ICARO_STAGE_URL ?? new URL('icaro', BASE).toString();
const CHROME = process.env.CHROMIUM_PATH ?? '/repl/tools/bin/chromium';

function wav(seconds: number) {
  const rate = 24_000;
  const frames = Math.floor(rate * seconds);
  const dataBytes = frames * 2;
  const output = Buffer.alloc(44 + dataBytes);
  output.write('RIFF', 0);
  output.writeUInt32LE(36 + dataBytes, 4);
  output.write('WAVE', 8);
  output.write('fmt ', 12);
  output.writeUInt32LE(16, 16);
  output.writeUInt16LE(1, 20);
  output.writeUInt16LE(1, 22);
  output.writeUInt32LE(rate, 24);
  output.writeUInt32LE(rate * 2, 28);
  output.writeUInt16LE(2, 32);
  output.writeUInt16LE(16, 34);
  output.write('data', 36);
  output.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < frames; i++) {
    output.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 220 * i / rate) * 8000), 44 + i * 2);
  }
  return output;
}

const INIT = `
(() => {
  class FakeRecognition {
    constructor() { this.alive = false; this.onstart = this.onend = this.onerror = this.onresult = null; }
    start() { this.alive = true; setTimeout(() => this.onstart && this.onstart(), 10); }
    abort() { if (!this.alive) return; this.alive = false; setTimeout(() => this.onend && this.onend(), 5); }
    stop() { this.abort(); }
  }
  window.SpeechRecognition = FakeRecognition;
  window.webkitSpeechRecognition = FakeRecognition;

  window.__audioAudit = {
    contexts: 0, contextState: 'none', resumeCalls: 0, decodes: 0,
    peak: 0, sourceStarts: 0, sourceToAnalyser: 0, analyserToDestination: 0,
  };
  const audit = window.__audioAudit;
  const NativeContext = window.AudioContext;
  if (NativeContext) {
    window.AudioContext = new Proxy(NativeContext, {
      construct(target, args, newTarget) {
        const context = Reflect.construct(target, args, newTarget);
        audit.contexts++;
        audit.contextState = context.state;
        context.addEventListener('statechange', () => { audit.contextState = context.state; });
        return context;
      },
    });
    const resume = NativeContext.prototype.resume;
    NativeContext.prototype.resume = function(...args) {
      audit.resumeCalls++;
      return resume.apply(this, args).then(() => {
        audit.contextState = this.state;
      });
    };
    const decode = NativeContext.prototype.decodeAudioData;
    NativeContext.prototype.decodeAudioData = function(...args) {
      return decode.apply(this, args).then((buffer) => {
        audit.decodes++;
        for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
          const samples = buffer.getChannelData(channel);
          for (let i = 0; i < samples.length; i++) audit.peak = Math.max(audit.peak, Math.abs(samples[i]));
        }
        return buffer;
      });
    };
  }
  const connect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function(destination, ...args) {
    if (this instanceof AnalyserNode && this.context.destination === destination) audit.analyserToDestination++;
    if (this instanceof AudioBufferSourceNode && destination instanceof AnalyserNode) audit.sourceToAnalyser++;
    return connect.call(this, destination, ...args);
  };
  const start = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function(...args) {
    audit.sourceStarts++;
    return start.apply(this, args);
  };
})();`;

type Check = { name: string; run: () => Promise<void> };
const checks: Check[] = [];
const check = (name: string, run: Check['run']) => checks.push({ name, run });
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const results: { name: string; ok: boolean; error?: string }[] = [];
let ttsMode: 'success' | 'fail' = 'success';
let ttsRequests = 0;
const ttsTexts: string[] = [];
let pageErrors: string[] = [];
let browser: Awaited<ReturnType<typeof chromium.launch>>;
let context: Awaited<ReturnType<typeof browser.newContext>>;
let page: Page;

async function until(fn: () => Promise<boolean>, timeoutMs = 10_000, label = 'condição') {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await fn()) return;
    await pause(35);
  }
  throw new Error(`Tempo esgotado esperando ${label}.`);
}

async function fresh() {
  if (page) await page.close();
  pageErrors = [];
  page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(STAGE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.stage');
  if (await page.locator('dialog.stage-help[open]').count()) {
    await page.getByTestId('button-close-help').press('Escape');
    await page.locator('dialog.stage-help[open]').waitFor({ state: 'detached', timeout: 3_000 });
  }
  await until(() => page.evaluate(() => !!(window as any).__audioAudit && !!(window as any).IcaroAvatar), 15_000, 'avatar e instrumentação');
  await until(() => page.evaluate(() => (window as any).__recReady === true || !!(window as any).SpeechRecognition), 3_000, 'reconhecimento inicializado');
}

async function audit() {
  return page.evaluate(() => (window as any).__audioAudit as {
    contexts: number; contextState: string; resumeCalls: number; decodes: number;
    peak: number; sourceStarts: number; sourceToAnalyser: number; analyserToDestination: number;
  });
}

async function runChecks() {
  check('1. Legenda começa realmente oculta', async () => {
    await fresh();
    assert.equal(await page.locator('[data-testid="text-caption"]').getAttribute('hidden') !== null, true);
  });
  check('2. O controle de legenda está disponível e acessível', async () => {
    const button = page.getByTestId('button-captions-toggle');
    assert.equal(await button.getAttribute('aria-pressed'), 'false');
    assert.match(await button.getAttribute('aria-label') ?? '', /mostrar legendas/i);
  });
  check('3. O botão liga e desliga a legenda', async () => {
    const button = page.getByTestId('button-captions-toggle');
    await button.click();
    assert.equal(await button.getAttribute('aria-pressed'), 'true');
    await button.click();
    assert.equal(await button.getAttribute('aria-pressed'), 'false');
    assert.equal(await page.locator('[data-testid="text-caption"]').getAttribute('hidden') !== null, true);
  });
  check('4. Há um botão principal para ativar/testar a voz', async () => {
    const button = page.getByTestId('button-audio-activate');
    assert.equal(await button.isVisible(), true);
    assert.equal(await button.isEnabled(), true);
    assert.match(await button.innerText(), /ativar áudio/i);
  });
  check('5. Um clique do usuário desbloqueia a saída e ativa a voz', async () => {
    await page.getByTestId('button-audio-activate').click();
    await until(() => page.locator('.stage').getAttribute('data-voice-enabled').then((value) => value === 'true'), 2_000, 'voz ligada');
    await until(async () => (await page.locator('.stage').getAttribute('data-state')) === 'talking', 15_000, 'início da fala de teste');
  });
  check('6. A ativação envia a frase de teste ao endpoint neural', async () => {
    assert.ok(ttsRequests >= 1, `pedidos TTS: ${ttsRequests}`);
    assert.ok(ttsTexts.some((text) => /áudio.*está ativado/i.test(text)), `frases enviadas: ${ttsTexts.join(' | ')}`);
  });
  check('7. O navegador decodifica áudio com amostras não silenciosas', async () => {
    await until(async () => (await audit()).decodes > 0, 5_000, 'decodificação WAV');
    const m = await audit();
    assert.ok(m.peak > 0.02, `pico de áudio ${m.peak}`);
    assert.ok(m.contexts > 0, 'AudioContext não foi criado');
  });
  check('8. AudioContext fica em execução após o clique explícito', async () => {
    const m = await audit();
    assert.equal(m.contextState, 'running');
    assert.ok(m.contexts > 0, 'AudioContext não foi criado');
  });
  check('9. O áudio chega ao analisador/saída e a fala termina sem travar', async () => {
    await until(async () => (await audit()).sourceStarts > 0, 3_000, 'início do buffer de voz');
    const caption = page.locator('[data-testid="text-caption"]');
    const captionsToggle = page.getByTestId('button-captions-toggle');
    await captionsToggle.click();
    await until(async () => {
      const text = await caption.innerText();
      return text.length > 0 && /áudio.*está ativado/i.test(text);
    }, 2_000, 'legenda durante a fala');
    assert.match(await caption.innerText(), /áudio.*está ativado/i);
    await captionsToggle.click();
    assert.equal(await caption.getAttribute('hidden') !== null, true);
    await until(async () => (await page.locator('.stage').getAttribute('data-state')) === 'idle', 8_000, 'fim da fala');
    const m = await audit();
    assert.ok(m.sourceToAnalyser > 0, 'a fonte de áudio não chegou ao analisador');
    assert.ok(m.analyserToDestination > 0, 'o analisador não foi conectado à saída do dispositivo');
    assert.equal(pageErrors.length, 0, pageErrors.join('; '));
  });
  check('10. Falha de voz aparece na tela e uma nova tentativa se recupera', async () => {
    ttsMode = 'fail';
    await page.getByTestId('button-open-panel').click();
    await page.getByTestId('tab-voz').click();
    await page.getByTestId('button-voice-test').click();
    await page.getByTestId('status-audio-error').waitFor({ state: 'visible', timeout: 8_000 });
    assert.match(await page.getByTestId('status-audio-error').innerText(), /áudio|voz/i);
    ttsMode = 'success';
    const before = (await audit()).sourceStarts;
    await page.getByTestId('button-voice-test').click();
    await until(async () => (await page.locator('.stage').getAttribute('data-state')) === 'idle', 10_000, 'recuperação da reprodução');
    assert.ok((await audit()).sourceStarts > before, 'a segunda tentativa não iniciou áudio');
    assert.equal(await page.getByTestId('status-audio-error').count(), 0, 'o aviso de erro não foi limpo');
    assert.equal(pageErrors.length, 0, pageErrors.join('; '));
  });
}

async function main() {
  browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--no-sandbox'],
  });
  context = await browser.newContext({ viewport: { width: 1366, height: 800 }, locale: 'pt-BR' });
  const loginRes = await context.request.post(new URL('api/auth/login', BASE).toString(), { data: { username: 'user1', password: process.env.ICARO_USER1_PASSWORD ?? '' } });
  if (!loginRes.ok()) throw new Error(`Login de teste falhou: ${loginRes.status()}`);
  await context.addInitScript(INIT);
  await context.route('**/api/ai/status', (route: Route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ speechAvailable: true, geminiAvailable: true, groqAvailable: true, openaiAvailable: true, claudeAvailable: false }),
  }));
  await context.route('**/api/tts-ts', (route: Route) => route.fulfill({
    status: 503, contentType: 'application/json', body: '{"error":"timestamps disabled in voice output validation"}',
  }));
  await context.route('**/api/ai/tts', async (route: Route) => {
    ttsRequests++;
    const text = String(route.request().postDataJSON()?.text ?? '');
    ttsTexts.push(text);
    if (ttsMode === 'fail') {
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"simulated neural voice failure"}' });
    } else {
      await route.fulfill({ status: 200, contentType: 'audio/wav', body: wav(1.5) });
    }
  });

  try {
    await runChecks();
    for (const item of checks) {
      try {
        await item.run();
        results.push({ name: item.name, ok: true });
        console.log(`✓ ${item.name}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        results.push({ name: item.name, ok: false, error: message });
        console.error(`✗ ${item.name}: ${message}`);
      }
    }
  } finally {
    await browser.close();
  }

  const passed = results.filter((result) => result.ok).length;
  console.log(`\n${passed}/10 validações de saída de voz passaram.`);
  process.exitCode = passed === 10 ? 0 : 1;
}

await main();