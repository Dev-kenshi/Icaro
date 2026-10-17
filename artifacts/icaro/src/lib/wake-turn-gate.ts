import { parseWakeCommand } from './wake-commands';

export const QUESTION_WINDOW_MS = 10_000;
export const OUTPUT_ECHO_GUARD_MS = 450;
const INTERIM_INCOMPLETE_ENDINGS = new Set([
  'a', 'o', 'as', 'os', 'um', 'uma', 'de', 'da', 'do', 'das', 'dos', 'em', 'no', 'na',
  'e', 'ou', 'que', 'qual', 'quais', 'como', 'quando', 'onde', 'sobre', 'para', 'por',
  'com', 'se', 'mas', 'entre', 'sem', 'ate', 'desde', 'porque',
  'é', 'sera', 'será', 'proximo', 'próximo', 'proxima', 'próxima',
]);
export function adaptiveQuestionSilenceMs(text: string): 500 | 1200 {
  const trimmed = text.trim();
  if (!trimmed || /[,;:]$/.test(trimmed)) return 1_200;
  if (/[.!?]$/.test(trimmed)) return 500;
  const last = trimmed.split(/\s+/).at(-1)?.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase() || '';
  return INTERIM_INCOMPLETE_ENDINGS.has(last) ? 1_200 : 500;
}
export function mergeQuestionContinuation(existing: string, transcript: string): string | null {
  const normalize = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const current = normalize(existing);
  const next = normalize(transcript);
  if (!next || next === current || current.startsWith(next)) return null;
  return next.startsWith(current) ? transcript.trim() : `${existing.trim()} ${transcript.trim()}`;
}
export type WakeEvent =
  | { type: 'wake' | 'stop' | 'expired' }
  | { type: 'transcript' | 'question'; text: string };

/** One deliberate activation authorizes ONE utterance, never an open-ended
 * conversation. This gate also remembers interim output echoes until final. */
export class WakeTurnGate {
  active = false;
  pending = false;
  private deadline = 0;
  private quietUntil = 0;
  private completed = new Set<number>();
  private suppressed = new Set<number>();
  /** Suppressed because it was playback echo; such a result can never become a command. */
  private echoed = new Set<number>();
  private woken = new Set<number>();

  newRecognitionSession() {
    this.completed.clear(); this.suppressed.clear(); this.echoed.clear(); this.woken.clear();
  }
  arm(now: number) { this.active = true; this.deadline = now + QUESTION_WINDOW_MS; }
  stop() { this.active = false; this.pending = false; this.deadline = 0; }
  complete(now: number, playedAudio = false) {
    this.stop();
    if (playedAudio) this.quietUntil = now + OUTPUT_ECHO_GUARD_MS;
  }
  expire(now: number) {
    if (!this.active || now < this.deadline) return false;
    this.active = false; this.deadline = 0;
    return true;
  }

  /** Confirma uma transcrição interim somente após o cliente observar que ela
   * ficou estável. O índice entra em `completed`, então o resultado final do
   * navegador não pode despachar a mesma pergunta outra vez. */
  commitInterim(index: number, text: string, now: number, busy = false, echo = false): WakeEvent[] {
    if (!this.active || this.pending || this.completed.has(index) || this.suppressed.has(index)) return [];
    if (this.expire(now)) return [{ type: 'expired' }];
    if (busy || echo || now < this.quietUntil) {
      this.suppressed.add(index);
      if (echo || now < this.quietUntil) this.echoed.add(index);
      return [];
    }
    const question = text.trim();
    const words = question.split(/\s+/).filter(Boolean);
    const last = words.at(-1)?.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase() || '';
    const reliableInterim = words.length >= 4 && question.length >= 14 && !INTERIM_INCOMPLETE_ENDINGS.has(last);
    if (!question || !/[\p{L}\p{N}]/u.test(question) || /^(?:ah|ahn|hum|hmm|é|eh|uh|ok)[.!?\s]*$/i.test(question) || !reliableInterim) return [];
    this.completed.add(index);
    this.active = false; this.deadline = 0; this.pending = true;
    return [{ type: 'question', text: question }];
  }

  receive(text: string, final: boolean, index: number, now: number, busy: boolean, echo = false, interruptibleWait = false): WakeEvent[] {
    if (this.completed.has(index)) return [];
    const command = parseWakeCommand(text, this.active);
    // A suppressed result never becomes a wake or question. A fragment dropped
    // only because Ícaro was busy ("pare") may still grow into an explicit Stop;
    // results identified as playback echo never can.
    if (this.suppressed.has(index)) {
      const growsIntoStop = command.stop && !echo && !this.echoed.has(index) && now >= this.quietUntil;
      if (!growsIntoStop) { if (final) this.completed.add(index); return []; }
    }
    if (command.stop) {
      if (echo || now < this.quietUntil) {
        this.suppressed.add(index); this.echoed.add(index);
        if (final) this.completed.add(index);
        return [];
      }
      this.completed.add(index); this.stop();
      return [{ type: 'stop' }];
    }
    // An explicit wake may cancel a pending answer/voice preparation, but never
    // playback or its delayed echoes. Ambient speech cannot clear the pending turn.
    if (interruptibleWait && command.wake && !echo && now >= this.quietUntil && this.pending) this.stop();
    if ((busy && !interruptibleWait) || this.pending || now < this.quietUntil || echo) {
      // While merely waiting, "Ok" can be the first interim fragment of a new
      // wake. Do not permanently suppress it before the full phrase arrives.
      const mayBecomeWake = interruptibleWait && this.pending && !echo && now >= this.quietUntil;
      if (!mayBecomeWake) {
        this.suppressed.add(index);
        if (echo || now < this.quietUntil) this.echoed.add(index);
      }
      if (final) this.completed.add(index);
      return [];
    }
    const events: WakeEvent[] = [];
    if (this.expire(now)) events.push({ type: 'expired' });
    if (command.wake && !this.woken.has(index)) {
      this.woken.add(index); this.arm(now);
      events.push({ type: 'wake' });
    }
    if (!this.active) { if (final) this.completed.add(index); return events; }
    // Parse again after expiration/wake; a wake-only phrase is never a question.
    const question = parseWakeCommand(text, this.active).question;
    if (question && /[\p{L}\p{N}]/u.test(question)) events.push({ type: 'transcript', text: question });
    if (final) {
      this.completed.add(index);
      if (question && /[\p{L}\p{N}]/u.test(question) && !/^(?:ah|ahn|hum|hmm|é|eh|uh|ok)[.!?\s]*$/i.test(question)) {
        this.active = false; this.deadline = 0; this.pending = true;
        events.push({ type: 'question', text: question });
      }
    }
    return events;
  }
}

export function resemblesPlayback(transcript: string, answer: string): boolean {
  const normalize = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const t = normalize(transcript), a = normalize(answer);
  return t.split(' ').length >= 3 && t.length >= 12 && !!a && a.includes(t);
}