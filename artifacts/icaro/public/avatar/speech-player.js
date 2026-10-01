/*
 * speech-player.js — fala do Ícaro com sincronia exata entre áudio, boca e legenda.
 *
 * - Divide a resposta em frases; gera a 1ª e já toca enquanto as próximas são geradas (latência baixa).
 * - Cada frase vem da ElevenLabs COM os tempos de cada caractere (/with-timestamps).
 * - O áudio é agendado no relógio do AudioContext; a boca e a legenda leem o MESMO relógio.
 *   Por construção, lábio e som não têm como se desalinhar.
 * - Aceita texto em streaming do LLM (feed(token) … flush()).
 * - Interrupção (barge-in): stop() corta áudio, boca e pedidos pendentes na hora.
 *
 *   const player = new IcaroSpeech({ avatar: face, endpoint: '/api/tts-ts', onWord, onSentence, onEnd });
 *   await player.say('Olá! Eu sou o Ícaro.');
 *   // ou streaming: player.feed('Olá'); player.feed('! Eu sou'); … player.flush();
 */
(function (root) {
  'use strict';
  const V = root.IcaroVisemes;

  class IcaroSpeech {
    constructor(opts = {}) {
      this.o = Object.assign({ endpoint: '/api/tts-ts', gap: 0.14, prefetch: 2, fallback: null }, opts);
      this.avatar = opts.avatar;
      this.ctx = null; this.analyser = null; this.buf = new Uint8Array(512);
      this.queue = []; this.sources = []; this.aborts = new Set();
      this.pending = ''; this.cursor = 0; this.gen = 0; this.active = 0;
      this._meter = this._meter.bind(this);
    }

    /** Chame dentro de um clique/toque do usuário (política de autoplay). */
    unlock() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AC({ latencyHint: 'interactive' });
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 1024;
        this.analyser.connect(this.ctx.destination);
        requestAnimationFrame(this._meter);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    }

    _meter() {
      if (this.analyser && this.avatar) {
        this.analyser.getByteTimeDomainData(this.buf);
        let s = 0; for (let i = 0; i < this.buf.length; i++) { const v = (this.buf[i] - 128) / 128; s += v * v; }
        const lvl = Math.sqrt(s / this.buf.length);
        if (this.active) this.avatar.setAudioLevel(lvl);
        if (this.o.onLevel) this.o.onLevel(lvl);
      }
      requestAnimationFrame(this._meter);
    }

    /** Fala um texto completo. Resolve quando termina (ou é interrompido). */
    say(text) { this.feed(text); return this.flush(); }

    /** Streaming: acumula tokens do LLM e dispara cada frase assim que ela fecha. */
    feed(chunk) {
      this.unlock();
      this.pending += chunk;
      const m = this.pending.match(/^([\s\S]*?[.!?…])(\s+)([\s\S]*)$/);
      if (m && m[1].trim().length >= 18) { this._enqueue(m[1].trim()); this.pending = m[3]; this.feed(''); }
    }

    flush() {
      const rest = this.pending.trim(); this.pending = '';
      if (rest) for (const s of V.splitSentences(rest)) this._enqueue(s);
      return this._done || Promise.resolve();
    }

    _enqueue(sentence) {
      const gen = this.gen;
      if (!this.queue.length && !this.active) {
        this._done = new Promise(r => { this._resolveDone = r; });
        this.cursor = 0;
        if (this.avatar) this.avatar.setState('speaking');
      }
      const prev = this.queue.length ? this.queue[this.queue.length - 1].text : '';
      const item = { text: sentence, prev, next: '', data: null };
      if (this.queue.length) this.queue[this.queue.length - 1].next = sentence;
      item.data = this._fetch(item, gen);
      this.queue.push(item);
      this.active++;
      this._pump(gen);
    }

    async _fetch(item, gen) {
      const ac = new AbortController(); this.aborts.add(ac);
      try {
        const r = await fetch(this.o.endpoint, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ac.signal,
          body: JSON.stringify({ text: item.text, previous_text: item.prev || undefined }),
        });
        if (!r.ok) throw new Error('tts ' + r.status);
        const j = await r.json();
        const bin = Uint8Array.from(atob(j.audio_base64), c => c.charCodeAt(0));
        const audio = await this.ctx.decodeAudioData(bin.buffer);
        const al = j.normalized_alignment && j.normalized_alignment.characters && j.normalized_alignment.characters.length ? j.normalized_alignment : j.alignment;
        return { audio, tl: V.buildTimeline(al), alignment: j.alignment };
      } finally { this.aborts.delete(ac); if (gen !== this.gen) ac.abort(); }
    }

    async _pump(gen) {
      if (this._pumping) return;
      this._pumping = true;
      try {
        while (this.queue.length && gen === this.gen) {
          const item = this.queue[0];
          let d;
          try { d = await item.data; }
          catch (e) {
            if (gen !== this.gen) return;
            console.warn('[fala] frase sem timestamps, usando reserva:', e.message);
            d = await this._fallback(item.text);
          }
          if (gen !== this.gen) return;
          this.queue.shift();
          if (d) await this._play(item.text, d, gen);
          this.active--;
        }
      } finally {
        this._pumping = false;
        if (gen === this.gen && !this.queue.length && !this.active) this._finish();
      }
    }

    _play(text, d, gen) {
      return new Promise(resolve => {
        const ctx = this.ctx;
        const src = ctx.createBufferSource();
        src.buffer = d.audio;
        src.connect(this.analyser);
        const start = Math.max(ctx.currentTime + 0.06, this.cursor);
        this.cursor = start + d.audio.duration + this.o.gap;
        const clock = () => ctx.currentTime - start;
        if (this.avatar) this.avatar.speak(d.tl, clock);
        if (this.o.onSentence) this.o.onSentence(text, d.tl, clock);
        // legenda palavra a palavra, no mesmo relógio
        let wi = -1;
        const tick = () => {
          if (gen !== this.gen) return;
          const t = clock();
          while (wi + 1 < d.tl.words.length && d.tl.words[wi + 1].t0 <= t) { wi++; if (this.o.onWord) this.o.onWord(d.tl.words[wi], wi, d.tl.words); }
          if (t < d.audio.duration) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        this._curResolve = resolve; // stop() libera a espera
        src.onended = () => { this.sources = this.sources.filter(s => s !== src); resolve(); };
        this.sources.push(src);
        src.start(start);
      });
    }

    async _fallback(text) {
      // sem timestamps: usa TTS reserva (ex.: o atual do sistema) e alinhamento estimado
      if (!this.o.fallback) return null;
      try {
        const buf = await this.o.fallback(text); // deve retornar ArrayBuffer de áudio
        const audio = await this.ctx.decodeAudioData(buf);
        const al = V.synthAlignment(text, text.length / Math.max(audio.duration - 0.1, 0.3));
        return { audio, tl: V.buildTimeline(al) };
      } catch (e) { console.warn('[fala] reserva falhou:', e.message); return null; }
    }

    _finish() {
      if (this.avatar) this.avatar.stopSpeaking();
      if (this.o.onEnd) this.o.onEnd();
      if (this._resolveDone) { this._resolveDone(); this._resolveDone = null; }
    }

    /** Interrompe tudo imediatamente (usuário começou a falar, trocou de pergunta etc.). */
    stop() {
      this.gen++;
      for (const a of this.aborts) a.abort();
      this.aborts.clear();
      for (const s of this.sources) { try { s.onended = null; s.stop(); } catch {} }
      this.sources = []; this.queue = []; this.pending = ''; this.active = 0; this._pumping = false;
      if (this._curResolve) { this._curResolve(); this._curResolve = null; }
      if (this.ctx) this.cursor = this.ctx.currentTime;
      this._finish();
    }

    get speaking() { return this.active > 0; }
  }

  root.IcaroSpeech = IcaroSpeech;
})(typeof self !== 'undefined' ? self : this);
