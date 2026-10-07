import type { SpeechEmotionMark } from './speech-plan';
type AiChatInput = { question: string; provider?: string; history?: unknown[]; dataset?: unknown; [key: string]: unknown };

export type AiChatStreamResult = {
  answer: string;
  provider: string;
  model: string;
  layer?: string;
  emotionMarks: SpeechEmotionMark[];
};

export async function requestAiChatStream(
  input: AiChatInput,
  signal: AbortSignal,
  onToken?: (text: string) => void,
): Promise<AiChatStreamResult> {
  if (signal.aborted) throw new DOMException('A solicitação foi cancelada.', 'AbortError');
  const answer = `Posso ajudar a investigar “${input.question}”. Comece pelo que os dados mostram e valide qualquer hipótese diretamente na base.`;
  onToken?.(answer);
  return { answer, provider: input.provider === 'auto' ? 'groq' : input.provider ?? 'groq', model: 'llama-3.3-70b-versatile', layer: 'L6', emotionMarks: [] };
}