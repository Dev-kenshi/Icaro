# Inteligência artificial

## ia_definicao | O que é inteligência artificial
p: o que é inteligência artificial; definição de ia; como a ia funciona; ia é inteligente de verdade
Inteligência artificial é o campo da computação que cria sistemas capazes de executar tarefas associadas à inteligência humana, como entender linguagem, reconhecer imagens, prever resultados e tomar decisões. A IA atual não pensa como um ser humano: ela aprende padrões estatísticos a partir de grandes volumes de dados. Por isso pode ser impressionante em algumas tarefas e falhar em outras que parecem simples para nós.

## ia_historia | História da inteligência artificial
p: história da inteligência artificial; quem criou a ia; teste de turing; dartmouth; quando surgiu a ia; chatgpt quando foi lançado
Em 1950, Alan Turing propôs o famoso teste para avaliar se uma máquina pode se passar por humana. O termo inteligência artificial surgiu na conferência de Dartmouth, em 1956, organizada por John McCarthy e outros pesquisadores. Depois vieram ciclos de entusiasmo e de desânimo, os invernos da IA. A virada recente começou em 2012, com redes neurais profundas vencendo competições de imagem; em 2017, a arquitetura Transformer revolucionou o processamento de linguagem; e em novembro de 2022 o ChatGPT popularizou a IA generativa no mundo todo.

## ia_tipos | Tipos de IA: estreita, geral e generativa
p: tipos de inteligência artificial; ia fraca e forte; ia estreita; ia geral; agi; o que é ia generativa
A IA estreita, ou fraca, resolve tarefas específicas, como reconhecer rostos ou classificar notas fiscais; é a que existe hoje. A IA geral, ou AGI, seria capaz de aprender e raciocinar em qualquer área como um humano; é objeto de pesquisa e debate. A IA generativa é a que cria conteúdo novo, como textos, imagens, áudio, vídeo e código, a partir de instruções. Modelos de linguagem como ChatGPT, Claude e Gemini são exemplos de IA generativa.

## ia_ml | Aprendizado de máquina
p: o que é machine learning; tipos de aprendizado de máquina; aprendizado supervisionado; não supervisionado; aprendizado por reforço
Aprendizado de máquina é quando o sistema aprende a partir de exemplos em vez de regras escritas à mão. No aprendizado supervisionado, os dados têm a resposta certa, como lançamentos já classificados, e o modelo aprende a prever. No não supervisionado, o modelo encontra grupos e padrões sozinho, como segmentar clientes. No aprendizado por reforço, ele aprende por tentativa e erro com recompensas, como em jogos e robótica.

## ia_redes_neurais | Redes neurais e deep learning
p: o que é rede neural; o que é deep learning; aprendizado profundo; como funciona uma rede neural
Redes neurais artificiais são modelos inspirados de forma simplificada nos neurônios: camadas de unidades conectadas por pesos que são ajustados durante o treinamento para reduzir o erro. Deep learning, ou aprendizado profundo, usa redes com muitas camadas, capazes de aprender representações complexas diretamente de dados brutos, como pixels de imagens ou ondas de áudio. É a base do reconhecimento de voz, da visão computacional e dos modelos de linguagem.

## ia_llm | Modelos de linguagem (LLMs)
p: o que é llm; como funciona o chatgpt; modelo de linguagem grande; transformer; como a ia escreve textos
Um LLM, modelo de linguagem grande, é uma rede neural do tipo Transformer treinada com enormes quantidades de texto para prever o próximo pedaço de texto. Depois, passa por ajustes com exemplos e com avaliação humana para seguir instruções e responder de forma útil e segura. Dessa tarefa simples de prever palavras surgem capacidades como resumir, traduzir, programar, explicar e raciocinar em etapas. Exemplos são as famílias GPT, Claude, Gemini, Llama e Qwen.

## ia_tokens | Tokens e janela de contexto
p: o que são tokens; janela de contexto; quanto custa usar ia; por que a ia esquece
Os modelos de linguagem leem e escrevem em tokens, pedaços de palavras; em português, uma palavra tem em média pouco mais de um token. A janela de contexto é a quantidade máxima de tokens que o modelo considera de uma vez, somando a conversa, os documentos e a resposta. O custo das APIs é cobrado por token de entrada e de saída. Por isso, sistemas como o Ícaro usam bases próprias e mandam ao modelo só os trechos relevantes, economizando tokens e tempo.

## ia_treinamento | Pré-treinamento, ajuste fino e RLHF
p: como a ia é treinada; o que é fine tuning; ajuste fino; rlhf; dados de treinamento
O treinamento de um modelo de linguagem tem etapas. No pré-treinamento, ele aprende padrões da linguagem com bilhões de textos. No ajuste fino, é especializado com exemplos de instruções e respostas desejadas. No aprendizado por reforço com feedback humano, o RLHF, e técnicas semelhantes, pessoas e outros modelos avaliam respostas para ensiná-lo a ser mais útil, honesto e seguro. Empresas também podem ajustar modelos com seus próprios dados para tarefas específicas.

