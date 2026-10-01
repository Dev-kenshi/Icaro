/* ÍCARO · Cérebro local (banco de respostas pré-programadas)
 * Responde sem gastar token quando a pergunta já está no banco.
 * Funciona em Node (require) e no navegador (window.IcaroBrain).
 *
 *   const brain = IcaroBrain.create(bancoJson, { now: () => new Date() });
 *   const r = brain.answer('o que é o split payment?');
 *   r.mode  -> 'local' | 'puzzle' | 'hint' | 'llm'
 *   r.parts -> peças da resposta: {tipo:'gravado', chave, texto} já gravadas + {tipo:'lacuna', prompt} p/ a IA (mode puzzle)
 *   r.text  -> resposta pronta (mode 'local')
 *   r.context -> trechos curtos para mandar ao LLM (mode 'hint')
 *   r.thoughts -> etapas reais do raciocínio, para o "Fluxo de Pensamento" holográfico
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.IcaroBrain = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const STOP = new Set(('a o as os um uma uns umas de da do das dos d em no na nos nas num numa por pelo pela pelos pelas ' +
    'para pra pro com sem sob sobre e ou que se me te lhe nos vos eu tu ele ela eles elas ' +
    'meu minha seu sua isso isto aquilo esse essa este esta ai la aqui ja mais muito muita bem tambem ' +
    'e eh foi ser sao era esta estao tem ter ha vai vou qual quais quanto quantos ' +
    'como onde quando porque pq oque sabe saber pode poderia gostaria queria quero fala falar diga vem agora ' +
    'explica explique explicar conta contar me mim icaro ola favor entao tipo coisa coisas tal gente aqui sobre agora fale falem ok okay hein').split(' '));

  // sinônimos e grafias faladas -> forma canônica
  const SYN = {
    uefis: 'uefs', ufs: 'uefs', 'uefs': 'uefs', estadual: 'uefs',
    feira: 'feira', fsa: 'feira', princesinha: 'princesa',
    ia: 'ia', ai: 'ia', inteligencia: 'ia', artificial: 'ia', chatgpt: 'llm', gpt: 'llm', claude: 'llm', gemini: 'llm',
    contabil: 'contabilidade', contabeis: 'contabilidade', contador: 'contabilidade', contadora: 'contabilidade', contadores: 'contabilidade',
    imposto: 'tributo', impostos: 'tributo', tributos: 'tributo', tributaria: 'tributario', tributarias: 'tributario',
    reforma: 'reforma', ibs: 'ibs', cbs: 'cbs', iva: 'iva', seletivo: 'seletivo', pecado: 'seletivo',
    split: 'split', payment: 'split', cashback: 'cashback', devolucao: 'cashback',
    balanco: 'balanco', balancete: 'balanco', dre: 'dre', resultado: 'dre',
    mei: 'mei', microempreendedor: 'mei', simples: 'simples', presumido: 'presumido', real: 'real',
    vc: 'voce', voces: 'voce', fazer: 'faz', faco: 'faz', roubar: 'substitu', tirar: 'substitu', substituir: 'substitu', trocar: 'substitu',
    vestibular: 'ingresso', sisu: 'ingresso', enem: 'ingresso', entrar: 'ingresso', ingressar: 'ingresso', vaga: 'ingresso', vagas: 'ingresso',
    oi: 'saudacao', ola: 'saudacao', eae: 'saudacao', salve: 'saudacao', bomdia: 'saudacao',
    obrigado: 'agradece', obrigada: 'agradece', valeu: 'agradece', brigado: 'agradece',
  };

  function norm(s) {
    return String(s || '').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/\bbom dia\b|\bboa tarde\b|\bboa noite\b/g, ' bomdia ')
      .replace(/\bo que\b/g, ' oque ')
      .replace(/[^a-z0-9%\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  // radical simples PT-BR (suficiente para casar plural/gênero/derivações curtas)
  function stem(w) {
    if (w.length <= 3) return w;
    return w.replace(/(ando|endo|indo|ado|ada|ido|ida|ar|er|ir)$/, '')
      .replace(/(coes|cao|soes|sao)$/, 'c')
      .replace(/(mente|idades|idade|mento|mentos)$/, '')
      .replace(/(ais|eis|ois)$/, 'al')
      .replace(/(oes|aes|ns)$/, 'o')
      .replace(/(es|s)$/, '')
      .replace(/[aeo]$/, '');
  }
  function pairs(s) {
    const out = [];
    for (const raw of norm(s).split(' ')) {
      if (!raw) continue;
      const w = SYN[raw] || raw;
      if (STOP.has(w)) continue;
      out.push({ w: raw, t: stem(w) });
    }
    return out;
  }
  function tokens(s) {
    const out = [];
    for (let w of norm(s).split(' ')) {
      if (!w) continue;
      if (SYN[w]) w = SYN[w];
      if (STOP.has(w)) continue;
      out.push(stem(w));
    }
    return out;
  }

  function create(bank, opts) {
    opts = opts || {};
    const now = opts.now || (() => new Date());
    const HIGH = opts.high != null ? opts.high : 0.62; // responde sozinho
    const LOW = opts.low != null ? opts.low : 0.30;    // manda dica ao LLM
    const longo = opts.longo !== false;   // inclui o bloco de aprofundamento (ext)
    const convite = opts.convite !== false; // termina sugerindo a próxima pergunta
    const entries = (bank.entries || bank).map((e) => {
      const qTok = e.q.map(tokens);
      const kwTok = (e.kw || []).map((k) => tokens(k)).filter((k) => k.length);
      return { e, qTok, kwTok, bag: new Set([].concat(...qTok, ...kwTok)) };
    });
    // IDF dos termos do banco
    const df = new Map();
    for (const it of entries) for (const t of it.bag) df.set(t, (df.get(t) || 0) + 1);
    const N = entries.length;
    const idf = (t) => Math.log(1 + N / (1 + (df.get(t) || 0)));

    let lastId = null;

    function score(qt, it) {
      if (!qt.length) return 0;
      const qs = new Set(qt);
      let total = 0; for (const t of qs) total += idf(t);
      // melhor pergunta-exemplo (cobertura ponderada por IDF nos dois sentidos)
      let best = 0;
      for (const ex of it.qTok) {
        const es = new Set(ex); if (!es.size) continue;
        let hit = 0, exTotal = 0;
        for (const t of es) { exTotal += idf(t); if (qs.has(t)) hit += idf(t); }
        const s = (2 * hit) / (total + exTotal);
        if (s > best) best = s;
      }
      // frases-chave: todos os termos da frase presentes
      let kw = 0;
      for (const k of it.kwTok) if (k.every((t) => qs.has(t))) kw += k.reduce((a, t) => a + idf(t), 0);
      const kwScore = Math.min(1, kw / Math.max(total, 1e-9));
      return Math.max(best, 0.55 * best + 0.6 * kwScore);
    }

    // quanto da pergunta-modelo está contido na pergunta (1 = modelo inteiro presente, mesmo com detalhes extras)
    // Conversa nunca vira quebra-cabeça; o modelo precisa ter peso mínimo e cobrir ≥ 25% da pergunta
    function coverage(qt, it) {
      if (it.e.cat === 'Conversa') return 0;
      const qs = new Set(qt); let best = 0, qTotal = 0;
      for (const t of qs) qTotal += idf(t);
      for (const ex of it.qTok) {
        const es = new Set(ex); if (!es.size) continue;
        let hit = 0, exTotal = 0;
        for (const t of es) { exTotal += idf(t); if (qs.has(t)) hit += idf(t); }
        if (exTotal < 3 || hit / qTotal < 0.25) continue;
        best = Math.max(best, hit / exTotal);
      }
      for (const k of it.kwTok) if (k.length > 1 && k.every((t) => qs.has(t))) best = 1;
      return best;
    }

    function dynamic(text, id) {
      const d = now();
      if (id === 'sys_hora') return text.replace('{hora}', d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bahia' }));
      if (id === 'sys_data') return text.replace('{data}', d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Bahia' }));
      return text;
    }

    // monta a resposta em peças: núcleo + aprofundamento + [lacuna da IA] + convite
    function compose(it, question, residual) {
      const e = it.e, parts = [];
      parts.push({ tipo: 'gravado', chave: e.id + '.a', texto: dynamic(e.a, e.id) });
      if (longo && e.ext) parts.push({ tipo: 'gravado', chave: e.id + '.ext', texto: e.ext });
      if (residual.length) {
        parts.push({
          tipo: 'lacuna',
          prompt: 'Pergunta: "' + String(question).trim() + '"\n' +
            'Já foi respondido: ' + e.a.split(/(?<=[.!?])\s/)[0] + '\n' +
            'Complete SÓ o que falta sobre: ' + residual.join(', ') + '.\n' +
            'Uma ou duas frases faladas (máx. 45 palavras), sem repetir o que já foi dito, sem saudação. Se não souber, diga que vale confirmar na fonte oficial.',
          max_tokens: 90,
        });
      }
      const nxt = convite && e.follow && entries.find((x) => x.e.id === e.follow[0]);
      if (nxt) {
        const pq = nxt.e.q.find((q) => /^(o que|como|quando|qual|quais|por que|quem|onde|quanto)\s/i.test(q));
        parts.push({ tipo: 'gravado', chave: e.id + '.convite', texto: pq ? 'Se quiser, me pergunte também: ' + pq + '?' : 'Se quiser, posso falar também sobre: ' + nxt.e.q[0] + '.' });
      }
      return parts;
    }
    function joinText(parts) { return parts.map((p) => (p.tipo === 'lacuna' ? '{lacuna}' : p.texto)).join(' '); }
    function pack(mode, it, score, parts, thoughts, t0) {
      lastId = it.e.id;
      return { mode, id: it.e.id, cat: it.e.cat, score, parts, text: joinText(parts), follow: it.e.follow || [], gestures: it.e.g || [], thoughts, ms: Date.now() - t0 };
    }

    function answer(question) {
      const t0 = Date.now();
      const qp = pairs(question), qt = qp.map((p) => p.t);
      const thoughts = [{ k: 'escuta', t: 'Pergunta recebida' }];
      // continuação: "e depois?", "fala mais", "continua"
      if (lastId && /^(e (depois|ai|entao)|fala mais|continua|mais detalhes|e isso|explica melhor)\b/.test(norm(question))) {
        const prev = entries.find((x) => x.e.id === lastId);
        const nxt = prev && prev.e.follow && entries.find((x) => x.e.id === prev.e.follow[0]);
        if (nxt) {
          thoughts.push({ k: 'memoria', t: 'Continuando o assunto anterior' }, { k: 'resposta', t: nxt.e.cat });
          return pack('local', nxt, 1, compose(nxt, question, []), thoughts, t0);
        }
      }
      if (qt.length) thoughts.push({ k: 'termos', t: qt.slice(0, 6).join(' · ') });
      const ranked = entries.map((it) => ({ it, s: score(qt, it) })).sort((a, b) => b.s - a.s);
      const top = ranked.slice(0, 3).filter((r) => r.s > 0);
      for (const r of top) thoughts.push({ k: 'hipotese', t: r.it.e.cat + ' — ' + r.it.e.q[0], c: +r.s.toFixed(2) });

      let b = ranked[0];
      // detalhe extra derruba a similaridade: se uma pergunta-modelo está inteira dentro da pergunta, vira quebra-cabeça
      if (b && b.s < HIGH) {
        const full = ranked.slice(0, 5).filter((r) => r.s >= LOW && coverage(qt, r.it) >= 0.85);
        if (full.length) b = full[0];
      }
      if (b && (b.s >= HIGH || (b.s >= LOW && coverage(qt, b.it) >= 0.85))) {
        // peças da pergunta que o banco não cobre = lacuna para a IA
        let total = 0, miss = 0; const residual = [];
        for (const p of qp) {
          total += idf(p.t);
          if (!b.it.bag.has(p.t) && (df.get(p.t) || 0) <= 1) { miss += idf(p.t); if (p.w.length >= 4 && !residual.includes(p.w)) residual.push(p.w); }
        }
        const gap = residual.length && miss / Math.max(total, 1e-9) >= 0.25 ? residual : [];
        const parts = compose(b.it, question, gap);
        const pct = Math.round((1 - (gap.length ? miss / total : 0)) * 100);
        if (gap.length) {
          thoughts.push({ k: 'resposta', t: 'Base própria cobre ' + pct + '% · completando: ' + gap.join(', ') });
          return pack('puzzle', b.it, b.s, parts, thoughts, t0);
        }
        thoughts.push({ k: 'resposta', t: 'Base própria · confiança ' + Math.round(Math.min(b.s, 1) * 100) + '%' });
        return pack('local', b.it, b.s, parts, thoughts, t0);
      }
      if (b && b.s >= LOW) {
        const ctx = top.filter((r) => r.s >= LOW).map((r) => '- ' + r.it.e.a);
        thoughts.push({ k: 'consulta', t: 'Confirmando com o modelo de IA' });
        return { mode: 'hint', score: b.s, cat: b.it.e.cat, context: ctx.join('\n'), thoughts, ms: Date.now() - t0 };
      }
      thoughts.push({ k: 'consulta', t: 'Pergunta nova · consultando o modelo de IA' });
      return { mode: 'llm', score: b ? b.s : 0, context: '', thoughts, ms: Date.now() - t0 };
    }

    return { answer, tokens, size: N, reset: () => { lastId = null; } };
  }

  // Cache de respostas do LLM (chave = termos normalizados ordenados). Em Node use com um Map persistido em JSON.
  function cacheKey(question) { return tokens(question).slice().sort().join(' '); }

  return { create, tokens, norm, cacheKey };
});
