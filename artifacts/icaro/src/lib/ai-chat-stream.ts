import type { AiChatInput } from '@workspace/api-client-react';
import type { SpeechEmotionMark } from './speech-plan';

export type AiChatStreamResult = {
  answer: string;
  provider: string;
  model: string;
  layer?: string;
  emotionMarks: SpeechEmotionMark[];
  sources?: { title: string; url: string }[];
};

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

  const result: AiChatStreamResult = { answer: '', provider: '', model: '', emotionMarks: [], sources: [] };
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
    } else if (event === 'sources' && Array.isArray(payload)) {
      result.sources = payload.flatMap((source) => {
        if (!source || typeof source !== 'object') return [];
        const item = source as { title?: unknown; url?: unknown };
        if (typeof item.title !== 'string' || typeof item.url !== 'string') return [];
        try {
          const url = new URL(item.url);
          return url.protocol === 'https:' || url.protocol === 'http:'
            ? [{ title: item.title, url: url.href }]
            : [];
        } catch {
          return [];
        }
      });
    } else if (event === 'done') {
      doneSeen = true;
      if (typeof payload.provider === 'string') result.provider = payload.provider;
      if (typeof payload.model === 'string') result.model = payload.model;
      if (typeof payload.layer === 'string') result.layer = payload.layer;
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