## ia_alucinacao | Alucinação e limitações
p: o que é alucinação de ia; por que a ia inventa; limitações da ia; ia erra
Alucinação é quando o modelo gera informação falsa com aparência convincente, como uma lei, um artigo ou um número inexistente. Acontece porque ele produz o texto mais provável, não verdades checadas. Outras limitações são conhecimento com data de corte, dificuldade com cálculos longos sem ferramentas, sensibilidade à forma da pergunta e possíveis vieses dos dados. Para reduzir riscos: fornecer fontes confiáveis, pedir citações, usar ferramentas de cálculo e manter revisão humana.

## ia_rag | RAG e embeddings
p: o que é rag; o que são embeddings; busca semântica; banco vetorial; como a ia consulta documentos
RAG, geração aumentada por recuperação, é a técnica de buscar trechos relevantes numa base de documentos e entregá-los ao modelo junto com a pergunta, para que ele responda com base em fontes. Embeddings são vetores numéricos que representam o significado de um texto; textos parecidos ficam próximos nesse espaço, o que permite busca por significado e não só por palavras. Bancos vetoriais guardam esses vetores. O Ícaro usa uma base própria e envia ao modelo apenas os três trechos mais relevantes.

## ia_agentes | Agentes de IA
p: o que é agente de ia; ia que executa tarefas; agentes autônomos; ia que usa ferramentas
Agentes de IA são sistemas em que o modelo não só responde, mas planeja e executa tarefas em várias etapas usando ferramentas: consulta sistemas, lê arquivos, preenche planilhas, navega na web e pede aprovação humana quando necessário. Na contabilidade, agentes já ajudam no fechamento mensal, na conferência fiscal e no atendimento a clientes. O desafio é garantir controle, segurança e rastreabilidade de cada ação.

## ia_prompt | Engenharia de prompt
p: como escrever um bom prompt; técnicas de prompt; engenharia de prompt; exemplos de prompt para contador
Um bom prompt diz quem a IA deve ser, dá o contexto, descreve a tarefa, define o formato da resposta e os limites. Técnicas úteis: dar exemplos do resultado esperado, dividir tarefas complexas em etapas, pedir que a IA explique o raciocínio e aponte incertezas, e fornecer os documentos de referência. Exemplo: atue como contador tributarista; com base nesta nota fiscal, liste em tópicos os riscos de classificação fiscal e diga quando não tiver certeza.

## ia_visao_ocr | Visão computacional e OCR
p: o que é visão computacional; o que é ocr; leitura automática de notas fiscais; ia que lê documentos
Visão computacional é a área que permite às máquinas interpretar imagens e vídeos. O OCR, reconhecimento óptico de caracteres, transforma imagens de texto em texto editável. Combinados com modelos de linguagem, permitem ler recibos, boletos, notas e contratos, extrair campos como CNPJ, valores e datas e classificar automaticamente os documentos, eliminando boa parte da digitação nos escritórios.

## ia_voz | IA de voz: reconhecimento e síntese
p: como funciona reconhecimento de voz; síntese de voz; text to speech; whisper; como o ícaro fala
O reconhecimento de fala converte áudio em texto; modelos como o Whisper fazem isso com boa precisão em português, inclusive offline. A síntese de voz, ou text to speech, faz o caminho inverso, gerando fala natural a partir do texto. Um detector de atividade de voz percebe quando a pessoa terminou de falar. O Ícaro combina essas três peças com um modelo de linguagem e sincroniza os lábios com o tempo de cada letra da fala.

## ia_vies_etica | Ética e vieses na IA
p: ética na inteligência artificial; viés algorítmico; ia pode ser preconceituosa; uso responsável de ia
Modelos aprendem com dados humanos e podem reproduzir vieses, por exemplo, em análise de crédito ou seleção de currículos. Princípios de uso responsável incluem transparência sobre o uso de IA, explicabilidade das decisões, privacidade, segurança, supervisão humana e responsabilização. Na contabilidade, decisões com impacto em clientes, como apontar fraude ou negar crédito, nunca devem ser tomadas só pela máquina.

## ia_regulacao | Regulação da IA no Brasil e no mundo
p: lei de inteligência artificial no brasil; pl 2338; marco legal da ia; ai act europa; regulação da ia
A União Europeia aprovou em 2024 o AI Act, que classifica sistemas de IA por nível de risco e impõe obrigações proporcionais, com aplicação gradual. No Brasil, o Projeto de Lei 2338 de 2023, o marco legal da IA, foi aprovado no Senado em dezembro de 2024 e seguiu para a Câmara dos Deputados; confira a situação atual. Enquanto isso, a LGPD já se aplica a sistemas de IA que tratam dados pessoais, inclusive quanto a decisões automatizadas.
v: sim

