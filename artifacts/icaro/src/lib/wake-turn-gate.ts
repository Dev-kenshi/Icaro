import { parseWakeCommand } from './wake-commands';

export const QUESTION_WINDOW_MS = 15_000;
export const OUTPUT_ECHO_GUARD_MS = 450;
export const UTTERANCE_SILENCE_MS = 1_200;
export const UTTERANCE_MAX_MS = 15_000;
export const UTTERANCE_DEADLINE_GRACE_MS = 1_700;
export type WakeEvent =
  | { type: 'wake' | 'stop' | 'expired' }
  | { type: 'transcript'; text: string; index: number }
  | { type: 'question'; text: string };

/** Collect interim revisions and adjacent final segments into one spoken turn. */
export class SpeechUtteranceBuffer {
  private readonly segments = new Map<number, string>();
  private startedAt: number | null = null;
  private lastUpdateAt = 0;

  get empty() { return this.startedAt === null; }

  update(index: number, text: string, now: number) {
    if (this.startedAt === null) this.startedAt = now;
    this.segments.set(index, text.trim());
    this.lastUpdateAt = now;
    return this.text;
  }

  get text() {
    return [...this.segments.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, segment]) => segment)
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  shouldFlush(now: number) {
    return this.startedAt !== null &&
      (now - this.startedAt >= UTTERANCE_MAX_MS || now - this.lastUpdateAt >= UTTERANCE_SILENCE_MS);
  }

  take() {
    const text = this.text;
    this.clear();
    return text;
  }

  clear() {
    this.segments.clear();
    this.startedAt = null;
    this.lastUpdateAt = 0;
  }
}

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

  beginCapture(now: number) {
    if (this.active && !this.pending) this.deadline = now + UTTERANCE_MAX_MS + UTTERANCE_DEADLINE_GRACE_MS;
  }

  submitQuestion(text: string, now: number): WakeEvent[] {
    if (!this.active || this.pending) return [];
    if (this.expire(now)) return [{ type: 'expired' }];
    const question = text.replace(/\s+/g, ' ').trim();
    if (!question || !/[\p{L}\p{N}]/u.test(question) || /^(?:ah|ahn|hum|hmm|é|eh|uh|ok)[.!?\s]*$/i.test(question)) return [];
    this.active = false; this.deadline = 0; this.pending = true;
    return [{ type: 'question', text: question }];
  }

  receive(text: string, final: boolean, index: number, now: number, busy: boolean, echo = false, interruptibleWait = false, directMode = false, deferQuestion = false): WakeEvent[] {
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
    const events: WakeEvent[] = [];
    // Direct mode is an explicit user opt-in: each recognized utterance can
    // start one turn without the wake phrase, but never while busy or echoing.
    if (directMode && !this.active && !this.pending && !busy && !echo && now >= this.quietUntil && !command.wake) {
      this.arm(now);
      events.push({ type: 'wake' });
    }
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
    if (this.expire(now)) events.push({ type: 'expired' });
    if (command.wake && !this.woken.has(index)) {
      this.woken.add(index); this.arm(now);
      events.push({ type: 'wake' });
    }
    if (!this.active) { if (final) this.completed.add(index); return events; }
    // Parse again after expiration/wake; a wake-only phrase is never a question.
    const question = parseWakeCommand(text, this.active).question;
    if (question && /[\p{L}\p{N}]/u.test(question) && (!final || deferQuestion)) {
      events.push({ type: 'transcript', text: question, index });
    }
    if (final) {
      this.completed.add(index);
      if (!deferQuestion && question && /[\p{L}\p{N}]/u.test(question) && !/^(?:ah|ahn|hum|hmm|é|eh|uh|ok)[.!?\s]*$/i.test(question)) {
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