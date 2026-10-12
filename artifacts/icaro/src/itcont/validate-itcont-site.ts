/**
 * 103 validações do site do ITCONT: dados oficiais, regras (contagem, fases, agenda),
 * identidade visual e leis da beleza, heurísticas de Nielsen na interface e integração.
 * Roda sem internet, sem banco e sem navegador.
 * Uso: pnpm --filter @workspace/scripts run validate:itcont-site
 * Desenvolvedor do projeto: Emanuel Macêdo Luz
 */
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FONTE_OFICIAL, ITCONT } from './dados';
import {
  aberturaEvento, contagem, contraste, dataExtenso, duracaoMin, encerramentoEvento, escalaAurea, faseDoEvento,
  gerarICS, googleAgendaUrl, horaCurta, iniciais, instante, layoutPara, mapaUrl, proximaSessao,
  sessoesOrdenadas, sessoesPorDia, whatsappUrl,
} from './logica';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, '../../../..');
const ler = (p: string) => (existsSync(p) ? readFileSync(p, 'utf8') : '');
const TOTAL_VALIDACOES = 103;

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
check('fotos servidas pelo Even3 em https', () => ITCONT.convidados.forEach((c) => assert.match(c.foto, /^https:\/\/images\.even3\.com\//, c.nome)));
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
check('12 cores do banner definidas como tokens', () => ['abismo', 'marinho', 'royal', 'azul', 'eletrico', 'neon', 'gelo', 'cromo-1', 'cromo-2', 'cromo-3', 'branco', 'alerta'].forEach(cor));
check('texto branco sobre o fundo ≥ 4,5:1', () => assert.ok(contraste(cor('branco'), cor('abismo')) >= 4.5));
check('texto secundário (gelo) sobre o fundo ≥ 4,5:1', () => assert.ok(contraste(cor('gelo'), cor('abismo')) >= 4.5));
check('texto secundário sobre os cartões ≥ 4,5:1', () => assert.ok(contraste(cor('gelo'), cor('marinho')) >= 4.5));
check('destaque neon sobre o fundo ≥ 4,5:1', () => assert.ok(contraste(cor('neon'), cor('abismo')) >= 4.5));
check('botão: branco sobre royal ≥ 4,5:1', () => assert.ok(contraste(cor('branco'), cor('royal')) >= 4.5));
check('faixa: branco sobre azul ≥ 4,5:1', () => assert.ok(contraste(cor('branco'), cor('azul')) >= 4.5));
check('anel de foco visível sobre o cartão ≥ 3:1', () => assert.ok(contraste(cor('neon'), cor('marinho')) >= 3));
check('selo "ao vivo" legível ≥ 4,5:1', () => assert.ok(contraste(cor('abismo'), cor('alerta')) >= 4.5));
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
check('página importa tokens.css e site.css', () => { const p = ler(join(AQUI, 'SiteItcont.tsx')); assert.match(p, /import ['"]\.\/tokens\.css['"]/); assert.match(p, /import ['"]\.\/site\.css['"]/); });
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
check('fotos dos convidados com loading="lazy"', () => assert.match(sec('Convidados'), /loading=["']lazy["']/));
check('links externos com rel="noopener noreferrer"', () => assert.ok(conta(UI, /target=["']_blank["']/g) <= conta(UI, /rel=["']noopener noreferrer["']/g)));
check('botão de inscrição usa a URL oficial', () => assert.match(UI, /ITCONT\.inscricaoUrl/));
check('nenhuma data/hora escrita à mão nos componentes', () => assert.doesNotMatch(UI, /\b2[12]\/10\b|2026-10-\d\d|\b19h\b|21h30|de outubro/));
check('componentes leem dados.ts', () => assert.ok(conta(UI, /from ['"](\.\.?\/)+dados['"]/g) >= 5));
check('status do evento visível (faseDoEvento)', () => assert.match(UI, /faseDoEvento\(/));
check('adicionar à agenda (.ics + Google)', () => { assert.match(UI, /gerarICS\(/); assert.match(UI, /googleAgendaUrl\(/); });
check('como chegar (mapa)', () => assert.match(UI, /mapaUrl\(\)/));
check('compartilhar (WhatsApp ou navigator.share)', () => assert.match(UI, /whatsappUrl\(|navigator\.share/));
check('hero usa a chamada aprovada e convidados oficiais', () => {
  assert.match(sec('Hero'), /Uma imersão em novas possibilidades/);
  assert.match(sec('Hero'), /ITCONT\.convidados\.map/);
});
check('QR code aparece no hero e representa o endereço público', () => {
  assert.match(sec('Hero'), /<QrEvento\s*\/>/);
  assert.match(sec('QrEvento'), /window\.location\.origin.*window\.location\.pathname/);
});
check('modo telão foi removido do site público', () => {
  assert.doesNotMatch(UI + CSS, /ModoTelao|modoTelao|data-layout=["']telao|itc-kiosk|itc-exit-kiosk/);
});
check('globo permanece no fundo fixo da página inteira', () => {
  assert.match(ler(join(AQUI, 'SiteItcont.tsx')), /<TerraFundo\s*\/>/);
  assert.match(CSS, /\.itc \.itc-earth-backdrop\s*\{\s*position:\s*fixed/);
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
check('nenhuma imagem do evento copiada para public/ (só links do Even3)', () => {
  const pub = arquivos(join(RAIZ, 'artifacts/icaro/public')).filter((p) => /itcont|even3/i.test(p) && /\.(png|jpe?g|webp|gif|avif)$/i.test(p));
  assert.deepEqual(pub, []);
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
