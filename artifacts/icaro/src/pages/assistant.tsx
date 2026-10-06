import { useMemo, useState } from 'react';
import { Bot, Check, ChevronDown, CircleAlert, LockKeyhole, Send, Sparkles, UserRound } from 'lucide-react';
import { getGetAiStatusQueryKey, useGetAiStatus, useSendAiMessage, type AiChatHistoryMessageRole, type AiChatResponse } from '@workspace/api-client-react';
import { useDataset } from '@/lib/dataset-context';

type ChatMessage = { role: AiChatHistoryMessageRole; content: string; model?: string };
type Provider = 'auto' | 'groq' | 'gemini' | 'openai' | 'claude' | 'cerebras' | 'openrouter' | 'mistral' | 'github' | 'nvidia' | 'cloudflare' | 'huggingface' | 'cohere';
type ProviderStatusData = {
  providers: Array<{
    id: Provider;
    name: string;
    configured: boolean;
    available: boolean;
    state: string;
    model: string;
    privacyNote: string;
    averageFirstTokenMs: number | null;
    errorRate: number;
    cooldownMs: number;
  }>;
};
const AUTO_PROVIDER_IDS = new Set(['groq', 'gemini', 'cerebras', 'openrouter', 'mistral', 'github', 'nvidia', 'cloudflare', 'huggingface', 'cohere']);

