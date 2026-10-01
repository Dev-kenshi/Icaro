# Base de conhecimento do Ícaro

187 textos (~13 mil palavras) em 8 temas: fundamentos de contabilidade · demonstrações, análise e custos · profissão, normas, auditoria e perícia · tributário · reforma tributária · inteligência artificial · universidade, UEFS e carreira · Feira de Santana e Bahia.

## Arquivos
- `fontes/*.md`: os textos. **Edite aqui** (formato: `## id | título`, linha `p:` com perguntas separadas por `;`, `v: sim` se precisa conferir, e o texto).
- `base.json`: gerado pelo `build.js`; é o que o Ícaro carrega.
- `base.csv`: o mesmo conteúdo para abrir no Excel.
- `icaro-conhecimento.js`: busca local (BM25 + sinônimos), sem internet e sem token. Depende de `../cerebro/icaro-brain.js`.
- `avaliar.js` e `avaliar-cego.js`: medem a cobertura com perguntas inéditas.

## Comandos
```
node conhecimento/build.js         # depois de editar fontes/
node conhecimento/avaliar.js       # precisa dar APROVADO
node conhecimento/avaliar-cego.js
```

## Resultado medido (perguntas que não estão na base)
| | Bateria 1 (187) | Teste cego (73) |
|---|---|---|
| Trecho certo em 1º lugar | 92,0% | 84,9% |
| Trecho certo entre os 3 enviados à IA | 98,9% | 91,8% |
| Respondidas sem IA (0 token) | 74,3% | 63,0% |
| Respostas diretas erradas | 1 | 1 |
| Fora do tema recusadas corretamente | 6/6 | 5/5 |

A bateria 1 foi usada para ajustar os sinônimos; o teste cego é o número mais honesto.

## Como o Ícaro usa
`K.responder(pergunta)` devolve:
- `base`: fala o texto do trecho (0 token);
- `contexto`: manda `contexto` (até 3 trechos) ao LLM;
- `nada`: fora do tema, LLM sem contexto.

## Antes do evento
40 trechos estão marcados `v: sim` (nomes, datas, valores e regras que mudam). Confira em fonte oficial e rode `build.js`.
