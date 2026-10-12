# Arquitetura, cascata e cronologia do Ícaro

## 1. Visão geral

O Ícaro é uma aplicação web com:

- **Interface:** React, TypeScript e Vite em `artifacts/icaro`.
- **API:** Express 5 e TypeScript em `artifacts/api-server`.
- **Contratos:** OpenAPI, schemas Zod e cliente React em `lib/api-spec`,
  `lib/api-zod` e `lib/api-client-react`.
- **Dados:** PostgreSQL/Drizzle para dados persistentes do ITCONT e cálculos;
  arquivos locais para alguns estados e bancos de conhecimento.
- **Serviços externos:** provedores de IA e voz, Open-Meteo, OpenStreetMap,
  feeds públicos e APIs financeiras/climáticas. Credenciais ficam no servidor.
- **Publicação:** `render.yaml` publica a API Node e o frontend compilado no
  mesmo serviço; o artifact web do Replit também serve a interface no preview.

## 2. Diagrama em cascata

```text
Pessoa
  │ teclado, microfone ou controle visual
  ▼
Interface React (App.tsx)
  ├─ LoginGate / sessão
  ├─ Rota da tela
  └─ Página e estado visual
       │
       ├─ Comando local reconhecido?
       │    ├─ sim → interpret(commands.ts)
       │    │        ├─ cena, timer, cálculo, painel ou navegação
       │    │        └─ localização → geo-fly → geo-busca → globo
       │    └─ não → cliente de API
       │
       ├─ Voz: microfone → STT (quando usado) → texto
       └─ Chat: POST /api/ai/chat/stream
                    │ cookie de sessão
                    ▼
             Express (app.ts)
                    │
             rotas/index.ts
                    │
             autenticação e validação
                    │
             rota específica
              ├─ dados públicos / saúde
              ├─ TTS / STT
              ├─ ITCONT / clima / finanças / Cosmos
              └─ IA
                   ├─ cálculo determinístico
                   ├─ camadas locais de conhecimento
                   └─ roteador de provedores externos
                    │
             resposta JSON, áudio ou SSE
                    ▼
             cliente React interpreta resposta
              ├─ atualiza texto/estado/painel
              ├─ envia texto à síntese de voz
              └─ alinha fala, emoções e animação do avatar
```

## 3. Linha cronológica de uma interação

### 3.1 Entrada e autenticação

1. O navegador abre uma rota React (`artifacts/icaro/src/App.tsx`).
2. `LoginGate` consulta `GET /api/auth/me`. Sem cookie válido, mostra login;
   com sessão válida, libera as rotas.
3. O login envia `POST /api/auth/login` com usuário e senha. O servidor valida
   as credenciais configuradas e devolve `icaro_session` como cookie
   HttpOnly. A aplicação não lê o valor do cookie em JavaScript.

### 3.2 Interpretação da intenção

4. A entrada digitada ou reconhecida como fala chega aos comandos locais
   (`artifacts/icaro/src/lib/commands.ts`).
5. `interpret` normaliza acentos, caixa e palavra de ativação, depois verifica
   comandos locais antes de encaminhar uma pergunta geral à IA.
6. Comandos como cenas, zoom, temporizador e “voe para Feira de Santana” são
   tratados localmente. Eles não precisam consumir um provedor de IA.
7. Uma localização passa por limpeza e interpretação (`geo-fly.ts`), busca em
   Open-Meteo/Photon e, se necessário, Nominatim (`geo-busca.ts`). O melhor
   resultado recebe um tipo; `globo.ts` escolhe o zoom. Essa busca é feita
   diretamente pelo navegador e **não é uma rota do backend Ícaro**.

### 3.3 Pergunta respondida pela API

8. Se não houver comando local, a interface envia pergunta, histórico, persona,
   modo, provedor e contexto de dados para a rota de chat.
9. `app.ts` aplica parsing, logging e roteamento; `routes/index.ts` exige
   sessão nas áreas protegidas e encaminha ao módulo correto.
10. `routes/ai.ts` valida o corpo, limita frequência, remove dados pessoais de
    conteúdo encaminhado e prepara o contexto.
