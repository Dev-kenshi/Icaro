# Referência da API Ícaro

## Convenções

- Base local/de produção: `/api`.
- A API é servida pelo artifact `artifacts/api-server`; no Render, o mesmo
  processo serve a interface compilada.
- JSON usa `Content-Type: application/json`, salvo quando indicado.
- **Sessão:** cookie assinado `icaro_session`, enviado automaticamente pelo
  navegador. As rotas marcadas “usuário autenticado” exigem `user` ou `admin`;
  as rotas “admin” exigem o papel `admin`.
- O middleware geral limita o corpo JSON a 1 MiB. A rota de STT aceita corpo
  bruto até 8 MiB.
- Erros de validação têm status 4xx; falhas internas são sanitizadas e
  registradas no servidor.

## Acesso e sessão

### `POST /auth/login`

**Acesso:** público. **Corpo:** `{ "username": "user1|admin", "password":
"..." }`.

Valida credenciais configuradas no servidor, limita cinco tentativas falhas
por combinação de IP/usuário em um intervalo de um minuto e grava a sessão no
cookie HttpOnly.

- `200`: `{ "username": "user1", "role": "user" }` ou papel `admin`; também
  define `icaro_session`.
- `400`: usuário/senha ausente, tipo inválido ou tamanho acima do limite.
- `401`: credenciais inválidas.
- `429`: bloqueio temporário após tentativas repetidas.
- `503`: senha ou segredo de sessão não configurado.

### `POST /auth/logout`

**Acesso:** público; remove o cookie, mesmo se já expirado.

- `204`: sem corpo.

### `GET /auth/me`

**Acesso:** público; identifica a sessão enviada.

- `200`: `{ "username": "...", "role": "user|admin" }`.
- `401`: cookie ausente, expirado ou inválido.

## Saúde e dados públicos

### `GET /healthz`

**Acesso:** público. `200`: `{ "status": "ok" }`. Verifica que a rota Express
responde; não afirma que todos os provedores externos estão disponíveis.

### `GET /cosmos/feeds`

**Acesso:** público. Devolve feeds públicos de órbita/ISS e terremotos em
cache; o cabeçalho `Cache-Control` usa o TTL retornado.

- `200`: `{ updatedAt, stale, ttlSeconds, iss, earthquakes }`.
- `502`: fontes públicas temporariamente indisponíveis.

`iss.current` tem `latitude`, `longitude`, `altitudeKm`, `velocityKmh`,
`visibility` e `timestamp`. `iss.trajectory` contém pontos com latitude,
longitude e instante. `nextPassAt` e `nextPassDistanceKm` são anuláveis.
Cada terremoto contém `id`, `magnitude`, `place`, latitude, longitude,
`depthKm`, `occurredAt` e `url`.

## Conversa e provedores

### `POST /ai/chat`

**Acesso:** usuário autenticado. **Corpo:**

```json
{
  "provider": "auto",
  "mode": "fast",
  "persona": "icaro",
  "question": "Pergunta",
  "history": [],
  "knowledgeMode": "auto",
  "dataset": null
}
```

- `provider` é obrigatório: `auto`, `gemini`, `openai`, `groq`, `claude`,
  `cerebras`, `openrouter`, `mistral`, `github`, `nvidia`, `cloudflare`,
  `huggingface` ou `cohere`.
- `question` é obrigatório (1–4000 caracteres).
- `history` é obrigatório, até 12 mensagens `{ role: "user|assistant",
  content }`; cada conteúdo tem até 4000 caracteres.
- `dataset` é obrigatório e pode ser `null` ou `{ name, columns, sampleRows,
  summary? }`. Máximos: 60 colunas, 50 linhas-amostra, nome de 160 caracteres
  e resumo de 6000 caracteres.
- `mode`: `fast|deep`; `persona`: `analyst|icaro` (padrão `analyst`);
  `knowledgeMode`: `auto|base` (padrão `auto`).
- Limite de frequência atual: 30 perguntas por IP em 10 minutos.

`200`: `{ answer, provider, model, layer? }`. A camada pode ser `L1`–`L6`;
`provider` pode ser `local` para resposta resolvida sem provedor externo.

Erros documentados na implementação: `400` corpo inválido/pergunta vazia ou
provedor não aceito; `429` excesso de perguntas; `502` falha do provedor;
`503` indisponibilidade/configuração. A implementação pode devolver outras
falhas sanitizadas pelo handler global.

### `POST /ai/chat/stream`

**Acesso:** usuário autenticado. Corpo igual ao de `/ai/chat`; transmissão
incremental exige provedor automático ou elegível para o roteador.

Resposta `200` como `text/event-stream`. Eventos:

| Evento | Dados | Uso |
|---|---|---|
| `provider` | `{ provider, model }` | Informa o provedor selecionado |
| `token` | `{ text }` | Fragmento de resposta |
| `emocao` | `{ emotion }` | Marca `entusiasmo`, `sério`, `curioso`, `alerta` ou `sorriso` |
| `done` | metadados, `layer`, `partial` quando aplicável | Conclusão |
| `error` | `{ error }` | Falha comunicada no stream |

