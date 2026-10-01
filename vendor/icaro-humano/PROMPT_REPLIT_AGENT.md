# PROMPT PARA O REPLIT AGENT: Ícaro com rosto humano

> Copie tudo abaixo da linha e cole no Replit Agent, com a pasta `icaro-humano/` já enviada para a raiz do projeto.

---

Você vai integrar ao projeto **Ícaro** (holograma assistente do projeto Contador do Amanhã / UEFS) o pacote que está em `icaro-humano/`. O objetivo é que o rosto pareça uma pessoa real falando:
- lábios sincronizados com cada sílaba da voz;
- zero cortes de vídeo;
- piscadas, sobrancelhas e movimentos de cabeça naturais;
- boca parada quando ele não fala;
- legenda palavra a palavra;
- resposta rápida.

Leia `icaro-humano/DIAGNOSTICO.md` antes de começar: ele lista os 9 defeitos medidos na versão atual.

## Regras
- **NÃO** reescreva os arquivos de `icaro-humano/avatar/` nem as imagens de `icaro-humano/avatar/assets/`. Use-os como biblioteca. Se algo precisar mudar, mude na integração.
- **NÃO** mantenha nenhum vídeo `.mp4` / clipe em loop para o rosto. Remova toda a lógica que troca, embaralha ou corta clipes do rosto. O rosto passa a ser só o `<canvas>` do `IcaroAvatar`.
- **NÃO** anime a boca fora do estado `speaking`. Em "Pensando…", "Ouvindo…" e em espera a boca fica fechada; quem cuida disso é o motor.
- **NÃO** exponha `ELEVENLABS_API_KEY` no front. A voz só passa pela rota do servidor.
- **NÃO** remova o envio de `previous_text`, a divisão em frases nem o agendamento pelo `AudioContext`: é isso que garante a sincronia.
- Mantenha a identidade visual atual: fundo preto com partículas, HUD "ÍCARO · estado", botão do microfone, "Toque para falar · Digitar".

## Passo 0: mapear o projeto (antes de editar)
Encontre e anote:
1. onde o rosto é desenhado hoje (`<video>`, clipes, lista de trechos, troca aleatória);
2. onde a voz é gerada e tocada (chamada ElevenLabs ou outro TTS, `<audio>`, `new Audio`);
3. onde chega a resposta do LLM (streaming ou texto pronto);
4. onde os estados do HUD são trocados (ON-LINE, OUVINDO, PENSANDO, FALANDO);
5. onde a legenda é escrita;
6. se o servidor é Express, Fastify, Next ou `http` puro.

## Passo 1: servir os arquivos do avatar
Sirva `icaro-humano/avatar/` como estático em **`/avatar/`**:
- Express: `app.use('/avatar', express.static(path.join(__dirname, 'icaro-humano/avatar'), { maxAge: '1d' }))`
- Vite/React: copie para `public/avatar/`.
- Next: copie para `public/avatar/`.

Confira que `GET /avatar/assets/atlas.json` responde 200 e `mouth.webp` vem como `image/webp`.

## Passo 2: rota de voz com tempos por caractere
Registre **`POST /api/tts-ts`** usando o handler pronto:
```js
const { createTtsTimestampsHandler } = require('./icaro-humano/server/tts-timestamps');
app.post('/api/tts-ts', express.json({ limit: '16kb' }), createTtsTimestampsHandler());
```
- Em ESM use `createRequire` ou importe via `import pkg from './icaro-humano/server/tts-timestamps.js'`.
- Em Next (route handler), adapte: leia `await req.json()` e reproduza o mesmo corpo/resposta.
- Secrets usados: `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` (a mesma voz de hoje) e, opcionalmente, `ELEVENLABS_MODEL`. Use `eleven_multilingual_v2` para a melhor naturalidade ou `eleven_flash_v2_5` se a latência for prioridade.
- Se já existir limite de requisições no projeto, aplique também nesta rota.

