/* ÍCARO · Base de conhecimento (busca BM25 local, sem token e sem internet)
 *
 *   const K = IcaroConhecimento.create(base);      // base = conteúdo de base.json
 *   K.buscar('como funciona o fator r', 3)          // → [{id, tema, titulo, texto, score}]
 *   K.responder('...')                              // → {modo:'base'|'contexto'|'nada', texto, trechos, confianca}
 *
 * 'base'     : um trecho responde sozinho → fale o texto (0 token)
 * 'contexto' : mande os trechos ao LLM como referência (poucos tokens)
 * 'nada'     : pergunta fora da base → LLM sem contexto
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../cerebro/icaro-brain.js'));
  else root.IcaroConhecimento = factory(root.IcaroBrain);
})(typeof self !== 'undefined' ? self : this, function (Brain) {
  'use strict';
  const K1 = 1.4, B = 0.6;
  const PESO = { titulo: 3, perguntas: 2.5, texto: 1 };
  // sinônimos do jeito que o público fala → termos usados na base (a palavra original continua na busca)
  const TESAURO = {
    inventou: 'historia origem', inventor: 'historia origem', criou: 'historia origem', surgiu: 'historia origem', comecou: 'historia origem', fundada: 'historia criada',
    segredo: 'sigilo etica', segredos: 'sigilo etica', sigiloso: 'sigilo',
    remedio: 'medicamento', remedios: 'medicamentos', farmacia: 'medicamento',
    aluga: 'locacao imovel', alugar: 'locacao imovel', aluguel: 'locacao arrendamento', inquilino: 'locacao',
    estrada: 'rodovia', estradas: 'rodovias', br: 'rodovia',
    gado: 'rural biologico agro', boi: 'rural biologico', plantacao: 'rural biologico agricola', lavoura: 'rural agricola', fazenda: 'rural agro',
    fiscaliza: 'conselho registro', fiscalizam: 'conselho registro',
    cursos: 'educacao continuada', atualizar: 'educacao continuada', capacitacao: 'educacao continuada',
    tipos: 'especies', modalidades: 'especies',
    emprego: 'mercado trabalho', vaga: 'mercado trabalho',
    prova: 'exame', faculdade: 'universidade', serve: 'objetivo', pra: '',
    dinheiro: 'caixa', lucro: 'lucro resultado', calote: 'perda credito', robo: 'automacao rpa',
    golpe: 'fraude seguranca', golpes: 'fraude seguranca', mentir: 'alucinacao', inventa: 'alucinacao',
    nota: 'nota fiscal', cupom: 'nfce', boleto: 'split payment', pix: 'split payment', cartao: 'split payment',
    devolucao: 'cashback', heranca: 'itcmd', carro: 'veiculos ipva', lancha: 'embarcacoes ipva',
  };
  function expandir(q) {
    const extra = [];
    for (const w of Brain.norm(q).split(' ')) if (TESAURO[w]) extra.push(TESAURO[w]);
    return q + ' ' + extra.join(' ');
  }

  function create(base, opts) {
    opts = opts || {};
    const docs = (base.trechos || base).map((d) => {
      const campos = { titulo: Brain.tokens(d.titulo), perguntas: Brain.tokens((d.perguntas || []).join(' ')), texto: Brain.tokens(d.texto) };
      const tf = new Map(); let len = 0;
      for (const [c, toks] of Object.entries(campos)) for (const t of toks) { tf.set(t, (tf.get(t) || 0) + PESO[c]); len += PESO[c]; }
      return { d, tf, len };
    });
    const N = docs.length;
    const avg = docs.reduce((a, x) => a + x.len, 0) / Math.max(N, 1);
    const df = new Map();
    for (const x of docs) for (const t of x.tf.keys()) df.set(t, (df.get(t) || 0) + 1);
    const idf = (t) => Math.log(1 + (N - (df.get(t) || 0) + 0.5) / ((df.get(t) || 0) + 0.5));

    function buscar(q, k) {
      k = k || 3;
      const todos = [...new Set(Brain.tokens(expandir(q)))];
      const qt = todos.filter((t) => df.has(t));
      if (!qt.length) return [];
      // palavras desconhecidas pela base também contam: pergunta fora do tema → confiança baixa
      const orig = new Set(Brain.tokens(q));
      const maxPossivel = todos.filter((t) => orig.has(t) || df.has(t)).reduce((a, t) => a + idf(t) * (K1 + 1), 0);
      const nOrig = orig.size || 1;
      const res = [];
      for (const x of docs) {
        let s = 0, hits = 0;
        for (const t of qt) {
          const f = x.tf.get(t); if (!f) continue;
          hits++;
          s += idf(t) * (f * (K1 + 1)) / (f + K1 * (1 - B + B * x.len / avg));
        }
        let hitsOrig = 0; for (const t of orig) if (x.tf.has(t)) hitsOrig++;
        if (s > 0) res.push({ id: x.d.id, tema: x.d.tema, titulo: x.d.titulo, texto: x.d.texto, verificar: !!x.d.verificar, score: s, cobertura: Math.max(hitsOrig, Math.min(hits, nOrig)) / nOrig, rel: s / maxPossivel });
      }
      return res.sort((a, b) => b.score - a.score).slice(0, k);
    }

    function responder(q) {
      const top = buscar(q, 3);
      if (!top.length) return { modo: 'nada', texto: '', trechos: [], confianca: 0 };
      const [a, b] = top;
      const margem = b ? a.score / b.score : 9;
      const conf = Math.min(1, a.rel * 1.6) * Math.min(1, a.cobertura + 0.15) * Math.min(1, margem / 1.25);
      const trechos = top.filter((t) => t.score >= a.score * 0.45);
      if (conf >= (opts.direto != null ? opts.direto : 0.55)) return { modo: 'base', texto: a.texto, id: a.id, titulo: a.titulo, verificar: a.verificar, trechos, confianca: conf };
      if (conf >= (opts.contexto != null ? opts.contexto : 0.12)) return { modo: 'contexto', texto: '', trechos, confianca: conf, contexto: trechos.map((t) => `- ${t.titulo}: ${t.texto}`).join('\n') };
      return { modo: 'nada', texto: '', trechos: [], confianca: conf };
    }

    return { buscar, responder, tamanho: N };
  }
  return { create };
});
