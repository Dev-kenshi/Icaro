/**
 * Labirinto determinístico para os comandos antigos e v5 do Ícaro.
 * Não chama API externa, provedor de IA, banco de dados nem altera estado.
 *
 * Uso: pnpm --filter @workspace/scripts run validate:icaro-command-maze
 */
import assert from 'node:assert/strict';
import {
  interpret,
  interpretV5,
  normalize,
  type CommandResult,
} from './lib/commands';

type Kind = CommandResult['kind'];
type ResultOf<K extends Kind> = Extract<CommandResult, { kind: K }>;

const observedKinds = new Set<Kind>();
const failures: string[] = [];
let checks = 0;
let passed = 0;

function check(stage: string, name: string, run: () => void) {
  checks += 1;
  try {
    run();
    passed += 1;
    process.stdout.write(`[OK] ${stage} · ${name}\n`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    failures.push(`${stage} · ${name}: ${detail}`);
    process.stdout.write(`[NOK] ${stage} · ${name}: ${detail}\n`);
  }
}

function expectIntegrated<K extends Kind>(
  input: string,
  expected: K,
  verify?: (result: ResultOf<K>) => void,
): ResultOf<K> {
  const result = interpret(input);
  observedKinds.add(result.kind);
  assert.equal(result.kind, expected, `"${input}" foi interpretado como ${result.kind}`);
  const typed = result as ResultOf<K>;
  verify?.(typed);
  return typed;
}

function expectV5<K extends Kind>(
  input: string,
  expected: K,
  verify?: (result: ResultOf<K>) => void,
): ResultOf<K> {
  const result = interpretV5(normalize(input));
  assert.ok(result, `o comando v5 não reconheceu "${input}"`);
  observedKinds.add(result.kind);
  assert.equal(result.kind, expected, `"${input}" virou ${result.kind} no v5`);
  const typed = result as ResultOf<K>;
  verify?.(typed);
  return typed;
}

function expectNoV5(input: string) {
  const result = interpretV5(normalize(input));
  if (result) observedKinds.add(result.kind);
  assert.equal(result, null, `"${input}" não deveria ser capturado pelo v5`);
}

process.stdout.write('LABIRINTO DE COMANDOS DO ÍCARO · TESTES LOCAIS\n\n');

// Trilha legada: cada tipo de resposta e ação da interpretação original.
check('LEGADO', 'entrada vazia mantém a conversa aberta', () => {
  expectIntegrated('', 'say', (r) => assert.match(r.text, /Estou ouvindo/));
});
check('LEGADO', 'saudação responde localmente', () => {
  expectIntegrated('Olá, turma', 'say', (r) => assert.match(r.text, /Olá!/));
});
check('LEGADO', 'ajuda lista a capacidade do assistente', () => {
  expectIntegrated('comandos', 'say', (r) => assert.match(r.text, /inteligência artificial/));
});
check('LEGADO', 'pergunta sobre o nome do Ícaro responde localmente', () => {
  expectIntegrated('o que é o Ícaro?', 'say', (r) => assert.match(r.text, /Inteligência/));
});
check('LEGADO', 'abre a apresentação original', () => {
  expectIntegrated('toque a apresentação original', 'intro');
});
check('LEGADO', 'ativa tela cheia', () => {
  expectIntegrated('modo apresentação', 'fullscreen');
});
check('LEGADO', 'informa a hora local de Brasília', () => {
  expectIntegrated('que horas são?', 'say', (r) => assert.match(r.text, /horário de Brasília/));
});
check('LEGADO', 'informa a data sem valor fixo', () => {
  expectIntegrated('qual a data', 'say', (r) => assert.match(r.text, /^Hoje é /));
});
check('LEGADO', 'inicia temporizador simples', () => {
  expectIntegrated('temporizador de 5 minutos', 'timer', (r) => assert.equal(r.seconds, 300));
});
check('LEGADO', 'soma unidades no temporizador', () => {
  expectIntegrated('timer de 1 hora e 30 minutos', 'timer', (r) => assert.equal(r.seconds, 5_400));
});
check('LEGADO', 'cancela temporizador', () => {
  expectIntegrated('parar temporizador', 'cancelTimer');
});
check('LEGADO', 'pede duração quando o temporizador está incompleto', () => {
  expectIntegrated('temporizador', 'say', (r) => assert.match(r.text, /Informe o período/));
});
check('LEGADO', 'recusa temporizador maior que 24 horas', () => {
  expectIntegrated('timer de 25 horas', 'say', (r) => assert.match(r.text, /24 horas/));
});
check('LEGADO', 'cria anotação sem perder acentos e maiúsculas', () => {
  expectIntegrated('Anote: Reunião com João', 'note', (r) => assert.equal(r.note, 'Reunião com João'));
});
check('LEGADO', 'solicita o conteúdo quando a anotação está vazia', () => {
  expectIntegrated('anotar', 'say', (r) => assert.match(r.text, /Diga o que deseja anotar/));
});
check('LEGADO', 'lista anotações', () => {
  expectIntegrated('listar minhas notas', 'listNotes');
});
check('LEGADO', 'lista anotações com artigo opcional', () => {
  expectIntegrated('listar as minhas notas', 'listNotes');
});
check('LEGADO', 'prepara uma pesquisa sem chamar a web', () => {
  expectIntegrated('pesquise na web sobre CPC 47', 'search', (r) => assert.equal(r.query, 'cpc 47'));
});
check('LEGADO', 'abre cena da galáxia', () => {
  expectIntegrated('mostre a galáxia', 'scene', (r) => assert.equal(r.scene, 'galaxy'));
});
check('LEGADO', 'abre cena do sistema solar', () => {
  expectIntegrated('mostrar sistema solar', 'scene', (r) => assert.equal(r.scene, 'system'));
});
check('LEGADO', 'abre a cena terrestre sem confundir com o controle do globo', () => {
  expectIntegrated('mostrar a Terra', 'scene', (r) => assert.equal(r.scene, 'earth'));
});
check('LEGADO', 'voa para a cidade de Feira de Santana', () => {
  expectIntegrated('voe para Feira de Santana', 'flyFeira');
});
check('LEGADO', 'extrai destino de cidade para o mapa', () => {
  expectIntegrated('onde fica Tóquio', 'flyTo', (r) => assert.equal(r.query, 'toquio'));
});
check('LEGADO', 'extrai destino de pedido natural para chegar diretamente', () => {
  expectIntegrated('abra aqui direto, dando zoom e chegando em Feira de Santana', 'flyTo', (r) => {
    assert.equal(r.query, 'Feira de Santana, Bahia, Brasil');
  });
});
check('LEGADO', 'extrai Feira quando Street View vem depois do destino', () => {
  expectIntegrated('abra Feira de Santana no Street View', 'flyTo', (r) => {
    assert.equal(r.query, 'Feira de Santana, Bahia, Brasil');
  });
});
check('LEGADO', 'abre o tour Discipulus', () => {
  expectIntegrated('mostre o Discipulus', 'openTour', (r) => assert.equal(r.tour, 'discipulus'));
});
check('LEGADO', 'abre o tour LabEduContábil', () => {
  expectIntegrated('apresente o laboratório didático', 'openTour', (r) => assert.equal(r.tour, 'labeducontabil'));
});
check('LEGADO', 'avança no tour', () => {
  expectIntegrated('próximo', 'tour', (r) => assert.equal(r.action, 'next'));
});
check('LEGADO', 'volta no tour', () => {
  expectIntegrated('volte', 'tour', (r) => assert.equal(r.action, 'previous'));
});
check('LEGADO', 'pausa o tour', () => {
  expectIntegrated('pausa', 'tour', (r) => assert.equal(r.action, 'pause'));
});
check('LEGADO', 'retoma o tour', () => {
  expectIntegrated('continue', 'tour', (r) => assert.equal(r.action, 'resume'));
});
check('LEGADO', 'encerra a demonstração guiada', () => {
  expectIntegrated('feche a demonstração', 'tour', (r) => assert.equal(r.action, 'close'));
});
check('LEGADO', 'abre música e inicia reprodução', () => {
  expectIntegrated('toque música', 'openMusic', (r) => assert.equal(r.play, true));
});
check('LEGADO', 'abre Spotify sem iniciar reprodução', () => {
  expectIntegrated('abra o Spotify', 'openMusic', (r) => assert.equal(r.play, false));
});
check('LEGADO', 'calcula porcentagem', () => {
  expectIntegrated('calcule 30% de 200', 'say', (r) => assert.match(r.text, /\b60\b/));
});
check('LEGADO', 'calcula expressão aritmética', () => {
  expectIntegrated('quanto é 2 mais 2?', 'say', (r) => assert.match(r.text, /\b4\b/));
});
check('LEGADO', 'recusa divisão por zero com resposta segura', () => {
  expectIntegrated('calcule 10 dividido por 0', 'say', (r) => assert.match(r.text, /Não consegui calcular/));
});
check('LEGADO', 'encaminha pergunta de contabilidade para a IA', () => {
  expectIntegrated('o que é DRE?', 'ai');
});
check('LEGADO', 'encaminha cálculo contábil textual para a IA', () => {
  expectIntegrated('calcule o custo de um funcionário de 2500', 'ai');
});

// Trilha v5: testa diretamente cada família de comandos novos.
check('V5', 'abre painel financeiro', () => {
  expectV5('painel financeiro', 'painel', (r) => assert.equal(r.abrir, true));
});
check('V5', 'abre painel de cotações', () => {
  expectV5('painel de cotações', 'painel', (r) => assert.equal(r.abrir, true));
});
check('V5', 'abre cotações a partir de uma pergunta sobre o dólar', () => {
  expectV5('quanto está o dólar', 'painel', (r) => assert.equal(r.abrir, true));
});
check('V5', 'reconhece cotação do euro', () => {
  expectV5('qual a cotação do euro', 'painel', (r) => assert.equal(r.abrir, true));
});
check('V5', 'fecha painel financeiro', () => {
  expectV5('feche o painel financeiro', 'painel', (r) => assert.equal(r.abrir, false));
});
check('V5', 'oculta painel por sinônimo', () => {
  expectV5('oculte o painel', 'painel', (r) => assert.equal(r.abrir, false));
});
check('V5', 'usa clima padrão de hoje sem cidade', () => {
  expectV5('temperatura', 'tempo', (r) => {
    assert.equal(r.dia, 'hoje');
    assert.equal(r.cidade, null);
  });
});
check('V5', 'identifica previsão de amanhã e cidade', () => {
  expectV5('previsão do tempo amanhã em Salvador', 'tempo', (r) => {
    assert.equal(r.dia, 'amanha');
    assert.equal(r.cidade, 'Salvador');
  });
});
check('V5', 'extrai cidade com acento normalizado', () => {
  expectV5('clima em Montevidéu', 'tempo', (r) => assert.equal(r.cidade, 'Montevideu'));
});
check('V5', 'não interpreta clima organizacional como previsão', () => {
  expectNoV5('clima organizacional');
});
check('V5', 'localiza onde estamos no globo', () => {
  expectV5('onde estamos', 'globo', (r) => assert.equal(r.acao, 'onde'));
});
check('V5', 'retorna à visão do planeta', () => {
  expectV5('volte para o planeta', 'globo', (r) => assert.equal(r.acao, 'planeta'));
});
check('V5', 'reconhece pedido de zoom mais próximo', () => {
  expectV5('aproxime', 'globo', (r) => assert.equal(r.acao, 'mais'));
});
check('V5', 'reconhece pedido de afastar', () => {
  expectV5('afaste', 'globo', (r) => assert.equal(r.acao, 'menos'));
});
check('V5', 'ativa rotação do planeta', () => {
  expectV5('gire o planeta', 'globo', (r) => assert.equal(r.acao, 'girar'));
});
check('V5', 'não captura fala comum de horário', () => {
  expectNoV5('que horas são');
});

// Labirinto integrado: o v5 tem precedência sem quebrar o legado.
check('INTEGRAÇÃO', 'remove a ativação de voz antes de interpretar comando v5', () => {
  expectIntegrated('Ok Ícaro mostre o painel financeiro', 'painel', (r) => assert.equal(r.abrir, true));
});
check('INTEGRAÇÃO', 'roteia o pedido de clima ao comando v5', () => {
  expectIntegrated('Ícaro, vai chover amanhã?', 'tempo', (r) => assert.equal(r.dia, 'amanha'));
});
check('INTEGRAÇÃO', 'roteia rotação da Terra ao controle de globo v5', () => {
  expectIntegrated('Ícaro, gire a Terra', 'globo', (r) => assert.equal(r.acao, 'girar'));
});
check('INTEGRAÇÃO', 'mantém pergunta comum de gestão fora do comando de clima', () => {
  expectIntegrated('o que é clima organizacional?', 'ai');
});
check('INTEGRAÇÃO', 'painel de controle de custos não abre cotações', () => {
  const result = interpret('o que é um painel de controle de custos?');
  observedKinds.add(result.kind);
  assert.notEqual(result.kind, 'painel');
});
check('INTEGRAÇÃO', 'pergunta de horário não vira navegação geográfica', () => {
  const result = interpret('que horas são?');
  observedKinds.add(result.kind);
  assert.equal(result.kind, 'say');
});
check('INTEGRAÇÃO', 'música continua fora do geocodificador v5', () => {
  const result = interpret('toque música');
  observedKinds.add(result.kind);
  assert.equal(result.kind, 'openMusic');
});
check('COBERTURA', 'todos os tipos de resposta estão exercitados', () => {
  const expected: Kind[] = [
    'say', 'intro', 'fullscreen', 'timer', 'cancelTimer', 'note', 'listNotes',
    'search', 'scene', 'flyFeira', 'openTour', 'tour', 'openMusic', 'flyTo',
    'painel', 'tempo', 'globo', 'ai',
  ];
  const missing = expected.filter((kind) => !observedKinds.has(kind));
  assert.deepEqual(missing, [], `tipos sem check: ${missing.join(', ')}`);
});

const status = failures.length === 0 ? 'OK' : 'NOK';
process.stdout.write(`\nCHECKS CONCLUÍDOS: ${passed}/${checks}\n`);
process.stdout.write(`RESULTADO FINAL: ${status}\n`);
if (failures.length > 0) process.exitCode = 1;
