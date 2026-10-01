// Validações automáticas do pacote: node test/validate.js
'use strict';
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const V = require('../avatar/visemes-ptbr.js');
const { createTtsTimestampsHandler, MAX_TEXT } = require('../server/tts-timestamps.js');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let n = 0, fail = 0;
async function check(name, fn) {
  n++;
  try { const r = await fn(); if (r === false) throw new Error('falso'); console.log(`  ✔ ${String(n).padStart(2)} ${name}`); }
  catch (e) { fail++; console.log(`  ✘ ${String(n).padStart(2)} ${name} — ${e.message}`); }
}
const eq = (a, b) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`esperado ${JSON.stringify(b)}, veio ${JSON.stringify(a)}`); return true; };
const cls = w => V.classify([...w]);
const tlOf = text => V.buildTimeline(V.synthAlignment(text));

// req/res falsos para testar a rota sem servidor
function fakeReq(body, raw) {
  const r = Readable.from([Buffer.from(raw !== undefined ? raw : JSON.stringify(body))]);
  return r;
}
async function call(handler, body, raw) {
  let out;
  const done = new Promise(r => { out = r; });
  const res = { headersSent: false, writeHead(s, h) { this.status = s; this.headers = h; this.headersSent = true; }, end(b) { out({ status: this.status, headers: this.headers, json: JSON.parse(b), raw: b }); } };
  handler(fakeReq(body, raw), res);
  return done;
}
const ALIGN = { characters: [...'Olá'], character_start_times_seconds: [0, 0.1, 0.2], character_end_times_seconds: [0.1, 0.2, 0.35] };

