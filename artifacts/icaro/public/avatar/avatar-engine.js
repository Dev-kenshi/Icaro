/*
 * avatar-engine.js — rosto do Ícaro com leitura labial, piscadas, microexpressões e movimento de cabeça.
 *
 * Substitui o "vídeo em loop com cortes". Um único rosto base é desenhado em <canvas> e, por cima,
 * recortes reais da boca e dos olhos (extraídos do vídeo original e alinhados) trocam a cada quadro.
 * Resultado: zero cortes, boca parada quando não fala, lábios seguindo cada sílaba.
 *
 *   const face = new IcaroAvatar(canvas, { assets: '/avatar/assets/' });
 *   await face.ready;
 *   face.setState('listening' | 'thinking' | 'speaking' | 'idle');
 *   face.speak(timeline, () => audioCtx.currentTime - startTime);   // timeline de IcaroVisemes.buildTimeline
 *   face.setAudioLevel(0..1);   // opcional: nível do áudio (fecha a boca em silêncios reais)
 */
(function (root) {
  'use strict';
  const V = root.IcaroVisemes;

  // ruído suave (value noise 1D) para movimentos orgânicos, sem padrão repetitivo
  function makeNoise(seed) {
    const r = []; let s = seed || 1;
    for (let i = 0; i < 256; i++) { s = (s * 16807) % 2147483647; r.push(s / 2147483647 * 2 - 1); }
    return t => { const i = Math.floor(t), f = t - i, a = r[i & 255], b = r[(i + 1) & 255]; const k = f * f * (3 - 2 * f); return a + (b - a) * k; };
  }
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const rand = (a, b) => a + Math.random() * (b - a);

  // mola criticamente amortecida: movimento de músculo, sem tremer nem atrasar
  function spring(state, target, dt, freq) {
    const w = 2 * Math.PI * freq, x = state.x - target;
    const exp = Math.exp(-w * dt);
    const nx = (x + (state.v + w * x) * dt) * exp;
    state.v = (state.v - w * (state.v + w * x) * dt) * exp;
    state.x = nx + target;
    return state.x;
  }

  class IcaroAvatar {
    constructor(canvas, opts = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: true });
      this.opts = Object.assign({ assets: 'avatar/assets/', motion: 1, dpr: Math.min(window.devicePixelRatio || 1, 2) }, opts);
      this.state = 'idle';
      this.tl = null; this.clock = null;
      this.level = 0; this.levelAt = 0; this.useLevelGate = false;
      this.mouth = { open: { x: 0, v: 0 }, width: { x: 0.45, v: 0 } };
      this.head = { rx: { x: 0, v: 0 }, ty: { x: 0, v: 0 }, tx: { x: 0, v: 0 }, sc: { x: 1, v: 0 } };
      this.blink = { t: 0, next: performance.now() + rand(1200, 3000), double: false };
      this.brow = { amt: 0, until: 0, peak: 0 };
      this.nod = { t: -1, amp: 0 };
      this.firedEmphasis = new Set();
      this.nx = makeNoise(7); this.ny = makeNoise(13); this.nr = makeNoise(29); this.ns = makeNoise(41);
      this.last = performance.now();
      this.onframe = null;
      this.ready = this._load();
    }

    async _load() {
      const a = this.opts.assets;
      const img = src => new Promise((ok, err) => { const i = new Image(); i.decoding = 'async'; i.onload = () => ok(i); i.onerror = () => err(new Error('falha ao carregar ' + src)); i.src = a + src; });
      const [meta, base, mouth, eyes] = await Promise.all([
        fetch(a + 'atlas.json').then(r => { if (!r.ok) throw new Error('atlas.json ' + r.status); return r.json(); }),
        img('base.jpg'), img('mouth.webp'), img('eyes.webp'),
      ]);
      this.meta = meta; this.base = base; this.mouthImg = mouth; this.eyesImg = eyes;
      const mr = meta.range;
      // normaliza métricas reais dos recortes para o espaço 0..1 usado pelos visemas
      this.frames = meta.mouth.frames.map((f, i) => ({
        i, open: clamp((f.open - mr.open[0]) / (mr.open[1] - mr.open[0] || 1), 0, 1),
        width: clamp((f.width - mr.width[0]) / (mr.width[1] - mr.width[0] || 1), 0, 1), neutral: !!f.neutral,
      }));
      this.eyeFrames = Object.fromEntries(meta.eyes.frames.map((f, i) => [f.kind, i]));
      this._buildBrowLayer();
      this.neutralWidth = this.frames[0].width;
      this.mouth.width.x = this.neutralWidth;
      this._resize();
      window.addEventListener('resize', () => this._resize());
      this._loop = this._loop.bind(this);
      requestAnimationFrame(this._loop);
      return this;
    }

    // Sobrancelha procedural: a faixa das sobrancelhas do próprio rosto base, com bordas suaves,
    // desenhada alguns pixels acima = sobrancelha levantando (sem precisar de quadro no vídeo).
    _buildBrowLayer() {
      const eb = this.meta.eyes.box, S = this.meta.size;
      const x = eb[0], w = eb[2], h = Math.round(eb[3] * 0.62), y = Math.max(0, eb[1] - Math.round(h * 0.25));
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d');
      g.drawImage(this.base, x, y, w, h, 0, 0, w, h);
      g.globalCompositeOperation = 'destination-in';
      const v = g.createLinearGradient(0, 0, 0, h);
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(0.3, 'rgba(0,0,0,1)'); v.addColorStop(0.72, 'rgba(0,0,0,1)'); v.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = v; g.fillRect(0, 0, w, h);
      const hz = g.createLinearGradient(0, 0, w, 0);
      hz.addColorStop(0, 'rgba(0,0,0,0)'); hz.addColorStop(0.12, 'rgba(0,0,0,1)'); hz.addColorStop(0.88, 'rgba(0,0,0,1)'); hz.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = hz; g.fillRect(0, 0, w, h);
      this.browLayer = { c, x, y, lift: S * 0.011 };
    }

    _resize() {
      const r = this.canvas.getBoundingClientRect();
      const s = this.meta ? this.meta.size : 720;
      const px = Math.round(Math.max(r.width, r.height, 320) * this.opts.dpr);
      const dim = Math.min(px, s * 2);
      if (this.canvas.width !== dim) { this.canvas.width = dim; this.canvas.height = dim; }
    }

    /* ---------- API ---------- */
    setState(s) {
      if (s === this.state) return;
      this.state = s;
      if (s !== 'speaking') { this.tl = null; this.clock = null; }
      if (s === 'listening') this._nodSoon(rand(600, 1400), 0.6);
      if (s === 'thinking') this._browPulse(0.35, 900);
    }
    speak(timeline, clock) {
      this.tl = timeline; this.clock = clock; this.firedEmphasis = new Set();
      this.state = 'speaking';
      this._blinkSoon(rand(80, 260)); // pessoas piscam ao começar a falar
    }
    stopSpeaking() { this.tl = null; this.clock = null; if (this.state === 'speaking') this.state = 'idle'; }
    setAudioLevel(l) { this.level = l; this.levelAt = this._t(); this.useLevelGate = true; }

    /* ---------- microexpressões ---------- */
    // um único relógio (o do quadro atual) para todas as microexpressões
    _t() { return this._now || performance.now(); }
    _blinkSoon(ms) { this.blink.next = this._t() + ms; }
    _browPulse(peak, ms) { this.brow.peak = Math.max(this.brow.peak, peak); this.brow.until = this._t() + ms; }
    _nodSoon(ms, amp) { this.nod = { t: this._t() + ms, amp }; }

    _mouthTarget(now) {
      if (this.state !== 'speaking' || !this.tl || !this.clock) return { open: 0, width: this.neutralWidth, press: false };
      const t = this.clock();
      if (t == null || t < -0.2) return { open: 0, width: this.neutralWidth, press: false };
      const m = V.sample(this.tl, t);
      // emoções da fala
      for (const e of this.tl.emphasis) {
        const id = e.kind + e.t;
        if (t >= e.t && !this.firedEmphasis.has(id)) {
          this.firedEmphasis.add(id);
          if (e.kind === 'brow') this._browPulse(0.75, 520);
          if (e.kind === 'question') { this._browPulse(0.9, 900); this.nod = { t: now, amp: -0.5 }; }
          if (e.kind === 'pause') { if (Math.random() < 0.45) this._blinkSoon(rand(0, 120)); this.nod = { t: now, amp: 0.5 }; }
          if (e.kind === 'end') { this.nod = { t: now, amp: 0.8 }; if (Math.random() < 0.6) this._blinkSoon(rand(150, 350)); }
        }
      }
      // porta de áudio: se o som real está em silêncio há >120 ms, a boca fecha (nunca "fala" mudo)
      if (this.useLevelGate && now - this.levelAt < 500 && this.level < 0.012 && !m.press) {
        this._silentSince = this._silentSince || now;
        if (now - this._silentSince > 120) return { open: 0, width: m.width, press: false };
      } else this._silentSince = 0;
      return m;
    }

    _pickMouth(open, width, press) {
      if (press) return [[this.frames[0], 1]]; // lábios juntos = recorte neutro (fechado)
      // 2 recortes mais próximos no espaço abertura x largura (abertura pesa mais)
      let best = null, second = null;
      for (const f of this.frames) {
        const d = Math.hypot((f.open - open) * 1.6, (f.width - width) * 0.8);
        if (!best || d < best.d) { second = best; best = { f, d }; } else if (!second || d < second.d) second = { f, d };
      }
      if (!second || best.d < 0.02) return [[best.f, 1]];
      const wb = 1 / (best.d + 1e-3), ws = 1 / (second.d + 1e-3);
      const k = ws / (wb + ws);
      return k < 0.18 ? [[best.f, 1]] : [[best.f, 1], [second.f, k]]; // mistura só quando útil (evita "lábio duplo")
    }

    _loop(now) {
      const dt = clamp((now - this.last) / 1000, 0.001, 0.05);
      this.last = now; this._now = now;
      const t = now / 1000, M = this.opts.motion;

      // ----- boca -----
      const tgt = this._mouthTarget(now);
      const fOpen = tgt.press ? 26 : tgt.open < this.mouth.open.x ? 16 : 11; // oclusão p/b/m é a mais rápida; fechar > abrir
      const open = clamp(spring(this.mouth.open, tgt.open, dt, fOpen), 0, 1);
      const width = clamp(spring(this.mouth.width, tgt.width, dt, 7), 0, 1);

      // ----- piscada -----
      let eyeKind = 'open';
      if (now >= this.blink.next && !this.blink.t) this.blink.t = now;
      if (this.blink.t) {
        const e = now - this.blink.t; // 170 ms: fecha rápido, abre mais devagar
        eyeKind = e < 45 ? 'half' : e < 105 ? 'closed' : e < 170 ? 'half' : 'open';
        if (e >= 170) {
          this.blink.t = 0;
          const talking = this.state === 'speaking';
          if (!this.blink.double && Math.random() < 0.14) { this.blink.double = true; this._blinkSoon(rand(90, 160)); }
          else { this.blink.double = false; this._blinkSoon(talking ? rand(1800, 4200) : this.state === 'thinking' ? rand(3500, 7000) : rand(2400, 5600)); }
        }
      }

      // ----- sobrancelha -----
      const browTarget = now < this.brow.until ? this.brow.peak : 0;
      if (now >= this.brow.until) this.brow.peak = 0;
      this.brow.amt += (browTarget - this.brow.amt) * (browTarget > this.brow.amt ? 0.25 : 0.08);
      if (this.state === 'idle' && Math.random() < dt * 0.05) this._browPulse(rand(0.2, 0.4), rand(500, 900)); // microexpressão ocasional

      // ----- cabeça (respiração + deriva orgânica + acenos ligados à fala) -----
      const speakBoost = this.state === 'speaking' ? 1 + open * 0.8 : 1;
      let rx = this.nr(t * 0.23) * 0.9 * speakBoost;
      let tx = this.nx(t * 0.19) * 3.2 * speakBoost;
      let ty = this.ny(t * 0.21) * 2.2 + Math.sin(t * 2 * Math.PI * 0.24) * 1.4; // respiração ~14/min
      let sc = 1 + Math.sin(t * 2 * Math.PI * 0.24) * 0.0035 + this.ns(t * 0.1) * 0.003;
      if (this.state === 'listening') { sc += 0.012; rx += 0.8; }               // inclina e aproxima: atenção
      if (this.state === 'thinking') { rx -= 1.4; ty -= 2; }                    // cabeça levemente de lado
      if (this.state === 'speaking') ty += open * 3.2;                          // queixo acompanha sílabas fortes
      if (this.nod.t > 0) {
        const e = (now - this.nod.t) / 1000;
        if (e >= 0 && e < 0.7) ty += Math.sin(e / 0.7 * Math.PI) * 5 * this.nod.amp; else if (e >= 0.7) this.nod.t = -1;
      }
      if (this.state === 'listening' && Math.random() < dt * 0.25) this.nod = { t: now, amp: rand(0.35, 0.6) };
      const H = this.head;
      rx = spring(H.rx, rx * M, dt, 1.6); tx = spring(H.tx, tx * M, dt, 1.4);
      ty = spring(H.ty, ty * M, dt, 2.2); sc = spring(H.sc, 1 + (sc - 1) * M, dt, 1.5);

      this._draw(open, width, tgt.press, eyeKind, rx, tx, ty, sc);
      if (this.onframe) this.onframe({ open, width, eye: eyeKind, brow: this.brow.amt, state: this.state });
      requestAnimationFrame(this._loop);
    }

    _draw(open, width, press, eyeKind, rx, tx, ty, sc) {
      const { ctx, canvas, meta } = this;
      const S = meta.size, k = canvas.width / S;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // pivô no pescoço (abaixo do queixo): rotações parecem de cabeça real, não de figura girando
      const px = meta.anchors.chin[0], py = meta.anchors.chin[1] + meta.iod * 0.6;
      ctx.setTransform(k, 0, 0, k, 0, 0);
      ctx.translate(px + tx, py + ty);
      ctx.rotate(rx * Math.PI / 180);
      ctx.scale(sc, sc);
      ctx.translate(-px, -py);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(this.base, 0, 0, S, S);

      // boca
      const mb = meta.mouth.box, mc = meta.mouth.cols;
      for (const [f, a] of this._pickMouth(open, width, press)) {
        if (f.neutral && a === 1 && open < 0.02) continue; // base já tem a boca neutra
        ctx.globalAlpha = a;
        const G = meta.gutter || 0, sx = (f.i % mc) * (mb[2] + 2 * G) + G, sy = Math.floor(f.i / mc) * (mb[3] + 2 * G) + G;
        ctx.drawImage(this.mouthImg, sx, sy, mb[2], mb[3], mb[0], mb[1], mb[2], mb[3]);
      }
      ctx.globalAlpha = 1;

      // olhos (piscada) e sobrancelha
      const eb = meta.eyes.box, ec = meta.eyes.cols;
      const drawEye = (idx, alpha) => {
        if (idx == null || alpha <= 0.01) return;
        ctx.globalAlpha = alpha;
        const G = meta.gutter || 0;
        ctx.drawImage(this.eyesImg, (idx % ec) * (eb[2] + 2 * G) + G, Math.floor(idx / ec) * (eb[3] + 2 * G) + G, eb[2], eb[3], eb[0], eb[1], eb[2], eb[3]);
      };
      if (this.brow.amt > 0.02 && this.browLayer) {
        const b = this.browLayer;
        ctx.globalAlpha = clamp(this.brow.amt * 1.2, 0, 1);
        ctx.drawImage(b.c, b.x, b.y - b.lift * this.brow.amt);
        ctx.globalAlpha = 1;
      }
      if (eyeKind !== 'open') drawEye(this.eyeFrames[eyeKind] ?? this.eyeFrames.closed, 1);
      ctx.globalAlpha = 1;
    }
  }

  root.IcaroAvatar = IcaroAvatar;
})(typeof self !== 'undefined' ? self : this);