## Passo 3: trocar o rosto
No lugar do vídeo do rosto, no mesmo container e na mesma posição/tamanho:
```html
<link rel="stylesheet" href="/avatar/avatar.css">
<canvas id="icaroFace" class="icaro-face" aria-label="Rosto do Ícaro"></canvas>
<script src="/avatar/visemes-ptbr.js"></script>
<script src="/avatar/avatar-engine.js"></script>
<script src="/avatar/speech-player.js"></script>
<script src="/avatar/captions.js"></script>
```
Em React, carregue os 4 scripts uma vez (ex.: `useEffect` com `<script>` dinâmico, ou `index.html`) e use `window.IcaroAvatar`, `window.IcaroSpeech`, `window.IcaroCaptions` e `window.IcaroVisemes`.

```js
const face = new IcaroAvatar(document.getElementById('icaroFace'), { assets: '/avatar/assets/' });
await face.ready;
```
- O canvas já usa `mix-blend-mode: screen`, então o preto fica transparente sobre as partículas.
- Ajuste só largura/altura no CSS do projeto. Não aplique `transform` animado no canvas, porque o motor já move a cabeça.

## Passo 4: estados
Ligue o HUD ao motor:

| Evento atual | Chamada |
|---|---|
| microfone abriu / "Estou ouvindo…" | `player.stop(); face.setState('listening')` |
| usuário terminou, aguardando o LLM ("Pensando…") | `face.setState('thinking')` |
| primeira frase começou a tocar | automático (`IcaroSpeech` chama `face.speak`) |
| terminou de falar | automático (`onEnd`) → HUD "ON-LINE" + `face.setState('idle')` |

O HUD "FALANDO" deve acender no `onSentence` da primeira frase, não antes: assim o texto nunca aparece antes da voz.

## Passo 5: voz sincronizada (substitui o player atual)
```js
const cap = new IcaroCaptions(document.getElementById('ID_DA_LEGENDA_ATUAL'));
const player = new IcaroSpeech({
  avatar: face,
  endpoint: '/api/tts-ts',
  onSentence: (text, tl, clock) => { cap.sentence(text, tl); hud('FALANDO'); },
  onWord: cap.word,
  onEnd: () => { cap.end(); hud('ON-LINE'); face.setState('idle'); },
  // opcional: reserva se /api/tts-ts falhar. Deve devolver ArrayBuffer de áudio do TTS atual.
  fallback: async text => (await fetch('/ROTA_TTS_ATUAL', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) })).arrayBuffer(),
});
```
- Chame `player.unlock()` no primeiro toque/clique do usuário (botão do microfone ou "Digitar"), por causa da política de autoplay.
- **Resposta pronta:** `await player.say(resposta)`.
- **Resposta em streaming (preferível):** a cada pedaço do LLM chame `player.feed(pedaco)`, e no fim `await player.flush()`. A primeira frase começa a tocar enquanto o resto ainda está sendo gerado.
- Remova o `<audio>`/`new Audio()` antigo da fala do Ícaro. Não toque a mesma fala duas vezes.

## Passo 6: interrupção (barge-in)
Quando o usuário tocar no microfone ou começar a falar enquanto o Ícaro fala: `player.stop()` e `face.setState('listening')`. O corte precisa ser imediato, sem terminar a frase.

## Passo 7: latência (meta: voz em ≤ 1,5 s após o fim da pergunta)
1. Use streaming no LLM e `player.feed()`.
2. Encerre o reconhecimento de voz ao detectar ~700 ms de silêncio (não espere timeout longo).
3. Mantenha o prompt de sistema pedindo respostas de 2 a 5 frases curtas, sem markdown, listas ou emojis.
4. Mostre "Pensando…" no máximo até a primeira frase começar.
5. Meça e mostre no console `[latência] pergunta→voz: X ms`.

