# Pacote Ícaro Humano

Correções para o rosto do Ícaro parecer uma pessoa real: leitura labial sílaba a sílaba, zero cortes, microexpressões e legenda sincronizada.

## Como usar
1. Envie a pasta `icaro-humano/` para a raiz do seu Repl.
2. Abra o **Replit Agent** e cole o conteúdo de [`PROMPT_REPLIT_AGENT.md`](PROMPT_REPLIT_AGENT.md).
3. Confirme que os Secrets `ELEVENLABS_API_KEY` e `ELEVENLABS_VOICE_ID` existem.
4. Ao final, rode `node icaro-humano/test/validate.js`.

## Testar antes de integrar
```
node icaro-humano/demo/server.js
```
Abra a URL e clique **Simular sem chave**: a boca segue o texto e a legenda acende palavra a palavra, mesmo sem voz. Com os Secrets configurados, **Falar (voz real)** usa a sua voz ElevenLabs.

## O que tem aqui
| Arquivo | Função |
|---|---|
| `DIAGNOSTICO.md` | os 9 defeitos medidos na gravação (96 cortes em 3 min, boca mexendo ao pensar, 8 s de atraso, "UFs"…) |
| `PROMPT_REPLIT_AGENT.md` | instruções passo a passo + 29 critérios de aceite |
| `avatar/avatar-engine.js` | rosto em canvas: boca, piscadas, sobrancelhas, respiração, acenos |
| `avatar/visemes-ptbr.js` | letras do português → formas de boca (dígrafos, nasais, p/b/m) |
| `avatar/speech-player.js` | voz por frases, agendada no mesmo relógio da boca; streaming; interrupção |
| `avatar/captions.js` | legenda palavra a palavra |
| `avatar/assets/` | rosto base + 37 bocas + piscadas extraídos do vídeo original |
| `server/tts-timestamps.js` | rota `/api/tts-ts` (ElevenLabs com tempo por caractere, cache, pronúncia) |
| `tools/build_atlas.py` | refaz os recortes a partir de outro vídeo |
| `test/validate.js` | validações automáticas |

## Refazer os recortes do rosto (opcional)
```
pip install mediapipe opencv-python-headless numpy
python icaro-humano/tools/build_atlas.py "video_do_holograma.mp4"
```
