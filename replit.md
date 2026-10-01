# Ícaro — Inteligência e Operações
# ÍCARO · Inteligência e Operações
Assistente holográfico do projeto Contador do Amanhã (Ciências Contábeis/UEFS, ITCONT 2026). Especialista em contabilidade, reforma tributária, IA, curso de Contábeis da UEFS e Feira de Santana. Deploy: icaro-inteligencia-e-operacoes.replit.app. Comunicação sempre em pt-BR.

## ⛔ Regras absolutas
1. **Não quebrar:** rosto, voz, microfone, teclado, "Ativar áudio" e legendas. Camadas novas só envolvem o que já existe.
2. **Chaves só no servidor:** `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` e a chave do LLM. Nunca no front.
3. **Rosto:** sem `.mp4` nem troca de clipes. A boca só mexe no estado `speaking`. Manter `previous_text`, divisão em frases e agendamento pelo `AudioContext` (é isso que garante a sincronia).
4. **Cérebro:** não editar `icaro-cinema/cerebro/icaro-brain.js`. Mudou o `banco-respostas.json`, rodar `node icaro-cinema/cerebro/test.js` (precisa dar TUDO OK). Exemplos ambíguos empatam em 1.00; diferencie as perguntas.
5. **Pensamentos reais:** os cartões holográficos mostram só eventos reais (`thoughts`). Nunca texto inventado.
6. **Antes de dizer "pronto":** testar em 375 px e 1440 px, console sem erros, 60 fps no desktop e 30 no celular, e respeitar `prefers-reduced-motion`.

## Fluxo de uma pergunta
voz/teclado → `POST /api/ask {text, sessionId}` → `IcaroBrain.answer()`:
- `local` (≥0.62): resposta do banco, sem LLM, áudio pré-gerado em `public/voz/<id>.mp3` + `.json`;
- `hint` (0.30–0.62): LLM recebe `r.context`;
- `llm`: LLM normal → cache pela chave `IcaroBrain.cacheKey(text)`.

LLM: máx. 220 tokens, temperatura 0.3, só as 4 últimas trocas, resposta falada em 2 a 4 frases (máx. 70 palavras), sem markdown.
Resposta da rota: `{mode, id, text, thoughts, gestures, cached}`. Estatísticas em `GET /api/ask/stats`. Curadoria em `/admin/cerebro` (`ADMIN_PASS`): promover perguntas que foram para o LLM ao banco.

## Barramento `icaroBus` (EventTarget)
`state` (idle|listening|thinking|speaking) · `transcript` · `thought {k,t,c}` · `answer:start` · `word {word,t}` · `answer:end` · `audio:level`. Todas as camadas visuais escutam só ele.

## Onde fica
- `icaro-humano/avatar/`: motor do rosto (`IcaroAvatar`, `IcaroSpeech`, `IcaroCaptions`, `IcaroVisemes`), servido em `/avatar/`.
- `icaro-humano/server/tts-timestamps.js`: rota `POST /api/tts-ts` (ElevenLabs com tempos por caractere).
- `icaro-cinema/cerebro/`: `banco-respostas.json` (80 intenções; campos `q`, `kw`, `a`, `g` = gestos, `follow`, `verificar`), `icaro-brain.js` e `test.js`.
- `icaro-cinema/PROMPT_*.md`: especificações completas (1 = visual cinema, 2 = modo palestra, 3 = cérebro).
- `public/models/icaro-body.glb`: avatar de corpo inteiro (blendshapes ARKit + animações Mixamo).

## Visual
- **Cores:** ciano `#39d5ff` · gelo `#bff4ff` · violeta `#8b7bff` (pensando) · âmbar `#ffb347` (alerta) · fundo `#000308`.
- **Fontes:** Rajdhani/Orbitron (títulos), JetBrains Mono (dados), Inter (legenda).
- **Camadas:** estrelas com paralaxe → grade no chão → anéis HUD (o externo vira equalizador na fala) → rosto com scanlines/fresnel → cartões de pensamento orbitando (no celular, coluna com no máx. 3) → waveform → legenda.
- **Desempenho:** um único `requestAnimationFrame`; qualidade cai sozinha se o frame passar de 22 ms; abertura de 3 s, uma vez por sessão.
- **Modos:** `?modo=palestra` (three.js, crossFade de 0,4 s, sem deslizar os pés, gestos guiados pelo texto, visemas PT-BR → ARKit; se falhar, volta ao rosto) e `?totem=1` (telão).