11. Na conversa do Ícaro, a resolução pode encerrar antes de uma chamada
    externa:
    - **camada determinística:** cálculos com resultado conhecido;
    - **L1–L4:** cache, conhecimento aprovado, busca semântica e banco de
      gatilhos/conhecimento local;
    - **L5:** composição a partir de trechos locais, quando aplicável;
    - **L6:** roteador de provedores, quando as camadas anteriores não resolvem.
12. A resposta não é inventada quando falta informação local: o sistema pode
    recorrer a provedores configurados, responder com erro controlado ou pedir
    nova tentativa, conforme o caminho.

### 3.4 Retorno, fala e animação

13. `/api/ai/chat/stream` retorna Server-Sent Events (SSE). O cliente lê os
    eventos em `ai-chat-stream.ts`: `provider`, `token`, `emocao`, `done` e
    `error`.
14. Tokens atualizam a resposta progressivamente. Marcas de emoção são
    registradas na posição do texto em que chegaram.
15. A resposta pode seguir para `/api/ai/tts` (áudio) ou `/api/tts-ts`
    (áudio com alinhamento por caractere). A camada de fala alimenta legendas
    e sincronização do retrato.
16. O palco (`pages/stage.tsx`) combina o estado de escuta, raciocínio e fala
    com controles visuais, cenas e painéis.

### 3.5 Dados complementares

- **ITCONT:** leitura autenticada dos detalhes públicos do evento no banco;
  agenda, convidados e categorias públicas são ordenados antes de responder.
- **Clima/finanças ao vivo:** rotas no servidor consultam fontes externas e
  convertem falhas em respostas HTTP controladas.
- **Cosmos:** rota pública devolve feeds em cache, estado de atualização,
  trajetória da ISS e terremotos.
- **Análise CSV:** a interface importa e resume o dataset no navegador; o
  contexto amostrado pode ser enviado à IA sem enviar o arquivo inteiro.

## 4. ADS — Análise e Desenvolvimento de Sistemas

Este projeto pode ser estudado pelas etapas usuais de ADS:

| Etapa | Aplicação no Ícaro | Evidência no código |
|---|---|---|
| Levantamento de requisitos | Assistente de aula, palco, voz, dados e administração | README, páginas e validadores |
| Modelagem | Rotas, papéis, entidades e contratos de entrada/saída | OpenAPI, Zod e `lib/db` |
| Arquitetura | Frontend, API, pacotes compartilhados e integrações | `artifacts/`, `lib/`, `scripts/` |
| Implementação | Componentes React, serviços e endpoints Express | `artifacts/icaro/src`, `artifacts/api-server/src` |
| Integração | Cookie, JSON, SSE, áudio, banco e serviços externos | clientes web e rotas |
| Testes | Typecheck, validadores de domínio e integrações | `scripts` e `validate-*.ts` |
| Implantação | Build do frontend e API; health check no Render | `render.yaml`, `api-server/build.mjs` |
| Manutenção | Observabilidade, limites, fallbacks e atualização desta documentação | logger, health e validadores |

### Conceitos usados

- **Requisito funcional:** ação oferecida, como localizar um lugar ou falar
  uma resposta.
- **Contrato:** formato aceito e devolvido por uma rota; validado em runtime
  por Zod e descrito parcialmente por OpenAPI.
- **Camada:** etapa de resolução que tenta responder antes de passar à próxima.
- **Middleware:** código Express executado antes da rota, por exemplo sessão
  e logging.
- **SSE:** resposta HTTP mantida aberta para enviar partes da resposta à medida
  que são produzidas.
- **Fallback:** tentativa alternativa explícita quando uma fonte não responde;
  exemplos: provedor secundário e geocodificador de reserva.
- **Observabilidade:** logs sanitizados e endpoint de saúde usados para detectar
  falhas sem registrar credenciais ou corpos sensíveis.

## 5. Limites e decisões de segurança

- Chaves de provedores existem apenas no ambiente do servidor.
- A sessão é assinada, expira e é transmitida em cookie HttpOnly.
- Funções administrativas verificam o papel `admin`.
- A rota de ITCONT devolve informações públicas do evento, não listas de
  inscritos, folha ou dados operacionais.
- Upload de áudio tem limite de tamanho e de frequência; TTS e chat também têm
  limites.
- O handler global evita devolver stack trace ao cliente.
- A geocodificação de localização do palco é client-side e depende de serviços
  públicos; isso é distinto das rotas `/api`.
