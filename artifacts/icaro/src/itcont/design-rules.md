# 100 critérios visuais do site público do ITCONT

Direção: vitrine digital inspirada em páginas de jogos para PC — superfícies escuras azul-carvão, ciano controlado, módulos escaneáveis e ações diretas. Não reutilizar logotipos, textos, capturas ou composição proprietária da Steam. Manter dados oficiais, marca UEFS/ITCONT, inscrição e navegação atuais.

## Direção de arte e identidade

01. Usar o azul-carvão como superfície principal; não voltar ao fundo branco como padrão.
02. Reservar o ciano para ação primária, foco e estado ativo.
03. Usar prata somente em detalhes de identidade, nunca como brilho em todo o texto.
04. Manter nomes, datas, local, convidados, preços e horários derivados de `dados.ts`.
05. Preservar o logo oficial e usar apenas imagens públicas já aprovadas.
06. Não copiar o logotipo, ícones, ilustrações nem o layout exato da Steam.
07. Usar uma grade de fundo apenas como textura de baixa intensidade.
08. Limitar o ruído/grão de tela a uma camada quase imperceptível.
09. Manter luzes e gradientes atrás do conteúdo, sem competir com texto.
10. Usar contraste alto entre o plano de fundo, cartões e conteúdo principal.

## Cor e superfície

11. Obter cores de interface somente dos tokens de `tokens.css`.
12. Manter texto principal com contraste mínimo WCAG AA de 4,5:1.
13. Manter foco e limites de componentes com contraste mínimo de 3:1.
14. Reservar o amarelo para alertas de evento ao vivo.
15. Distinguir cartões do fundo por tom, borda e profundidade, não por cor isolada.
16. Preferir bordas azul-acinzentadas finas a contornos luminosos permanentes.
17. Usar sombra escura curta para separar cartões do plano de fundo.
18. Usar brilho ciano somente em ações e estados interativos.
19. Evitar superfícies translúcidas sob textos longos.
20. Preservar legibilidade quando o fundo da Terra passar atrás de uma seção.

## Tipografia e conteúdo

21. Manter até três famílias tipográficas já carregadas pelo site.
22. Usar a família de títulos para títulos, sem afetar a legibilidade dos parágrafos.
23. Manter corpo de texto em pelo menos 16 px em telas comuns.
24. Usar rótulos em caixa alta somente em metadados curtos.
25. Limitar o rastreamento amplo a siglas e micro-rótulos.
26. Evitar parágrafos com mais de 70 caracteres médios por linha.
27. Usar títulos com hierarquia clara: um H1, títulos H2 de seção e H3 de cartão.
28. Evitar quebrar palavras no meio em títulos.
29. Usar números tabulares para horários e contagens quando disponíveis.
30. Nunca reduzir informações oficiais para criar espaço decorativo.

## Composição da página

31. Alinhar conteúdo de cada seção à mesma largura máxima.
32. Manter margem horizontal suficiente para leitura em telas grandes.
33. Usar uma grade consistente baseada nos espaçamentos existentes.
34. Separar visualmente hero, agenda, convidados, local, inscrição e FAQ.
35. Manter áreas de respiro ao redor dos títulos de seção.
36. Evitar cartões aninhados sem uma função visual clara.
37. Alinhar os cartões de uma mesma grade pela borda e linha de base.
38. Usar uma coluna principal no celular e no tablet estreito.
39. Evitar que elementos decorativos capturem cliques ou foco.
40. Preservar rolagem natural e âncoras de cada seção.

## Hero e descoberta do evento

41. Apresentar o nome oficial como o principal ponto de entrada visual.
42. Manter data, hora e local visíveis sem exigir rolagem no desktop.
43. Apresentar a inscrição oficial como a ação de maior destaque.
44. Oferecer a programação como ação secundária no hero.
45. Tratar o cartão de local/ingresso como módulo informativo, não como anúncio.
46. Manter o logo oficial em proporção e resolução corretas.
47. Não inventar trailer, avaliação, preço, gênero ou plataforma para o evento.
48. Usar o selo “gratuita · presencial” como metadado simples.
49. Equilibrar o hero para que texto e cartão tenham pesos visuais próximos.
50. Fazer o hero funcionar em altura baixa sem cortar inscrição ou local.

## Cartões e componentes

51. Usar cantos discretos, sem arredondamentos exagerados.
52. Manter padding interno consistente entre cartões equivalentes.
53. Diferenciar hover com borda, sombra ou pequeno deslocamento.
54. Não depender de hover para revelar informação essencial.
55. Usar estados ativos para indicar o dia selecionado na agenda.
56. Destacar a sessão atual com cor de alerta e texto explícito.
57. Exibir todas as fotos de convidados em molduras 4:5, sem cortes e com orientação original.
58. Preservar alternativa com iniciais quando uma foto falhar.
59. Tornar o FAQ fácil de escanear e abrir por teclado.
60. Manter o mapa legível sem sequestrar a rolagem da página.