## Conferir antes do ITCONT
Entradas do banco com `verificar: true`: dados do curso de Contábeis da UEFS, MEI, IR até R$ 5 mil, ano-teste da reforma (2026), alíquota estimada, prefeito e população de Feira de Santana.

## Estilo do agente
Edição cirúrgica, sem reescrever o arquivo inteiro. Sem preâmbulo. Escopo fechado: se algo vizinho parecer necessário, 1 linha e pergunta. Ler só o que for relevante.
Reporte: `STATUS ✅/⚠️/❌ · Feito · Testado · Corrigido (arquivo:linha) · Riscos · Próximo passo`.
Todo erro novo vira uma linha em "Erros resolvidos", no formato `erro → causa → regra`.

## Erros resolvidos
- Voz dizia "UFs" → falta de pronúncia → dicionário UEFS→"Uéfis" no TTS.
- Boca mexia em "Pensando" e o rosto tinha 96 cortes em 176 s → clipes de vídeo → rosto só por canvas e boca só em `speaking`.
Ícaro explora arquivos CSV no navegador e oferece análises assistidas por Gemini, com Claude opcional.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/icaro run dev` — run the Ícaro web app
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required secret: `GEMINI_API_KEY` (the current `gemine` secret name is also accepted)
- Optional secret: `OPENAI_API_KEY` (the current `gpt` secret name is also accepted)
- Optional secret: `ANTHROPIC_API_KEY` — enables Claude

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

`artifacts/icaro/src/lib/dataset-context.tsx` parses CSV files in the browser. The app pages live in `artifacts/icaro/src/pages/`. Server-side AI calls are implemented in `artifacts/api-server/src/routes/ai.ts`, and `lib/api-spec/openapi.yaml` is the API contract source of truth.

## Architecture decisions

- CSV contents stay in browser memory; nothing is sent to an AI provider until the user submits a question.
- Provider credentials are read only by the API server and are never returned by the status endpoint.
- Gemini and ChatGPT use the user's direct API keys; Claude is optional until its own key is configured.

## Product

- Holographic stage at `/` (`artifacts/icaro/src/pages/stage.tsx`): the supplied `icaro-humano` canvas avatar replaces all facial video/boot loops. Original library and face/sprite assets are preserved in `vendor/icaro-humano/` and served from `public/avatar/`; integration adapters are in `src/lib/icaro-avatar.ts` and `speech.ts`. Keep the reduced face size and futuristic scene. `intro.mp4` remains only as the explicitly requested original presentation. Local voice commands include hora, data, temporizador, anotações, pesquisa, cálculo and apresentação.
- Neural voice: `POST /api/ai/tts` uses the engine in `artifacts/api-server/src/lib/tts.ts`. One voice family per server (ElevenLabs clone → Gemini → OpenAI, first configured wins, no cross-family fallback). Gemini rotates TTS models on 429, all with voice Charon (`GEMINI_TTS_VOICE`); audio cached in memory and on disk (`artifacts/api-server/.data/`, gitignored). Response headers `X-Speech-Provider/Voice/Model/Cache`. Optional secrets `ELEVENLABS_API_KEY` (paid plan; auto-clones `assets/voice/amostra_voz.mp3` from the jarvis-voice kit), `ELEVENLABS_VOICE_ID`, `ELEVENLABS_MODEL`.
- Client speech uses the supplied `IcaroSpeech` sentence queue, prefetch and AudioContext clock, with interruptible speech and word-by-word React captions. `POST /api/tts-ts` provides character timestamps only when ElevenLabs and a configured/saved voice ID are available; otherwise the client keeps the existing Gemini Charon `/api/ai/tts` voice with estimated mouth/word timings. No automatic browser-voice fallback. UEFS is pronounced “Uéfis” without changing its displayed spelling. Exact phoneme alignment and ≤1.5 s response latency are not guaranteed by Gemini/REST responses.
- Validations: `pnpm --filter @workspace/scripts run validate:voice`, `validate:voice-output` (10 headless Chromium checks of the audio output path with simulated WAV), `validate:hologram`, `exec tsx ./src/validate-wake.ts`, and `validate:e2e` (exactly 50: 10 real API checks + 40 headless Chromium scenarios with simulated microphone; uses a few real Groq/Gemini calls). Original supplied package tests: `node vendor/icaro-humano/test/validate.js`.
- Hands-free stage: browser SpeechRecognition starts automatically where supported and remains in standby until an utterance starting with “Ok, Ícaro”. Each activation authorizes one question, not an indefinitely open conversation; an empty activation expires silently after 12 s. Completion returns to standby. Playback, suppressed interim/final results and recent speech echoes never authorize a new response. “Stop, Ícaro” cancels playback/pending responses. Recognition reconnects after normal session ends; denied permissions stop retries. “Pausar microfone” disables recognition entirely. Permission and an open page are required; this is not an offline/local wake-word engine or guaranteed background service. The browser's speech service may process audio remotely; only activated questions reach the assistant API.
- Live captions show activated user transcripts and highlight the current spoken word, disappearing 2 s after audio ends. The canvas mouth stays closed when idle/listening/thinking or audio is silent. Futuristic scene uses original decorative code rain, holographic geometry, grid and cyan/green/amber lighting, with reduced-motion support.
- Portrait now uses a circular holographic frame (500 px cap, container-sized with phone edge clearance). Background is a procedural black/cyan-blue particle field based on the supplied video, not binary code rain. The expanded 960 px portrait has the original 720 px face composited at (120,120); matching atlas feature/anchor positions are translated without changing source sprite tile sizes. Original vendor/public/avatar remain unchanged. Rebuild with `pnpm --filter @workspace/scripts exec tsx ./src/build-avatar-portrait.ts attached_assets/icaro-portrait-extended.png`.
- Static labels, usage, microphone permissions/status and clock are in the native help dialog opened by `?`; live answer/transcription/error captions remain on stage. Enter, ArrowRight and PageDown activate one question when the page has focus, excluding editable fields, modifiers, repeated/composing keys and open panels/dialogs. Focused buttons retain native Enter; presenter arrows work even after clicking the microphone. Shortcut checks: `pnpm --filter @workspace/scripts exec tsx ./src/validate-stage-shortcuts.ts`.
- Microphone recovery: blocked/unsupported capture opens the help dialog once rather than failing silently. Manual activation waits for actual recognition `onstart` before arming the question window; ignore callbacks from obsolete recognizers. Frame-denied microphone policy offers a new-tab link, never a fake active-listening state. Accept dotted/spaced “O.K.”/“O K” transcriptions, not ambiguous ordinary “O que” questions. Wake regression checks: `pnpm --filter @workspace/scripts exec tsx ./src/validate-wake.ts`.
- Provider configuration: the user confirmed that the secret named `grok` belongs to **Groq** (`console.groq.com`), not Grok/xAI. Groq is the default text provider in Stage and Assistant; keep `grok` as a supported key alias. Gemini Charon remains the voice service, unchanged. Text quota and voice quota are independent; never substitute a paid provider or another voice silently.
- Groq validation: `pnpm --filter @workspace/scripts run validate:groq` runs exactly 49 local checks and one authenticated live chat through the app proxy, without synthesizing speech. It reports failures honestly and uses some Free Tier text quota. Response cleanup removes Unicode dashes while preserving ASCII technical/URL hyphens, negative numbers, numeric ranges and paragraph breaks.
- Ten grouped logic/error validations: `pnpm --filter @workspace/scripts exec tsx ./src/validate-stage.ts`. Covers ambient silence, empty activation expiry, one question per activation, playback echo, stop/re-arm, silent mouth, word timelines/pronunciation, canvas integrity/framing, invalid HTTP inputs, and TypeScript checks. Passing these does not prove acoustic microphone accuracy or exact equivalence to prerecorded demonstration audio/video.
- Import and inspect CSV data locally, with row, column, completeness, and numeric summaries (`/analysis`).
- Ask Gemini or ChatGPT questions about the current dataset or general analysis topics; the stage sends `persona: 'icaro'` so answers use the ÍCARO classroom persona.
- `/api/ai/chat` is rate-limited in memory (30 requests per 10 minutes per IP).

## User preferences

No additional project-specific preferences recorded.

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
