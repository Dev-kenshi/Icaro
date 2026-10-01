# Ícaro — Assistente holográfico (Contador do Amanhã · UEFS)

**Site:** https://icaro-inteligencia-e-operacoes.replit.app/

Assistente virtual holográfico para o I ITCONT 2026, evento do Projeto de Extensão
Contador do Amanhã (UEFS). O Ícaro aparece em um palco 3D, ouve por voz ("Ok, Ícaro"),
responde perguntas sobre contabilidade, reforma tributária, IA e o evento — e fala
com a boca sincronizada e legendas.

## Estrutura

```
artifacts/icaro       Front-end (React + Vite) — palco, rosto, voz, microfone, legendas
artifacts/api-server  API (Express) — chat, voz TTS, login, base de conhecimento
icaro-cinema/cerebro  Cérebro local (banco de respostas) + testes
icaro-cinema/conhecimento  Base de conhecimento (busca BM25 local) + fontes .md + build.js
scripts               Validações e ferramentas
vendor/               Assets locais (modelos, fontes, libs)
```

## Como funciona uma pergunta

1. **Banco de respostas** (`icaro-cinema/cerebro`) — resposta imediata, sem IA (~5 ms).
2. **Base de conhecimento** (`icaro-cinema/conhecimento`) — responde direto ou envia
   referências para a IA responder em 3 a 5 frases.
3. **IA (Groq)** — só quando nenhuma das anteriores cobre o assunto.

Estatísticas ao vivo: `GET /api/ask/stats` (exige login).

## Rodar localmente

```bash
pnpm install
pnpm --filter @workspace/api-server run dev   # API
pnpm --filter @workspace/icaro run dev        # site
```

Segredos (nunca no código, nunca no front): `gpt` (OpenAI/Groq), `gemine` (Gemini),
`grok`, `SESSION_SECRET`, `ICARO_USER1_CODE`, `ICARO_ADMIN_CODE`.
Logins de palco: usuários `user1` e `admin` com seus códigos.

## Editar a base de conhecimento

1. Edite os arquivos em `icaro-cinema/conhecimento/fontes/*.md`.
2. Rode `node icaro-cinema/conhecimento/build.js` (gera `base.json`).
3. Copie para o servidor: `cp icaro-cinema/conhecimento/base.json artifacts/api-server/src/lib/conhecimento/base.json`.
4. Confira com `node icaro-cinema/conhecimento/avaliar.js` (deve dizer APROVADO).

Não edite os `.js` de `icaro-cinema` sem os testes:
`node icaro-cinema/cerebro/test.js` deve dizer TUDO OK.

## Validações (QA)

```bash
pnpm --filter @workspace/scripts run validate:all          # as 5 suítes abaixo
pnpm --filter @workspace/scripts run validate:auth         # 1. login, 401, cookie seguro, headers
pnpm --filter @workspace/scripts run validate:routing      # 2. banco → base → IA, resposta em ms
pnpm --filter @workspace/scripts run validate:stats        # 3. /api/ask/stats conta certo
pnpm --filter @workspace/scripts run validate:pipeline     # 4. voz: limite 8 s, reserva, voz local
pnpm --filter @workspace/scripts run validate:conhecimento # 5. testes do cérebro + segredos fora do front
pnpm --filter @workspace/scripts run validate:voice        # regras de voz (17 itens)
pnpm --filter @workspace/scripts exec tsx ./src/validate-wake.ts  # "Ok, Ícaro" (50 itens)
```

## Voz

- **Local (padrão):** Piper `pt_BR-faber-medium` em WebAssembly, no navegador. Sem chave,
  sem cota. O modelo (~63 MB) baixa na 1ª carga; antes de um evento, abra o palco uma
  vez e espere a aba Voz mostrar "pronta".
- **Servidor:** ElevenLabs via `/api/tts-ts` (modelo `eleven_flash_v2_5`, limite de 8 s);
  após o 1º 503/erro, as demais frases da resposta vão direto à voz reserva (Gemini TTS).

## Sincronização com o GitHub (Dev-kenshi/Icaro)

```bash
./scripts/src/git-sync.sh push "mensagem do commit"   # manda daqui para lá
./scripts/src/git-sync.sh pull                        # traz de lá para cá
```

O `push` puxa primeiro qualquer mudança nova do GitHub. Segredos ficam nos Secrets
do Replit e nunca entram no repositório.

## Regras de ouro

- Não quebre: rosto, voz, microfone, teclado, "Ativar áudio" e legendas.
- A boca só se move no estado `speaking`. Sem vídeo `.mp4` no rosto.
- Mudanças cirúrgicas; teste em 375 px e 1440 px.
- Nenhuma chave de API no front-end.
