Ícaro · base de conhecimento. Envie a pasta icaro-cinema/ (cerebro/ + conhecimento/). Não edite os .js; para mudar textos, edite conhecimento/fontes/*.md e rode node icaro-cinema/conhecimento/build.js.

No servidor, na rota de pergunta, nesta ordem:
1. Comandos.
2. IcaroBrain (cerebro/): mode local/puzzle → responde como já está (áudio pré-gravado + lacuna).
3. Se mode for hint ou llm:
   const K = require('./icaro-cinema/conhecimento/icaro-conhecimento').create(require('./icaro-cinema/conhecimento/base.json'));
   const k = K.responder(pergunta);
   - k.modo === 'base' → responda k.texto direto, sem IA (fale frase por frase);
   - k.modo === 'contexto' → chame a IA com o system do Ícaro + "Referências (use se pertinentes):\n" + k.contexto;
   - k.modo === 'nada' → chame a IA sem contexto, resposta curta.
4. Emita nos thoughts: "Base de conhecimento · <k.trechos[0].titulo> · confiança <k.confianca>".
5. Pré-gere o áudio dos textos da base (como no PROMPT_4), pela chave = id do trecho.

Aceite:
- node icaro-cinema/conhecimento/avaliar.js → APROVADO;
- "quem foi Maria Quitéria?" → resposta da base, sem IA;
- "qual a capital da Austrália?" → vai para a IA, nunca responde com trecho da base.
