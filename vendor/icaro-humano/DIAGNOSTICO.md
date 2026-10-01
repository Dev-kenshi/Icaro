# Diagnóstico do Ícaro: gravação de 30/09/2026 (2min56s)

Analisei o vídeo `screen-capture (6).webm` quadro a quadro, com a transcrição automática do áudio e a detecção de cortes no rosto.

## O que quebra a ilusão de pessoa real

| # | Problema | Evidência | Por que parece robô |
|---|---|---|---|
| 1 | **O rosto é um vídeo em loop picotado** | **96 cortes bruscos em 176 s**, um a cada 1,8 s (detecção de mudança de cena na região do rosto) | Cabeça "teleporta", olhos pulam de posição, expressão muda sem motivo |
| 2 | **A boca não segue a voz** | Os lábios mexem no ritmo do vídeo original, não das sílabas faladas; em "p/b/m" a boca fica aberta | É o erro que o cérebro humano detecta primeiro |
| 3 | **A boca mexe quando ele NÃO está falando** | Em "Pensando…" (≈16 s, 20 s, 72 s, 76 s, 128 s, 132 s) o rosto aparece de boca aberta | Parece que fala sem som |
| 4 | **Clarões de brilho aleatórios** | Flashes do efeito "circuito" do vídeo original em ≈76 s e ≈148 s | Chama a atenção para o artifício |
| 5 | **Olhar desviando e olhos fechando no meio da fala** | Olhando para o lado em ≈96 s e ≈136 s; olhos fechados em ≈44 s | Parece desatento, não conversa com a turma |
| 6 | **Legenda chega inteira** | A frase toda aparece de uma vez e fica ~16 s após o fim da fala (44→64 s) | Sem ligação visual entre palavra e boca |
| 7 | **Demora para responder** | Pergunta termina ≈70 s → fala começa ≈79 s; pergunta termina ≈128 s → fala ≈136 s. **~8–9 s de silêncio** | Pessoas respondem em < 1,5 s |
| 8 | **Pronúncia errada** | A voz diz "UFs" em vez de "UEFS" (transcrição automática em 105 s e 170 s) | Erro que a plateia da UEFS nota na hora |
| 9 | **Sem microexpressões controladas** | Piscadas e sobrancelhas só existem quando o clipe tem; nada reage à fala (pergunta, ênfase, pausa) | Rosto não "pensa" junto com o que diz |

## O que o pacote muda

| Problema | Correção | Arquivo |
|---|---|---|
| 1, 4, 5 | Um único rosto base em `<canvas>`, sem vídeo; movimento de cabeça por respiração, deriva orgânica e acenos ligados à fala | `avatar/avatar-engine.js` |
| 2 | 37 recortes reais da boca extraídos do vídeo e alinhados ao rosto; forma escolhida pelo tempo de cada letra que a ElevenLabs devolve; p/b/m fecham os lábios ≥ 80 ms; lábios antecipam o som em 45 ms, como em humanos | `tools/build_atlas.py`, `avatar/visemes-ptbr.js` |
| 3 | Boca travada fechada fora do estado "falando"; porta de silêncio fecha a boca se o áudio real estiver mudo | `avatar/avatar-engine.js` |
| 6 | Legenda palavra a palavra no mesmo relógio do áudio | `avatar/captions.js` |
| 7 | Resposta dividida em frases: a 1ª toca enquanto as outras são geradas; aceita streaming do LLM; cache de frases repetidas | `avatar/speech-player.js`, `server/tts-timestamps.js` |
| 8 | Dicionário de pronúncia (UEFS → "Uéfis"); a legenda mostra "UEFS" | `server/tts-timestamps.js`, `avatar/captions.js` |
| 9 | Piscadas de 170 ms (duplas às vezes, mais no início das falas e nas pausas), sobrancelha em perguntas e ênfases, aceno no fim de frase, inclinação ao ouvir, cabeça de lado ao pensar | `avatar/avatar-engine.js` |
