# ÍCARO · Inteligência e Operações

Assistente holográfico de inteligência artificial do curso de **Ciências Contábeis da UEFS** (Universidade Estadual de Feira de Santana), criado no **Projeto de Extensão Contador do Amanhã** para a **I ITCONT 2026**, a Imersão Tecnológica Contábil.

O Ícaro aparece num palco holográfico, ouve perguntas por voz ou teclado, responde falando com a boca sincronizada à voz e é especialista em contabilidade, Reforma Tributária, inteligência artificial e no curso de Contábeis da UEFS.

> **ÍCARO** = **I**nteligência, **C**iência de dados, **A**nálise de dados, **R**esultados e **O**perações.

**No ar:** https://icaro-0q50.onrender.com (Render) · https://icaro-inteligencia-e-operacoes.replit.app (Replit)

---

## Funcionalidades

- **Palco holográfico** (`/`): rosto em canvas com sincronia labial por visemas em português, piscadas e microexpressões, legendas palavra a palavra e fundo animado (Terra, galáxia e sistema solar). Tem dois avatares, o **Ícaro Feirense** e o **Ícaro clássico**, e posição e tamanho ajustáveis.
- **Voz natural:** síntese pelo ElevenLabs (voz clonada, com tempos por caractere) ou pelo Gemini. "UEFS" é pronunciado "Uéfis".
- **Escuta sem as mãos:** diga **"Ok, Ícaro"** e faça a pergunta. "Stop, Ícaro" interrompe. Também é possível usar o modo Whisper no servidor ou digitar.
- **Cérebro em camadas:** responde primeiro pelo banco local, sem gastar API, e só consulta a IA online quando precisa (detalhes abaixo).
- **857 respostas prontas** em contabilidade, matemática, pesquisa, universidades, IA, história e perguntas gerais.
- **Cálculos contábeis exatos:** custo de funcionário CLT e lançamento da folha, com **painel holográfico de débitos e créditos**.
- **Comandos locais:** hora, data, temporizador, anotações, cálculos, pesquisa na web e reprodução da apresentação original.
- **Análise de dados** (`/analysis`): importação de CSV no navegador, com resumo de linhas, colunas e números e perguntas à IA sobre os dados.
- **Curadoria** (`/admin/cerebro`): perguntas que foram para a IA viram candidatas que o admin pode aprovar para o banco.
- **Login** com dois perfis (`admin` e `user1`) e sessão assinada por cookie.

## Como o Ícaro responde

```
voz / teclado
   │
   ├─ comando local? (hora, temporizador, "calcule 30% de 200"...) → responde no navegador
   │
   └─ POST /api/ai/chat/stream
         │
         ├─ cálculo de folha (custo de funcionário / lançamento)  → resposta exata + painel
         ├─ L1  cache de respostas anteriores
         ├─ L2  conhecimento aprovado na curadoria
         ├─ L3  busca semântica (embeddings multilingual-e5-small)
         ├─ L4  banco de conhecimento por gatilhos (857 respostas)
         ├─ L5  IA compõe a resposta usando só trechos do banco
         └─ L6  IA online (Groq → Gemini → outros configurados)
```

As camadas L1 a L4 respondem **sem gastar tokens**. Perguntas sobre lei, alíquota, "hoje", "atual" ou notícia vão sempre para a IA online, porque dependem de informação que muda.

## Estrutura

