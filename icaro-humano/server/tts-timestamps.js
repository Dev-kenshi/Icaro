/*
 * tts-timestamps.js — rota POST /api/tts-ts
 * Pede à ElevenLabs o áudio JÁ COM o tempo de cada caractere (endpoint /with-timestamps).
 * É isso que permite a boca acertar cada sílaba.
 *
 * Express:
 *   const { createTtsTimestampsHandler } = require('./server/tts-timestamps');
 *   app.post('/api/tts-ts', express.json({ limit: '16kb' }), createTtsTimestampsHandler());
 * Node puro:
 *   if (req.url === '/api/tts-ts' && req.method === 'POST') return handler(req, res);
 *
 * Variáveis: ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID, ELEVENLABS_MODEL (padrão eleven_multilingual_v2)
 */
'use strict';

const MAX_TEXT = 600;       // por frase (o player divide respostas longas)
const CACHE_MAX = 80;       // frases repetidas (saudações, bordões) saem instantâneas e grátis

// Pronúncia: siglas/nomes que a voz lê errado. A legenda desfaz a troca (captions.js → DISPLAY).
// Na gravação analisada a voz dizia "UFs" em vez de "UEFS".
// Use grafias de UMA palavra (a legenda troca de volta palavra por palavra). Acrescente as suas em opts.pronunciation.
const PRONUNCIATION = { UEFS: 'Uéfis' };
function applyPronunciation(text, dict) {
  let out = text;
  for (const [k, v] of Object.entries(dict)) out = out.replace(new RegExp(`(^|[^\\p{L}])${k}(?=[^\\p{L}]|$)`, 'gu'), `$1${v}`);
  return out;
}

function createTtsTimestampsHandler(opts = {}) {
  const key = opts.apiKey || process.env.ELEVENLABS_API_KEY;
  const voice = opts.voiceId || process.env.ELEVENLABS_VOICE_ID;
  const model = opts.modelId || process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2';
  const doFetch = opts.fetch || globalThis.fetch;
  const settings = Object.assign({ stability: 0.42, similarity_boost: 0.88, style: 0.18, use_speaker_boost: true }, opts.voiceSettings);
  const cache = new Map();
  const dict = Object.assign({}, PRONUNCIATION, opts.pronunciation);

  async function readBody(req) {
    if (req.body && typeof req.body === 'object') return req.body; // Express com express.json()
    return new Promise((resolve, reject) => {
      let size = 0; const chunks = [];
      req.on('data', c => { size += c.length; if (size <= 16384) chunks.push(c); });
      req.on('end', () => {
        if (size > 16384) return reject(Object.assign(new Error('corpo muito grande'), { status: 413 }));
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
        catch { reject(Object.assign(new Error('JSON inválido'), { status: 400 })); }
      });
      req.on('error', reject);
    });
  }

  function send(res, status, obj) {
    const body = JSON.stringify(obj);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body) });
    res.end(body);
  }

  const clean = t => (typeof t === 'string' ? t : '').replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim();

  return async function ttsTimestamps(req, res) {
    try {
      const body = await readBody(req);
      const text = applyPronunciation(clean(body.text), dict);
      if (!text) return send(res, 400, { error: 'texto vazio' });
      if (text.length > MAX_TEXT) return send(res, 413, { error: `frase acima de ${MAX_TEXT} caracteres` });
      if (!key || !voice) return send(res, 503, { error: 'ElevenLabs não configurada' });

      const prev = applyPronunciation(clean(body.previous_text), dict).slice(-300);
      const ck = model + '|' + text;
      if (!prev && cache.has(ck)) { const v = cache.get(ck); cache.delete(ck); cache.set(ck, v); return send(res, 200, v); }

      const payload = { text, model_id: model, voice_settings: settings };
      if (prev) payload.previous_text = prev; // mantém entonação contínua entre frases
      if (/v2_5/.test(model)) payload.language_code = 'pt';
      const r = await doFetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}/with-timestamps?output_format=mp3_44100_128`, {
        method: 'POST',
        headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(Number(process.env.TTS_TIMEOUT_MS) || 8000), // 30 s travava a fala inteira
      });
      if (!r.ok) {
        const detail = await r.text().catch(() => '');
        console.error('[tts-ts]', r.status, detail.slice(0, 300));
        return send(res, 502, { error: `ElevenLabs ${r.status}` });
      }
      const j = await r.json();
      if (!j.audio_base64 || !j.alignment) return send(res, 502, { error: 'resposta sem áudio/alinhamento' });
      const out = { audio_base64: j.audio_base64, alignment: j.alignment, normalized_alignment: j.normalized_alignment || null };
      if (!prev) { cache.set(ck, out); if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value); }
      return send(res, 200, out);
    } catch (e) {
      const status = e.status || (e.name === 'TimeoutError' ? 504 : 502);
      if (!res.headersSent) send(res, status, { error: e.status ? e.message : 'falha ao gerar voz' });
    }
  };
}

module.exports = { createTtsTimestampsHandler, applyPronunciation, PRONUNCIATION, MAX_TEXT };