Erros ocorridos após abrir o stream são enviados como evento `error`; por isso
o cliente deve ler eventos, não apenas o status HTTP. O cliente rejeita o fluxo
se não receber `done` ou uma resposta não vazia.

### `GET /ai/status`

**Acesso:** usuário autenticado. Retorna disponibilidade booleana dos
provedores clássicos, disponibilidade de voz e estado de saúde dos provedores.
Não devolve chaves.

### `GET /ia/saude`

**Acesso:** admin. Retorna a lista de saúde dos provedores: configuração,
disponibilidade, estado, modelo, nota de privacidade, latência inicial média,
taxa de erro e tempo de cooldown.

- `401`: sem sessão.
- `403`: sessão sem papel admin.

### `GET /ask/stats`

**Acesso:** admin. Retorna total de respostas, distribuição por camada,
tokens gastos/economizados e resumo diário.

### `GET /admin/cerebro/candidates`

**Acesso:** admin. Lista candidatas pendentes da curadoria do conhecimento,
sem embeddings internos.

### `POST /admin/cerebro/candidates/{id}/approve`

**Acesso:** admin. `id` identifica a candidata. Corpo:
`{ "destination": "bank" | "base" }`.

- `200`: `{ "ok": true }`.
- `400`: destino inválido.
- `404`: candidata ausente, inválida ou com dados pessoais.
- `401` / `403`: sessão ausente / papel insuficiente.

### `DELETE /admin/cerebro/candidates/{id}`

**Acesso:** admin. Descarta candidata pendente.

- `200`: `{ "ok": true }`.
- `404`: candidata inexistente ou já revisada.
- `401` / `403`: sessão ausente / papel insuficiente.

## Voz

### `POST /ai/tts`

**Acesso:** usuário autenticado. Corpo:
`{ "text": "...", "emotion?": "...", "voice_id?": "..." }`.
`text` aceita de 1 a 1200 caracteres; emoção aceita `entusiasmo`, `sério`,
`curioso`, `alerta` ou `sorriso`. `voice_id` opcional deve pertencer à conta
ElevenLabs quando informado.

- `200`: bytes de áudio; `Content-Type` indica WAV/MP3. Cabeçalhos
  `X-Speech-Provider`, `X-Speech-Voice`, `X-Speech-Model` e
  `X-Speech-Cache` descrevem a síntese.
- `400`: texto/voz inválidos.
- `429`: mais de 90 solicitações por IP em 10 minutos.
- `503`: síntese indisponível ou provedor não configurado; pode incluir
  `Retry-After`.

### `POST /tts-ts`

**Acesso:** usuário autenticado. Gera áudio ElevenLabs e alinhamento temporal
por caractere. Corpo:

```json
{
  "text": "Olá.",
  "previous_text": "",
  "emotion": "sorriso",
  "voice_id": "..."
}
```

`text` tem limite de 600 caracteres, `previous_text` até 1200 e `voice_id` é
opcional. `200`: `{ audio_base64, alignment, normalized_alignment }`. Cada
alinhamento contém arrays `characters`, `character_start_times_seconds` e
`character_end_times_seconds`; alinhamentos normalizados podem ser `null`.

- `400`: JSON/texto/voz inválido.
- `413`: frase ultrapassa 600 caracteres depois da normalização de pronúncia.
- `429`: mais de 90 solicitações por IP em 10 minutos.
- `502`: provedor falhou/resposta inválida.
- `503`: credencial ou voz padrão ausente.
- `504`: síntese excedeu 30 segundos.

### `GET /ai/voices?search=...`

**Acesso:** usuário autenticado. Lista vozes portuguesas masculinas da conta
ElevenLabs; `search` opcional, até 80 caracteres.

- `200`: `{ "voices": [{ voiceId, name, category, description, labels }] }`.
- `400`: filtro inválido.
- `502`: catálogo indisponível.
- `503`: ElevenLabs não configurado.

### `POST /ai/stt`

**Acesso:** usuário autenticado. Envia bytes de áudio, não JSON, com
`Content-Type` `audio/webm`, `audio/ogg`, `audio/mp4`, `audio/mpeg`,
`audio/wav` ou `application/octet-stream`. Limite 8 MiB; modelo padrão
`whisper-large-v3-turbo`, idioma português. O servidor envia o áudio ao Groq.

- `200`: `{ "text": "...", "ms": 123 }`.
- `400`: áudio ausente ou menor que 1000 bytes.
- `429`: mais de 80 gravações por IP em 10 minutos.
- `502`: falha upstream/transcrição.
- `503`: `GROQ_API_KEY` não configurada.

## Dados ao vivo e ITCONT

### `GET /ao-vivo/financas`

**Acesso:** usuário autenticado. Resposta `200`:

```json
{
  "moedas": [{ "codigo": "USD", "nome": "Dólar", "valor": 0, "variacao": 0 }],
  "indices": { "selic": { "valor": 0, "data": "..." } },
  "serieDolar": [{ "d": "dd/mm", "v": 0 }],
  "atualizado": "data e hora em America/Sao_Paulo",
  "falhas": [],
  "fala": "Frase curta para o Ícaro ler"
}
```

`moedas` pode incluir USD, EUR, UYU, ARS e BTC; `variacao` pode ser `null`.
`indices` pode conter Selic, IPCA de 12 meses e CDI. As fontes são consultadas
em paralelo quando aplicável, com cache de cinco minutos. Falhas de uma fonte
podem gerar resposta parcial `200` e aparecem em `falhas`; `502` é reservado
para falha que escapa ao tratamento do serviço.

### `GET /ao-vivo/tempo?cidade={cidade}&dia=hoje|amanha`

**Acesso:** usuário autenticado. `cidade` opcional; `dia` assume `hoje` quando
não for `amanha`. Resposta `200`:

```json
{
  "fala": "Agora em Feira de Santana faz ...",
  "cidade": "Feira de Santana",
  "regiao": "Bahia",
  "pais": "Brasil",
  "atual": 0,
  "max": 0,
  "min": 0,
  "chuva": 0,
  "umidade": 0,
  "codigo": 0,
  "desc": "céu limpo",
  "lat": 0,
  "lon": 0
}
```

Exceto `fala`, os campos são opcionais; chuva/umidade/código podem ser `null`.
A cidade padrão é Feira de Santana. Se não for encontrada, a rota ainda
responde `200` com `{ "fala": "Não encontrei a cidade ..." }`. A busca e
previsão usam Open-Meteo e têm cache de dez minutos. `502` indica falha da
fonte externa.

### `GET /itcont/events/{slug}`

**Acesso:** usuário autenticado. `slug` deve ter 3–100 caracteres minúsculos,
números ou hífens. Retorna `event`, `sessions`, `guests` e
`registrationCategories`. Inclui apenas conteúdo público do evento.

- `event`: `slug`, `title`, `summary`, `description`, `startsOn`, `endsOn`,
  `timezone`, `venue`, `address`, `city`, `state`, `country`, `organizerName`,
  `organizingProject`, `bannerUrl`, `logoUrl`, `sourceUrl` e `updatedAt`.
- `sessions[]`: `date`, `title`, `startsAt`, `endsAt` e `sortOrder`.
- `guests[]`: `name`, `imageUrl` e `sortOrder`.
- `registrationCategories[]`: `name`, `priceCents`, `currency`,
  `availableUntil`, `registrationUrl` e `sortOrder`.

Datas usam `YYYY-MM-DD`; horários usam `HH:mm:ss`; `updatedAt` é date-time;
URLs devem ser URIs válidas; moeda é um código de três letras maiúsculas;
preço é inteiro em centavos e não pode ser negativo.

- `400`: slug inválido.
- `401`: sessão ausente.
- `404`: evento não encontrado.
- `503`: banco não configurado.
- `500`: falha inesperada ou dado obrigatório inconsistente; mensagem externa
  é sanitizada.

## Política efetiva de autenticação

`routes/index.ts` monta `health` e `auth` antes do middleware geral. Depois
aplica `requireAuth()` aos prefixos `/ai`, `/tts-ts`, `/itcont` e `/ao-vivo`.
Isso protege inclusive STT, status e catálogo de vozes. `cosmos` não está
nesses prefixos e é público. `ia/saude`, `ask/stats` e operações de candidatas
também exigem admin individualmente.

## Diferença entre código e OpenAPI

`lib/api-spec/openapi.yaml` descreve um subconjunto da API. Na revisão atual,
faltam no arquivo de contrato as rotas de login/logout/me, STT, finanças e
clima ao vivo; e o contrato não sinaliza sessão em operações sob `/ai`,
`/tts-ts` e `/ao-vivo`. A rota ITCONT explicita sessão. Use este documento junto
do código de `routes/index.ts` e `routes/*.ts` para verificar o comportamento
efetivo. Uma próxima manutenção pode alinhar o OpenAPI e regenerar os clientes,
com validação das alterações resultantes.

## Chamadas de exemplo

```bash
# Saúde, sem autenticação
curl -i https://SEU_HOST/api/healthz

# Login; cria um arquivo local com permissões restritas para a sessão
umask 077
curl -i -c /tmp/icaro-cookie.txt \
  -H 'Content-Type: application/json' \
  -d '{"username":"user1","password":"SENHA_LOCAL"}' \
  https://SEU_HOST/api/auth/login

# Consulta SSE usando sessão
curl -N -b /tmp/icaro-cookie.txt \
  -H 'Content-Type: application/json' \
  -H 'Accept: text/event-stream' \
  -d '{"provider":"auto","mode":"fast","persona":"icaro","question":"O que é o Ícaro?","history":[],"knowledgeMode":"auto","dataset":null}' \
  https://SEU_HOST/api/ai/chat/stream

# O exemplo usa marcador de host/senha; nunca coloque credenciais reais em Git.
```