```
artifacts/
  api-server/            API Express 5 (Node 24)
    src/routes/          ai (chat, stream, TTS), auth, stt, tts-timestamps, cosmos, health
    src/lib/
      cerebro-camadas.ts camadas L1–L6, cache e curadoria
      knowledge-bank.ts  banco núcleo (evento ITCONT) + carregador dos bancos
      conhecimento/      bancos por área (contabilidade, matemática, pesquisa...)
      calculo-folha.ts   custo de funcionário e lançamento da folha
      provider-router.ts roteamento entre provedores de IA
      tts.ts             síntese de voz (ElevenLabs / Gemini / OpenAI)
  icaro/                 frontend React + Vite + Tailwind
    src/pages/stage.tsx  palco holográfico
    src/components/stage/ rosto, retratos, painel financeiro, ajustes
    src/lib/             fala, microfone, comandos locais, avatares
    public/avatar/       motor do rosto (icaro-humano)
lib/                     contrato OpenAPI, cliente React e schemas Zod gerados
scripts/src/             validadores (voz, holograma, Groq, e2e, wake word...)
vendor/icaro-humano/     pacote original do motor de rosto (não editar)
render.yaml              Blueprint de deploy no Render
```

## Rodando localmente

Requisitos: **Node 24** e **pnpm 10**.

```bash
pnpm install
pnpm --filter @workspace/api-server run dev   # API
pnpm --filter @workspace/icaro run dev        # frontend (precisa de PORT e BASE_PATH)
```

Build de produção, igual ao do Render:
```bash
PORT=10000 BASE_PATH=/ pnpm --filter @workspace/icaro run build
pnpm --filter @workspace/api-server run build
node --enable-source-maps artifacts/api-server/dist/index.mjs
```
Em produção, a API também serve o frontend buildado (`artifacts/icaro/dist/public`), então site e `/api` ficam no mesmo endereço.

## Variáveis de ambiente

Todas ficam **só no servidor**, nunca no frontend.

| Variável | Uso |
|---|---|
| `SESSION_SECRET` | Assinatura da sessão de login (obrigatória) |
| `ICARO_ADMIN_CODE` ou `ICARO_ADMIN_PASSWORD` | Senha do usuário `admin` |
| `ICARO_USER1_CODE` ou `ICARO_USER1_PASSWORD` | Senha do usuário `user1` |
| `GROQ_API_KEY` ou `grok` | IA de texto padrão (Groq) |
| `GEMINI_API_KEY` ou `gemine` | IA e voz Gemini |
| `OPENAI_API_KEY` ou `gpt` | OpenAI (opcional) |
| `ANTHROPIC_API_KEY` ou `CLAUDE_API_KEY_ROMULA` | Claude (opcional) |
| `ELEVENLABS_API_KEY` | Voz ElevenLabs |
| `ELEVENLABS_VOICE_ID` | ID da voz do Ícaro. Sem ele, a voz é clonada de novo a cada reinício |
| `ICARO_DATA_DIR` | Pasta de cache e curadoria (padrão `artifacts/api-server/.data`) |

## Deploy

- **Render:** o `render.yaml` cria um Web Service Node que builda frontend e API com `npx pnpm@10.18.0` (o `corepack` falha porque o `/usr/bin` do Render é somente leitura). Todo push no `main` gera deploy automático. A checagem de saúde é `GET /api/healthz`. No plano free, o serviço dorme após 15 minutos sem uso, e o primeiro acesso leva cerca de 50 s.
- **Replit:** o workspace `@emanuelph14/Icaro-Inteligencia-e-Operacoes` sincroniza com este repositório. Antes de editar pelo Replit, faça `git pull` para não sobrescrever commits feitos por aqui.

## Testes e validações

```bash
pnpm run typecheck                                        # TypeScript de todo o monorepo
pnpm --filter @workspace/scripts run validate:cerebro-200                # 200 casos do cérebro
pnpm --filter @workspace/scripts exec tsx ../artifacts/api-server/src/validate-conhecimento.ts  # bancos
pnpm --filter @workspace/scripts run validate:hologram   # rosto, boca e retratos
pnpm --filter @workspace/scripts run validate:voice      # pipeline de voz
pnpm --filter @workspace/scripts run validate:groq       # 49 checagens + 1 chamada real
pnpm --filter @workspace/scripts run validate:e2e        # 50 cenários (API real + Chromium)
pnpm --filter @workspace/scripts exec tsx ./src/validate-wake.ts         # "Ok, Ícaro"
```