## ia_lgpd | IA, privacidade e LGPD
p: posso usar chatgpt com dados de clientes; ia e lgpd; segurança de dados na ia; privacidade na ia
Antes de colocar dados de clientes em ferramentas de IA, verifique se o fornecedor usa os dados para treinar modelos, onde eles ficam armazenados e se há contrato de proteção de dados. Prefira versões corporativas, anonimize CPFs, nomes e valores sempre que possível e registre o uso no inventário de dados do escritório. O sigilo profissional do contador continua valendo integralmente quando ele usa IA.

## ia_trabalho | IA e o mercado de trabalho
p: a ia vai acabar com empregos; profissões que a ia vai substituir; como a ia muda o trabalho; ia e emprego
A IA automatiza tarefas, não profissões inteiras. Atividades repetitivas e baseadas em regras são as mais afetadas, enquanto julgamento, relacionamento, criatividade e responsabilidade continuam humanos. Estudos indicam que muitas profissões serão transformadas, com ganhos de produtividade para quem souber usar as ferramentas. Para o contador, a recomendação é dominar a IA para eliminar o operacional e investir no consultivo.

## ia_contabilidade_casos | IA na contabilidade: casos de uso
p: como usar ia na contabilidade; exemplos de ia na contabilidade; automação contábil com ia; ferramentas de ia para contador
Casos práticos de IA na contabilidade: leitura e classificação automática de notas e extratos; conciliação bancária inteligente; sugestão de lançamentos com base no histórico; detecção de anomalias e possíveis fraudes; previsão de fluxo de caixa; respostas automáticas a dúvidas de clientes; resumo de legislação e de mudanças normativas; revisão de cadastros fiscais para a reforma tributária; e geração de relatórios gerenciais em linguagem simples.

## ia_rpa | Automação: RPA, planilhas e IA
p: diferença entre rpa e ia; o que é rpa; automação de processos; robôs na contabilidade
RPA, automação robótica de processos, são robôs de software que repetem passos fixos, como baixar guias, preencher sistemas e enviar e-mails. Funcionam bem quando o processo é estável e as regras são claras. A IA entra quando há variação e interpretação, como ler documentos diferentes ou classificar textos. Os melhores resultados vêm da combinação: processos bem desenhados, automação para o repetitivo e IA para o que exige interpretação, sempre com revisão humana.

## ia_ferramentas_dados | Dados, Excel, Power BI e Python para contadores
p: o que o contador deve aprender de tecnologia; python para contadores; power bi contabilidade; excel avançado; análise de dados
Para o contador moderno, as habilidades técnicas mais valiosas são Excel avançado, com tabelas dinâmicas, Power Query e fórmulas de busca; Power BI ou ferramentas semelhantes para painéis; noções de bancos de dados e SQL; e Python para automatizar tarefas e analisar grandes volumes de dados. Somadas ao uso de IA, essas ferramentas transformam o contador em analista de negócios.

## ia_seguranca | Segurança, deepfakes e golpes com IA
p: golpes com inteligência artificial; deepfake; ia em fraudes; como se proteger de golpes com ia
A IA também é usada por criminosos: deepfakes de voz e vídeo imitando diretores para autorizar pagamentos, e-mails de phishing muito bem escritos e documentos falsificados. Defesas incluem confirmar pedidos de pagamento por um segundo canal, exigir dupla aprovação para transferências, treinar a equipe e usar autenticação forte. Escritórios contábeis são alvos frequentes porque lidam com dados e dinheiro de muitos clientes.

## ia_futuro | Futuro da inteligência artificial
p: futuro da ia; para onde vai a inteligência artificial; o que esperar da ia nos próximos anos
As tendências incluem modelos mais capazes de raciocinar e usar ferramentas, agentes que executam tarefas completas, IA rodando localmente em computadores e celulares, integração com sistemas empresariais e mais regulação. Também crescem os debates sobre consumo de energia, direitos autorais, empregos e segurança. Para quem estuda contabilidade, a melhor preparação é aprender a usar a IA com senso crítico, ética e conhecimento técnico sólido.

## ia_icaro | Como o Ícaro funciona
p: como o ícaro funciona; o ícaro usa chatgpt; o ícaro é uma ia; tecnologia do ícaro; arquitetura do ícaro
O Ícaro funciona em camadas. Primeiro, um detector de voz percebe quando você terminou de falar e um modelo de reconhecimento transforma a fala em texto. Depois, um roteador resolve comandos e consulta a base própria do Ícaro, com respostas e textos sobre contabilidade, reforma tributária, IA, UEFS e Feira de Santana. Se a pergunta for nova, um modelo de linguagem responde usando os trechos mais relevantes da base. Por fim, a resposta vira voz, frase por frase, com os lábios sincronizados.
