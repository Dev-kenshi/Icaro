/**
 * Plans how an answer is sent to the neural voice server.
 * Few requests per answer = the free Gemini TTS quota lasts, so the voice never
 * degrades to the robotic browser voice. The first sentence goes alone so the
 * ÍCARO starts speaking quickly; the rest is grouped into large chunks.
 */
export const SERVER_TEXT_LIMIT = 1200;
export const TIMESTAMP_SAFE_CHUNK_LIMIT = 550;

export type SpeechEmotion = 'entusiasmo' | 'sério' | 'curioso' | 'alerta' | 'sorriso';
export type SpeechEmotionMark = { offset: number; emotion: SpeechEmotion };
export type SpeechSegmentOptions = { emotion: SpeechEmotion; gapAfter: number; rate: number };

export interface SpeechQueueEngine {
  unlock(): unknown;
  _enqueue(text: string, options?: SpeechSegmentOptions): void;
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

function splitSpeechSegments(text: string): Array<{ text: string; offset: number }> {
  const segments: Array<{ text: string; offset: number }> = [];
  const sentences = /[^.!?…]+[.!?…]*/g;
  for (const match of text.matchAll(sentences)) {
    const raw = match[0];
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const leading = raw.indexOf(trimmed);
    const offset = (match.index ?? 0) + leading;
    const anota = /\banota\s+isso\s*:/i.exec(trimmed);
    if (anota && anota.index > 0) {
      const before = trimmed.slice(0, anota.index).trim();
      const after = trimmed.slice(anota.index).trim();
      if (before) segments.push({ text: before, offset });
      if (after) segments.push({ text: after, offset: offset + anota.index });
    } else {
      segments.push({ text: trimmed, offset });
    }
  }
  return segments.length ? segments : [{ text: text.trim(), offset: 0 }].filter((segment) => segment.text);
}

export function planSpeechSegments(
  text: string,
  opts: { groupMax?: number; hardMax?: number; emotionMarks?: readonly SpeechEmotionMark[] } = {},
): Array<{ text: string; options: SpeechSegmentOptions }> {
  const hardMax = Math.min(opts.hardMax ?? TIMESTAMP_SAFE_CHUNK_LIMIT, SERVER_TEXT_LIMIT);
  const groupMax = Math.min(opts.groupMax ?? TIMESTAMP_SAFE_CHUNK_LIMIT, hardMax);
  const clean = cleanSpeechText(text);
  if (!clean) return [];

  const marks = [...(opts.emotionMarks ?? [])].sort((a, b) => a.offset - b.offset);
  const units = splitSpeechSegments(clean).flatMap((segment) => splitLong(segment.text, hardMax).map((part) => ({
    ...segment,
    text: part,
  })));
  const groups: Array<{ text: string; emotion: SpeechEmotion; gapAfter: number; rate: number }> = [];
  let current = '';
  let currentEmotion: SpeechEmotion = 'sério';
  let currentRate = 1;
  let activeEmotion: SpeechEmotion = 'sério';
  let markIndex = 0;
  let firstGroup = true;

  const flush = (gapAfter = 0.12) => {
    if (!current) return;
    groups.push({ text: current, emotion: currentEmotion, gapAfter, rate: currentRate });
    current = '';
    currentRate = 1;
    firstGroup = false;
  };

  for (const unit of units) {
    while (markIndex < marks.length && marks[markIndex].offset <= unit.offset) {
      activeEmotion = marks[markIndex].emotion;
      markIndex++;
    }
    const anotaStart = /^anota\s+isso\b/i.test(unit.text);
    if (current && anotaStart) flush(0.3);
    if (current && firstGroup && current.length >= 40) flush();
    if (current && activeEmotion !== currentEmotion) flush();
    const rate = /\b(?:primeiro|segundo|terceiro|quarto|quinto|1º|2º|3º|4º|5º)\b/i.test(unit.text) ? 1.05 : 1;
    if (current && (current.length + 1 + unit.text.length > groupMax || rate !== currentRate)) flush();
    if (!current) {
      currentEmotion = activeEmotion;
      currentRate = rate;
    }
    current = current ? `${current} ${unit.text}` : unit.text;
    if (/[?？]\s*$/.test(unit.text)) flush(0.3);
  }
  flush();

  return groups.map((group) => ({
    text: group.text,
    options: { emotion: group.emotion, gapAfter: group.gapAfter, rate: group.rate },
  }));
}

/** Feed grouped items directly to the player queue; `say()` would split them back into sentences. */
export function queueSpeechChunks(
  engine: SpeechQueueEngine,
  text: string,
  opts: { groupMax?: number; hardMax?: number; emotionMarks?: readonly SpeechEmotionMark[] } = {},
): Promise<unknown> {
  const chunks = planSpeechSegments(text, {
    groupMax: opts.groupMax ?? TIMESTAMP_SAFE_CHUNK_LIMIT,
    hardMax: opts.hardMax ?? TIMESTAMP_SAFE_CHUNK_LIMIT,
    emotionMarks: opts.emotionMarks,
  });
  if (!chunks.length) return Promise.resolve();

  engine.unlock();
  for (const chunk of chunks) engine._enqueue(chunk.text, chunk.options);
  return engine.flush();
}