## Sincronização Replit ⇄ GitHub (Sync Doctor)

Quando o projeto é editado no Replit e fora dele ao mesmo tempo, use o **Sync Doctor**:

```bash
pnpm --filter @workspace/scripts run sync:check   # 100 validações, não altera nada
pnpm --filter @workspace/scripts run sync:fix     # sincroniza com segurança
pnpm --filter @workspace/scripts run sync:fix -- --abort   # desfaz um merge pendente
```

**As 100 validações cobrem:**
- ambiente Git (12);
- credenciais e conexão com o GitHub (10);
- divergência entre os lados, incluindo merge simulado (9);
- integridade (19): marcadores de conflito, JSON, lockfile, chaves expostas e arquivos indevidos;
- funcionalidades entregues que não podem sumir (30);
- comportamento real (20): cálculos da folha e respostas do banco.

**O que o `sync:fix` faz:**
1. Guarda as alterações locais num commit (sem `.log`, `.env` nem `.sync-out/`).
2. Busca o GitHub. Se a credencial do workspace falhar, usa o secret `GITHUB_TOKEN` só naquele comando, sem gravá-lo.
3. Junta os dois lados sem descartar nada. Em conflito, para e lista os arquivos.
4. **Desfaz o merge** se ele apagaria alguma funcionalidade entregue.
5. Envia sem force-push. Se o `main` recusar, envia para um ramo `sync-AAAA-MM-DD`.
6. Sem nenhuma credencial, exporta as alterações em `.sync-out/` (patches e bundle) para aplicar do outro lado.

Códigos de saída: `0` tudo certo · `1` erros a revisar · `2` conflito ou merge desfeito · `3` sem acesso ao GitHub.

## Adicionando conhecimento

Cada área tem um arquivo em `artifacts/api-server/src/lib/conhecimento/`. Uma entrada tem este formato:

```ts
{
  id: "cont-partidas-dobradas",
  category: "contabilidade",
  title: "Método das partidas dobradas",
  triggers: [["partidas dobradas"], ["debito", "credito", "igual"]],
  answer: "Pelo método das partidas dobradas, todo lançamento tem ...",
}
```

- **Gatilhos:** a pergunta casa quando **todos** os termos de um gatilho aparecem nela. Escreva os termos sem acento e em minúsculas. Cada gatilho precisa de 2 palavras de conteúdo, ou ser uma sigla conhecida (DRE, EBITDA...), ou uma frase de 3 palavras ou mais.
- **Palavras proibidas nos gatilhos:** lei, alíquota, atual, hoje e notícia. Essas perguntas são da IA online.
- **Respostas:** 2 a 5 frases faladas, sem markdown.

Rode o validador depois de editar. Ele aponta gatilhos fracos, duplicados e respostas fora do padrão.

## Roteiro da abertura (I ITCONT 2026)

1. O vídeo de abertura roda com as luzes apagadas.
2. O Ícaro fala, e as luzes acendem.
3. **"Ícaro, dê as boas-vindas ao público"**: discurso de abertura.
4. **"Você vai substituir o contador?"**: não; o contador precisa de um assistente que otimize os processos contábeis.
5. **"Calcule o custo de um funcionário de 2.500"**: R$ 4.055,14 por mês no Lucro Presumido ou Real, ou R$ 3.225,00 no Simples, com cada encargo detalhado.
6. **"Faça o lançamento contábil da folha desse funcionário"**: lançamentos falados e painel de débitos e créditos fechando em R$ 4.055,14.

## Créditos

**Desenvolvedor do projeto:** Emanuel Macêdo Luz

Projeto de Extensão **Contador do Amanhã**, curso de Ciências Contábeis da **UEFS**, Feira de Santana, Bahia. Motor de rosto `icaro-humano` em `vendor/`. Desenvolvido com apoio do Replit Agent e do Claude.
