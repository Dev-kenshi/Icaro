# Mapa do código e guia de leitura por linha

## Como interpretar este documento

Este mapa cobre os módulos do produto e seus pontos de entrada. Para manter a
explicação fiel, os intervalos indicam **blocos lógicos**, não uma paráfrase
repetida de toda linha, comentário, chave ou linha em branco. A documentação da
API cobre cada rota; as páginas abaixo explicam a função dos módulos. Os
arquivos gerados, dados de conhecimento e código vendor são identificados
separadamente porque não são a implementação de primeira autoria de uma rota.

Use `nl -ba <arquivo>` para conferir o número de linha atual. A lista de
arquivos abaixo é um mapa de responsabilidade: cada pasta da aplicação tem
uma finalidade, e cada arquivo não listado nominalmente herda a descrição da
categoria em que aparece.

## 1. Raiz do workspace

| Caminho | Responsabilidade |
|---|---|
| `package.json` | Scripts e dependências comuns do monorepo |
| `pnpm-workspace.yaml` | Define pacotes e catálogo de versões |
| `tsconfig.base.json`, `tsconfig.json` | Configuração compartilhada e referências TypeScript |
| `render.yaml` | Build, processo Node, health check e variáveis esperadas no Render |
| `README.md` | Resumo do produto, rotas visíveis e execução local |
| `lib/` | Contratos, schemas, cliente React e acesso a dados compartilhados |
| `artifacts/api-server/` | API de produção |
| `artifacts/icaro/` | Aplicação React do Ícaro |
| `scripts/` | Validadores, demonstrações e ferramentas de manutenção |
| `vendor/icaro-humano/` | Dependência vendorizada do motor visual; não editar como código comum |

## 2. Cascata do servidor

### 2.1 Bootstrap e pipeline HTTP

#### `artifacts/api-server/src/index.ts` (25 linhas)

- **1–2:** importa a aplicação e o logger.
- **4–13:** exige `PORT` e rejeita valor ausente/inválido.
- **15–25:** inicia o listener e encerra com erro se o bind falhar.

#### `artifacts/api-server/src/app.ts` (99 linhas)

- **1–10:** filesystem, Express e componentes de middleware.
- **11–15:** cria o app, remove o cabeçalho de tecnologia e informa o proxy
  confiável.
- **17–38:** logging HTTP com campos selecionados; a URL registrada não inclui
  query string.
- **39–45:** CORS, cookies, JSON até 1 MiB, formulário e prefixo `/api`.
- **46–51:** fallback JSON 404 para caminhos da API desconhecidos.
- **53–76:** serve o frontend compilado, se `index.html` existir, e encaminha
  rotas do navegador para a SPA.
- **78–82:** 404 geral.
- **84–99:** handler de erros normaliza status 4xx/5xx e não expõe stack trace.

#### `artifacts/api-server/src/routes/index.ts` (24 linhas)

- **1–9:** importa roteadores funcionais.
- **11–12:** cria roteador raiz.
- **14–15:** monta saúde e sessão antes do middleware geral.
- **16:** aplica sessão aos prefixos de IA, TTS com timestamp, ITCONT e dados
  ao vivo.
- **17–23:** registra roteadores; Cosmos continua público porque não pertence
  aos prefixos protegidos.
- **24:** exporta o roteador.

#### `artifacts/api-server/src/middlewares/require-auth.ts`

Lê o cookie assinado; sem sessão responde `401`; com sessão mas papel
insuficiente responde `403`; caso contrário chama `next()`.

### 2.2 Rotas HTTP

| Arquivo | Cascata interna |
|---|---|
| `routes/health.ts` | Analisa resposta pelo schema compartilhado e responde `ok` |
| `routes/auth.ts` | Valida login → limita tentativas → confere segredo → cria/limpa cookie |
| `routes/stt.ts` | Limita frequência → valida áudio bruto → consulta Groq → devolve texto |
| `routes/ai.ts` | Valida entrada → resolve cálculo/conhecimento → escolhe provedor → resposta JSON/SSE |
| `routes/tts-timestamps.ts` | Valida texto/voz → limita frequência → gera áudio → valida alinhamento |
| `routes/cosmos.ts` | Carrega feeds em cache → valida shape Zod → define TTL de cache |
| `routes/itcont.ts` | Valida slug → consulta evento/sessões/convidados/categorias → valida payload |
| `routes/ao-vivo.ts` | Consulta clima/finanças → formata para painel/voz → responde ou `502` |

