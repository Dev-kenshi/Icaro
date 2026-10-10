Você é o engenheiro do ÍCARO (monorepo pnpm; palco em `artifacts/icaro/src/pages/stage.tsx`). Implemente a **sequência cinematográfica "Ícaro Earth"**: um zoom contínuo do planeta até o local pedido, com o nome aparecendo em cada etapa, no estilo do Google Earth. Trabalhe em ciclos curtos de editar → testar → corrigir. Fique no **modo Gratuito** e use só serviços grátis, sem chave paga.

## 0. Antes de começar
1. Sincronize: `pnpm --filter @workspace/scripts run sync:fix`. Se ele parar por credencial, rode `GITHUB_TOKEN="$GITUV_TOKEN_ICARO" pnpm --filter @workspace/scripts run sync:fix`. Nunca use force-push.
2. Leia o que já existe e reaproveite, sem duplicar:
   - `src/lib/geo-fly.ts`: `parseFlyQuery` e geocodificação pelo Photon.
   - `src/components/stage/geo-map-panel.tsx`: painel com o mapa do Google em iframe.
   - `src/components/stage/cosmos/renderer.tsx`: globo 3D three.js com NASA GIBS, cena `earth`.
   - Comando `flyFeira` em `src/lib/commands.ts` e o case correspondente em `stage.tsx`.

## 1. O que o usuário vê (roteiro da animação)
Comando de voz ou texto: **"Ícaro, mostre Feira de Santana"**, **"mostre a UEFS no mapa"** ou **"mostre o Abrini em Feira de Santana"**.

1. **Planeta (0 a 2 s):** a Terra inteira na tela, girando devagar até o país de destino ficar de frente. Texto holográfico: **"Ícaro Earth"**.
2. **Aproximação em etapas (2 a 12 s):** zoom contínuo, sem cortes, passando por **país → estado → cidade**. Em cada etapa, um rótulo grande e elegante aparece e some suavemente:
   - "BRASIL"
   - "BAHIA"
   - "**Feira de Santana**", junto com a linha "Feira de Santana Earth" e as coordenadas.
3. **Dentro da cidade (12 a 18 s):** o zoom continua até o nível de bairro e rua (zoom 16 a 17), com leve inclinação 3D (pitch de cerca de 50°) e rotação lenta.
4. **Local final (18 s em diante):** quando o pedido tiver um ponto específico (ex.: "Abrini", "UEFS"), a câmera voa até ele e mostra:
   - um **marcador pulsante**;
   - o cartão "**Abrini — localização**", com endereço e coordenadas;
   - uma pausa de 5 s para a plateia ver;
   - os botões **Recentralizar**, **Abrir no Google Maps** (link externo, que já existe em `googleMapsLink`) e **Fechar**.
5. O Ícaro **fala** cada etapa de forma curta e sincronizada ("Saindo da órbita… Brasil… Bahia… Feira de Santana… e aqui está o Abrini."), usando a fila de fala que já existe.

## 2. Tecnologia (grátis e animável)
- Use **MapLibre GL JS v5** (`maplibre-gl`) com **`projection: 'globe'`**. Isso permite um único mapa que vai do globo inteiro ao nível da rua com `map.flyTo`, sem trocar de componente no meio.
- **Imagem de satélite:** Esri World Imagery (`https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}`), com a atribuição exibida ("Imagens © Esri, Maxar, Earthstar Geographics").
- **Nomes de ruas por cima:** camada de rótulos grátis (ex.: Esri World Boundaries and Places ou OpenFreeMap). Não use chave paga do Google nem do Mapbox.
- **Geocodificação:** continue usando o Photon (`geocodeUrl`/`parseGeocode`). Para "X em Y", busque "X, Y, Bahia, Brasil". Do resultado, extraia país, estado e cidade para os rótulos das etapas.
- **Coordenadas fixas, para não depender da busca ao vivo no evento:** crie `src/lib/pontos-feira.ts` com os pontos frequentes:
  - Feira de Santana: −12,2664, −38,9663 (já usado no `renderer.tsx`);
  - UEFS;
  - **Abrini**.

  **Se o Photon não encontrar o Abrini**, deixe o ponto com coordenadas `null` e um comentário `// PREENCHER: latitude e longitude do Abrini`. Mostre ao usuário a mensagem "Ainda não tenho a localização exata do Abrini. Me diga o endereço." **Nunca invente coordenadas.**
