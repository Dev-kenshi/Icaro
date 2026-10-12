export type ApiResponseExample = {
  status: string;
  label: string;
  contentType: string;
  body: string;
};

export type ApiParameter = {
  name: string;
  in: 'path' | 'query';
  required: boolean;
  details: string;
  example?: string;
};

export type ApiEndpoint = {
  id: string;
  group: string;
  method: 'GET' | 'POST' | 'DELETE';
  path: string;
  title: string;
  description: string;
  access: string;
  params?: ApiParameter[];
  requestType?: string;
  requestBody?: string;
  responseExamples: ApiResponseExample[];
  note?: string;
};

const json = (body: string, status = '200', label = 'Sucesso'): ApiResponseExample => ({
  status, label, contentType: 'application/json', body,
});

const error = (status: string, label: string, body = '{\n  "error": "Mensagem sanitizada do handler"\n}'): ApiResponseExample => ({
  status, label, contentType: 'application/json', body,
});

const chatBody = `{
  "provider": "auto",
  "mode": "fast",
  "persona": "icaro",
  "question": "Explique o conceito solicitado.",
  "history": [],
  "knowledgeMode": "auto",
  "dataset": null
}`;

export const apiEndpoints: ApiEndpoint[] = [
  {
    id: 'healthz', group: 'Saúde e feeds', method: 'GET', path: '/healthz', title: 'Verificar disponibilidade',
    description: 'Confirma que o processo Express responde. Não verifica provedores externos.',
    access: 'Público; sem sessão.',
    responseExamples: [json(`{
  "status": "ok"
}`)],
  },
  {
    id: 'cosmos-feeds', group: 'Saúde e feeds', method: 'GET', path: '/cosmos/feeds', title: 'Feeds de órbita e sismos',
    description: 'Devolve os feeds públicos de ISS e terremotos armazenados em cache. O TTL também é enviado em Cache-Control.',
    access: 'Público; sem sessão.',
    responseExamples: [
      json(`{
  "updatedAt": 0,
  "stale": false,
  "ttlSeconds": 0,
  "iss": {
    "current": {
      "latitude": 0,
      "longitude": 0,
      "altitudeKm": 0,
      "velocityKmh": 0,
      "visibility": "string",
      "timestamp": 0
    },
    "trajectory": [],
    "nextPassAt": null,
    "nextPassDistanceKm": null
  },
  "earthquakes": []
}`),
      error('502', 'Fonte pública indisponível'),
    ],
    note: 'Cada item de earthquakes inclui id, magnitude, place, latitude, longitude, depthKm, occurredAt e url. nextPassAt e nextPassDistanceKm podem ser null.',
  },
  {
    id: 'auth-login', group: 'Acesso e sessão', method: 'POST', path: '/auth/login', title: 'Iniciar sessão',
    description: 'Valida credenciais configuradas no servidor e define o cookie HttpOnly icaro_session.',
    access: 'Público. A sessão é criada na resposta; o navegador armazena o cookie.',
    requestType: 'application/json',
    requestBody: `{
  "username": "{{USERNAME}}",
  "password": "{{PASSWORD}}"
}`,
    responseExamples: [
      json(`{
  "username": "{{USERNAME}}",
  "role": "user"
}`),
      error('400', 'Entrada ausente ou inválida'),
      error('401', 'Credenciais inválidas'),
      error('429', 'Tentativas limitadas'),
      error('503', 'Configuração de sessão indisponível'),
    ],
    note: 'username até 64 caracteres e password até 200; após cinco falhas por IP/usuário em um minuto há bloqueio temporário. Não coloque credenciais, cookies ou segredos em Git. Use valores locais fora do repositório; a API não devolve o cookie no JSON.',
  },
  {
    id: 'auth-logout', group: 'Acesso e sessão', method: 'POST', path: '/auth/logout', title: 'Encerrar sessão',
    description: 'Limpa o cookie da sessão mesmo quando já expirou.',
    access: 'Público; não exige sessão válida.',
    responseExamples: [{ status: '204', label: 'Sem conteúdo', contentType: '—', body: 'Sem corpo de resposta.' }],
  },
  {
    id: 'auth-me', group: 'Acesso e sessão', method: 'GET', path: '/auth/me', title: 'Consultar sessão atual',
    description: 'Lê a sessão enviada pelo navegador e retorna a identidade autenticada.',
    access: 'Público; envia o cookie se existir. Sem cookie válido retorna 401.',
    responseExamples: [
      json(`{
  "username": "{{USERNAME}}",
  "role": "user"
}`),
      error('401', 'Sessão ausente, expirada ou inválida', `{
  "error": "Não autenticado."
}`),
    ],
  },
  {
    id: 'ai-chat', group: 'Assistente e provedores', method: 'POST', path: '/ai/chat', title: 'Enviar pergunta ao Ícaro',
    description: 'Resolve uma pergunta usando conhecimento local e/ou provedores configurados. Pode retornar provider local quando a resposta vem da base.',
    access: 'Usuário autenticado (papel user ou admin); cookie de sessão obrigatório.',
    requestType: 'application/json',
    requestBody: chatBody,
    responseExamples: [
      json(`{
  "answer": "Resposta do assistente.",
  "provider": "local",
  "model": "modelo",
  "layer": "L4"
}`),
      error('400', 'Corpo ou pergunta inválidos'),
      error('401', 'Sessão ausente'),
      error('429', 'Limite de perguntas excedido'),
      error('502', 'Falha do provedor'),
      error('503', 'Nenhum provedor disponível ou configurado'),
    ],
    note: 'provider é obrigatório e aceita auto, gemini, openai, groq, claude, cerebras, openrouter, mistral, github, nvidia, cloudflare, huggingface ou cohere. question: 1–4000 caracteres; history: obrigatório, até 12 mensagens user/assistant, cada conteúdo até 4000. dataset é obrigatório: null ou objeto com name, columns, sampleRows e summary opcional (máximos 60 colunas, 50 linhas, nome 160 e resumo 6000). mode: fast/deep; persona: analyst/icaro; knowledgeMode: auto/base.',
  },
  {
    id: 'ai-chat-stream', group: 'Assistente e provedores', method: 'POST', path: '/ai/chat/stream', title: 'Transmitir resposta incremental',
    description: 'Envia eventos Server-Sent Events com metadados, fragmentos de resposta, emoção e conclusão.',
    access: 'Usuário autenticado (papel user ou admin); cookie de sessão obrigatório.',
    requestType: 'application/json',
    requestBody: chatBody,
    responseExamples: [
      {
        status: '200', label: 'Fluxo SSE', contentType: 'text/event-stream',
        body: `event: provider
data: {"provider":"provedor","model":"modelo"}

event: token
data: {"text":"Fragmento"}

event: done
data: {}`,
      },
      error('400', 'Corpo inválido ou fluxo não elegível'),
      error('401', 'Sessão ausente'),
      error('429', 'Limite de perguntas excedido'),
      error('502', 'Falha antes de iniciar resposta'),
      error('503', 'Sem provedor automático disponível'),
    ],
    note: 'Corpo igual a /ai/chat; o stream exige roteamento automático ou provedor elegível. Após abrir o fluxo, falhas são eventos error; consuma SSE e verifique done. O exemplo é estrutural, não uma conversa real.',
  },
  {
    id: 'ai-status', group: 'Assistente e provedores', method: 'GET', path: '/ai/status', title: 'Estado dos provedores de IA',
    description: 'Informa disponibilidade de provedores clássicos, voz e saúde dos provedores; não retorna chaves.',
    access: 'Usuário autenticado (papel user ou admin); cookie de sessão obrigatório.',
    responseExamples: [
      json(`{
  "geminiAvailable": false,
  "openaiAvailable": false,
  "groqAvailable": false,
  "claudeAvailable": false,
  "speechAvailable": false,
  "providers": []
}`),
      error('401', 'Sessão ausente'),
    ],
    note: 'O OpenAPI não marca a sessão nesta operação; routes/index.ts aplica requireAuth() a todo o prefixo /ai.',
  },
  {
    id: 'ia-saude', group: 'Administração e curadoria', method: 'GET', path: '/ia/saude', title: 'Saúde detalhada dos provedores',
    description: 'Lista configuração, disponibilidade, estado, modelo, nota de privacidade, latência, taxa de erro e cooldown.',
    access: 'Admin; exige cookie de sessão com papel admin.',
    responseExamples: [
      json(`[
  {
    "id": "groq",
    "name": "Provedor",
    "configured": false,
    "available": false,
    "state": "not_configured",
    "model": "modelo",
    "privacyNote": "Nota de privacidade",
    "averageFirstTokenMs": null,
    "errorRate": 0,
    "cooldownMs": 0
  }
]`),
      error('401', 'Sessão ausente'),
      error('403', 'Papel insuficiente'),
    ],
  },
  {
    id: 'ask-stats', group: 'Administração e curadoria', method: 'GET', path: '/ask/stats', title: 'Estatísticas de respostas',
    description: 'Resume volume, distribuição por camada, tokens gastos/economizados e série diária.',
    access: 'Admin; exige cookie de sessão com papel admin.',
    responseExamples: [
      json(`{
  "total": 0,
  "byLayer": {},
  "tokensSpent": 0,
  "tokensSaved": 0,
  "daily": []
}`),
      error('401', 'Sessão ausente'),
      error('403', 'Papel insuficiente'),
    ],
  },
  {
    id: 'candidates', group: 'Administração e curadoria', method: 'GET', path: '/admin/cerebro/candidates', title: 'Listar candidatas pendentes',
    description: 'Lista candidatas de conhecimento pendentes sem embeddings internos.',
    access: 'Admin; exige cookie de sessão com papel admin.',
    responseExamples: [
      json(`[
  {
    "id": "identificador",
    "question": "Pergunta",
    "answer": "Resposta",
    "layer": "L5",
    "provider": "provedor",
    "firstSeenAt": 0,
    "lastSeenAt": 0,
    "count": 1,
    "status": "pending"
  }
]`),
      error('401', 'Sessão ausente'),
      error('403', 'Papel insuficiente'),
    ],
  },
  {
    id: 'candidate-approve', group: 'Administração e curadoria', method: 'POST', path: '/admin/cerebro/candidates/{id}/approve', title: 'Aprovar candidata',
    description: 'Move candidata pendente para o banco local ou para a base de conhecimento.',
    access: 'Admin; exige cookie de sessão com papel admin.',
    params: [{ name: 'id', in: 'path', required: true, details: 'Identificador da candidata; forneça o ID retornado pela listagem.', example: '{{CANDIDATE_ID}}' }],
    requestType: 'application/json',
    requestBody: `{
  "destination": "bank"
}`,
    responseExamples: [
      json(`{
  "ok": true
}`),
      error('400', 'Destino inválido'),
      error('401', 'Sessão ausente'),
      error('403', 'Papel insuficiente'),
      error('404', 'Candidata ausente, inválida ou com dados pessoais'),
    ],
  },
  {
    id: 'candidate-delete', group: 'Administração e curadoria', method: 'DELETE', path: '/admin/cerebro/candidates/{id}', title: 'Descartar candidata',
    description: 'Descarta uma candidata pendente ainda não revisada.',
    access: 'Admin; exige cookie de sessão com papel admin.',
    params: [{ name: 'id', in: 'path', required: true, details: 'Identificador da candidata; forneça o ID retornado pela listagem.', example: '{{CANDIDATE_ID}}' }],
    responseExamples: [
      json(`{
  "ok": true
}`),
      error('401', 'Sessão ausente'),
      error('403', 'Papel insuficiente'),
      error('404', 'Candidata inexistente ou já revisada'),
    ],
  },
  {
    id: 'ai-tts', group: 'Voz', method: 'POST', path: '/ai/tts', title: 'Gerar áudio de texto',
    description: 'Sintetiza fala e responde com bytes WAV ou MP3. Cabeçalhos X-Speech-* descrevem provedor, voz, modelo e cache.',
    access: 'Usuário autenticado (papel user ou admin); cookie de sessão obrigatório.',
    requestType: 'application/json',
    requestBody: `{
  "text": "Texto curto para sintetizar.",
  "emotion": "sorriso",
  "voice_id": "{{VOICE_ID}}"
}`,
    responseExamples: [
      { status: '200', label: 'Áudio binário', contentType: 'audio/wav ou audio/mpeg', body: 'Corpo binário de áudio; cabeçalho Content-Type indica o formato.' },
      error('400', 'Texto ou voz inválidos'),
      error('401', 'Sessão ausente'),
      error('429', 'Limite de solicitações excedido'),
      error('502', 'Não foi possível verificar a voz selecionada'),
      error('503', 'Síntese indisponível ou sem provedor configurado'),
    ],
    note: 'text: 1–1200 caracteres. emotion é opcional: entusiasmo, sério, curioso, alerta ou sorriso. voice_id deve pertencer à conta ElevenLabs.',
  },
  {
    id: 'tts-ts', group: 'Voz', method: 'POST', path: '/tts-ts', title: 'Gerar áudio com alinhamento temporal',
    description: 'Gera áudio ElevenLabs em base64 e alinhamento por caractere.',
    access: 'Usuário autenticado (papel user ou admin); middleware geral protege /tts-ts.',
    requestType: 'application/json',
    requestBody: `{
  "text": "Olá.",
  "previous_text": "",
  "emotion": "sorriso",
  "voice_id": "{{VOICE_ID}}"
}`,
    responseExamples: [
      json(`{
  "audio_base64": "BASE64_AUDIO",
  "alignment": {
    "characters": ["O", "l", "á", "."],
    "character_start_times_seconds": [0, 0, 0, 0],
    "character_end_times_seconds": [0, 0, 0, 0]
  },
  "normalized_alignment": null
}`),
      error('400', 'JSON, texto ou voz inválidos'),
      error('401', 'Sessão ausente'),
      error('413', 'Mais de 600 caracteres após normalização'),
      error('429', 'Limite excedido'),
      error('502', 'Falha do provedor'),
      error('503', 'ElevenLabs ou voz padrão indisponível'),
      error('504', 'Tempo limite de geração'),
    ],
    note: 'text até 600 caracteres; previous_text até 1200. O alinhamento inclui arrays characters, character_start_times_seconds e character_end_times_seconds.',
  },
  {
    id: 'ai-voices', group: 'Voz', method: 'GET', path: '/ai/voices', title: 'Listar vozes disponíveis',
    description: 'Lista vozes portuguesas masculinas da conta ElevenLabs configurada.',
    access: 'Usuário autenticado (papel user ou admin); cookie de sessão obrigatório.',
    params: [{ name: 'search', in: 'query', required: false, details: 'Filtro de texto opcional; máximo de 80 caracteres.', example: 'portugues' }],
    responseExamples: [
      json(`{
  "voices": [
    {
      "voiceId": "identificador",
      "name": "Nome",
      "category": "categoria",
      "description": "descrição",
      "labels": {}
    }
  ]
}`),
      error('400', 'Filtro inválido'),
      error('401', 'Sessão ausente'),
      error('502', 'Catálogo indisponível'),
      error('503', 'ElevenLabs não configurado'),
    ],
  },
  {
    id: 'ai-stt', group: 'Voz', method: 'POST', path: '/ai/stt', title: 'Transcrever áudio',
    description: 'Envia bytes de áudio ao serviço de transcrição e retorna o texto reconhecido em português.',
    access: 'Usuário autenticado (papel user ou admin); /ai/stt está sob o prefixo protegido /ai.',
    requestType: 'audio/webm, audio/ogg, audio/mp4, audio/mpeg, audio/wav ou application/octet-stream',
    requestBody: 'Corpo binário: {{AUDIO_FILE}} (mínimo 1000 bytes; máximo 8 MiB).',
    responseExamples: [
      json(`{
  "text": "Texto transcrito.",
  "ms": 123
}`),
      error('400', 'Áudio vazio ou curto demais'),
      error('401', 'Sessão ausente'),
      error('429', 'Limite de gravações excedido'),
      error('413', 'Corpo maior que o limite bruto de 8 MiB'),
      error('502', 'Falha de transcrição'),
      error('503', 'Serviço de transcrição não configurado'),
    ],
    note: 'O corpo é áudio bruto, não JSON. O handler aceita também audio/x-wav. O modelo padrão é whisper-large-v3-turbo.',
  },
  {
    id: 'finance', group: 'Dados ao vivo e ITCONT', method: 'GET', path: '/ao-vivo/financas', title: 'Consultar indicadores financeiros',
    description: 'Combina cotações e índices financeiros com atualização e falhas parciais identificadas.',
    access: 'Usuário autenticado (papel user ou admin); cookie de sessão obrigatório pelo prefixo /ao-vivo.',
    responseExamples: [
      json(`{
  "moedas": [
    { "codigo": "USD", "nome": "Dólar", "valor": 0, "variacao": null }
  ],
  "indices": {
    "selic": { "valor": 0, "data": "data" }
  },
  "serieDolar": [
    { "d": "dd/mm", "v": 0 }
  ],
  "atualizado": "data e hora",
  "falhas": [],
  "fala": "Frase curta para leitura"
}`),
      error('502', 'Falha geral no serviço de cotações'),
      error('401', 'Sessão ausente'),
    ],
    note: 'Falha de uma fonte pode resultar em 200 parcial, detalhada em falhas. moedas pode incluir USD, EUR, UYU, ARS e BTC; índices incluem Selic, IPCA de 12 meses e CDI. Cache de cinco minutos.',
  },
  {
    id: 'weather', group: 'Dados ao vivo e ITCONT', method: 'GET', path: '/ao-vivo/tempo', title: 'Consultar previsão do tempo',
    description: 'Retorna condições atuais e previsão para hoje ou amanhã; cidade padrão: Feira de Santana.',
    access: 'Usuário autenticado (papel user ou admin); cookie de sessão obrigatório pelo prefixo /ao-vivo.',
    params: [
      { name: 'cidade', in: 'query', required: false, details: 'Cidade consultada; padrão Feira de Santana.', example: 'Feira%20de%20Santana' },
      { name: 'dia', in: 'query', required: false, details: 'Somente "amanha" seleciona amanhã; qualquer outro valor usa hoje.', example: 'amanha' },
    ],
    responseExamples: [
      json(`{
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
}`),
      error('502', 'Fonte de previsão indisponível'),
      error('401', 'Sessão ausente'),
    ],
    note: 'Exceto fala, os campos podem estar ausentes; chuva, umidade e código podem ser null. Cidade não encontrada ainda retorna 200 com fala informativa. Cache de dez minutos.',
  },
  {
    id: 'itcont-event', group: 'Dados ao vivo e ITCONT', method: 'GET', path: '/itcont/events/{slug}', title: 'Detalhar evento ITCONT',
    description: 'Retorna informações públicas do evento, sessões, convidados e categorias de inscrição.',
    access: 'Usuário autenticado (papel user ou admin); sessão exigida pelo prefixo /itcont.',
    params: [{ name: 'slug', in: 'path', required: true, details: '3–100 caracteres; apenas minúsculas, números e hífens.', example: '{{EVENT_SLUG}}' }],
    responseExamples: [
      json(`{
  "event": {
    "slug": "{{EVENT_SLUG}}",
    "title": "Título",
    "summary": "Resumo",
    "description": "Descrição",
    "startsOn": "YYYY-MM-DD",
    "endsOn": "YYYY-MM-DD",
    "timezone": "America/Sao_Paulo",
    "venue": "Local",
    "address": "Endereço",
    "city": "Cidade",
    "state": "UF",
    "country": "Brasil",
    "organizerName": "Organização",
    "organizingProject": "Projeto",
    "bannerUrl": "https://example.invalid/banner",
    "logoUrl": "https://example.invalid/logo",
    "sourceUrl": "https://example.invalid/evento",
    "updatedAt": "2026-01-01T00:00:00.000Z"
  },
  "sessions": [],
  "guests": [],
  "registrationCategories": []
}`),
      error('400', 'Slug inválido'),
      error('401', 'Sessão ausente'),
      error('404', 'Evento não encontrado'),
      error('500', 'Falha inesperada ou dado obrigatório inconsistente'),
      error('503', 'Banco de dados não configurado'),
    ],
    note: 'Os endereços example.invalid são apenas marcadores ilustrativos e não links reais. O OpenAPI e o handler incluem 500 sanitizado, não listado na referência Markdown.',
  },
];
