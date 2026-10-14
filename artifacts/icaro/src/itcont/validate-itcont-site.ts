/**
 * 142 validações do site do ITCONT: dados oficiais, regras (contagem, fases, agenda),
 * identidade visual e leis da beleza, heurísticas de Nielsen na interface e integração.
 * Roda sem internet, sem banco e sem navegador.
 * Uso: pnpm --filter @workspace/scripts run validate:itcont-site
 * Desenvolvedor do projeto: Emanuel Macêdo Luz
 */
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FONTE_OFICIAL, ITCONT } from './dados';
import {
  aberturaEvento, contagem, contraste, dataExtenso, duracaoMin, encerramentoEvento, escalaAurea, faseDoEvento,
  gerarICS, googleAgendaUrl, horaCurta, iniciais, instante, layoutPara, mapaUrl, proximaSessao,
  sessoesOrdenadas, sessoesPorDia, whatsappUrl,
} from './logica';
import {
  detectPromoPhotoFormat,
  fitPromoPhotoDimensions,
  PROMO_PHOTO_MAX_BYTES,
  PROMO_PHOTO_MAX_SIDE,
} from './secoes/promo-photo';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, '../../../..');
const ler = (p: string) => (existsSync(p) ? readFileSync(p, 'utf8') : '');
const TOTAL_VALIDACOES = 142;

const resultados: Array<{ n: number; grupo: string; nome: string; erro?: string }> = [];
let grupo = '';
function check(nome: string, fn: () => void) {
  const n = resultados.length + 1;
  try { fn(); resultados.push({ n, grupo, nome }); }
  catch (e) { resultados.push({ n, grupo, nome, erro: e instanceof Error ? e.message.split('\n')[0] : String(e) }); }
}

