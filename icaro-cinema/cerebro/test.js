// node cerebro/test.js  -> valida o banco e a precisão do roteador
const fs = require('fs'), path = require('path');
const IcaroBrain = require('./icaro-brain');
const bank = JSON.parse(fs.readFileSync(path.join(__dirname, 'banco-respostas.json'), 'utf8'));
const brain = IcaroBrain.create(bank, { now: () => new Date('2026-10-01T15:30:00-03:00') });
let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('FALHA:', m); } };

// 1. estrutura
const ids = new Set();
for (const e of bank.entries) {
  ok(!ids.has(e.id), 'id duplicado ' + e.id); ids.add(e.id);
  ok(e.q && e.q.length && e.a && e.cat, 'campos ' + e.id);
  ok(e.a.length < 650, 'resposta longa demais p/ fala ' + e.id);
}
for (const e of bank.entries) for (const f of e.follow || []) ok(ids.has(f), 'follow inválido ' + e.id + '->' + f);

// 2. auto-recuperação: cada pergunta-exemplo cai no próprio intent
let self = 0, tot = 0;
for (const e of bank.entries) for (const q of e.q) { tot++; const r = brain.answer(q); brain.reset(); if (r.id === e.id) self++; else console.log('  exemplo', JSON.stringify(q), '->', r.mode, r.id || '', r.score.toFixed(2), '(esperado', e.id + ')'); }
console.log(`auto-recuperação: ${self}/${tot}`);
ok(self / tot >= 0.95, 'auto-recuperação < 95%');

// 3. paráfrases inéditas (como o público fala)
const para = [
  ['ícaro, quando o ICMS vai acabar?', 'rt_cronograma'],
  ['me explica esse tal de split payment', 'rt_split'],
  ['a inteligência artificial vai roubar o emprego dos contadores?', 'ia_substitui'],
  ['quanto um MEI pode faturar por ano', 'ct_mei'],
  ['como faço pra entrar na UEFS', 'uefs_ingresso'],
  ['onde fica a uefis', 'uefs_local'],
  ['qual a diferença entre lucro real e presumido', 'ct_regimes'],
  ['o que é CBS', 'rt_cbs'],
  ['o que é o IBS', 'rt_ibs'],
  ['por que chamam feira de princesa do sertão', 'fsa_princesa'],
  ['que horas são agora', 'sys_hora'],
  ['quem te criou?', 'sys_criador'],
  ['o que é o imposto do pecado', 'rt_seletivo'],
  ['vale a pena cursar contábeis?', 'uefs_porque'],
  ['quem ganha 5 mil vai pagar imposto de renda?', 'ct_irpf_2026'],
  ['a IA inventa coisas?', 'ia_alucinacao'],
  ['o que vai mudar ano que vem com a reforma', 'rt_o_que_e'],
  ['boa noite ícaro', 'sys_saudacao'],
];
let hit = 0;
for (const [q, id] of para) { const r = brain.answer(q); brain.reset(); if (r.id === id) hit++; else console.log('  paráfrase', JSON.stringify(q), '->', r.mode, r.id || r.cat, r.score.toFixed(2), '(esperado', id + ')'); }
console.log(`paráfrases: ${hit}/${para.length}`);
ok(hit / para.length >= 0.85, 'paráfrases < 85%');

// 4. fora do escopo deve ir ao LLM, nunca resposta local errada
for (const q of ['qual a capital da austrália', 'me ensina a fazer bolo de chocolate', 'quem ganhou a copa de 2002']) {
  const r = brain.answer(q); ok(r.mode !== 'local', 'fora do escopo virou local: ' + q + ' -> ' + r.id);
}
// 5. dinâmicas + continuação + pensamentos
ok(/15:30/.test(brain.answer('que horas são').text), 'hora dinâmica');
brain.answer('o que é a reforma tributária'); ok(brain.answer('e depois?').id === 'rt_cronograma', 'continuação');
ok(brain.answer('o que é split payment').thoughts.length >= 3, 'pensamentos');
// 6. quebra-cabeça: exemplo do banco nunca abre lacuna falsa; pergunta com detalhe extra abre lacuna só com o detalhe
let falsas = 0;
for (const e of bank.entries) for (const q of e.q) { const r = brain.answer(q); brain.reset(); if (r.mode === 'puzzle') { falsas++; console.log('  lacuna falsa', JSON.stringify(q), r.parts.find(p => p.tipo === 'lacuna').prompt.split('sobre: ')[1].split('.')[0]); } }
console.log('lacunas falsas nos exemplos: ' + falsas);
ok(falsas / tot <= 0.03, 'lacunas falsas > 3%');
const puz = [
  ['o que é split payment e como isso afeta uma farmácia?', 'rt_split', 'farmacia'],
  ['o que é MEI e serve para uma manicure?', 'ct_mei', 'manicure'],
  ['a ia vai substituir o contador que trabalha com agronegócio?', 'ia_substitui', 'agronegocio'],
];
for (const [q, id, w] of puz) {
  const r = brain.answer(q); brain.reset();
  const lac = r.parts && r.parts.find(p => p.tipo === 'lacuna');
  ok(r.mode === 'puzzle' && r.id === id && lac && lac.prompt.includes(w), 'puzzle ' + q + ' -> ' + r.mode + ' ' + r.id);
}
const ex = brain.answer(puz[0][0]); brain.reset();
console.log('exemplo de peças:', ex.parts.map(p => p.tipo === 'lacuna' ? '[LACUNA IA]' : p.chave).join(' + '));
ok(ex.parts[0].tipo === 'gravado' && ex.parts[1].chave === 'rt_split.ext', 'ordem das peças');
const pal = s => s.trim().split(" ").length;
const l = brain.answer('o que é a reforma tributária'); brain.reset();
console.log('resposta longa (local):', pal(l.text), 'palavras');
ok(pal(l.text) >= 90, 'resposta curta demais');
const prompt = lac => lac.prompt.length / 4;
console.log('tokens da lacuna ≈', Math.round(prompt(ex.parts.find(p => p.tipo === 'lacuna'))), '(vs ~600 de uma chamada completa)');
// 7. latência
const t = Date.now(); for (let i = 0; i < 500; i++) brain.answer('como a reforma tributária afeta o contador'); const ms = (Date.now() - t) / 500;
console.log(`latência média: ${ms.toFixed(2)} ms · ${bank.entries.length} intents`);
ok(ms < 5, 'lento');
console.log(fail ? `\n${fail} FALHA(S)` : '\nTUDO OK'); process.exit(fail ? 1 : 0);
