/*
 * visemes-ptbr.js — converte o alinhamento de caracteres da ElevenLabs em uma linha do tempo
 * de formas de boca (visemas) para português do Brasil.
 *
 * Forma de boca = { open: 0..1 (fechada→bem aberta), width: 0..1 (arredondada→esticada), press: bool }
 * `press` = lábios precisam se tocar (p, b, m) — é o que o olho humano mais usa para julgar sincronia.
 *
 * Funciona no navegador (window.IcaroVisemes) e no Node (module.exports) para testes.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.IcaroVisemes = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Alvos calibrados para PT-BR (abertura, largura). Vogais dominam; consoantes são rápidas.
  const V = {
    sil: { open: 0.00, width: 0.45, w: 1.0 },
    PBM: { open: 0.00, width: 0.42, w: 1.0, press: true },
    FV:  { open: 0.07, width: 0.52, w: 0.9 },
    TD:  { open: 0.18, width: 0.52, w: 0.5 },   // t d n l
    SZ:  { open: 0.10, width: 0.64, w: 0.6 },   // s z ç
    CH:  { open: 0.14, width: 0.26, w: 0.7 },   // ch x j g(e/i) — lábios projetados
    KG:  { open: 0.24, width: 0.50, w: 0.45 },  // c q k g
    R:   { open: 0.22, width: 0.46, w: 0.45 },  // r rr
    LH:  { open: 0.20, width: 0.52, w: 0.5 },   // lh nh
    A:   { open: 0.92, width: 0.60, w: 1.0 },
    E:   { open: 0.52, width: 0.76, w: 1.0 },   // e é ê
    I:   { open: 0.26, width: 0.88, w: 1.0 },
    O:   { open: 0.58, width: 0.24, w: 1.0 },   // o ó ô
    U:   { open: 0.28, width: 0.10, w: 1.0 },
    AN:  { open: 0.55, width: 0.52, w: 1.0 },   // ã (nasal: menos aberto)
    ON:  { open: 0.42, width: 0.24, w: 1.0 },   // õ
    SPACE: { open: 0.05, width: 0.46, w: 0.3 },
  };

  const strip = c => c.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const isVowel = c => /[aeiou]/.test(strip(c || ''));
  const isLetter = c => /[a-záàâãéêíóôõúüç]/i.test(c || '');

  /** Classifica cada caractere (com contexto) em um visema. Retorna array de chaves de V ou null (mudo). */
  function classify(chars) {
    const s = chars.map(c => (c || '').toLowerCase());
    const out = new Array(s.length).fill(null);
    for (let i = 0; i < s.length; i++) {
      const c = s[i], n = s[i + 1] || '', n2 = s[i + 2] || '', p = s[i - 1] || '';
      const b = strip(c);
      if (!c.trim()) { out[i] = 'SPACE'; continue; }
      if (/[.,;:!?…—–]/.test(c)) { out[i] = 'sil'; continue; }
      if (/[0-9]/.test(c)) { out[i] = i % 2 ? 'E' : 'TD'; continue; } // números sem normalização
      if (!isLetter(c)) { out[i] = null; continue; }

      // dígrafos
      if (b === 'c' && n === 'h') { out[i] = 'CH'; out[i + 1] = 'CH'; i++; continue; }
      if ((b === 'l' || b === 'n') && n === 'h') { out[i] = 'LH'; out[i + 1] = 'LH'; i++; continue; }
      if (b === 'q' && n === 'u') { out[i] = 'KG'; out[i + 1] = /[eiéêí]/.test(n2) ? 'KG' : 'U'; i++; continue; }
      if (b === 'g' && n === 'u' && /[eiéêí]/.test(n2)) { out[i] = 'KG'; out[i + 1] = 'KG'; i++; continue; }
      if (b === 'h') { out[i] = null; continue; } // h mudo

      switch (b) {
        case 'p': case 'b': out[i] = 'PBM'; break;
        case 'm': {
          // m nasal (fim de sílaba: "também", "campo") não fecha tanto os lábios quanto m de início
          const nasalEnd = isVowel(p) && (!isLetter(n) || (!isVowel(n) && !/[pb]/.test(n)));
          out[i] = nasalEnd ? null : 'PBM';
          break;
        }
        case 'n': out[i] = isVowel(p) && !isVowel(n) ? null : 'TD'; break; // n nasal de coda
        case 'f': case 'v': out[i] = 'FV'; break;
        case 't': case 'd': case 'l': out[i] = 'TD'; break;
        case 's': case 'z': out[i] = 'SZ'; break;
        case 'x': case 'j': out[i] = 'CH'; break;
        case 'c': out[i] = c === 'ç' || /[eiéêí]/.test(n) ? 'SZ' : 'KG'; break;
        case 'g': out[i] = /[eiéêí]/.test(n) ? 'CH' : 'KG'; break;
        case 'k': case 'q': out[i] = 'KG'; break;
        case 'r': out[i] = 'R'; break;
        case 'w': out[i] = 'U'; break;
        case 'y': out[i] = 'I'; break;
        case 'a': out[i] = c === 'ã' || c === 'â' && /[mn]/.test(n) ? 'AN' : 'A'; break;
        case 'e': out[i] = 'E'; break;
        case 'i': out[i] = 'I'; break;
        case 'o': out[i] = c === 'õ' ? 'ON' : 'O'; break;
        case 'u': out[i] = 'U'; break;
        default: out[i] = null;
      }
    }
    return out;
  }

  /**
   * Monta a linha do tempo a partir do alinhamento da ElevenLabs.
   * alignment = { characters[], character_start_times_seconds[], character_end_times_seconds[] }
   * Retorna { keys: [{t0,t1,v,open,width,press,w}], words: [{text,t0,t1,i}], duration, emphasis: [{t,kind}] }
   */
  function buildTimeline(alignment, opts = {}) {
    const chars = alignment.characters || [];
    const st = alignment.character_start_times_seconds || [];
    const en = alignment.character_end_times_seconds || [];
    const cls = classify(chars);
    const keys = [];
    for (let i = 0; i < chars.length; i++) {
      let v = cls[i];
      const t0 = st[i] ?? 0, t1 = Math.max(en[i] ?? t0, t0 + 0.001);
      if (v === null) { // caractere mudo: estende o anterior
        if (keys.length) keys[keys.length - 1].t1 = Math.max(keys[keys.length - 1].t1, t1);
        continue;
      }
      const last = keys[keys.length - 1];
      if (last && last.v === v && t0 - last.t1 < 0.02) { last.t1 = t1; continue; } // funde repetidos (ss, rr)
      keys.push({ t0, t1, v, ...V[v] });
    }
    // garante fechamento visível mínimo em p/b/m — sem isso a boca "pula" a oclusão
    // (80 ms: o filtro de 50 ms abaixo ainda chega a zero no centro da oclusão)
    for (const k of keys) if (k.press && k.t1 - k.t0 < 0.08) { const c = (k.t0 + k.t1) / 2; k.t0 = c - 0.04; k.t1 = c + 0.04; }
    // alvo efetivo: consoantes fracas herdam parte da vogal seguinte (coarticulação real — a boca
    // não fecha a cada letra). Calculado uma vez, deixa a curva contínua entre segmentos.
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (k.press) { k.eo = 0; k.ew = k.width; continue; }
      let n = null;
      for (let j = i + 1; j < Math.min(keys.length, i + 3); j++) if (keys[j].w >= 1 && !keys[j].press) { n = keys[j]; break; }
      k.eo = n ? k.open * k.w + n.open * (1 - k.w) * 0.6 : k.open;
      k.ew = n ? k.width * k.w + n.width * (1 - k.w) : k.width;
    }

    const words = [];
    let cur = null;
    for (let i = 0; i < chars.length; i++) {
      const c = chars[i];
      if (/\s/.test(c)) { if (cur) { words.push(cur); cur = null; } continue; }
      if (!cur) cur = { text: '', t0: st[i] ?? 0, t1: en[i] ?? 0, i: words.length };
      cur.text += c; cur.t1 = en[i] ?? cur.t1;
    }
    if (cur) words.push(cur);

    // ênfase para microexpressões: perguntas, exclamações, palavras longas/acentuadas, pausas
    const emphasis = [];
    const text = chars.join('');
    words.forEach((w, i) => {
      const dur = w.t1 - w.t0;
      const clean = w.text.replace(/[^\p{L}]/gu, '');
      if (clean.length >= 7 && dur > 0.42 && /[áéíóúâêô]/i.test(clean)) emphasis.push({ t: w.t0, kind: 'brow', word: w.text });
      const next = words[i + 1];
      if (next && next.t0 - w.t1 > 0.28) emphasis.push({ t: w.t1, kind: 'pause' });
    });
    if (/\?\s*$/.test(text) && words.length) emphasis.push({ t: words[words.length - 1].t0, kind: 'question' });
    if (/!\s*$/.test(text) && words.length) emphasis.push({ t: words[0].t0, kind: 'brow' });
    if (words.length) emphasis.push({ t: words[words.length - 1].t1, kind: 'end' });

    const duration = Math.max(0, ...en.filter(Number.isFinite));
    return { keys, words, emphasis, duration, lead: opts.lead ?? 0.045 };
  }

  const lerp = (a, b, k) => a + (b - a) * k;
  const smooth = k => k * k * (3 - 2 * k);

  const REST = { open: 0, width: 0.45, press: false };
  function sampleRaw(k, t) {
    if (!k.length || t <= k[0].t0 - 0.12 || t >= k[k.length - 1].t1 + 0.12) return REST;
    let lo = 0, hi = k.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (k[m].t0 <= t) lo = m; else hi = m - 1; }
    const a = k[lo], b = k[lo + 1];
    if (t < a.t0) { const q = smooth(Math.max(0, 1 - (a.t0 - t) / 0.12)); return { open: a.eo * q, width: lerp(0.45, a.ew, q), press: false }; }
    if (a.press && t <= a.t1) return { open: 0, width: a.ew, press: true };
    if (!b || t > a.t1) { // após o último som (ou num buraco): relaxa até o repouso
      const q = smooth(Math.min(1, Math.max(0, (t - a.t1) / 0.12)));
      const to = b ? b.eo : 0, tw = b ? b.ew : 0.45;
      return { open: lerp(a.eo, b ? lerp(0, to, q) : 0, q), width: lerp(a.ew, tw, q), press: false };
    }
    // segura o alvo e, nos últimos 40% do segmento, desliza para o próximo (contínuo na fronteira)
    const pos = (t - a.t0) / Math.max(a.t1 - a.t0, 0.001);
    if (pos < 0.6) return { open: a.eo, width: a.ew, press: false };
    const q = smooth((pos - 0.6) / 0.4);
    return { open: lerp(a.eo, b.eo, q), width: lerp(a.ew, b.ew, q), press: false };
  }

  /**
   * Forma de boca no tempo t (s). Aplica antecipação (lábios se movem ~45 ms antes do som),
   * coarticulação e um filtro de ~50 ms (músculo não muda de forma instantaneamente).
   * Retorna {open,width,press}.
   */
  function sample(tl, t) {
    const k = tl.keys;
    if (!k.length) return REST;
    t += tl.lead;
    const c = sampleRaw(k, t);
    let o = 0, w = 0;
    for (const d of [-0.024, -0.012, 0, 0.012, 0.024]) { const r = d ? sampleRaw(k, t + d) : c; o += r.open; w += r.width; }
    o /= 5;
    return { open: o, width: w / 5, press: c.press && o < 0.12 };
  }

  /** Divide texto em frases para TTS por partes (primeira frase começa a tocar enquanto as outras são geradas). */
  function splitSentences(text) {
    const ABBR = /\b(sr|sra|dr|dra|prof|profa|av|etc|ex|nº|n|pág|vs)\.$/i;
    const parts = [];
    let buf = '';
    const tokens = String(text).replace(/\s+/g, ' ').trim().split(/(?<=[.!?…;:])\s+/);
    for (const tk of tokens) {
      buf = buf ? buf + ' ' + tk : tk;
      if (ABBR.test(buf) || /\d\.$/.test(buf) && !/[.!?]\s*$/.test(tk)) continue;
      if (buf.length < 18 && tokens.length > 1) continue; // evita frases minúsculas (prosódia ruim)
      parts.push(buf); buf = '';
    }
    if (buf) parts.push(buf);
    // quebra frases longas demais em vírgulas (latência menor na 1ª frase)
    return parts.flatMap(p => p.length <= 220 ? [p] : p.split(/(?<=,)\s+/).reduce((acc, s) => {
      if (acc.length && (acc[acc.length - 1] + ' ' + s).length <= 220) acc[acc.length - 1] += ' ' + s; else acc.push(s);
      return acc;
    }, []));
  }

  /** Alinhamento sintético (demo sem chave / fallback): ~13 caracteres por segundo. */
  function synthAlignment(text, cps = 13.5) {
    const characters = [...text], s = [], e = [];
    let t = 0.05;
    for (const c of characters) {
      const d = /[.!?]/.test(c) ? 0.32 : /[,;:]/.test(c) ? 0.18 : /\s/.test(c) ? 0.05 : 1 / cps * (isVowel(c) ? 1.25 : 0.8);
      s.push(t); t += d; e.push(t);
    }
    return { characters, character_start_times_seconds: s, character_end_times_seconds: e };
  }

  return { VISEMES: V, classify, buildTimeline, sample, splitSentences, synthAlignment };
});