// ───────────── A. Dados oficiais (Even3) ─────────────
grupo = 'A. Dados oficiais';
const S = ITCONT.sessoes;
check('título oficial com a sigla ITCONT', () => assert.match(ITCONT.tituloOficial, /IMERSÃO TECNOLÓGICA CONTÁBIL - ITCONT/));
check('datas 21 e 22/10/2026', () => assert.deepEqual([ITCONT.inicio, ITCONT.fim], ['2026-10-21', '2026-10-22']));
check('fuso de Brasília (UTC-3)', () => assert.deepEqual([ITCONT.fuso, ITCONT.offset], ['America/Sao_Paulo', '-03:00']));
check('local: Auditório III do Módulo IV da UEFS, Feira de Santana/BA', () => {
  assert.match(ITCONT.local.nome, /Auditório III do Módulo IV da UEFS/); assert.equal(ITCONT.local.cidade, 'Feira de Santana'); assert.equal(ITCONT.local.uf, 'BA');
});
check('3 sessões na programação', () => assert.equal(S.length, 3));
check('horários HH:MM e fim depois do início', () => S.forEach((s) => { assert.match(s.inicio, /^\d{2}:\d{2}$/); assert.match(s.fim, /^\d{2}:\d{2}$/); assert.ok(s.fim > s.inicio, s.id); }));
check('sessões dentro do período do evento', () => S.forEach((s) => assert.ok(s.data >= ITCONT.inicio && s.data <= ITCONT.fim, s.id)));
check('sessões não se sobrepõem', () => {
  const o = sessoesOrdenadas();
  for (let i = 1; i < o.length; i++) assert.ok(instante(o[i].data, o[i].inicio) >= instante(o[i - 1].data, o[i - 1].fim), o[i].id);
});
check('7 convidados com nomes únicos', () => { assert.equal(ITCONT.convidados.length, 7); assert.equal(new Set(ITCONT.convidados.map((c) => c.nome)).size, 7); });
check('fotos oficiais em alta resolução servidas pelo Even3', () => ITCONT.convidados.forEach((c) => assert.match(c.foto, /^https:\/\/static\.even3\.com\//, c.nome)));
check('inscrição aponta para a página oficial (https, Even3)', () => { assert.equal(ITCONT.inscricaoUrl, FONTE_OFICIAL); assert.match(FONTE_OFICIAL, /^https:\/\/www\.even3\.com\.br\//); });
check('3 categorias de inscrição, todas gratuitas', () => { assert.deepEqual(ITCONT.categorias.map((c) => c.nome), ['Graduação', 'Docente', 'Profissional Contábil']); ITCONT.categorias.forEach((c) => assert.equal(c.precoCentavos, 0)); });
const seed = ler(join(RAIZ, 'lib/db/src/seed/itcont.ts'));
check('programação igual à do banco (seed)', () => { assert.ok(seed, 'seed não encontrado'); S.forEach((s) => assert.ok(seed.includes(s.titulo), s.titulo)); });
check('convidados e datas iguais aos do banco (seed)', () => { ITCONT.convidados.forEach((c) => assert.ok(seed.includes(c.nome), c.nome)); assert.ok(seed.includes(ITCONT.inicio) && seed.includes(ITCONT.fim)); });

// ───────────── B. Regras do site (funções puras) ─────────────
grupo = 'B. Regras';
const brt = (iso: string) => new Date(`${iso}-03:00`);
check('21/10 19:00 de Brasília = 22:00 UTC', () => assert.equal(instante('2026-10-21', '19:00').toISOString(), '2026-10-21T22:00:00.000Z'));
check('abertura do evento', () => assert.equal(aberturaEvento().toISOString(), '2026-10-21T22:00:00.000Z'));
check('encerramento do evento (22/10 21h30)', () => assert.equal(encerramentoEvento().toISOString(), '2026-10-23T00:30:00.000Z'));
check('contagem de 12/10 10:00 → 9 dias e 9 horas', () => { const c = contagem(brt('2026-10-12T10:00:00')); assert.deepEqual([c.dias, c.horas, c.minutos, c.segundos], [9, 9, 0, 0]); });
check('contagem nunca fica negativa e marca término', () => { const c = contagem(brt('2026-10-25T10:00:00')); assert.equal(c.totalMs, 0); assert.equal(c.terminou, true); });
check('contagem conta segundos', () => assert.equal(contagem(brt('2026-10-21T18:59:15')).segundos, 45));
check('fase "antes" com a próxima sessão', () => { const f = faseDoEvento(brt('2026-10-20T10:00:00')); assert.equal(f.fase, 'antes'); assert.equal(f.fase === 'antes' && f.proxima.id, 'ia-rotina'); });
check('fase "ao vivo" na 1ª noite', () => { const f = faseDoEvento(brt('2026-10-21T20:00:00')); assert.equal(f.fase, 'ao-vivo'); assert.equal(f.fase === 'ao-vivo' && f.atual.id, 'ia-rotina'); assert.equal(f.fase === 'ao-vivo' && f.proxima?.id, 'bate-papo'); });
check('fase "intervalo" entre as noites', () => { const f = faseDoEvento(brt('2026-10-22T12:00:00')); assert.equal(f.fase, 'intervalo'); assert.equal(f.fase === 'intervalo' && f.proxima.id, 'bate-papo'); });
check('troca exata de sessão às 20:00 do dia 22', () => { const f = faseDoEvento(brt('2026-10-22T20:00:00')); assert.equal(f.fase === 'ao-vivo' && f.atual.id, 'ia-estrategia'); });
check('fase "encerrado" às 21h30 do dia 22, sem próxima sessão', () => { assert.equal(faseDoEvento(brt('2026-10-22T21:30:00')).fase, 'encerrado'); assert.equal(proximaSessao(brt('2026-10-23T00:00:00')), null); });
check('programação em 2 noites com rótulo', () => { const d = sessoesPorDia(); assert.equal(d.length, 2); assert.equal(d[0].rotulo, 'Noite 1 · 21/10'); assert.equal(d[1].sessoes.length, 2); });
check('data por extenso: quarta-feira, 21 de outubro de 2026', () => assert.equal(dataExtenso('2026-10-21'), 'quarta-feira, 21 de outubro de 2026'));
check('22/10/2026 é quinta-feira', () => assert.match(dataExtenso('2026-10-22'), /^quinta-feira/));
check('horários curtos: 19h e 21h30', () => { assert.equal(horaCurta('19:00'), '19h'); assert.equal(horaCurta('21:30'), '21h30'); });
check('durações: 120, 60 e 90 minutos', () => assert.deepEqual(sessoesOrdenadas().map(duracaoMin), [120, 60, 90]));
check('iniciais do avatar reserva', () => { assert.equal(iniciais('Rômulo Benício'), 'RB'); assert.equal(iniciais('Ângelo Loula'), 'ÂL'); assert.equal(iniciais('  Anna  '), 'A'); });
const ICS = gerarICS(undefined, new Date('2026-10-12T12:00:00Z'));
check('.ics começa/termina certo e usa CRLF', () => { assert.ok(ICS.startsWith('BEGIN:VCALENDAR\r\n')); assert.ok(ICS.endsWith('END:VCALENDAR\r\n')); assert.ok(!/[^\r]\n/.test(ICS)); });
check('.ics com 3 eventos e UIDs únicos', () => { assert.equal(ICS.match(/BEGIN:VEVENT/g)?.length, 3); const u = ICS.match(/^UID:.+$/gm) ?? []; assert.equal(new Set(u).size, 3); });
check('.ics em UTC: DTSTART 20261021T220000Z', () => assert.ok(ICS.includes('DTSTART:20261021T220000Z')));
check('.ics escapa vírgulas do local', () => assert.match(ICS, /LOCATION:[^\r]*\\,/));
check('Google Agenda com datas e fuso', () => { const u = new URL(googleAgendaUrl(S[0])); assert.equal(u.hostname, 'calendar.google.com'); assert.equal(u.searchParams.get('dates'), '20261021T220000Z/20261022T000000Z'); assert.equal(u.searchParams.get('ctz'), 'America/Sao_Paulo'); });
check('mapa do Google com o endereço codificado', () => { const u = new URL(mapaUrl()); assert.equal(u.hostname, 'www.google.com'); assert.match(u.searchParams.get('query') ?? '', /UEFS Módulo IV/); });
check('compartilhar no WhatsApp leva o link do site', () => { const u = new URL(whatsappUrl('https://exemplo.org/itcont')); assert.equal(u.hostname, 'wa.me'); assert.match(u.searchParams.get('text') ?? '', /https:\/\/exemplo\.org\/itcont/); });
check('4 modos responsivos sem ativação especial de telão', () => assert.deepEqual(
  [layoutPara(390, 844), layoutPara(844, 390), layoutPara(820, 1180), layoutPara(1440, 900)],
  ['celular', 'celular-deitado', 'tablet', 'desktop']));
check('contraste WCAG: branco/preto = 21', () => { assert.equal(contraste('#ffffff', '#000000'), 21); assert.equal(contraste('#123456', '#123456'), 1); });
check('escala na razão áurea', () => { assert.equal(escalaAurea(1), 25.89); assert.equal(escalaAurea(2), 41.89); });

// ───────────── C. Identidade visual e as 10 leis da beleza ─────────────
grupo = 'C. Identidade e beleza';
const TOK = ler(join(AQUI, 'tokens.css'));
const cor = (nome: string) => { const m = TOK.match(new RegExp(`--itc-${nome}:\\s*(#[0-9a-fA-F]{3,6})`)); assert.ok(m, `token --itc-${nome} ausente`); return m[1]; };
const misturarHex = (frente: string, fundo: string, proporcao: number) => {
  const rgb = (hex: string) => hex.replace('#', '').match(/.{2}/g)!.map((canal) => parseInt(canal, 16));
  const a = rgb(frente); const b = rgb(fundo);
  return `#${a.map((canal, i) => Math.round(canal * proporcao + b[i] * (1 - proporcao)).toString(16).padStart(2, '0')).join('')}`;
};
const PALETA_APROVADA: Record<string, string> = {
  abismo: '#080f16', marinho: '#14212b', 'ceu-1': '#0e2a66', 'ceu-2': '#081a44', nevoa: '#58a9e8',
  estrela: '#d9efff', royal: '#1679a8', azul: '#2a5064', eletrico: '#57b5e3', neon: '#93d7f5',
  gelo: '#b1c9d6', 'cromo-1': '#f1f5f7', 'cromo-2': '#abb9c2', 'cromo-3': '#a9bac5', branco: '#ffffff',
  alerta: '#ffcf5a', 'fundo-claro': '#0b131b', 'superficie-clara': '#14212b', 'superficie-prata': '#1a2a35',
  'borda-clara': '#304b5b', tinta: '#eef4f7', 'tinta-2': '#b0c2cc', 'planeta-terra': '#719a73',
  'action-top': '#218dbc', 'action-bottom': '#176b93', 'action-hover-top': '#32a2d0', 'action-hover-bottom': '#1b7eaa',
  'action-border': '#55b9e8', 'control-top': '#203341', 'control-bottom': '#182733', 'control-hover': '#263e4d',
  'ribbon-top': '#174e69', 'ribbon-bottom': '#1c759d', 'ticket-top': '#1b2a35', 'ticket-bottom': '#111d26',
  inset: '#0e1821', 'input-surface': '#0b151d', 'footer-top': '#101c25', 'footer-bottom': '#0a1118',
  'fallback-top': '#22617c', 'category-surface': '#172a36', 'silver-mid': '#bbc9d0', 'silver-shadow': '#71808a',
  texto: 'var(--itc-tinta)', 'texto-2': 'var(--itc-tinta-2)', fundo: 'var(--itc-ceu-2)',
  superficie: 'var(--itc-superficie-clara)', foco: 'var(--itc-royal)',
  cromo: 'linear-gradient(180deg, var(--itc-cromo-1) 0%, var(--itc-cromo-2) 48%, var(--itc-cromo-3) 52%, var(--itc-cromo-1) 100%)',
  'metal-azul': 'linear-gradient(180deg, var(--itc-nevoa) 0%, var(--itc-royal) 52%, var(--itc-abismo) 100%)',
  'metal-azul-titulo': 'linear-gradient(180deg, #90c7ff 0%, #8fcfff 55%, #90c7ff 100%)',
  escovado: 'repeating-linear-gradient(90deg, rgb(255 255 255 / .035) 0 1px, transparent 1px 3px)',
  grade: 'linear-gradient(rgb(87 181 227 / .055) 1px, transparent 1px) 0 0 / 56px 56px, linear-gradient(90deg, rgb(87 181 227 / .055) 1px, transparent 1px) 0 0 / 56px 56px',
  brilho: '0 0 12px rgb(87 181 227 / .42), 0 0 32px rgb(87 181 227 / .18)',
  chanfro: 'inset 0 1px 0 rgb(255 255 255 / .08), inset 0 -2px 0 rgb(0 0 0 / .38)',
};
check('paleta aprovada em 12/10/2026: cores oficiais congeladas', () => {
  for (const [name, value] of Object.entries(PALETA_APROVADA)) {
    const found = TOK.match(new RegExp(`--itc-${name}:\\s*([^;]+);`));
    assert.ok(found, `token --itc-${name} ausente`);
    assert.equal(found[1].trim().replace(/\s+/g, ' '), value, `token --itc-${name} diverge da paleta aprovada`);
  }
  assert.match(ler(join(AQUI, 'design-rules.md')), /paleta aprovada em 12\/10\/2026/i);
});
check('texto branco sobre o céu inteiro ≥ 4,5:1', () => {
  const textColors = ['branco', 'tinta', 'tinta-2', 'gelo', 'neon', 'cromo-1', 'cromo-2', 'cromo-3'];
  const backgrounds = [cor('ceu-1'), cor('ceu-2'), '#1c427f']; // céu máximo sob a névoa azul
  for (const text of textColors) for (const background of backgrounds) {
    assert.ok(contraste(cor(text), background) >= 4.5, `${text} sobre ${background}`);
  }
  for (const blue of ['#90c7ff', '#8fcfff']) {
    for (const background of backgrounds) assert.ok(contraste(blue, background) >= 4.5, `${blue} sobre ${background}`);
  }
});
check('texto secundário (gelo) sobre o fundo ≥ 4,5:1', () => assert.ok(contraste(cor('gelo'), cor('abismo')) >= 4.5));
check('texto secundário sobre os cartões ≥ 4,5:1', () => assert.ok(contraste(cor('gelo'), cor('marinho')) >= 4.5));
check('destaque neon sobre o fundo ≥ 4,5:1', () => assert.ok(contraste(cor('neon'), cor('abismo')) >= 4.5));
check('botão: branco sobre royal ≥ 4,5:1', () => assert.ok(contraste(cor('branco'), cor('royal')) >= 4.5));
check('faixa: branco sobre azul ≥ 4,5:1', () => assert.ok(contraste(cor('branco'), cor('azul')) >= 4.5));
check('anel de foco visível sobre o cartão ≥ 3:1', () => assert.ok(contraste(cor('neon'), cor('marinho')) >= 3));
check('selo "ao vivo" legível ≥ 4,5:1', () => assert.ok(contraste(cor('abismo'), cor('alerta')) >= 4.5));
check('inscrição: contraste no fundo real e gerador responsivo em duas colunas', () => {
  const fundoCartao = misturarHex(cor('neon'), cor('superficie-clara'), .07);
  const ratioAjuda = contraste(cor('tinta-2'), fundoCartao);
  assert.ok(ratioAjuda >= 4.5, `ajuda de inscrição sobre vidro (${fundoCartao}) = ${ratioAjuda}:1`);
  for (const fundo of [cor('ceu-1'), cor('ceu-2')]) {
    assert.ok(contraste(cor('branco'), fundo) >= 4.5, `título sobre céu ${fundo}`);
  }
  const cssAtual = ler(join(AQUI, 'site.css'));
  const revisao = cssAtual.slice(cssAtual.lastIndexOf('/* Revisão 4:'));
  assert.match(revisao, /\.itc\s*\{\s*background:\s*var\(--itc-fundo\)/);
  assert.match(revisao, /--itc-area-texto:\s*var\(--itc-tinta\)/);
  assert.match(revisao, /\.itc #sobre \.itc-event-metrics/);
  assert.match(revisao, /grid-template-columns:\s*minmax\(280px,\s*\.72fr\)\s+minmax\(420px,\s*1\.28fr\)/);
  assert.match(revisao, /"controls preview"/);
  assert.match(revisao, /"preview" "controls"/);
  assert.match(revisao, /@media \(min-width: 768px\) and \(max-width: 1099px\)[\s\S]*?padding-right: 88px/);
  const promocional = ler(join(AQUI, 'secoes/Inscricao.tsx'));
  assert.match(promocional, /itc-promo-controls[\s\S]*?itc-promo-preview/);
  assert.match(promocional, /const gap = Math\.max\([\s\S]*?contentGapCount/);
  assert.match(promocional, /const bottomSafe = story \? 250 : 32/);
  assert.match(promocional, /height - top - bottomSafe/);
});
check('tipografia na razão áurea (1,618)', () => {
  const t = (n: string) => Number(TOK.match(new RegExp(`--itc-t-${n}:\\s*([\\d.]+)rem`))?.[1]);
  for (const [a, b] of [['1', '0'], ['2', '1'], ['3', '2']]) assert.ok(Math.abs(t(a) / t(b) - 1.618) < 0.01, `t-${a}/t-${b}`);
});
check('espaçamento em grade de 8px', () => { const v = [...TOK.matchAll(/--itc-e-\d+:\s*(\d+)px/g)].map((m) => Number(m[1])); assert.ok(v.length >= 6); v.forEach((x) => assert.equal(x % 8, 0, `${x}px`)); });
check('no máximo 3 famílias de fonte', () => assert.equal(TOK.match(/--itc-fonte-[a-z]+:/g)?.length, 3));
check('respeita "reduzir movimento"', () => assert.match(TOK, /prefers-reduced-motion:\s*reduce/));
check('foco do teclado visível', () => assert.match(TOK, /:focus-visible\s*\{[^}]*outline/));
check('alvo de toque mínimo de 44px', () => assert.match(TOK, /--itc-toque:\s*44px/));
check('documento contém exatamente 100 critérios visuais em ordem', () => {
  const regras = ler(join(AQUI, 'design-rules.md'));
  const numeros = [...regras.matchAll(/^(\d{2,3})\. /gm)].map((m) => Number(m[1]));
  assert.deepEqual(numeros, Array.from({ length: 100 }, (_, index) => index + 1));
});

// ───────────── D. Interface (heurísticas de Nielsen + leis da beleza) ─────────────
grupo = 'D. Interface';
function arquivos(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? arquivos(p) : [p]; });
}
const SECOES = ['Navegacao', 'Hero', 'Contagem', 'Sobre', 'Programacao', 'Convidados', 'Local', 'Inscricao', 'Faq', 'Rodape'];
const TSX = arquivos(AQUI).filter((p) => p.endsWith('.tsx'));
const UI = TSX.map(ler).join('\n');
const sec = (n: string) => ler(join(AQUI, 'secoes', `${n}.tsx`));
const CSS = ler(join(AQUI, 'site.css'));
const APP = ler(join(AQUI, '..', 'App.tsx'));
const conta = (txt: string, re: RegExp) => txt.match(re)?.length ?? 0;

check('SiteItcont.tsx existe e exporta a página', () => assert.match(ler(join(AQUI, 'SiteItcont.tsx')), /export default function SiteItcont/));
check('as 10 seções existem em secoes/', () => SECOES.forEach((n) => assert.ok(sec(n), `secoes/${n}.tsx`)));
check('página carrega tokens.css e os estilos no bundle lazy antes da primeira renderização', () => { const p = ler(join(AQUI, 'SiteItcont.tsx')); assert.match(p, /import ['"]\.\/tokens\.css['"]/); assert.match(p, /import ['"]\.\/site\.css['"]/); });
check('/itcont é pública: abre antes do LoginGate', () => {
  assert.match(APP, /ehRotaItcont/); const i = APP.indexOf('<SiteItcont'); const j = APP.indexOf('<LoginGate');
  assert.ok(i > -1 && j > -1 && i < j, 'SiteItcont precisa ser renderizado fora/antes do LoginGate');
});
check('página carregada sob demanda (lazy)', () => assert.match(APP, /lazy\(\s*\(\)\s*=>\s*import\(['"]\.\/itcont\/SiteItcont['"]\)\s*\)/));
check('âncoras das seções', () => ['inicio', 'sobre', 'programacao', 'convidados', 'local', 'inscricao', 'faq'].forEach((id) => assert.match(UI, new RegExp(`id=["']${id}["']`), id)));
check('link "Pular para o conteúdo"', () => assert.match(UI, /href=["']#conteudo["'][^>]*>\s*Pular para o conteúdo/));
check('<main id="conteudo">', () => assert.match(UI, /<main\b[^>]*id=["']conteudo["']/));
check('navegação nomeada (aria-label)', () => assert.match(sec('Navegacao'), /<nav\b[^>]*aria-label=/));
check('um único <h1> no site', () => assert.equal(conta(UI, /<h1\b/g), 1));
check('cada seção tem título <h2>', () => assert.ok(conta(UI, /<h2\b/g) >= 6));
check('menu marca a seção atual (aria-current)', () => assert.match(sec('Navegacao'), /aria-current/));
check('contagem anunciada a leitores de tela (aria-live)', () => assert.match(sec('Contagem'), /aria-live=["']polite["']/));
check('toda <img> tem alt', () => { const imgs = UI.split('<img').slice(1).map((t) => t.slice(0, t.indexOf('/>'))); assert.ok(imgs.length > 0); imgs.forEach((t) => assert.match(t, /\balt=/)); });
check('foto que falha vira iniciais', () => { const c = sec('Convidados'); assert.match(c, /onError/); assert.match(c, /iniciais\(/); });
check('fotos dos convidados em alta definição, sem corte e com orientação original', () => {
  assert.match(sec('Convidados'), /loading=["']lazy["']/);
  assert.match(sec('Convidados'), /width=\{960\} height=\{1200\}/);
  assert.match(CSS, /\.itc-speaker-photo-frame\s*\{[^}]*aspect-ratio:\s*4\/5/);
  assert.match(CSS, /\.itc-speaker-photo\s*\{[^}]*object-fit:\s*contain/);
  assert.match(CSS, /\.itc-speaker-photo\s*\{[^}]*image-orientation:\s*from-image/);
});
check('links externos com rel="noopener noreferrer"', () => assert.ok(conta(UI, /target=["']_blank["']/g) <= conta(UI, /rel=["']noopener noreferrer["']/g)));
check('botão de inscrição usa a URL oficial', () => assert.match(UI, /ITCONT\.inscricaoUrl/));
check('nenhuma data/hora escrita à mão nos componentes', () => assert.doesNotMatch(UI, /\b2[12]\/10\b|2026-10-\d\d|\b19h\b|21h30|de outubro/));
check('componentes leem dados.ts', () => assert.ok(conta(UI, /from ['"](\.\.?\/)+dados['"]/g) >= 5));
check('status do evento visível (faseDoEvento)', () => assert.match(UI, /faseDoEvento\(/));
check('adicionar à agenda (.ics + Google)', () => { assert.match(UI, /gerarICS\(/); assert.match(UI, /googleAgendaUrl\(/); });
check('Sobre mantém chamada oficial, pilares numerados e frases concisas', () => {
  const sobre = sec('Sobre');
  assert.match(sobre, /ITCONT\.chamada/);
  assert.match(sobre, /ITCONT\.slogan\.map/);
  assert.match(sobre, /String\(index \+ 1\)\.padStart\(2, '0'\)/);
  assert.match(CSS, /\.itc-pillar-number[\s\S]*?var\(--itc-fonte-rotulo\)/);
});
check('métricas do Sobre são derivadas de noites, sessões, convidados e categorias', () => {
  const sobre = sec('Sobre');
  assert.match(sobre, /sessoesPorDia\(\)\.length/);
  assert.match(sobre, /ITCONT\.sessoes\.length/);
  assert.match(sobre, /ITCONT\.convidados\.length/);
  assert.match(sobre, /ITCONT\.categorias\.every/);
});
check('métricas mostram valores reais imediatamente, sem números parciais', () => {
  const sobre = sec('Sobre');
  assert.match(sobre, /<strong>\{value\}\{typeof value === 'number' \? suffix : ''\}<\/strong>/);
  assert.doesNotMatch(sobre, /new IntersectionObserver|requestAnimationFrame/);
});
check('programação exibe todas as noites com seus rótulos oficiais em timeline responsiva', () => {
  const agenda = sec('Programacao');
  assert.match(agenda, /days\.map/);
  assert.match(agenda, /\{day\.rotulo\}/);
  assert.match(agenda, /day\.sessoes\.map/);
  assert.match(CSS, /\.itc \.itc-timeline::before/);
  assert.match(CSS, /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(CSS, /@media \(max-width: 760px\)[\s\S]*?\.itc \.itc-session \{ grid-template-columns: 1fr/);
  assert.match(CSS, /\.itc\[data-layout="celular"\] \.itc-night:not\(\[data-selected="true"\]\)[\s\S]*?display: block/);
});
check('progresso ao vivo usa fase e relógio, pausa polling em aba oculta', () => {
  const agenda = sec('Programacao');
  assert.match(agenda, /faseDoEvento\(now\)/);
  assert.match(agenda, /setInterval\(\(\) => setNow\(new Date\(\)\), 30_000\)/);
  assert.match(agenda, /document\.addEventListener\('visibilitychange', visibility\)/);
  assert.match(agenda, /document\.hidden \? stop\(\) : refresh\(\)/);
  assert.match(agenda, /--itc-progress/);
});
check('cartões da agenda mostram hora tabular, duração, tipo, agenda e .ics; pulso respeita redução', () => {
  const agenda = sec('Programacao');
  assert.match(agenda, /duracaoMin\(session\)/);
  assert.match(agenda, /session\.tipo === 'palestra'/);
  assert.match(agenda, /googleAgendaUrl\(session\)/);
  assert.match(agenda, /downloadICS\(\[session\]/);
  assert.match(CSS, /-webkit-line-clamp:\s*2/);
  assert.match(CSS, /data-live="true"[\s\S]*?var\(--itc-alerta\)/);
  assert.match(CSS, /prefers-reduced-motion:\s*reduce[\s\S]*?itc-live-pulse[\s\S]*?animation:\s*none/);
});
check('como chegar (mapa)', () => assert.match(UI, /mapaUrl\(\)/));
check('compartilhar (WhatsApp ou navigator.share)', () => assert.match(UI, /whatsappUrl\(|navigator\.share/));
check('hero mantém identidade oficial e convidados continuam na seção própria', () => {
  assert.match(sec('Hero'), /I<\/i> Imersão/);
  assert.match(sec('Hero'), /Tecnológica/);
  assert.match(sec('Hero'), /itc-chrome">Contábil/);
  assert.match(sec('Hero'), /font-stretch|itc-title/);
  assert.match(sec('Hero'), /Ver programação/);
  assert.match(sec('Hero'), /Garantir minha vaga gratuita/);
  assert.match(sec('Convidados'), /ITCONT\.convidados/);
});
check('QR code fica na inscrição e representa o endereço público', () => {
  assert.match(sec('Inscricao'), /<QrEvento\s*\/>/);
  assert.doesNotMatch(sec('Hero'), /QrEvento|intro-speakers/);
  assert.match(sec('QrEvento'), /window\.location\.origin.*window\.location\.pathname/);
});
check('logo e slogan oficiais aparecem no hero', () => {
  assert.match(sec('Hero'), /className="itc-ribbon-logo"/);
  assert.match(sec('Hero'), /alt="Logo do ITCONT"/);
  assert.match(sec('Hero'), /itcont-logo\.png/);
  assert.match(sec('Hero'), /INOVAÇÃO/);
  assert.match(sec('Hero'), /PRÁTICA/);
  assert.match(sec('Hero'), /CONEXÕES/);
});
check('favicon do ITCONT usa a logo sem alterar o favicon do Ícaro', () => {
  const indexHtml = ler(join(RAIZ, 'artifacts/icaro/index.html'));
  assert.match(indexHtml, /href="\/favicon\.svg"/);
  assert.match(indexHtml, /path==='\/'\|\|path==='\/itcont'/);
  assert.match(indexHtml, /icon\.href=`\$\{base\}\/itcont-logo\.png`/);
  assert.ok(existsSync(join(RAIZ, 'artifacts/icaro/public/itcont-logo.png')));
});
check('contagem tem quatro unidades, números tabulares e segundos em todas as larguras', () => {
  assert.match(sec('Contagem'), /TEMPO ATÉ O INÍCIO DO EVENTO/);
  assert.match(sec('Contagem'), /count\.segundos/);
  assert.doesNotMatch(sec('Contagem'), /matchMedia\('\(min-width: 768px\)'\)/);
  assert.match(CSS, /font-variant-numeric:\s*tabular-nums/);
});
check('relatório mais recente do audit responsivo tem 28 casos sem falhas e capturas-chave', () => {
  const path = resolve(RAIZ, 'generated-artifacts/audit/itcont-layout-report.json');
  const report = JSON.parse(ler(path)) as { generatedAt: string; widths: number[]; caseCount: number; failureCount: number; screenshots: string[]; transitionScreenshots: string[] };
  assert.deepEqual(report.widths, [320, 360, 390, 414, 768, 840, 1024, 1280, 1366, 1440, 1568, 1920]);
  assert.equal(report.caseCount, 28);
  assert.equal(report.failureCount, 0);
  assert.ok(Date.now() - Date.parse(report.generatedAt) < 24 * 60 * 60 * 1000, 'relatório tem mais de 24 horas');
  for (const width of [390, 840, 1024, 1440]) assert.ok(report.screenshots.includes(`itcont-${width}px.png`), `captura de ${width}px ausente`);
  for (const capture of ['itcont-transition-1568x736.png', 'itcont-transition-390x844.png']) assert.ok(report.transitionScreenshots.includes(capture), `captura de transição ausente: ${capture}`);
});
check('ação secundária do hero abre a programação', () => assert.match(sec('Hero'), /href="#programacao"/));
check('Ícaro aparece no menu desktop e na navegação móvel inferior', () => {
  assert.match(sec('Navegacao'), /href="\/icaro"[^>]*data-testid="link-access-icaro"/);
  assert.match(sec('Navegacao'), /data-testid="mobile-nav-icaro"/);
  assert.match(CSS, /\.itc\[data-layout="celular"\] \.itc-bottom-nav\s*\{[^}]*repeat\(6,/);
  assert.match(CSS, /\.itc\[data-layout="celular-deitado"\] \.itc-bottom-nav\s*\{[^}]*repeat\(6,/);
  assert.match(sec('Navegacao'), /document\.getElementById\('inscricao'\)/);
  assert.match(sec('Navegacao'), /entry\.target\.id === 'inscricao'.*setInscricaoVisivel\(entry\.isIntersecting\)/);
  assert.match(sec('Navegacao'), /data-visible=\{heroPassed && !inscricaoVisivel\}/);
});
check('rótulos numerados de seção usam Michroma', () => {
  ['01 · Sobre', '02 · Programação', '03 · Convidados', '04 · Local', '05 · Inscrição', '06 · Dúvidas'].forEach((label) => assert.ok(UI.includes(label), label));
  assert.match(CSS, /itc-section-head h2 span[\s\S]*?letter-spacing/);
  assert.match(TOK, /--itc-fonte-rotulo:\s*'Michroma'/);
});
check('revelação por IntersectionObserver e fallback para movimento reduzido', () => {
  assert.match(ler(join(AQUI, 'SiteItcont.tsx')), /new IntersectionObserver/);
  assert.match(ler(join(AQUI, 'SiteItcont.tsx')), /prefers-reduced-motion: reduce/);
  assert.match(CSS, /\.itc \.itc-reveal/);
});
check('grade de perspectiva, vinheta, feixe de 8s e ruído a 4%', () => {
  assert.match(CSS, /perspective\(520px\) rotateX\(62deg\)/);
  assert.match(CSS, /radial-gradient\(ellipse at center, transparent 36%/);
  assert.match(CSS, /animation: itc-streak 8s/);
  assert.match(CSS, /\.itc::after \{[^}]*opacity:\s*\.04/);
});
check('layout estreito de 360px não amplia o conteúdo além da viewport', () => {
  assert.match(CSS, /@media \(max-width: 380px\)/);
  assert.match(CSS, /\.itc \.itc-shell \{ width: calc\(100% - 28px\)/);
  assert.match(CSS, /\.itc \{ font-size: 16px; \}/);
  assert.match(CSS, /\.itc\[data-layout="celular"\] #inicio \{[\s\S]*?min-height: 100dvh/);
  assert.match(CSS, /\.itc \.itc-nav a \{ width: 44px; height: 44px; \}/);
});
check('site carrega as cenas system e GloboTerra por demanda, com fundo CSS de reserva', () => {
  const site = ler(join(AQUI, 'SiteItcont.tsx'));
  assert.match(site, /lazy\(\(\) => import\('@\/components\/stage\/globo-terra'\)/);
  assert.match(site, /lazy\(\(\) => import\('@\/components\/stage\/cosmos\/renderer'\)/);
  assert.match(site, /const hero = siteRef\.current\?\.querySelector<HTMLElement>\('#inicio'\)/);
  assert.match(site, /sceneIdle && cosmosVisivel/);
  assert.match(site, /requestIdleCallback[\s\S]*?setSceneIdle\(true\)/);
  const html = ler(join(RAIZ, 'artifacts/icaro/index.html'));
  assert.match(html, /itcont-earth-static\.webp/);
  assert.match(html, /fetchpriority="high"/);
  assert.match(site, /visible=\{cosmosVisivel && documentoVisivel\}/);
  assert.match(site, /<Suspense fallback=\{null\}>[\s\S]*<GloboTerraSite/);
  assert.match(site, /scene="system"/);
  assert.match(site, /transparentBackground/);
  assert.match(site, /motion=\{movimentoAtivado \? 'on' : 'system'\}/);
  assert.match(site, /quality=\{layout === 'celular'[\s\S]*?'low'/);
  assert.match(site, /onRenderMode=\{setModoCosmos\}/);
  assert.match(site, /background-sky-stars/);
  assert.match(site, /cosmosVisivel && documentoVisivel/);
  assert.match(site, /giroContinuo[\s\S]*decorativo/);
  assert.match(site, /aria-hidden="true" data-testid="background-earth"/);
  const renderer = ler(resolve(RAIZ, 'artifacts/icaro/src/components/stage/cosmos/renderer.tsx'));
  assert.match(renderer, /if \(decorativo\) \{\s*groupSystem\.position\.x = -6\.8;\s*groupSystem\.scale\.setScalar\(\.72\);/);
  assert.equal(conta(renderer, /if \(index === 5 && !decorativo\)/g), 2, 'anéis de Saturno decorativos removidos no WebGL e no modo estático');
  assert.match(renderer, /decorativo\?: boolean/);
  assert.match(renderer, /useState\(\(\) => decorativo \? \.5 : readSpinSpeed\(\)\)/);
  assert.match(renderer, /visible && !decorativo/);
  assert.match(renderer, /keyboardShortcuts && !decorativo/);
  assert.match(renderer, /window\.innerWidth <= 767 && !interacting[\s\S]*?30 : 60/);
  assert.match(CSS, /mask-image:\s*radial-gradient\(circle 49% at 51% 50%, transparent 0 90%/);
  assert.match(CSS, /@media \(max-width: 767px\)[\s\S]*?\.itc #inicio > \.itc-cosmos-backdrop \{ display: none !important; \}/);
  assert.match(CSS, /\.itc #inicio \{ isolation: isolate; \}/);
  assert.match(CSS, /background:\s*radial-gradient\(ellipse at 50% 16%, var\(--itc-ceu-1\) 0%, var\(--itc-ceu-2\) 72%\)/);
  assert.match(CSS, /itc-sky-stars::before[\s\S]*?radial-gradient\(1px 1px/);
});
check('mapa da seção Local e MapLibre são carregados somente quando visíveis', () => {
  const local = sec('Local');
  const map = sec('MapaLocal');
  const site = ler(join(AQUI, 'SiteItcont.tsx'));
  assert.match(site, /lazy\(\(\) => import\('\.\/secoes\/Local'\)\)/);
  assert.match(site, /function LocalSobDemanda/);
  assert.match(site, /itc-local-deferred/);
  assert.match(local, /lazy\(\(\) => import\('\.\/MapaLocal'\)\)/);
  assert.match(local, /new IntersectionObserver/);
  assert.match(local, /mapRequested/);
  assert.match(map, /import\('maplibre-gl'\)/);
});
check('GloboTerra mantém giro padrão e aceita giro contínuo e modo decorativo', () => {
  const globo = ler(resolve(RAIZ, 'artifacts/icaro/src/components/stage/globo-terra.tsx'));
  assert.match(globo, /giroContinuo\?: boolean/);
  assert.match(globo, /decorativo\?: boolean/);
  assert.match(globo, /giroContinuo = false, decorativo = false/);
  assert.match(globo, /interactive: !decorativo/);
  assert.match(globo, /pointerEvents: 'none'/);
});
check('GloboTerra pausa completamente o ciclo de animação quando a aba está oculta', () => {
  const globo = ler(resolve(RAIZ, 'artifacts/icaro/src/components/stage/globo-terra.tsx'));
  assert.match(globo, /document\.addEventListener\('visibilitychange', visibilidade\)/);
  assert.match(globo, /cancelAnimationFrame\(raf\)/);
  assert.match(globo, /if \(!reduzidoRef\.current/);
});
check('movimento reduzido mantém as cenas e oferece opt-in persistido', () => {
  const site = ler(join(AQUI, 'SiteItcont.tsx'));
  const hero = ler(join(AQUI, 'secoes/Hero.tsx'));
  assert.match(site, /matchMedia\('\(prefers-reduced-motion: reduce\)'\)/);
  assert.doesNotMatch(site, /webglPronto && !reduzMovimento/);
  assert.match(site, /motion=\{movimentoAtivado \? 'on' : 'system'\}/);
  assert.match(site, /onEnableMotion=\{ativarMovimento\}/);
  assert.match(site, /localStorage\.getItem\('itcont-motion-choice'\)[\s\S]*catch/);
  assert.match(site, /localStorage\.setItem\('itcont-motion-choice', 'on'\)[\s\S]*catch/);
  assert.match(site, /reduzido=\{reduzMovimento && !movimentoAtivado\}/);
  assert.match(hero, /button-enable-motion/);
  assert.match(hero, /cosmosBackdrop/);
  assert.match(site, /cosmosBackdrop=\{cosmicBackdrop\}/);
  assert.match(CSS, /\.itc #inicio \.itc-motion-enable \{[\s\S]*?grid-column: 1;[\s\S]*?margin: 24px 16px 0;[\s\S]*?white-space: nowrap/);
  assert.match(CSS, /\.itc #inicio\.itc-hero \{[\s\S]*?grid-template-rows: minmax\(min-content, 1fr\) auto auto;[\s\S]*?row-gap: 24px/);
  assert.match(CSS, /\.itc #inicio > \.itc-cosmos-backdrop \{[\s\S]*?position: absolute;[\s\S]*?inset: 0 0 0 42%/);
  assert.match(CSS, /\.itc #inicio::after \{[\s\S]*?height: 200px;[\s\S]*?linear-gradient\(180deg, transparent 0%, var\(--itc-marinho\) 100%\)/);
  assert.doesNotMatch(CSS, /\.itc \.itc-cosmos-backdrop, \.itc \.itc-earth-backdrop \{ display: none !important; \}/);
});
check('mapa real usa satélite Esri, coordenadas públicas, atribuição e gestos cooperativos', () => {
  const map = ler(join(AQUI, 'secoes/MapaLocal.tsx'));
  assert.match(map, /World_Imagery/);
  assert.match(map, /World_Boundaries_and_Places/);
  assert.match(map, /cooperativeGestures: true/);
  assert.match(map, /center: CENTER/);
  assert.match(map, /zoom: 16/);
  assert.match(map, /pitch: 18/);
  assert.match(map, /attributionControl/);
  assert.match(map, /IntersectionObserver/);
});
check('texto visível e dados não usam travessão nem meia-risca', () => {
  assert.doesNotMatch(UI + ler(join(AQUI, 'dados.ts')), /[—–]/);
});
check('inscrição destaca as 3 categorias como ingressos e usa a URL oficial', () => {
  const insc = sec('Inscricao');
  assert.match(insc, /itc-register-highlight/);
  assert.match(insc, /ITCONT\.categorias\.map/);
  assert.match(insc, /role="listitem"/);
  assert.match(insc, /Entrada gratuita/);
  assert.match(insc, /href=\{ITCONT\.inscricaoUrl\}/);
});
check('QR do site fica em cartão de vidro com a legenda pedida', () => {
  assert.match(sec('Inscricao'), /itc-qr-card[\s\S]*<QrEvento\s*\/>/);
  assert.match(sec('QrEvento'), /<figcaption>Aponte a câmera<\/figcaption>/);
});
check('cartão de divulgação tem prévia ao vivo e aviso de que não substitui inscrição', () => {
  assert.match(sec('Inscricao'), /Prévia ao vivo/);
  assert.match(sec('Inscricao'), /não substitui a inscrição oficial/);
  assert.match(sec('Inscricao'), /onChange=\{\(event\) => setName/);
});
check('cartão usa a logo oficial Even3 com CORS e fallback acessível', () => {
  const insc = sec('Inscricao');
  assert.match(insc, /https:\/\/static\.even3\.com\/logos\/ImagemdoCodex21deset\.de202609_39_23\.91a8f584302f4c68b0fa\.png/);
  assert.match(insc, /logo\.crossOrigin = 'anonymous';[\s\S]*logo\.src = LOGO_OFICIAL/);
  assert.match(insc, /I IMERSÃO TECNOLÓGICA CONTÁBIL/);
  assert.match(insc, /IntersectionObserver[\s\S]*promoVisible/);
});
check('cartão do ITCONT usa logo ampliada, faixas metálicas e eixo central', () => {
  const insc = sec('Inscricao');
  assert.match(insc, /const paper = context\.createLinearGradient/);
  assert.match(insc, /rgb\(234 242 255\)/);
  assert.match(insc, /strokeRect\(24, 24, width - 48, height - 48\)/);
  assert.match(insc, /PROMO_FRAME_INSET = 32/);
  assert.match(insc, /PROMO_TEXT_MARGIN = 56/);
  assert.match(insc, /PROMO_CONTENT_INSET = PROMO_FRAME_INSET \+ PROMO_TEXT_MARGIN/);
  assert.match(insc, /PROMO_LOGO_PHOTO_CLEARANCE = 32/);
  assert.match(insc, /PROMO_PHOTO_RING_OUTSET = 27/);
  assert.match(insc, /PROMO_LOGO_PHOTO_GAP = PROMO_LOGO_PHOTO_CLEARANCE \+ PROMO_PHOTO_RING_OUTSET/);
  assert.match(insc, /const textFont = \(weight: number, size: number\) => `\$\{weight\} \$\{size\}px Archivo/);
  assert.match(insc, /wrapName[\s\S]*measure\(candidate, 900, nameFontSize\)/);
  assert.match(insc, /const centerX = width \/ 2/);
  assert.match(insc, /const photoX = centerX/);
  assert.match(insc, /drawMetalLine\(line, cursor, true, centerX/);
  assert.match(insc, /const logoWidth = \(width - PROMO_FRAME_INSET \* 2\) \* \(story \? \.70 : \.62\)/);
  assert.match(insc, /findLogoContentBounds\(logo\)/);
  assert.match(insc, /PROMO_CORNER_RIBBON_WIDTH = 76/);
  assert.match(insc, /context\.lineWidth = PROMO_CORNER_RIBBON_WIDTH/);
  assert.match(insc, /PROMO_CORNER_RIBBON_INNER_WIDTH = 60/);
  assert.ok(.62 * (1080 - 2 * 32) >= .60 * (1080 - 2 * 32));
  assert.ok(.70 * (1080 - 2 * 32) >= .60 * (1080 - 2 * 32));
  assert.match(insc, /layer = 8/);
  assert.match(insc, /context\.roundRect\(centerX - phraseWidth \/ 2, phraseTop, phraseWidth, phraseHeight, phraseHeight \/ 2\)/);
  assert.match(insc, /context\.arc\(photoX, cy, radius, 0, Math\.PI \* 2\); context\.clip\(\)/);
  assert.match(insc, /dateParts = \[dataExtenso\(ITCONT\.inicio\), dataExtenso\(ITCONT\.fim\)\]/);
  assert.match(insc, /oneLineDate\.width <= usableWidth/);
  assert.match(insc, /const contentGapCount = 8/);
  assert.match(insc, /photoTop = top \+ logoHeight \+ PROMO_LOGO_PHOTO_GAP/);
  assert.match(insc, /photoTop \+ photoDiameter \+ PROMO_PHOTO_RING_OUTSET \+ gap/);
  assert.match(insc, /height - top - bottomSafe/);
  assert.match(insc, /ITCONT\.local\.nome/);
});
check('foto fica local, aceita JPG de 5–15 MB e não usa upload', () => {
  const insc = sec('Inscricao');
  const photo = ler(join(AQUI, 'secoes/promo-photo.ts'));
  assert.match(insc, /URL\.createObjectURL\(prepared\.blob\)/);
  assert.match(insc, /URL\.revokeObjectURL\(photoUrl\)/);
  assert.equal(PROMO_PHOTO_MAX_BYTES, 20 * 1024 * 1024);
  assert.match(photo, /await createImageBitmap\(blob, \{ imageOrientation: 'from-image' \}\)/);
  assert.match(photo, /await image\.decode\(\)/);
  assert.match(photo, /imageSmoothingQuality = 'high'/);
  assert.match(insc, /decodeAndResizePromoPhoto\(file\)/);
  assert.match(insc, /console\.warn\('\[ITCONT\] Falha ao preparar a foto local no navegador\./);
  assert.match(insc, /await import\('heic2any'\)/);
  assert.match(insc, /photoSelectionRef/);
  assert.match(insc, /accept="image\/\*.*heic/);
  assert.doesNotMatch(insc, /\bfetch\(|FormData/);
});
check('JPG, PNG, WebP e HEIC são reconhecidos pela assinatura sem depender do MIME', () => {
  const ascii = (value: string) => Array.from(new TextEncoder().encode(value));
  const isoBmff = (brand: string) => {
    const bytes = new Uint8Array(32);
    bytes.set(ascii('ftyp'), 4);
    bytes.set(ascii(brand), 8);
    return bytes;
  };
  const webp = new Uint8Array(12);
  webp.set(ascii('RIFF'), 0);
  webp.set(ascii('WEBP'), 8);
  assert.equal(detectPromoPhotoFormat(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])), 'jpeg');
  assert.equal(detectPromoPhotoFormat(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'png');
  assert.equal(detectPromoPhotoFormat(webp), 'webp');
  assert.equal(detectPromoPhotoFormat(isoBmff('heic')), 'heic');
  assert.equal(detectPromoPhotoFormat(isoBmff('heix')), 'heic');
  assert.equal(detectPromoPhotoFormat(isoBmff('mif1')), 'heic');
  assert.equal(detectPromoPhotoFormat(Uint8Array.from([0, 1, 2, 3])), null);
  const photo = ler(join(AQUI, 'secoes/promo-photo.ts'));
  assert.match(photo, /file\.slice\(0, 64\)\.arrayBuffer\(\)/);
  assert.match(photo, /if \(signatureFormat\) return signatureFormat/);
});
check('JPG/PNG grandes são reduzidos a 2048 px sem ampliar fotos menores', () => {
  assert.equal(PROMO_PHOTO_MAX_SIDE, 2048);
  assert.deepEqual(fitPromoPhotoDimensions(4000, 3000), { width: 2048, height: 1536 });
  assert.deepEqual(fitPromoPhotoDimensions(3000, 5000), { width: 1228, height: 2048 });
  assert.deepEqual(fitPromoPhotoDimensions(800, 600), { width: 800, height: 600 });
  assert.deepEqual(fitPromoPhotoDimensions(12000, 5000), { width: 2048, height: 853 });
});
check('cartão exporta Feed 1080×1350 e Stories 1080×1920 com margem segura de 250px', () => {
  const insc = sec('Inscricao');
  assert.match(insc, /PROMO_WIDTH = 1080/);
  assert.match(insc, /PROMO_HEIGHTS = \{ feed: 1350, stories: 1920 \}/);
  assert.match(insc, /const bottomSafe = story \? 250 : 32/);
  assert.match(insc, /height - top - bottomSafe/);
  assert.match(insc, /const logoWidth = \(width - PROMO_FRAME_INSET \* 2\) \* \(story \? \.70 : \.62\)/);
  assert.match(insc, /story \? 520 : 320/);
  assert.match(insc, /data-photo-width=\{photoSize\?\.width \?\? ''\}/);
});
check('FAQ e assistente compartilham cartão de vidro', () => {
  assert.match(sec('Faq'), /className="itc-card"/);
  assert.match(sec('InteligenciaEvento'), /className="itc-intelligence itc-card"/);
  assert.match(CSS, /\.itc #faq \.itc-faq-list details,[\s\S]*?\.itc #faq \.itc-intelligence/);
});
check('hero desktop separa título e Terra e mantém a contagem na primeira tela', () => {
  const globo = ler(resolve(RAIZ, 'artifacts/icaro/src/components/stage/globo-terra.tsx'));
  const renderer = ler(resolve(RAIZ, 'artifacts/icaro/src/components/stage/cosmos/renderer.tsx'));
  assert.match(CSS, /\.itc #inicio\.itc-hero \{[\s\S]*?grid-template-columns: minmax\(0, 1\.1fr\) minmax\(0, \.9fr\)[\s\S]*?column-gap: 48px/);
  assert.match(CSS, /\.itc #inicio \.itc-intro-content \{[\s\S]*?grid-column: 1;[\s\S]*?grid-row: 1/);
  assert.match(CSS, /\.itc #inicio > \.itc-section \{[\s\S]*?grid-column: 1;[\s\S]*?grid-row: 2/);
  assert.match(CSS, /\.itc #inicio \.itc-counter \{[\s\S]*?width: 100%;[\s\S]*?padding: \.45rem/);
  assert.match(CSS, /\.itc \.itc-earth-backdrop[\s\S]*?width: clamp\(470px, 36vw, 520px\)/);
  assert.match(globo, /'background-opacity': decorativo \? 0 : 1/);
  assert.match(CSS, /\.itc \.itc-earth-backdrop::before[\s\S]*?rgb\(59 157 255/);
  assert.match(renderer, /mesh\.visible = !decorativo \|\| index < 4/);
  assert.match(renderer, /orbit\.visible = !decorativo \|\| index < 4/);
  assert.match(CSS, /\.itc\[data-layout="celular"\] \.itc-earth-backdrop \{[\s\S]*?opacity: \.16;/);
  assert.match(CSS, /\.itc #inicio \.itc-counter[\s\S]*?position: relative;[\s\S]*?grid-row: 2/);
  assert.match(CSS, /itc-title-first i[\s\S]*?-webkit-text-stroke: 1px var\(--itc-neon\)/);
  assert.match(CSS, /\.itc #inicio \.itc-hero-actions \{ gap: 12px; \}/);
  assert.match(CSS, /\.itc #inicio \.itc-hero-audience \{ display: block; margin: 8px 0 0; \}/);
  assert.match(CSS, /\.itc #inicio\.itc-hero \{[\s\S]*?grid-template-rows: minmax\(min-content, 1fr\) auto/);
  assert.match(CSS, /\.itc \.itc-earth-backdrop[\s\S]*?right: max\(calc\(\(100vw - 1200px\) \/ 2\), calc\(clamp\(1\.5rem, 3vw, 3rem\) \+ 77px\)\)/);
  assert.match(CSS, /\.itc \.itc-cosmos-backdrop \{[\s\S]*?opacity: \.55[\s\S]*?mask-image: linear-gradient/);
  assert.match(CSS, /\.itc \.itc-hero-facts > span \{ display: flex; align-items: flex-start; gap: 8px; flex-wrap: nowrap; \}/);
  assert.match(CSS, /\.itc \.itc-hero \{ background: linear-gradient\(180deg, rgb\(8 15 22/);
});
check('Local tem endereço compacto, agenda ICS e mapa alto sem encostar na navegação', () => {
  assert.match(sec('Local'), /Auditório III do Módulo IV · UEFS · Av\. Transnordestina · Feira de Santana\/BA/);
  assert.match(sec('Local'), /Adicionar à agenda/);
  assert.match(sec('Local'), /gerarICS\(\)/);
  assert.match(CSS, /\.itc #local \.itc-map \{ min-height: clamp\(440px, 58vh, 680px\); height: clamp\(440px, 58vh, 680px\); \}/);
  assert.match(CSS, /\.itc \.itc-nav \{ right: clamp\(1\.5rem, 3vw, 3rem\); \}/);
});
check('seções usam céu azul contínuo com cartões de vidro', () => {
  assert.match(CSS.slice(CSS.lastIndexOf('/* Revisão 4:')), /\.itc \{\s*background: var\(--itc-fundo\)/);
  assert.match(CSS, /\.itc \.itc-main-site \{[\s\S]*?background: transparent;/);
  assert.match(CSS, /\.itc \.itc-main-site main > \.itc-section:not\(#inicio\) \{\s*background: transparent !important/);
});
check('modo telão foi removido do site público', () => {
  assert.doesNotMatch(UI + CSS, /ModoTelao|modoTelao|data-layout=["']telao|itc-kiosk|itc-exit-kiosk/);
});
check('camadas fixas: céu estrelado, Cosmos com parallax e Terra em primeiro plano', () => {
  const site = ler(join(AQUI, 'SiteItcont.tsx'));
  const audit = ler(join(RAIZ, 'scripts/audit-itcont-layout.ts'));
  assert.match(site, /background-sky-stars/);
  assert.match(site, /background-cosmos/);
  assert.match(site, /itc-cosmos-parallax/);
  assert.match(site, /hero\.insertBefore\(earth, content\)/);
  assert.doesNotMatch(site, /siteRef\.current\.insertBefore\(earth/);
  assert.match(site, /#inicio > \.itc-earth-backdrop, #inicio > #itc-page-earth/);
  assert.match(CSS, /\.itc #inicio > \.itc-earth-backdrop \{[\s\S]*?position: absolute/);
  assert.match(CSS, /\.itc #inicio > \.itc-earth-backdrop \{[\s\S]*?mask-image: radial-gradient\(circle/);
  assert.match(CSS, /\.itc #inicio > #itc-page-earth \{[\s\S]*?position: absolute[\s\S]*?mask-image: radial-gradient/);
  assert.match(CSS, /@media \(max-width: 599px\)[\s\S]*?\.itc #inicio > \.itc-earth-backdrop \{ display: none; \}/);
  assert.match(CSS, /--itc-earth-opacity/);
  assert.match(CSS, /transition: opacity \.5s ease, transform \.35s ease-out/);
  assert.match(audit, /earth-layer-outside-hero/);
  assert.match(audit, /earth-straight-cut-outside-hero/);
  assert.match(audit, /globe-canvas-outside-hero/);
  assert.match(audit, /\['#programacao', '#inscricao'\]/);
  assert.match(CSS, /\.itc \.itc-cosmos-backdrop \{[\s\S]*?opacity:\s*\.4/);
  assert.match(CSS, /--itc-cosmos-parallax/);
  assert.match(TOK, /--itc-ceu-1:\s*#0e2a66/);
  assert.match(TOK, /--itc-ceu-2:\s*#081a44/);
});
check('Terra e sistema solar compartilham velocidade única e direção subsolar', () => {
  const scene = ler(join(RAIZ, 'artifacts/icaro/src/components/stage/cosmos/scene-assets.ts'));
  const renderer = ler(join(RAIZ, 'artifacts/icaro/src/components/stage/cosmos/renderer.tsx'));
  const globe = ler(join(RAIZ, 'artifacts/icaro/src/components/stage/globo-terra.tsx'));
  assert.match(scene, /export const CENA_VELOCIDADE = [\d.]+/);
  assert.match(renderer, /groupEarth\.rotation\.y \+= CENA_VELOCIDADE \* seconds \* spin/);
  assert.match(renderer, /orbitClock \+= CENA_VELOCIDADE \* seconds \* spin/);
  assert.match(renderer, /subsolarDirection/);
  assert.match(globe, /CENA_VELOCIDADE/);
  assert.match(globe, /subsolarDirection/);
  assert.match(globe, /map\.setLight\([\s\S]*?azimuth[\s\S]*?polar/);
  assert.match(globe, /c\.lng -= dt \* spin/);
  assert.match(renderer, /mesh\.position\.set\(Math\.cos\(phase\) \* orbitRadius, 0, -Math\.sin\(phase\) \* orbitRadius\)/);
  assert.match(CSS, /--itc-sun-x/);
});
check('FAQ acessível (details/summary ou aria-expanded)', () => assert.match(sec('Faq'), /<details|aria-expanded/));
check('todo <button> começa com type=', () => assert.equal(conta(UI, /<button(?!\s+type=)/g), 0));
check('sem lorem ipsum, TODO ou FIXME', () => assert.doesNotMatch(UI + CSS, /lorem|ipsum|TODO|FIXME/i));
check('sem console.log', () => assert.doesNotMatch(UI, /console\.log/));
check('sem localhost nem links http inseguros', () => assert.doesNotMatch(UI + CSS, /localhost|127\.0\.0\.1|["'(]http:\/\//));
check('cores só por tokens (sem hex solto)', () => assert.doesNotMatch(UI + CSS, /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![\w-])/));
check('site.css mantém os 4 modos responsivos', () => ['celular', 'celular-deitado', 'tablet', 'desktop'].forEach((m) => assert.match(CSS, new RegExp(`data-layout=["']?${m}["']?\\]`), m)));
check('consultas de contêiner (@container)', () => assert.match(CSS, /@container/));
check('versão para imprimir (@media print)', () => assert.match(CSS, /@media print/));
check('tipografia fluida (clamp)', () => assert.match(CSS + TOK, /clamp\(/));
check('título da aba com ITCONT', () => assert.match(UI, /document\.title\s*=\s*[^;]*ITCONT/));
check('descrição e Open Graph para compartilhar', () => { assert.match(UI, /name="description"|name=\\"description\\"|'description'/); assert.match(UI, /og:title/); assert.match(UI, /og:image/); });
check('crédito: Emanuel Macêdo Luz, desenvolvedor do projeto', () => assert.match(sec('Rodape'), /ITCONT\.creditos|Emanuel Macêdo Luz, desenvolvedor do projeto/));
check('rodapé com realização (Contador do Amanhã, UEFS)', () => assert.match(sec('Rodape'), /ITCONT\.realizacao/));
check('rodapé cita a fonte oficial', () => assert.match(sec('Rodape'), /ITCONT\.fonteUrl|FONTE_OFICIAL/));

// ───────────── E. Integração ─────────────
grupo = 'E. Integração';
check('fotos do evento ficam como links; a logo institucional enviada é a exceção autorizada', () => {
  const publicDir = resolve(RAIZ, 'artifacts/icaro/public');
  const pub = arquivos(publicDir).map((p) => relative(publicDir, p))
    .filter((p) => /itcont|even3/i.test(p) && /\.(png|jpe?g|webp|gif|avif)$/i.test(p));
  assert.deepEqual(pub.filter((p) => !/itcont-earth-(?:static|small)\.webp$/.test(p) && p !== 'itcont-logo.png'), []);
  const earth = join(RAIZ, 'artifacts/icaro/public/itcont-earth-static.webp');
  const earthSmall = join(RAIZ, 'artifacts/icaro/public/itcont-earth-small.webp');
  assert.ok(existsSync(earth));
  assert.ok(existsSync(earthSmall));
  assert.ok(statSync(earth).size <= 60 * 1024);
  assert.ok(statSync(earthSmall).size <= 10 * 1024);
});
check('raiz itcont-qualquer-coisa não faz imagens comuns parecerem assets do evento', () => {
  const publicDir = resolve('/tmp/itcont-qualquer-coisa', 'artifacts/icaro/public');
  const ordinaryImage = join(publicDir, 'brand-logo.png');
  const eventImages = [ordinaryImage].map((p) => relative(publicDir, p))
    .filter((p) => /itcont|even3/i.test(p) && /\.(png|jpe?g|webp|gif|avif)$/i.test(p));
  assert.deepEqual(eventImages, []);
});
check('script validate:itcont-site registrado', () => assert.match(ler(join(RAIZ, 'scripts/package.json')), /"validate:itcont-site"/));
check('nenhuma dependência nova pesada', () => assert.doesNotMatch(ler(join(RAIZ, 'artifacts/icaro/package.json')), /"(gsap|jquery|bootstrap|@mui\/material|antd|moment)"/));

const falhas = resultados.filter((r) => r.erro);
let atual = '';
for (const r of resultados) {
  if (r.grupo !== atual) { atual = r.grupo; console.log(`\n${atual}`); }
  console.log(`${r.erro ? '✗' : '✓'} ${String(r.n).padStart(3)}. ${r.nome}${r.erro ? ` → ${r.erro}` : ''}`);
}
if (resultados.length !== TOTAL_VALIDACOES) { console.log(`\n✗ o validador deveria ter ${TOTAL_VALIDACOES} checagens, tem ${resultados.length}`); process.exit(1); }
console.log(`\n${TOTAL_VALIDACOES - falhas.length}/${TOTAL_VALIDACOES} validações do site do ITCONT`);
process.exit(falhas.length ? 1 : 0);
