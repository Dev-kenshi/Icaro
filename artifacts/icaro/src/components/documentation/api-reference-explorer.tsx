import { useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  CircleHelp,
  Clipboard,
  FileJson2,
  KeyRound,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { apiEndpoints, type ApiEndpoint } from './api-endpoints';

type CodeLanguage = 'curl' | 'javascript';
const API_ROOT = 'https://{{BASE_URL}}/api';

function concretePath(endpoint: ApiEndpoint) {
  return endpoint.path
    .replace('{id}', '{{CANDIDATE_ID}}')
    .replace('{slug}', '{{EVENT_SLUG}}');
}

function requestUrl(endpoint: ApiEndpoint) {
  const path = concretePath(endpoint);
  if (endpoint.id === 'ai-voices') return `${API_ROOT}${path}?search={{SEARCH_TERM}}`;
  if (endpoint.id === 'weather') return `${API_ROOT}${path}?cidade={{CITY}}&dia=amanha`;
  return `${API_ROOT}${path}`;
}

function curlSnippet(endpoint: ApiEndpoint) {
  const url = requestUrl(endpoint);
  const lines = endpoint.id === 'auth-login' ? ['umask 077'] : [];
  lines.push(`curl --request ${endpoint.method} \\`, `  --url '${url}' \\`);
  if (endpoint.id === 'auth-login') {
    lines.push("  --cookie-jar '/tmp/icaro-session.txt' \\");
  } else if (endpoint.id === 'auth-logout') {
    lines.push("  --cookie '/tmp/icaro-session.txt' \\");
    lines.push("  --cookie-jar '/tmp/icaro-session.txt' \\");
  } else if (endpoint.id === 'auth-me' || endpoint.access.includes('autenticado') || endpoint.access.startsWith('Admin')) {
    lines.push("  --cookie '/tmp/icaro-session.txt' \\");
  }
  if (endpoint.id === 'ai-chat-stream') lines.push("  --header 'Accept: text/event-stream' \\");
  if (endpoint.requestType) {
    const contentType = endpoint.requestType.includes(',')
      ? 'audio/webm'
      : endpoint.requestType;
    lines.push(`  --header 'Content-Type: ${contentType}' \\`);
  }
  if (endpoint.requestBody) {
    const isBinary = endpoint.id === 'ai-stt';
    lines.push(isBinary
      ? "  --data-binary '@{{AUDIO_FILE}}'"
      : `  --data '${endpoint.requestBody.replaceAll("'", "'\\''")}'`);
  }
  if (lines.at(-1)?.endsWith(' \\')) lines[lines.length - 1] = lines.at(-1)!.slice(0, -2);
  return lines.join('\n');
}

function javascriptSnippet(endpoint: ApiEndpoint) {
  if (endpoint.id === 'ai-stt') {
    return `const picker = document.createElement("input");
picker.type = "file";
picker.accept = "audio/*";
const audioFile = await new Promise(resolve => {
  picker.onchange = () => resolve(picker.files?.[0]);
  picker.click();
});
if (!audioFile) throw new Error("Selecione um arquivo de áudio.");

const response = await fetch("${requestUrl(endpoint)}", {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": audioFile.type || "application/octet-stream" },
  body: audioFile,
});
const result = await response.json();`;
  }
  const lines = [
    `const response = await fetch("${requestUrl(endpoint)}", {`,
    `  method: "${endpoint.method}",`,
    '  credentials: "include",',
  ];
  if (endpoint.id === 'ai-chat-stream') lines.push('  headers: { Accept: "text/event-stream", "Content-Type": "application/json" },');
  else if (endpoint.requestType) {
    const contentType = endpoint.requestType.includes(',') ? 'audio/webm' : endpoint.requestType;
    lines.push(`  headers: { "Content-Type": "${contentType}" },`);
  }
  if (endpoint.requestBody) lines.push(`  body: JSON.stringify(${endpoint.requestBody}),`);
  lines.push('});');
  if (endpoint.id === 'ai-chat-stream') {
    lines.push('const eventStream = response.body; // Consumir os eventos SSE até done ou error.');
  } else if (endpoint.id === 'ai-tts') {
    lines.push('const audio = await response.blob(); // Content-Type será audio/wav ou audio/mpeg.');
  } else if (endpoint.id === 'auth-logout') {
    lines.push('// Resposta 204: sem corpo.');
  } else {
    lines.push('const result = response.status === 204 ? null : await response.json();');
  }
  return lines.join('\n');
}

function methodTone(method: ApiEndpoint['method']) {
  if (method === 'GET') return 'border-emerald-700/20 bg-emerald-700/10 text-emerald-800 dark:text-emerald-300';
  if (method === 'POST') return 'border-sky-700/20 bg-sky-700/10 text-sky-800 dark:text-sky-300';
  return 'border-rose-700/20 bg-rose-700/10 text-rose-800 dark:text-rose-300';
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setFailed(false);
      window.setTimeout(() => setCopied(false), 1700);
    } catch {
      setFailed(true);
      setCopied(false);
    }
  };
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={copy}
        className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-border bg-background/70 px-2.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
        aria-label={`Copiar ${label}`}
      >
        {copied ? <Check size={14} aria-hidden="true" /> : <Clipboard size={14} aria-hidden="true" />}
        {copied ? 'Copiado' : 'Copiar'}
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? `${label} copiado.` : failed ? 'Não foi possível copiar. Verifique a permissão da área de transferência.' : ''}
      </span>
      {failed && <span className="text-[11px] text-destructive">Falha ao copiar</span>}
    </div>
  );
}