- **Sequência:** escreva uma função `voarCinematico(destino)` que encadeie `flyTo` com `await map.once('moveend')`. Durações:

  | Trecho | Duração | Zoom |
  |---|---|---|
  | Globo → país | 3 s | 3 |
  | País → estado | 3 s | 5,5 |
  | Estado → cidade | 3,5 s | 11 |
  | Cidade → rua/ponto | 4 s | 16,5, pitch 50 |

  Use `curve: 1.4` e `essential: true`. Mostre cada rótulo ao terminar o trecho.
- **Integração com o palco:**
  - A sequência abre em tela cheia por cima do palco, e o rosto do Ícaro continua visível num canto, falando.
  - Esc ou "Ícaro, fechar mapa" encerra.
  - O comando `flyFeira` e o `parseFlyQuery` passam a disparar a sequência cinematográfica. O painel antigo continua acessível pelo botão "Abrir no Google Maps".
- **`prefers-reduced-motion`:** use transições mais curtas (1 s por trecho), sem rotação automática, mantendo as etapas e os rótulos.
- **Sem internet ou se as imagens falharem:** use o globo three.js atual com o rótulo da cidade e uma mensagem clara. A tela nunca pode ficar preta.

## 3. Não pode quebrar
Rosto, voz, sincronia labial, microfone, "Ok, Ícaro", legendas, painel financeiro, boca medida dos avatares, bancos de conhecimento e calculadoras. Edição cirúrgica, só nos trechos necessários.

## 4. Critérios de aceite (teste cada um)
- [ ] "Ícaro, mostre Feira de Santana" faz a sequência completa planeta → Brasil → Bahia → Feira de Santana em uns 12 s, **sem cortes nem tela preta**.
- [ ] Os rótulos "BRASIL", "BAHIA" e "Feira de Santana / Feira de Santana Earth" aparecem cada um no momento certo e somem suavemente.
- [ ] "Ícaro, mostre a UEFS" termina com o marcador pulsante e o cartão da UEFS.
- [ ] "Ícaro, mostre o Abrini em Feira de Santana" voa até o Abrini, se a localização for conhecida. Se não for, a sequência para na cidade e mostra a mensagem pedindo o endereço, **sem inventar**.
- [ ] Outro lugar qualquer ("mostre Salvador", "mostre a Torre Eiffel") funciona pela busca do Photon, com rótulos de país, estado e cidade.
- [ ] Depois da sequência, o usuário consegue arrastar, girar com dois dedos, inclinar e dar zoom (mouse e toque).
- [ ] A fala do Ícaro acompanha as etapas, e a boca do avatar mexe enquanto ele fala.
- [ ] Fica fluido em 1440 px (60 fps) e em 375 px de celular.
- [ ] Com `prefers-reduced-motion` ligado, a versão curta funciona.
- [ ] Sem internet, aparece o globo three.js com o aviso e a tela não fica preta.
- [ ] `pnpm run typecheck` limpo, `sync:check` com 0 erros, `validate:hologram` e `validate:cerebro-200` passando, e console do navegador sem erros.
- [ ] Commit com mensagem clara e `sync:fix` para enviar ao GitHub (o Render publica sozinho).

## 5. Relatório final
`STATUS ✅/⚠️ · O que foi feito (arquivo:linha) · Como testar (comandos de voz) · Testes (comando → resultado) · Pendências reais (ex.: coordenadas do Abrini)`.
