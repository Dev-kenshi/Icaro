// node conhecimento/build.js → lê fontes/*.md e gera base.json (o que o Ícaro carrega) + base.csv (planilha)
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, 'fontes');
const trechos = [], ids = new Set(), erros = [];
for (const arq of fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort()) {
  let tema = '', cur = null;
  const fecha = () => {
    if (!cur) return;
    cur.texto = cur.texto.join(' ').replace(/\s+/g, ' ').trim();
    if (!cur.texto) erros.push(`${arq}: ${cur.id} sem texto`);
    if (!cur.perguntas.length) erros.push(`${arq}: ${cur.id} sem perguntas`);
    trechos.push(cur); cur = null;
  };
  for (const linha of fs.readFileSync(path.join(dir, arq), 'utf8').split(/\r?\n/)) {
    if (linha.startsWith('# ')) { fecha(); tema = linha.slice(2).trim(); continue; }
    const m = linha.match(/^## +([a-z0-9_]+) *\| *(.+)$/);
    if (m) {
      fecha();
      if (ids.has(m[1])) erros.push(`${arq}: id duplicado ${m[1]}`);
      ids.add(m[1]);
      cur = { id: m[1], tema, titulo: m[2].trim(), perguntas: [], texto: [], verificar: false, arquivo: arq };
      continue;
    }
    if (!cur) continue;
    if (/^p: /.test(linha)) cur.perguntas.push(...linha.slice(3).split(';').map((s) => s.trim()).filter(Boolean));
    else if (/^v: *sim/.test(linha)) cur.verificar = true;
    else if (linha.trim()) cur.texto.push(linha.trim());
  }
  fecha();
}
if (erros.length) { console.error(erros.join('\n')); process.exit(1); }
const palavras = trechos.reduce((a, t) => a + t.texto.split(' ').length, 0);
fs.writeFileSync(path.join(__dirname, 'base.json'), JSON.stringify({ versao: '1.0.0', gerado: new Date().toISOString().slice(0, 10), trechos }, null, 1));
const esc = (s) => '"' + String(s).replace(/"/g, '""') + '"';
fs.writeFileSync(path.join(__dirname, 'base.csv'), '﻿id;tema;titulo;perguntas;texto;verificar\n' +
  trechos.map((t) => [t.id, t.tema, t.titulo, t.perguntas.join(' | '), t.texto, t.verificar ? 'sim' : ''].map(esc).join(';')).join('\n'));
const porTema = {};
for (const t of trechos) porTema[t.tema] = (porTema[t.tema] || 0) + 1;
console.log(`${trechos.length} trechos · ${palavras} palavras · ${trechos.filter((t) => t.verificar).length} a verificar`);
for (const [k, v] of Object.entries(porTema)) console.log(`  ${v.toString().padStart(3)}  ${k}`);
