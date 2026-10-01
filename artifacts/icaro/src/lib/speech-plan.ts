/**
 * Plans how an answer is sent to the neural voice server.
 * Few requests per answer = the free Gemini TTS quota lasts, so the voice never
 * degrades to the robotic browser voice. The first sentence goes alone so the
 * ÍCARO starts speaking quickly; the rest is grouped into large chunks.
 */
export const SERVER_TEXT_LIMIT = 1200;
export const TIMESTAMP_SAFE_CHUNK_LIMIT = 550;

export interface SpeechQueueEngine {
  unlock(): unknown;
  _enqueue(text: string): void;
  flush(): Promise<unknown>;
}

export function cleanSpeechText(text: string): string {
  return text.replace(/[*#_`>]+/g, '').replace(/\s+/g, ' ').trim();
}

function splitLong(sentence: string, max: number): string[] {
  if (sentence.length <= max) return [sentence];
  const out: string[] = [];
  let cur = '';
  for (const word of sentence.split(' ')) {
    if (word.length > max) {
      if (cur) { out.push(cur); cur = ''; }
      for (let i = 0; i < word.length; i += max) out.push(word.slice(i, i + max));
      continue;
    }
    if (cur && cur.length + 1 + word.length > max) { out.push(cur); cur = word; }
    else cur = cur ? `${cur} ${word}` : word;
  }
  if (cur) out.push(cur);
  return out;
}

export function planSpeechChunks(text: string, opts: { groupMax?: number; hardMax?: number } = {}): string[] {
  const hardMax = Math.min(opts.hardMax ?? SERVER_TEXT_LIMIT, SERVER_TEXT_LIMIT);
  const groupMax = Math.min(opts.groupMax ?? 700, hardMax);
  const clean = cleanSpeechText(text);
  if (!clean) return [];
  const sentences = (clean.match(/[^.!?]+[.!?]*/g) ?? [clean])
    .map((s) => s.trim())
    .filter(Boolean)
    .flatMap((s) => splitLong(s, hardMax));
  if (sentences.length <= 1) return sentences;
  // Very short openers ("Claro.") are merged with the next sentence to avoid a wasted request.
  let first = sentences.shift()!;
  while (first.length < 40 && sentences.length && first.length + 1 + sentences[0].length <= groupMax) {
    first = `${first} ${sentences.shift()!}`;
  }
  const chunks = [first];
  let cur = '';
  for (const s of sentences) {
    if (cur && cur.length + 1 + s.length > groupMax) { chunks.push(cur); cur = s; }
    else cur = cur ? `${cur} ${s}` : s;
  }
  if (cur) chunks.push(cur);
  return chunks;
}

/** Feed grouped items directly to the player queue; `say()` would split them back into sentences. */
export function queueSpeechChunks(
  engine: SpeechQueueEngine,
  text: string,
  opts: { groupMax?: number; hardMax?: number } = {},
): Promise<unknown> {
  const chunks = planSpeechChunks(text, {
    groupMax: opts.groupMax ?? TIMESTAMP_SAFE_CHUNK_LIMIT,
    hardMax: opts.hardMax ?? TIMESTAMP_SAFE_CHUNK_LIMIT,
  });
  if (!chunks.length) return Promise.resolve();

  engine.unlock();
  for (const chunk of chunks) engine._enqueue(chunk);
  return engine.flush();
}