(async () => {
  console.log('\nArquivos do pacote');
  const files = ['PROMPT_REPLIT_AGENT.md', 'DIAGNOSTICO.md', 'README.md', 'avatar/visemes-ptbr.js', 'avatar/avatar-engine.js', 'avatar/speech-player.js', 'avatar/captions.js', 'avatar/avatar.css',
    'avatar/assets/atlas.json', 'avatar/assets/base.jpg', 'avatar/assets/mouth.webp', 'avatar/assets/eyes.webp', 'server/tts-timestamps.js', 'demo/index.html', 'demo/server.js', 'tools/build_atlas.py'];
  await check('todos os arquivos presentes', () => { const miss = files.filter(f => !fs.existsSync(path.join(ROOT, f))); if (miss.length) throw new Error(miss.join(', ')); });
  const atlas = JSON.parse(read('avatar/assets/atlas.json'));
  await check('atlas: ≥ 24 formas de boca e piscada completa', () => atlas.mouth.frames.length >= 24 && ['open', 'half', 'closed'].every(k => atlas.eyes.frames.some(f => f.kind === k)));
  await check('atlas: 1º recorte é a boca neutra (repouso sem troca)', () => atlas.mouth.frames[0].neutral === true);
  await check('atlas: faixa de abertura real (fechada → aberta)', () => atlas.range.open[1] - atlas.range.open[0] > 0.08);
  await check('atlas: margem entre recortes (sem vazamento ao girar)', () => atlas.gutter >= 2);
  await check('atlas: caixas dentro do quadro', () => [atlas.mouth.box, atlas.eyes.box].every(([x, y, w, h]) => x >= 0 && y >= 0 && x + w <= atlas.size && y + h <= atlas.size));
  await check('sprites com tamanho coerente com o atlas', () => {
    const size = f => { const b = fs.readFileSync(path.join(ROOT, 'avatar/assets', f)); return b.length; };
    return size('mouth.webp') > 100000 && size('eyes.webp') > 10000 && size('mouth.webp') < 4e6;
  });

  console.log('\nVisemas PT-BR');
  await check('p/b/m fecham os lábios', () => eq(cls('papai').filter(v => v === 'PBM').length, 2) && cls('bom')[0] === 'PBM');
  await check('m nasal final NÃO fecha ("também")', () => { const c = cls('também'); return c[5] === null && c[3] === 'PBM'; });
  await check('dígrafo ch → CH', () => eq(cls('chuva').slice(0, 2), ['CH', 'CH']));
  await check('lh / nh → LH', () => cls('filho')[2] === 'LH' && cls('ganho')[2] === 'LH');
  await check('qu antes de e/i → K (u mudo)', () => eq(cls('que').slice(0, 2), ['KG', 'KG']));
  await check('qua → K + U (u pronunciado)', () => eq(cls('qual').slice(0, 2), ['KG', 'U']));
  await check('c antes de e/i → S; ç → S', () => cls('cedo')[0] === 'SZ' && cls('ação')[1] === 'SZ');
  await check('g antes de e/i → CH; ga → K', () => cls('gente')[0] === 'CH' && cls('gato')[0] === 'KG');
  await check('h mudo ignorado', () => cls('hoje')[0] === null);
  await check('vogais nasais ã/õ', () => cls('mão')[1] === 'AN' && cls('põe')[1] === 'ON');
  await check('pontuação vira silêncio', () => cls('a, b.')[1] === 'sil' && cls('a, b.')[4] === 'sil');

  console.log('\nLinha do tempo e sincronia');
  const tl = tlOf('Papai é bom. Tudo bem?');
  await check('p/b/m têm fechamento visível ≥ 80 ms', () => tl.keys.filter(k => k.press).every(k => k.t1 - k.t0 >= 0.079));
  await check('boca fechada durante oclusão de p', () => { const k = tl.keys.find(k => k.press); return V.sample(tl, (k.t0 + k.t1) / 2 - tl.lead).open === 0; });
  await check('boca abre em vogal "a"', () => { const k = tl.keys.find(k => k.v === 'A'); return V.sample(tl, k.t0 + (k.t1 - k.t0) * 0.3 - tl.lead).open > 0.5; });
  await check('antecipação: lábios se movem ~45 ms antes do som', () => tl.lead >= 0.03 && tl.lead <= 0.08);
  await check('boca fechada antes e depois da fala', () => V.sample(tl, -1).open === 0 && V.sample(tl, tl.duration + 1).open === 0);
  await check('transições suaves (sem saltos > 0.35 em 10 ms)', () => { let prev = V.sample(tl, 0).open, max = 0; for (let t = 0; t < tl.duration; t += 0.01) { const o = V.sample(tl, t).open; max = Math.max(max, Math.abs(o - prev)); prev = o; } if (max > 0.35) throw new Error('salto ' + max.toFixed(2)); });
  await check('palavras com tempos crescentes (legenda)', () => tl.words.every((w, i) => w.t1 >= w.t0 && (!i || w.t0 >= tl.words[i - 1].t0)) && eq(tl.words.map(w => w.text), ['Papai', 'é', 'bom.', 'Tudo', 'bem?']));
  await check('pergunta gera microexpressão', () => tl.emphasis.some(e => e.kind === 'question'));
  await check('fim de frase gera aceno', () => tl.emphasis.some(e => e.kind === 'end'));
  await check('usa normalized_alignment (números falados)', () => /normalized_alignment/.test(read('avatar/speech-player.js')));

  console.log('\nDivisão em frases (latência)');
  await check('divide por pontuação', () => V.splitSentences('Olá, tudo bem com você hoje? Eu sou o Ícaro, prazer em conhecer.').length === 2);
  await check('não quebra abreviações (Prof., Dr.)', () => V.splitSentences('O Prof. Rômulo explicou o tema hoje. Depois o Dr. Silva comentou tudo.').length === 2);
  await check('não quebra números decimais', () => V.splitSentences('A alíquota é 26.5 por cento neste cenário. Isso muda tudo no cálculo.').length === 2);
  await check('frase longa quebrada em vírgulas (≤ 220)', () => V.splitSentences(('palavra, ').repeat(60) + 'fim.').every(s => s.length <= 230));

  console.log('\nRota /api/tts-ts');
  const okFetch = async (url, init) => { okFetch.last = { url, body: JSON.parse(init.body), headers: init.headers }; return { ok: true, json: async () => ({ audio_base64: 'AAAA', alignment: ALIGN, normalized_alignment: ALIGN }) }; };
  const h = createTtsTimestampsHandler({ apiKey: 'k', voiceId: 'v', fetch: okFetch });
  await check('retorna áudio + alinhamento', async () => { const r = await call(h, { text: 'Olá' }); return eq(r.status, 200) && r.json.audio_base64 === 'AAAA' && r.json.alignment.characters.length === 3; });
  await check('chama endpoint /with-timestamps com a voz certa', () => /\/v1\/text-to-speech\/v\/with-timestamps/.test(okFetch.last.url));
  await check('chave vai só no cabeçalho, nunca na resposta', async () => { const r = await call(h, { text: 'Oi de novo' }); return okFetch.last.headers['xi-api-key'] === 'k' && !r.raw.includes('"k"'); });
  await check('envia previous_text (entonação contínua)', async () => { await call(h, { text: 'Segunda frase.', previous_text: 'Primeira frase.' }); return okFetch.last.body.previous_text === 'Primeira frase.'; });
  await check('language_code só em modelos v2.5', async () => {
    const h25 = createTtsTimestampsHandler({ apiKey: 'k', voiceId: 'v', modelId: 'eleven_flash_v2_5', fetch: okFetch });
    await call(h25, { text: 'teste um' }); const a = okFetch.last.body.language_code;
    await call(h, { text: 'teste dois' }); const b = okFetch.last.body.language_code;
    return a === 'pt' && b === undefined;
  });
  await check('cache: frase repetida não chama a ElevenLabs de novo', async () => {
    let calls = 0; const f = async (...a) => { calls++; return okFetch(...a); };
    const hc = createTtsTimestampsHandler({ apiKey: 'k', voiceId: 'v', fetch: f });
    await call(hc, { text: 'Bom dia!' }); await call(hc, { text: 'Bom dia!' }); return eq(calls, 1);
  });
  await check('pronúncia: UEFS vira "Uéfis" na voz', async () => { await call(h, { text: 'Alunos da UEFS.' }); return okFetch.last.body.text === 'Alunos da Uéfis.'; });
  await check('legenda desfaz a pronúncia (mostra UEFS)', () => /'Uéfis': 'UEFS'/.test(read('avatar/captions.js')));
  await check('texto vazio → 400', async () => eq((await call(h, { text: '  ' })).status, 400));
  await check(`texto > ${MAX_TEXT} → 413`, async () => eq((await call(h, { text: 'a'.repeat(MAX_TEXT + 1) })).status, 413));
  await check('JSON inválido → 400', async () => eq((await call(h, null, '{x')).status, 400));
  await check('sem chave → 503', async () => eq((await call(createTtsTimestampsHandler({ apiKey: '', voiceId: '' }), { text: 'oi' })).status, 503));
  await check('erro da ElevenLabs → 502', async () => eq((await call(createTtsTimestampsHandler({ apiKey: 'k', voiceId: 'v', fetch: async () => ({ ok: false, status: 401, text: async () => 'bad' }) }), { text: 'oi' })).status, 502));
  await check('falha de rede → 502 sem derrubar', async () => eq((await call(createTtsTimestampsHandler({ apiKey: 'k', voiceId: 'v', fetch: async () => { throw new TypeError('fetch failed'); } }), { text: 'oi' })).status, 502));
  await check('funciona com Express (req.body já parseado)', async () => {
    let out; const done = new Promise(r => { out = r; });
    h({ body: { text: 'Express ok' } }, { writeHead(s) { this.s = s; }, end(b) { out({ s: this.s, b }); } });
    return eq((await done).s, 200);
  });

  console.log('\nMotor do rosto (estático)');
  const eng = read('avatar/avatar-engine.js');
  await check('boca parada fora da fala (pensando/ouvindo)', () => /if \(this\.state !== 'speaking' \|\| !this\.tl/.test(eng));
  await check('porta de silêncio: boca fecha se o áudio real está mudo', () => /level < 0\.012/.test(eng));
  await check('piscada natural 150–200 ms com piscada dupla ocasional', () => /e >= 170/.test(eng) && /0\.14/.test(eng));
  await check('respiração e deriva orgânica da cabeça', () => /0\.24/.test(eng) && /makeNoise/.test(eng));
  await check('pivô de rotação no pescoço', () => /pivô no pescoço/.test(eng));
  await check('sobrancelha em ênfase e pergunta', () => /kind === 'question'/.test(eng) && /_browPulse/.test(eng));
  await check('ouvindo: inclina/aproxima e acena', () => /state === 'listening'/.test(eng) && /sc \+= 0\.012/.test(eng));
  await check('sem troca de vídeo/cortes (um único rosto base)', () => !/<video|\.mp4/.test(eng));
  await check('mistura no máximo 2 recortes (sem "lábio duplo")', () => /k < 0\.18/.test(eng));

  console.log('\nPlayer de fala');
  const sp = read('avatar/speech-player.js');
  await check('áudio agendado no relógio do AudioContext', () => /src\.start\(start\)/.test(sp) && /ctx\.currentTime - start/.test(sp));
  await check('boca e legenda usam o mesmo relógio', () => /avatar\.speak\(d\.tl, clock\)/.test(sp) && /onSentence\(text, d\.tl, clock\)/.test(sp));
  await check('pré-busca da próxima frase enquanto fala', () => /item\.data = this\._fetch\(item, gen\)/.test(sp));
  await check('streaming do LLM (feed/flush)', () => /feed\(chunk\)/.test(sp) && /flush\(\)/.test(sp));
  await check('interrupção imediata (stop) cancela áudio e pedidos', () => /for \(const a of this\.aborts\) a\.abort\(\)/.test(sp) && /s\.stop\(\)/.test(sp));
  await check('reserva quando timestamps falham', () => /_fallback\(item\.text\)/.test(sp));

  console.log('\nDocumentação');
  const prompt = read('PROMPT_REPLIT_AGENT.md');
  await check('prompt cobre integração, estados, validação e proibições', () => ['/api/tts-ts', 'listening', 'thinking', 'speaking', 'Critérios de aceite', 'NÃO'].every(s => prompt.includes(s)));
  await check('diagnóstico com evidências do vídeo', () => /96/.test(read('DIAGNOSTICO.md')));

  console.log(`\n${n - fail}/${n} validações OK${fail ? ` — ${fail} falharam` : ''}\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