### 2.3 Segurança da sessão

#### `lib/auth.ts` (60 linhas)

- Tipos `Role`/`Session` definem `user`, `admin`, usuário e expiração.
- `ACCOUNTS` associa nomes de usuário a nomes de variáveis de ambiente, sem
  conter as senhas.
- `safeEqual` compara hashes em tempo constante.
- `checkCredentials` distingue credencial incorreta de senha não configurada.
- `issueToken` cria payload codificado e assinado com HMAC-SHA256.
- `readToken` valida tamanho, formato, assinatura, JSON, expiração e papel.

#### `routes/auth.ts` (75 linhas)

- **1–22:** router, controle de falhas e atributos do cookie.
- **24–58:** valida entrada de login, bloqueia repetidas tentativas, valida
  sessão configurada e define cookie.
- **61–64:** logout limpa cookie.
- **66–74:** `/me` retorna identidade/papel ou `401`.

### 2.4 Conversa e conhecimento

#### `routes/ai.ts` (1126 linhas)

- **1–247:** imports, limites por IP, configuração dos provedores, construção
  de persona/contexto e reescrita de pergunta curta de seguimento.
- **248–329:** catálogo e estado dos provedores; estatísticas e administração
  de candidatas do conhecimento.
- **330–397:** rate limit e síntese binária `/ai/tts`.
- **398–945:** chat JSON; valida, prepara contexto, tenta resolução local e
  chama provedor quando necessário.
- **946–1126:** chat SSE; transmite eventos de provedor, tokens, emoção,
  conclusão ou erro.

#### `lib/cerebro-camadas.ts` (552 linhas)

Gerencia camadas locais, cache/estatísticas, busca e candidatas de respostas.
É o centro da resolução anterior ao provedor e da curadoria administrativa.
Consulte os nomes de funções exportadas ao ler o intervalo atual, pois esse
arquivo evolui junto com o formato do armazenamento.

#### `lib/knowledge-bank.ts` (454 linhas) e `lib/knowledge-corpus.ts`

Carregam bancos por domínio, normalizam/rankeiam gatilhos e localizam trechos.
Os arquivos JSON em `lib/conhecimento/` são conteúdo — não endpoints nem
código de transporte.

#### `lib/provider-router.ts` (489 linhas), `lib/groq.ts`

Selecionam e consultam provedores configurados, acompanham saúde/erro/cooldown
e expõem resultado padronizado. Não confundir disponibilidade configurada com
disponibilidade real do serviço: a consulta e o status em runtime são a prova.

### 2.5 Voz, dados e observabilidade

| Arquivo | Função |
|---|---|
| `lib/tts.ts` | Síntese de voz e seleção/fallback de mecanismo |
| `lib/tts-timestamps.ts` | Preparação do texto, pronunciamento e alinhamento temporal |
| `lib/elevenlabs-voice-catalog.ts` | Lista/valida vozes permitidas na conta |
| `lib/emotion-tags.ts` | Reconhece tags emocionais durante a resposta |
| `lib/ao-vivo.ts` | Integração e normalização de clima/cotações |
| `lib/cosmos-feeds.ts` | Consulta, processamento e cache de feeds do planeta |
| `lib/calculos-db.ts`, `import-calculos.ts` | Procura/importa dados de cálculos |
| `lib/logger.ts` | Configura logs do servidor |

## 3. Cascata do frontend

### 3.1 Entrada e rotas

#### `artifacts/icaro/src/main.tsx`

Entrada Vite/React: carrega CSS global e monta a árvore do aplicativo.

#### `artifacts/icaro/src/App.tsx` (82 linhas)

