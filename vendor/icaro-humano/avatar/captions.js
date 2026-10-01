/*
 * captions.js — legenda sincronizada palavra a palavra (estilo karaokê discreto).
 *   const cap = new IcaroCaptions(document.getElementById('legenda'));
 *   new IcaroSpeech({ onSentence: cap.sentence, onWord: cap.word, onEnd: cap.end });
 *   cap.user('Qual é o seu limite?')   // mostra o que o usuário falou (itálico)
 */
(function (root) {
  'use strict';
  // desfaz a troca de pronúncia do servidor para exibir a grafia correta
  const DISPLAY = { 'Uéfis': 'UEFS' };
  class IcaroCaptions {
    constructor(el, opts = {}) {
      this.el = el; this.o = Object.assign({ hold: 2200, display: DISPLAY }, opts);
      this.spans = []; this.timer = 0;
      el.setAttribute('aria-live', 'polite');
      el.classList.add('icaro-cap');
      this.sentence = this.sentence.bind(this); this.word = this.word.bind(this); this.end = this.end.bind(this);
    }
    _show() { clearTimeout(this.timer); this.el.classList.add('on'); }
    sentence(text, tl) {
      this._show();
      this.el.classList.remove('user');
      this.el.textContent = '';
      this.spans = tl.words.map((w, i) => {
        const s = document.createElement('span');
        s.textContent = this._fix(w.text); s.className = 'w';
        this.el.appendChild(s);
        if (i < tl.words.length - 1) this.el.appendChild(document.createTextNode(' '));
        return s;
      });
    }
    _fix(t) { const m = t.match(/^([\p{L}]+)(.*)$/u); return m && this.o.display[m[1]] ? this.o.display[m[1]] + m[2] : t; }
    word(w, i) {
      const s = this.spans[i]; if (!s) return;
      s.classList.add('said');
      this.spans.forEach((x, j) => x.classList.toggle('now', j === i));
    }
    end() {
      this.spans.forEach(x => { x.classList.add('said'); x.classList.remove('now'); });
      this.timer = setTimeout(() => this.el.classList.remove('on'), this.o.hold);
    }
    user(text, final) {
      this._show();
      this.el.classList.add('user');
      this.el.textContent = text;
      if (final) this.timer = setTimeout(() => this.el.classList.remove('on'), this.o.hold);
    }
    status(text) { this._show(); this.el.classList.add('user'); this.el.textContent = text; }
    clear() { this.el.classList.remove('on'); }
  }
  root.IcaroCaptions = IcaroCaptions;
})(typeof self !== 'undefined' ? self : this);
