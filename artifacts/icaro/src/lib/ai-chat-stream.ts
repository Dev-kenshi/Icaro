import type { AiChatInput } from '@workspace/api-client-react';
import type { SpeechEmotionMark } from './speech-plan';

export type PainelFinanceiro = {
  titulo: string;
  linhas: Array<{ conta: string; debito: number; credito: number }>;
  totais: { debito: number; credito: number };
  destaque?: { rotulo: string; valor: number };
};

export type AiChatStreamResult = {
  answer: string;
  provider: string;
  model: string;
  layer?: string;
  painel?: PainelFinanceiro;
  emotionMarks: SpeechEmotionMark[];
};

function isPainel(value: unknown): value is PainelFinanceiro {
  const painel = value as PainelFinanceiro | null;
  return !!painel && typeof painel.titulo === 'string' && Array.isArray(painel.linhas)
    && painel.linhas.every((linha) => typeof linha?.conta === 'string' && typeof linha.debito === 'number' && typeof linha.credito === 'number')
    && typeof painel.totais?.debito === 'number' && typeof painel.totais?.credito === 'number';
}

const EMOTIONS = new Set(['entusiasmo', 'sério', 'curioso', 'alerta', 'sorriso']);

export async function requestAiChatStream(
  input: AiChatInput,
  signal: AbortSignal,
  onToken?: (text: string) => void,
): Promise<AiChatStreamResult> {
  const response = await fetch(`${import.meta.env.BASE_URL}api/ai/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    credentials: 'include',
    body: JSON.stringify(input),
    signal,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: unknown } | null;
    throw new Error(typeof payload?.error === 'string' ? payload.error : `A resposta do Ícaro falhou (${response.status}).`);
  }
  if (!response.body) throw new Error('O fluxo de resposta do Ícaro está vazio.');

  const result: AiChatStreamResult = { answer: '', provider: '', model: '', emotionMarks: [] };
  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let pending = '';
  let doneSeen = false;

  const consume = (block: string) => {
    let event = 'message';
    const data: string[] = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith(':')) continue;
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
    }
    if (!data.length) return;
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(data.join('\n')) as Record<string, unknown>;
    } catch {
      throw new Error('O fluxo de resposta do Ícaro continha um evento inválido.');
    }

    if (event === 'provider') {
      if (typeof payload.provider === 'string') result.provider = payload.provider;
      if (typeof payload.model === 'string') result.model = payload.model;
    } else if (event === 'token' && typeof payload.text === 'string') {
      result.answer += payload.text;
      onToken?.(payload.text);
    } else if (event === 'emocao' && typeof payload.emotion === 'string' && EMOTIONS.has(payload.emotion)) {
      result.emotionMarks.push({ offset: result.answer.length, emotion: payload.emotion as SpeechEmotionMark['emotion'] });
    } else if (event === 'done') {
      doneSeen = true;
      if (typeof payload.provider === 'string') result.provider = payload.provider;
      if (typeof payload.model === 'string') result.model = payload.model;
      if (typeof payload.layer === 'string') result.layer = payload.layer;
      if (isPainel(payload.painel)) result.painel = payload.painel;
    } else if (event === 'error') {
      throw new Error(typeof payload.error === 'string' ? payload.error : 'Os provedores não conseguiram responder.');
    }
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      const blocks = pending.split(/\r?\n\r?\n/);
      pending = blocks.pop() ?? '';
      for (const block of blocks) consume(block);
    }
    pending += decoder.decode();
    if (pending.trim()) consume(pending);
  } catch (error) {
    await reader.cancel(error).catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  if (!doneSeen || !result.answer.trim()) throw new Error('O Ícaro encerrou a resposta antes de concluir.');
  return result;
}