- imports e providers (React Query, dataset, tooltip, idioma);
- `Router` seleciona palco na raiz e páginas internas;
- `Shelled` fornece navegação para páginas de produto;
- `LoginGate` bloqueia conteúdo sem sessão;
- `ErrorBoundary` limita falhas a uma tela recuperável.

Rotas atuais: `/`, `/overview`, `/analysis`, `/assistant`,
`/finance-weather`, `/agenda`, `/music`, `/demos` e `/admin/cerebro`.

### 3.2 Páginas

| Arquivo | Responsabilidade |
|---|---|
| `pages/stage.tsx` | Palco, cenas, globo, chat, microfone, voz e painéis |
| `pages/overview.tsx` | Visão geral operacional |
| `pages/analysis.tsx` | Importação/consulta analítica de CSV |
| `pages/assistant.tsx` | Conversa textual e estado de provedores |
| `pages/admin-cerebro.tsx` | Revisão/aprovação de candidatas do conhecimento |
| `pages/finance-weather.tsx` | Indicadores financeiros e previsão |
| `pages/agenda.tsx` | Apresentação de programação |
| `pages/demos.tsx` | Demonstrações guiadas |
| `pages/music.tsx` | Atalhos/integração de música |
| `pages/not-found.tsx` | Rota desconhecida |
| `pages/stage.css` | Estilo do palco e responsividade |

### 3.3 Serviços de interface

| Arquivo | Fluxo que implementa |
|---|---|
| `lib/auth.ts` | Chamadas login/me/logout com cookie same-origin |
| `lib/commands.ts` | Normalização e despacho de comandos locais |
| `lib/ai-chat-stream.ts` | Leitura SSE e composição de resposta/metadados |
| `lib/mic-config.ts` | Permissão/configuração do microfone e chamada STT |
| `lib/wake-commands.ts`, `lib/wake-turn-gate.ts`, `lib/wake-access.ts` | Ativação segura por palavra de chamada e controle de turno |
| `hooks/use-wake-listener.ts` | Ciclo de vida do reconhecimento de voz |
| `lib/speech.ts`, `lib/speech-plan.ts` | Reprodução, fila de fala, visemas/emoção e sincronização |
| `lib/geo-fly.ts`, `lib/geo-busca.ts`, `lib/globo.ts` | Comando de localização, geocodificação, tipo e zoom |
| `lib/stage-layout.ts`, `hooks/use-stage-layout.ts` | Posições e persistência do layout do palco |
| `lib/avatar-layout.ts`, `lib/avatars.ts`, `lib/icaro-avatar.ts` | Definição, ajuste e carregamento do avatar |
| `lib/dataset-context.tsx` | Estado compartilhado dos dados importados |
| `lib/i18n.tsx` | Idioma e strings |
| `lib/ao-vivo.ts` | Cliente web das rotas ao vivo |

### 3.4 Componentes

- `components/stage/`: globo, renderizador Cosmos, avatar/rosto, voz, painel
  ao vivo, ajuda, geolocalização e ajustes de cena.
- `components/login/`: portão de login e elementos da tela de acesso.
- `components/app-shell.tsx`: navegação e estrutura comum das páginas.
- `components/error-boundary.tsx`: captura de erro da árvore React.
- `components/ui/`: componentes de interface reutilizáveis (botões, forms,
  menus, calendários, gráficos e afins). Eles não definem rotas da API.

## 4. Contratos e persistência

| Pacote | Responsabilidade |
|---|---|
| `lib/api-spec/openapi.yaml` | Contrato OpenAPI parcial das operações |
| `lib/api-zod/src/` | Schemas Zod usados por cliente/servidor |
| `lib/api-client-react/src/` | Tipos e hooks de cliente derivados do contrato |
| `lib/db/src/` | Conexão, schema Drizzle, migrações e seeds |
| `scripts/src/validate-*.ts` | Verificações automatizadas de domínio e integração |

### Arquivos compartilhados e ferramentas

- `lib/api-spec/openapi.yaml` descreve as operações e schemas documentados;
  `lib/api-spec/orval.config.ts` controla a geração do cliente.
- `lib/api-zod/src/generated/api.ts` e `generated/types/*.ts` contêm schemas
  tipados gerados a partir do contrato. Não edite arquivos gerados à mão sem
  também atualizar a fonte e regenerar.