function CodeSample({ endpoint }: { endpoint: ApiEndpoint }) {
  const [language, setLanguage] = useState<CodeLanguage>('curl');
  const snippet = language === 'curl' ? curlSnippet(endpoint) : javascriptSnippet(endpoint);
  return (
    <section className="overflow-hidden rounded-xl border border-border" aria-label="Exemplos de chamada">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/45 px-3 py-2">
        <div className="flex items-center gap-1" role="tablist" aria-label="Linguagem do exemplo">
          {(['curl', 'javascript'] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={language === option}
              onClick={() => setLanguage(option)}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${language === option ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {option === 'curl' ? 'cURL' : 'JavaScript'}
            </button>
          ))}
        </div>
        <CopyButton text={snippet} label={language === 'curl' ? 'cURL' : 'JavaScript'} />
      </div>
      <pre className="api-docs-code api-docs-scrollbar max-h-[420px] overflow-auto p-4" aria-label={`Exemplo ${language}`}>
        <code>{snippet}</code>
      </pre>
    </section>
  );
}

export default function ApiReferenceExplorer() {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(apiEndpoints[0].id);
  const [responseIndex, setResponseIndex] = useState(0);
  const normalizedQuery = query.trim().toLocaleLowerCase('pt-BR');
  const filteredEndpoints = useMemo(() => apiEndpoints.filter((endpoint) => {
    const haystack = `${endpoint.method} ${endpoint.path} ${endpoint.title} ${endpoint.description} ${endpoint.group}`.toLocaleLowerCase('pt-BR');
    return haystack.includes(normalizedQuery);
  }), [normalizedQuery]);
  const selectedEndpoint = filteredEndpoints.find((endpoint) => endpoint.id === selectedId) ?? filteredEndpoints[0];
  const groups = useMemo(() => [...new Set(filteredEndpoints.map((endpoint) => endpoint.group))], [filteredEndpoints]);

  const selectEndpoint = (id: string) => {
    setSelectedId(id);
    setResponseIndex(0);
  };

  if (!selectedEndpoint) {
    return (
      <div className="api-docs rounded-2xl border border-border bg-card p-6 sm:p-8">
        <div className="mx-auto max-w-md py-10 text-center">
          <Search size={22} className="mx-auto text-muted-foreground" aria-hidden="true" />
          <h2 className="mt-3 font-semibold">Nenhuma operação encontrada</h2>
          <p className="mt-1 text-sm text-muted-foreground">Tente outro termo, método ou caminho.</p>
          <button type="button" onClick={() => setQuery('')} className="mt-4 rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-muted">
            Limpar busca
          </button>
        </div>
      </div>
    );
  }

  const response = selectedEndpoint.responseExamples[Math.min(responseIndex, selectedEndpoint.responseExamples.length - 1)];
  const path = concretePath(selectedEndpoint);
  const isAuthenticated = selectedEndpoint.access.includes('autenticado') || selectedEndpoint.access.startsWith('Admin');

  return (
    <div className="api-docs overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="grid min-h-[720px] lg:grid-cols-[265px_minmax(0,1fr)]">
        <aside className="border-b border-border bg-background/55 lg:border-b-0 lg:border-r" aria-label="Explorador de endpoints">
          <div className="border-b border-border p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="eyebrow">Coleção Ícaro</p>
                <p className="mt-1 text-sm font-semibold">REST · /api</p>
              </div>
              <span className="rounded-full border border-border bg-card px-2 py-1 font-mono-data text-[10px] text-muted-foreground">{apiEndpoints.length} operações</span>
            </div>
            <label className="relative mt-4 block">
              <span className="sr-only">Buscar operação</span>
              <Search size={15} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar rota ou método"
                className="h-10 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm outline-none transition focus:border-primary"
                aria-label="Buscar rota ou método"
              />
            </label>
          </div>
          <nav className="api-docs-scrollbar max-h-[34rem] overflow-auto p-2 lg:sticky lg:top-3 lg:max-h-[calc(100dvh-15rem)]" aria-label="Operações da API">
            {groups.map((group) => (
              <div key={group} className="mb-3">
                <p className="px-2 pb-1.5 pt-2 font-mono-data text-[9px] font-bold uppercase tracking-[.12em] text-muted-foreground">{group}</p>
                <ul className="space-y-0.5">
                  {filteredEndpoints.filter((endpoint) => endpoint.group === group).map((endpoint) => (
                    <li key={endpoint.id}>
                      <button
                        type="button"
                        aria-current={selectedEndpoint.id === endpoint.id ? 'true' : undefined}
                        onClick={() => selectEndpoint(endpoint.id)}
                        className="api-docs-navitem flex min-h-11 w-full items-center gap-2 rounded-lg border border-transparent px-2 text-left transition-colors"
                      >
                        <span className={`min-w-[43px] rounded border px-1.5 py-0.5 text-center font-mono-data text-[9px] font-bold ${methodTone(endpoint.method)}`}>{endpoint.method}</span>
                        <span className="min-w-0 flex-1">
                          <span className="api-docs-navpath block truncate font-mono-data text-[10px] text-muted-foreground">{endpoint.path}</span>
                          <span className="block truncate text-[10px] text-muted-foreground/80">{endpoint.title}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        <main className="api-docs-panel min-w-0 p-4 sm:p-6 lg:p-8" key={selectedEndpoint.id} aria-label={`Documentação ${selectedEndpoint.method} ${selectedEndpoint.path}`}>
          <aside className="mb-5 rounded-xl border border-accent/25 bg-accent/5 p-3.5 text-xs leading-5 text-muted-foreground" aria-label="Notas sobre diferenças entre implementação e contrato">
            <p className="font-semibold text-foreground">Implementação Express como fonte de verdade</p>
            <p className="mt-1">
              O OpenAPI é parcial: não lista login/logout/me, STT, finanças ou clima; também não sinaliza sessão em rotas protegidas de /ai, /tts-ts e /ao-vivo. routes/index.ts aplica essas proteções. Em ITCONT, o handler ainda pode responder 500 sanitizado, além dos status de validação e indisponibilidade listados no contrato.
            </p>
          </aside>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span>Ícaro API</span><span aria-hidden="true">/</span><span>{selectedEndpoint.group}</span>
          </div>
          <div className="mt-5 border-b border-border pb-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-md border px-2 py-1 font-mono-data text-[11px] font-bold ${methodTone(selectedEndpoint.method)}`}>{selectedEndpoint.method}</span>
              <code className="min-w-0 break-all font-mono-data text-sm font-semibold sm:text-base">{path}</code>
            </div>
            <h2 className="mt-4 font-display text-2xl font-bold tracking-tight sm:text-3xl">{selectedEndpoint.title}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{selectedEndpoint.description}</p>
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
              <span className="inline-flex items-center gap-1.5 text-foreground">
                {isAuthenticated ? <KeyRound size={14} className="text-accent" aria-hidden="true" /> : <ShieldCheck size={14} className="text-secondary" aria-hidden="true" />}
                <span className="font-semibold">Acesso</span>
              </span>
              <span className="text-muted-foreground">{selectedEndpoint.access}</span>
            </div>
          </div>

          {isAuthenticated && (
            <div className="mt-4 flex gap-2 rounded-lg border border-secondary/20 bg-secondary/5 p-3 text-xs leading-5 text-muted-foreground">
              <KeyRound size={15} className="mt-0.5 shrink-0 text-secondary" aria-hidden="true" />
              <p><strong className="text-foreground">Sessão Ícaro.</strong> A autenticação usa o cookie HttpOnly icaro_session. No navegador, use credentials: "include"; em cURL, reutilize o cookie obtido no login. Não envie nem registre o valor do cookie.</p>
            </div>
          )}

          <div className="mt-6 grid gap-7 xl:grid-cols-[minmax(0,1.1fr)_minmax(290px,.9fr)]">
            <div className="min-w-0 space-y-6">
              <section>
                <div className="mb-3 flex items-center gap-2">
                  <h3 className="text-sm font-bold">Parâmetros</h3>
                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono-data text-[9px] text-muted-foreground">{(selectedEndpoint.params ?? []).length}</span>
                </div>
                {selectedEndpoint.params?.length ? (
                  <div className="overflow-hidden rounded-xl border border-border">
                    {selectedEndpoint.params.map((parameter) => (
                      <div key={`${parameter.in}-${parameter.name}`} className="grid gap-2 border-b border-border p-3 last:border-b-0 sm:grid-cols-[100px_1fr]">
                        <div>
                          <code className="font-mono-data text-xs font-bold">{parameter.name}</code>
                          <p className="mt-1 font-mono-data text-[9px] uppercase tracking-wide text-muted-foreground">{parameter.in}{parameter.required ? ' · obrigatório' : ' · opcional'}</p>
                        </div>
                        <div>
                          <p className="text-xs leading-5 text-muted-foreground">{parameter.details}</p>
                          {parameter.example && <p className="mt-1 font-mono-data text-[10px] text-foreground">Exemplo: {parameter.example}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">Esta operação não declara parâmetros de caminho ou consulta.</p>
                )}
              </section>

              {selectedEndpoint.requestBody && (
                <section>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="inline-flex items-center gap-2 text-sm font-bold"><FileJson2 size={15} className="text-secondary" aria-hidden="true" /> Corpo da requisição</h3>
                    <span className="rounded bg-muted px-2 py-1 font-mono-data text-[10px] text-muted-foreground">{selectedEndpoint.requestType}</span>
                  </div>
                  <pre className="api-docs-code api-docs-scrollbar max-h-72 overflow-auto rounded-xl p-4"><code>{selectedEndpoint.requestBody}</code></pre>
                  {selectedEndpoint.id === 'ai-stt' && <p className="mt-2 text-xs leading-5 text-muted-foreground">Envie os bytes diretamente, sem envelope JSON. Limite do handler: 8 MiB.</p>}
                </section>
              )}

              {selectedEndpoint.note && (
                <aside className="flex gap-2 rounded-lg border border-accent/25 bg-accent/5 p-3 text-xs leading-5 text-muted-foreground">
                  <CircleHelp size={15} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
                  <p>{selectedEndpoint.note}</p>
                </aside>
              )}
            </div>

            <div className="min-w-0 space-y-6">
              <section>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-bold">Exemplo de resposta</h3>
                  <label className="relative">
                    <span className="sr-only">Selecionar exemplo de resposta</span>
                    <select
                      value={responseIndex}
                      onChange={(event) => setResponseIndex(Number(event.target.value))}
                      className="h-8 appearance-none rounded-lg border border-input bg-background pl-2.5 pr-8 text-xs font-medium outline-none focus:border-primary"
                      aria-label="Selecionar exemplo de resposta"
                    >
                      {selectedEndpoint.responseExamples.map((item, index) => (
                        <option key={`${item.status}-${item.label}`} value={index}>{item.status} · {item.label}</option>
                      ))}
                    </select>
                    <ChevronDown size={13} aria-hidden="true" className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  </label>
                </div>
                <div className="overflow-hidden rounded-xl border border-border">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/45 px-3 py-2">
                    <span className="font-mono-data text-[10px] text-muted-foreground">{response.contentType}</span>
                    <span className={`rounded px-1.5 py-0.5 font-mono-data text-[10px] font-bold ${response.status.startsWith('2') ? 'bg-secondary/10 text-secondary' : 'bg-accent/10 text-accent'}`}>{response.status}</span>
                  </div>
                  <pre className="api-docs-code api-docs-scrollbar max-h-[380px] overflow-auto p-4"><code>{response.body}</code></pre>
                </div>
              </section>
              <section>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold">Exemplos de chamada</h3>
                  <span className="font-mono-data text-[9px] text-muted-foreground">sem execução</span>
                </div>
                <CodeSample key={selectedEndpoint.id} endpoint={selectedEndpoint} />
              </section>
            </div>
          </div>
          <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-[10px] text-muted-foreground">
            <span>Base de exemplos: https://{'{{BASE_URL}}'}/api</span>
            <span>Referência da implementação Express</span>
          </div>
        </main>
      </div>
    </div>
  );
}