export default function Assistant() {
  const { dataset } = useDataset();
  const status = useGetAiStatus({ query: { queryKey: getGetAiStatusQueryKey() } });
  const sendMessage = useSendAiMessage();
  const [provider, setProvider] = useState<Provider>('auto');
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const providers = status.data?.providers ?? [];
  const available = provider === 'auto'
    ? providers.some((item) => AUTO_PROVIDER_IDS.has(item.id) && item.available)
    : providers.some((item) => item.id === provider && item.available);
  const history = useMemo(() => messages.slice(-12).map(({ role, content }) => ({ role, content })), [messages]);
  const submit = () => {
    const trimmed = question.trim();
    if (!trimmed || !available || sendMessage.isPending) return;
    setQuestion('');
    setMessages((current) => [...current, { role: 'user', content: trimmed }]);
    sendMessage.mutate({ data: {
      provider,
      question: trimmed,
      history,
      dataset: dataset ? { name: dataset.name, columns: dataset.columns, sampleRows: dataset.sampleRows, summary: dataset.summary } : null,
    } }, {
      onSuccess: (response: AiChatResponse) => setMessages((current) => [...current, { role: 'assistant', content: response.answer, model: response.model }]),
       onError: (error) => {
         setQuestion(trimmed);
         setMessages((current) => [...current, { role: 'assistant', content: getApiErrorMessage(error) }]);
       },
    });
  };

  return <div className="mx-auto max-w-[1060px] space-y-8">
    <header className="animate-rise"><div className="eyebrow mb-3">Copiloto / pergunta orientada por dados</div><h1 className="font-display text-5xl leading-none text-primary">Converse com o que você importou.</h1><p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">Faça perguntas específicas, peça próximos passos ou explore uma anomalia. O contexto enviado é sempre visível antes do envio.</p></header>
    <section className="grid gap-5 lg:grid-cols-[1fr_290px]">
      <div className="flex min-h-[540px] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
        <div className="flex items-center justify-between border-b border-border px-5 py-4"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-secondary/15 text-secondary"><Bot size={18} /></span><div><div className="text-sm font-bold text-primary">Ícaro Copiloto</div><div className="font-mono-data text-[10px] text-muted-foreground">{dataset ? `${dataset.name} em contexto` : 'sem dataset em contexto'}</div></div></div><ProviderPicker value={provider} setValue={setProvider} status={status.data} /></div>
        <div className="flex-1 space-y-5 overflow-y-auto p-5 sm:p-7">
          {!messages.length && <div className="flex min-h-[320px] flex-col items-center justify-center text-center"><div className="mb-5 grid h-16 w-16 place-items-center rounded-[22px] border border-secondary/25 bg-secondary/10 text-secondary"><Sparkles size={27} /></div><h2 className="font-display text-3xl text-primary">Por onde começamos?</h2><p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">{dataset ? 'Seu arquivo está disponível como contexto. Experimente perguntar sobre uma coluna, uma lacuna ou uma decisão operacional.' : 'Importe um CSV para perguntas contextualizadas ou faça uma pergunta geral ao provedor disponível.'}</p><div className="mt-6 flex flex-wrap justify-center gap-2">{(dataset ? ['O que merece atenção?', 'Compare os campos numéricos', 'Sugira próximos passos'] : ['Como você pode me ajudar?', 'Que tipo de análise posso fazer?']).map((suggestion) => <button type="button" key={suggestion} onClick={() => setQuestion(suggestion)} className="rounded-full border border-border px-3 py-2 text-xs text-muted-foreground transition hover:border-secondary hover:text-primary" data-testid={`button-suggestion-${suggestion.toLowerCase().replaceAll(' ', '-')}`}>{suggestion}</button>)}</div></div>}
          {messages.map((message, index) => <div key={`${message.role}-${index}`} className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : ''}`} data-testid={`message-${message.role}-${index}`}><div className={`flex max-w-[88%] gap-3 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${message.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-secondary/15 text-secondary'}`}>{message.role === 'user' ? <UserRound size={15} /> : <Bot size={15} />}</span><div className={`rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === 'user' ? 'rounded-tr-sm bg-primary text-primary-foreground' : 'rounded-tl-sm bg-muted text-foreground'}`}>{message.content}{message.model && <div className="mt-3 font-mono-data text-[10px] text-muted-foreground">respondido por {message.model}</div>}</div></div></div>)}
          {sendMessage.isPending && <div className="flex gap-3" role="status" aria-live="polite" data-testid="status-ai-loading"><span className="grid h-8 w-8 place-items-center rounded-lg bg-secondary/15 text-secondary"><Bot size={15} /></span><div className="flex items-center gap-1 rounded-2xl rounded-tl-sm bg-muted px-4 py-3"><span className="sr-only">Ícaro está preparando uma resposta</span><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-secondary" /><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-secondary [animation-delay:120ms]" /><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-secondary [animation-delay:240ms]" /></div></div>}
        </div>
         <div className="border-t border-border p-4"><div className="rounded-2xl border border-input bg-background p-2 transition focus-within:border-secondary focus-within:ring-2 focus-within:ring-secondary/15"><textarea value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit(); } }} placeholder={available === false ? (status.isLoading ? 'Consultando disponibilidade dos provedores…' : status.isError ? 'Não foi possível verificar os provedores.' : 'Nenhum provedor selecionado está disponível.') : 'Escreva uma pergunta sobre seus dados…'} className="min-h-[76px] w-full resize-none bg-transparent px-2 py-1 text-sm leading-6 outline-none placeholder:text-muted-foreground" aria-label="Pergunta para o copiloto" data-testid="input-ai-question" /><div className="flex items-center justify-between gap-3 px-2 pt-2"><span className="text-[10px] text-muted-foreground">Enter envia · Shift + Enter quebra linha</span><button type="button" onClick={submit} disabled={!question.trim() || available === false || sendMessage.isPending} aria-busy={sendMessage.isPending} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40" data-testid="button-send-ai"><Send size={14} /> {sendMessage.isPending ? 'Enviando…' : 'Enviar'}</button></div></div></div>
      </div>
      <aside className="space-y-4">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-xs"><div className="eyebrow">Contexto da pergunta</div><h2 className="mt-2 text-sm font-bold text-primary">O que será compartilhado</h2><div className="mt-4 flex items-start gap-3 text-xs leading-5 text-muted-foreground"><LockKeyhole size={15} className="mt-0.5 shrink-0 text-secondary" /><span>Somente ao enviar: nome, colunas, resumo e até 12 linhas iniciais do CSV atual.</span></div><div className="mt-4 rounded-xl bg-muted p-3 font-mono-data text-[10px] text-muted-foreground">{dataset ? <><div className="truncate font-bold text-primary">{dataset.name}</div><div className="mt-1">{dataset.columns.length} colunas · {dataset.rows.length} linhas locais</div></> : 'Nenhum dataset selecionado'}</div><p className="mt-4 text-[11px] leading-5 text-muted-foreground">Ícaro nunca pede API keys no navegador. A configuração dos provedores é feita no ambiente seguro do workspace.</p></div>
        <ProviderStatus status={status.data} loading={status.isLoading} error={status.isError} onRetry={() => void status.refetch()} />
        {sendMessage.isError && <div role="alert" className="flex gap-2 rounded-xl border border-destructive/25 bg-destructive/10 p-3 text-xs leading-5 text-destructive" data-testid="status-ai-error"><CircleAlert size={15} className="mt-0.5 shrink-0" /> O provedor retornou um erro. Sua pergunta continua na conversa; envie novamente ou selecione outro provedor disponível.</div>}
      </aside>
    </section>
  </div>;
}

function ProviderPicker({ value, setValue, status }: { value: Provider; setValue: (value: Provider) => void; status?: ProviderStatusData }) {
  const providerRows = status?.providers ?? [];
  const autoAvailable = providerRows.some((item) => AUTO_PROVIDER_IDS.has(item.id) && item.available);
  return <div className="relative">
    <select value={value} onChange={(event) => setValue(event.target.value as Provider)} className="appearance-none rounded-lg border border-border bg-background py-2 pl-3 pr-8 text-xs font-semibold text-primary outline-none" aria-label="Selecionar provedor" data-testid="select-ai-provider">
      <option value="auto" disabled={!autoAvailable}>Automático {autoAvailable ? '· roteamento ativo' : '· sem provedores disponíveis'}</option>
      {providerRows.map((item) => <option key={item.id} value={item.id} disabled={!item.available}>{item.name} · {item.available ? 'disponível' : item.configured ? item.state.replaceAll('_', ' ') : 'não configurado'}</option>)}
    </select>
    <ChevronDown size={14} className="pointer-events-none absolute right-2 top-2.5 text-muted-foreground" />
  </div>;
}

function ProviderStatus({ status, loading, error, onRetry }: { status?: ProviderStatusData; loading: boolean; error: boolean; onRetry: () => void }) {
  return <div className="rounded-2xl border border-border bg-card p-5 shadow-xs"><div className="eyebrow">Configuração do ambiente</div><h2 className="mt-2 text-sm font-bold text-primary">Provedores de IA</h2>{loading ? <div className="mt-4 space-y-2" role="status" aria-label="Carregando provedores">{[0, 1, 2, 3].map((i) => <div key={i} className="h-8 animate-pulse rounded-lg bg-muted" />)}</div> : error || !status ? <div className="mt-4 flex flex-wrap items-center gap-2 text-xs leading-5 text-destructive" role="alert"><CircleAlert size={15} className="mt-0.5" /> Não foi possível consultar os provedores.<button type="button" onClick={onRetry} className="font-semibold underline underline-offset-2" data-testid="button-retry-providers">Tentar novamente</button></div> : <div className="mt-4 max-h-80 space-y-2 overflow-y-auto">{status.providers.map((item) => <div key={item.id} className="rounded-lg bg-muted/70 px-3 py-2.5 text-xs"><div className="flex items-center justify-between gap-3"><span className="font-semibold text-primary">{item.name}</span>{item.available ? <span className="flex shrink-0 items-center gap-1.5 text-secondary"><Check size={13} /> disponível</span> : <span className="shrink-0 text-muted-foreground">{item.configured ? 'Configurado · indisponível no momento' : 'não configurado'}</span>}</div>{item.configured && <div className="mt-1 truncate font-mono-data text-[10px] text-muted-foreground">{item.model}{item.averageFirstTokenMs !== null ? ` · ${item.averageFirstTokenMs} ms até a primeira resposta` : ''}</div>}</div>)}</div>}</div>;
}

function getApiErrorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = error.data;
    if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') {
      return data.error;
    }
  }

  return error instanceof Error
    ? error.message
    : 'Não foi possível concluir a pergunta. Verifique o status do provedor e tente novamente.';
}
