import type { SpeechEmotion, SpeechSegmentOptions } from './speech-plan';

export interface IcaroWord { text: string; t0: number; t1: number; i: number }
export interface IcaroVisemeKey { t0: number; t1: number; [key: string]: unknown }
export interface IcaroTimeline { words: IcaroWord[]; keys?: IcaroVisemeKey[]; [key: string]: unknown }

export interface IcaroAvatarInstance {
  ready: Promise<unknown>;
  state: string;
  mouth: { open: { x: number } };
  setState(state: 'idle' | 'listening' | 'thinking' | 'speaking'): void;
  speak(timeline: IcaroTimeline, clock: () => number): void;
  stopSpeaking(): void;
  setAudioLevel(level: number): void;
  setEmotion(emotion: SpeechEmotion): void;
  setListeningActivity(active: boolean): void;
  canvas: HTMLCanvasElement;
  _loop?: () => void;
  _resize?: () => void;
  __disposed?: boolean;
}

export interface IcaroSpeechOptions {
  avatar: IcaroAvatarInstance;
  endpoint: string;
  voiceId?: string;
  fallback: (text: string, emotion?: SpeechEmotion) => Promise<ArrayBuffer>;
  onSentence: (text: string, timeline: IcaroTimeline, clock: () => number, emotion?: SpeechEmotion) => void;
  onEmotion?: (emotion: SpeechEmotion) => void;
  onWord: (word: IcaroWord, index: number, words: IcaroWord[]) => void;
  onEnd: () => void;
  onLevel: (level: number) => void;
}

export interface IcaroSpeechInstance {
  o: IcaroSpeechOptions;
  avatar: IcaroAvatarInstance;
  ctx: AudioContext | null;
  analyser: AnalyserNode | null;
  unlock(): AudioContext;
  say(text: string): Promise<unknown>;
  stop(): void;
  _meter?: () => void;
  sources?: AudioBufferSourceNode[];
  _enqueue(text: string, options?: SpeechSegmentOptions): void;
  _fetch(item: unknown, generation: number): Promise<unknown>;
  _fallback(text: string, emotion?: SpeechEmotion): Promise<unknown>;
  _pump(generation: number): Promise<void>;
}

declare global {
  interface Window {
    IcaroAvatar?: new (canvas: HTMLCanvasElement, options: { assets: string }) => IcaroAvatarInstance;
    IcaroSpeech?: new (options: IcaroSpeechOptions) => IcaroSpeechInstance;
    IcaroVisemes?: {
      splitSentences(text: string): string[];
      buildTimeline(alignment: unknown): IcaroTimeline;
    };
    __icaroAvatarLibrary?: Promise<void>;
  }
}

const base = '/__mockup/icaro-assets/';
const avatarRoot = `${base}avatar/`;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Não foi possível carregar a biblioteca do avatar: ${src}`));
    document.head.appendChild(script);
  });
}

export function loadIcaroAvatarLibrary(): Promise<void> {
  if (window.__icaroAvatarLibrary) return window.__icaroAvatarLibrary;
  window.__icaroAvatarLibrary = (async () => {
    const stylesheetHref = `${avatarRoot}avatar.css`;
    if (!document.querySelector(`link[href="${stylesheetHref}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = stylesheetHref;
      document.head.appendChild(link);
    }
    await loadScript(`${avatarRoot}visemes-ptbr.js`);
    await loadScript(`${avatarRoot}avatar-engine.js`);
    await loadScript(`${avatarRoot}speech-player.js`);
    await loadScript(`${avatarRoot}captions.js`);
  })();
  return window.__icaroAvatarLibrary;
}

export function avatarAssetsUrl(): string {
  // Expanded portrait and translated atlas, separate from the immutable package.
  return `${base}avatar-portrait/`;
}