## Passo 8: pronúncia
Siglas que a voz erra vão no dicionário `PRONUNCIATION` de `icaro-humano/server/tts-timestamps.js`, ou via `createTtsTimestampsHandler({ pronunciation: { SIGLA: 'grafia falada' } })`, sempre com UMA palavra por grafia. Para a legenda mostrar a sigla certa, repita o par invertido em `new IcaroCaptions(el, { display: { 'grafia falada': 'SIGLA' } })`. UEFS já vem configurada.

## Passo 9: rodar as validações do pacote
```
node icaro-humano/test/validate.js
```
Todas devem passar. Depois abra `/` e confira os critérios abaixo.

## Critérios de aceite
Verifique cada item e corrija até todos passarem.

**Rosto**
1. Não existe mais nenhum `<video>` de rosto na página (DevTools → Elements).
2. Em 3 minutos de uso, zero cortes/saltos de cabeça.
3. Em "Pensando…" e "Ouvindo…" a boca fica fechada o tempo todo.
4. Em espera, o rosto respira (movimento leve), pisca a cada 2–6 s e nunca congela.
5. Nenhum clarão ou mudança brusca de brilho.
6. O olhar fica para a frente (nada de olhar para o lado no meio da fala).
7. Nenhuma linha, borda ou "lábio duplo" visível na região da boca, inclusive em tela cheia.

**Sincronia**
8. Nas palavras "papai", "bem", "Rômulo", "também" e "bom", os lábios se fecham nos p/b/m (exceto o "m" final nasal de "também").
9. Vogais "a" abrem a boca; "o"/"u" arredondam; "i"/"e" esticam.
10. A boca começa a abrir levemente ANTES do som (lábios antecipam ~45 ms), nunca depois.
11. A boca fecha no mesmo instante em que o áudio termina, sem ficar mexendo após o fim.
12. Em pausas de vírgula/ponto a boca fecha.
13. Com a aba em segundo plano e de volta, a sincronia continua certa.

**Microexpressões**
14. Pergunta ("…?") levanta as sobrancelhas.
15. Fim de frase gera um aceno leve.
16. Ao ouvir, a cabeça inclina/aproxima e acena de vez em quando.
17. Ao pensar, a cabeça pende levemente de lado.

**Legenda**
18. Cada palavra acende no momento em que é falada.
19. "UEFS" aparece escrito "UEFS" e é falado corretamente (não "UFs").
20. A legenda some ~2 s após o fim da fala.

**Voz e fluxo**
21. Voz em ≤ 1,5 s após o fim da pergunta (medido no console).
22. Respostas longas não travam: a 1ª frase toca enquanto as outras são geradas, sem buraco entre frases (> 0,3 s).
23. Tocar no microfone durante a fala corta a voz e a boca na hora.
24. Duas perguntas seguidas não sobrepõem vozes.
25. Se `/api/tts-ts` falhar, a reserva fala e a boca segue o volume (sem travar a interface).
26. Nenhuma chave de API aparece no código do front nem nas respostas da rede.

**Desempenho e compatibilidade**
27. 60 fps estáveis em notebook comum (Performance → sem long tasks > 50 ms em loop).
28. Funciona no Chrome/Edge desktop e no Chrome Android; no iPhone, após o primeiro toque.
29. Nenhum erro no console durante 5 minutos de uso.

## Se algo não funcionar
- **Boca não mexe:** `/api/tts-ts` está 503? Faltam Secrets. Confira `face.state` = `speaking` durante a fala.
- **Boca adiantada/atrasada:** verifique se alguém está tocando o áudio por fora do `IcaroSpeech`. O áudio precisa sair do `AudioContext` do player.
- **Rosto não aparece:** caminho `assets` errado; abra `/avatar/assets/atlas.json`.
- **Sem som no iPhone:** `player.unlock()` precisa ser chamado dentro do clique.

## Opcional (nível 2): Simli
Se quiser boca 3D gerada por IA (Simli) além deste motor, mantenha este pacote como reserva automática. Não substitua sem manter todos os critérios acima.