## Agenda e inscrição

61. Mostrar data e intervalo de horário em cada sessão.
62. Manter o fuso de Brasília junto a informação de horário.
63. Preservar os links de Google Agenda e arquivos `.ics`.
64. Diferenciar ação principal de ações secundárias por cor e peso.
65. Manter a inscrição apontando exclusivamente para a página oficial.
66. Manter categorias e preços de inscrição conforme a fonte oficial.
67. Mostrar confirmação visual após copiar ou compartilhar o link.
68. Usar rótulos visíveis ou acessíveis em campos e botões.
69. Não enviar ou persistir o nome digitado no cartão promocional.
70. Manter a nota de que o cartão compartilhável não substitui a inscrição.

## Interação e acessibilidade

71. Garantir foco visível para todos os elementos interativos.
72. Manter alvos de toque com pelo menos 44 px de altura.
73. Não remover indicadores nativos sem fornecer alternativa visível.
74. Preservar a navegação por teclado nos dias da agenda.
75. Evitar animações que pisquem ou mudem o layout de forma abrupta.
76. Respeitar `prefers-reduced-motion` em animações e transições.
77. Comunicar estados ao vivo com texto além da cor.
78. Manter nomes acessíveis para navegação e ícones sem texto.
79. Não usar apenas posição, cor ou movimento para transmitir informação.
80. Manter o link para pular ao conteúdo antes da navegação repetida.

## Estados e resposta visual

81. Distinguir hover, foco, ativo, desabilitado e selecionado.
82. Manter botões desabilitados legíveis e com cursor adequado.
83. Evitar animações de hover em telas sem ponteiro fino.
84. Manter transições curtas e funcionais, sem atrasar a ação.
85. Exibir o progresso de leitura sem cobrir conteúdo.
86. Apresentar a chamada principal e os convidados oficiais já na introdução.
87. Manter o QR code da introdução acessível e ligado ao endereço público do evento.
88. Exibir o resumo oficial junto à chamada, sem substituir dados ou links do evento.
89. Não alternar painéis automaticamente nem ocultar conteúdo essencial.
90. Manter versões de impressão sem fundos pesados nem elementos fixos.

## Responsividade e robustez

91. Testar os quatro modos existentes: celular, celular deitado, tablet e desktop.
92. Evitar rolagem horizontal acidental em todas as larguras.
93. Manter nomes e botões legíveis em telas estreitas.
94. Não sobrepor a navegação móvel ao botão de inscrição.
95. Manter a navegação móvel com rótulos, não apenas ícones.
96. Preservar a rotação e o zoom do navegador.
97. Não exigir WebGL para renderizar conteúdo do evento.
98. Carregar fotos dos convidados de forma tardia e assíncrona.
99. Não introduzir dependências pesadas para efeitos decorativos.
100. Conferir o banner, o mapa e o cartão promocional com contraste legível no tema escuro.

## Paleta oficial congelada

**Paleta aprovada em 12/10/2026.** Os valores abaixo são a fonte oficial em `tokens.css`. A Etapa 6 e ajustes futuros podem refinar espaçamento, alinhamento, microinterações e conteúdo do rodapé, mas não podem mudar cores, fundos, halo da Terra ou o contraste geral. `validate:itcont-site` compara os tokens com os valores aprovados.

| Grupo | Tokens aprovados |
| --- | --- |
| Identidade | `abismo #080f16` · `marinho #14212b` · `ceu-1 #0e2a66` · `ceu-2 #081a44` · `nevoa #58a9e8` · `estrela #d9efff` |
| Ações e texto | `royal #1679a8` · `azul #2a5064` · `eletrico #57b5e3` · `neon #93d7f5` · `gelo #b1c9d6` · `branco #ffffff` · `alerta #ffcf5a` |
| Prata | `cromo-1 #f1f5f7` · `cromo-2 #abb9c2` · `cromo-3 #a9bac5` · `silver-mid #bbc9d0` · `silver-shadow #71808a` |
| Superfícies | `fundo-claro #0b131b` · `superficie-clara #14212b` · `superficie-prata #1a2a35` · `borda-clara #304b5b` · `tinta #eef4f7` · `tinta-2 #b0c2cc` · `planeta-terra #719a73` |
| Ações/superfícies auxiliares | `action-top #218dbc` · `action-bottom #176b93` · `action-hover-top #32a2d0` · `action-hover-bottom #1b7eaa` · `action-border #55b9e8` · `control-top #203341` · `control-bottom #182733` · `control-hover #263e4d` |
| Outros tokens cromáticos | `ribbon-top #174e69` · `ribbon-bottom #1c759d` · `ticket-top #1b2a35` · `ticket-bottom #111d26` · `inset #0e1821` · `input-surface #0b151d` · `footer-top #101c25` · `footer-bottom #0a1118` · `fallback-top #22617c` · `category-surface #172a36` |