- `lib/api-client-react/src/generated/api.ts` e
  `generated/api.schemas.ts` contêm funções/tipos de cliente. `custom-fetch.ts`
  centraliza transporte, credenciais e tratamento comum.
- `lib/db/src/index.ts` inicializa o acesso ao banco; `schema/index.ts`
  agrega schemas; `schema/itcont.ts` declara tabelas do evento; `schema/
  icaro-calculos.ts` declara cálculos; `seed/itcont.ts` insere dados públicos
  iniciais do ITCONT.
- `scripts/src/validate-*.ts` cobre API, conversação, voz, microfone, palco,
  conhecimento, clima/finanças e instalação. `build-avatar-portrait.ts`
  constrói recurso visual; `sync-doctor.ts`, `sync-repair-policy.ts` e
  `repair-health.ts` são ferramentas de manutenção, não endpoints.
- `artifacts/api-server/src/validate-*.ts` contém validações próximas aos
  serviços do backend; não faz parte do caminho HTTP de produção.

Arquivos sob `dist/`, artefatos de build, `*.d.ts` gerados, arquivos JSON de
respostas, imagens, áudio e arquivos vendor são tratados como saída, dados ou
dependência — não devem ser reescritos como se fossem a lógica da API.

### Catálogo de componentes reutilizáveis de interface

Os arquivos abaixo residem em `artifacts/icaro/src/components/ui/`. Cada arquivo
implementa um primitivo visual acessível e reutilizável; eles não acessam a API
nem contêm regra de negócio do Ícaro:

`accordion.tsx`, `alert-dialog.tsx`, `alert.tsx`, `aspect-ratio.tsx`,
`avatar.tsx`, `badge.tsx`, `breadcrumb.tsx`, `button-group.tsx`,
`button.tsx`, `calendar.tsx`, `card.tsx`, `carousel.tsx`, `chart.tsx`,
`checkbox.tsx`, `collapsible.tsx`, `command.tsx`, `context-menu.tsx`,
`dialog.tsx`, `drawer.tsx`, `dropdown-menu.tsx`, `empty.tsx`, `field.tsx`,
`form.tsx`, `hover-card.tsx`, `input-group.tsx`, `input-otp.tsx`,
`input.tsx`, `item.tsx`, `kbd.tsx`, `label.tsx`, `menubar.tsx`,
`navigation-menu.tsx`, `pagination.tsx`, `popover.tsx`, `progress.tsx`,
`radio-group.tsx`, `resizable.tsx`, `scroll-area.tsx`, `select.tsx`,
`separator.tsx`, `sheet.tsx`, `sidebar.tsx`, `skeleton.tsx`, `slider.tsx`,
`sonner.tsx`, `spinner.tsx`, `switch.tsx`, `table.tsx`, `tabs.tsx`,
`textarea.tsx`, `toaster.tsx`, `toast.tsx`, `toggle-group.tsx`,
`toggle.tsx` e `tooltip.tsx`.

O conteúdo visual do avatar, bancos `.json`, recursos de áudio/imagem e
arquivos de declarações TypeScript (`*.d.ts`) são descritos como dados,
recursos ou tipos, não como instruções de execução.

## 5. Linha a linha nos módulos centrais

Para estudo manual, a ordem recomendada é:

1. `api-server/src/index.ts` — processo e porta;
2. `api-server/src/app.ts` — middlewares e fallback;
3. `api-server/src/routes/index.ts` — segurança e ordem dos routers;
4. `api-server/src/middlewares/require-auth.ts` e `lib/auth.ts` — sessão;
5. a rota indicada em [API-REFERENCE.md](API-REFERENCE.md);
6. serviços chamados pela rota;
7. cliente equivalente em `artifacts/icaro/src/lib`;
8. página/componente que apresenta o resultado;
9. validador que cobre o cenário.

Em cada arquivo, leia imports e tipos primeiro, constantes/configuração depois,
funções puras antes dos handlers e, por fim, efeitos externos. Essa ordem
expõe as dependências sem misturar regra de negócio com transporte HTTP.
