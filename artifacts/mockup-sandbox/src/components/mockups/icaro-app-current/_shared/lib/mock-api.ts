import { useState } from 'react';

export type AiChatHistoryMessageRole = 'user' | 'assistant';
export type AiChatResponse = { answer: string; provider: string; model: string; layer?: string };
export type AiVoiceCatalog = { voices: Array<{ voiceId: string; name: string; labels: Record<string, string>; description?: string | null }> };
export type CosmosFeedsResponse = {
  updatedAt: number;
  stale: boolean;
  ttlSeconds: number;
  iss: { current: { latitude: number; longitude: number; altitudeKm: number; velocityKmh: number; visibility: string; timestamp: number }; trajectory: Array<{ latitude: number; longitude: number; timestamp: number }>; nextPassAt: number | null; nextPassDistanceKm: number | null };
  earthquakes: Array<{ id: string; magnitude: number; place: string; latitude: number; longitude: number; depthKm: number; occurredAt: number; url: string }>;
};

type ProviderId = 'groq' | 'gemini' | 'openai' | 'claude' | 'cerebras' | 'openrouter' | 'mistral' | 'github' | 'nvidia' | 'cloudflare' | 'huggingface' | 'cohere';
const providers: Array<{ id: ProviderId; name: string; configured: boolean; available: boolean; state: string; model: string; privacyNote: string; averageFirstTokenMs: number | null; errorRate: number; cooldownMs: number }> = [
  { id: 'groq', name: 'Groq', configured: true, available: true, state: 'ready', model: 'llama-3.3-70b-versatile', privacyNote: 'Solicitação enviada sob demanda.', averageFirstTokenMs: 420, errorRate: 0.01, cooldownMs: 0 },
  { id: 'gemini', name: 'Gemini', configured: true, available: true, state: 'ready', model: 'gemini-2.0-flash', privacyNote: 'Solicitação enviada sob demanda.', averageFirstTokenMs: 610, errorRate: 0.02, cooldownMs: 0 },
  ...([
    ['openai', 'OpenAI'], ['claude', 'Claude'], ['cerebras', 'Cerebras'], ['openrouter', 'OpenRouter'],
    ['mistral', 'Mistral'], ['github', 'GitHub Models'], ['nvidia', 'NVIDIA'], ['cloudflare', 'Cloudflare'],
    ['huggingface', 'Hugging Face'], ['cohere', 'Cohere'],
  ] as Array<[ProviderId, string]>).map(([id, name]) => ({
    id, name, configured: false, available: false, state: 'not_configured', model: '—', privacyNote: 'Não configurado neste ambiente.', averageFirstTokenMs: null, errorRate: 0, cooldownMs: 0,
  })),
];

export const getGetAiStatusQueryKey = () => ['/api/ai/status'] as const;
export const getHealthCheckQueryKey = () => ['/api/healthz'] as const;
export const getGetCosmosFeedsQueryKey = () => ['/api/cosmos/feeds'] as const;
export const getGetAiVoicesQueryKey = (params?: { search?: string }) => ['/api/ai/voices', params] as const;

export function useGetAiStatus(_options?: unknown) {
  return { data: { geminiAvailable: true, openaiAvailable: false, groqAvailable: true, claudeAvailable: false, speechAvailable: false, providers }, isLoading: false, isError: false, refetch: async () => ({ data: { providers } }) };
}

export function useHealthCheck(_options?: unknown) {
  return { data: { status: 'ok' }, isLoading: false, isError: false, refetch: async () => ({ data: { status: 'ok' } }) };
}

export function useGetCosmosFeeds(_options?: unknown) {
  const now = Date.now();
  const data: CosmosFeedsResponse = {
    updatedAt: now, stale: false, ttlSeconds: 300,
    iss: { current: { latitude: -8.9, longitude: -37.2, altitudeKm: 418, velocityKmh: 27600, visibility: 'daylight', timestamp: now }, trajectory: [], nextPassAt: null, nextPassDistanceKm: null },
    earthquakes: [],
  };
  return { data, isLoading: false, isError: false, refetch: async () => ({ data }) };
}

export function useGetAiVoices(params?: { search?: string }, _options?: unknown) {
  const allVoices = [
    { voiceId: 'sample-ptbr-01', name: 'Português — voz natural', labels: { language: 'pt-BR' }, description: 'Voz de demonstração em português brasileiro.' },
    { voiceId: 'sample-ptbr-02', name: 'Português — voz clara', labels: { language: 'pt-BR' }, description: 'Voz de demonstração com dicção clara.' },
  ];
  const voices = allVoices.filter((voice) => !params?.search || voice.name.toLowerCase().includes(params.search.toLowerCase()));
  return { data: { voices } as AiVoiceCatalog, isLoading: false, isError: false, refetch: async () => ({ data: { voices } }) };
}

export function useSendAiMessage() {
  const [isPending, setPending] = useState(false);
  const [isError, setError] = useState(false);
  return {
    isPending, isError,
    mutate: (variables: { data: { question: string; provider?: string; [key: string]: unknown } }, callbacks?: { onSuccess?: (response: AiChatResponse) => void; onError?: (error: Error) => void }) => {
      setPending(true);
      setError(false);
      window.setTimeout(() => {
        const response: AiChatResponse = {
          answer: `Posso ajudar a investigar “${variables.data.question}”. No recorte disponível, vale começar pelos campos observados e validar qualquer hipótese diretamente na base.`,
          provider: variables.data.provider === 'auto' ? 'groq' : variables.data.provider ?? 'groq',
          model: 'llama-3.3-70b-versatile',
          layer: 'L6',
        };
        callbacks?.onSuccess?.(response);
        setPending(false);
      }, 550);
    },
  };
}
