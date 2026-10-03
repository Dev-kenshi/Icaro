import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import { StageHelp } from '@/components/stage/stage-help';
import { shouldActivateStageShortcut } from '@/lib/stage-shortcuts';
import { Mic, X, BarChart3, ExternalLink, Trash2, Menu, Keyboard, Play, Maximize, Volume2, VolumeX, Eye, EyeOff, Orbit, Globe2, Radio, SkipForward, Layers, Move, RotateCcw, Check } from 'lucide-react';
import { getGetAiStatusQueryKey, getGetAiVoicesQueryKey, getGetCosmosFeedsQueryKey, useGetAiStatus, useGetAiVoices, useGetCosmosFeeds, useSendAiMessage, type AiChatResponse, type AiVoiceCatalog } from '@workspace/api-client-react';
import { requestAiChatStream } from '@/lib/ai-chat-stream';
import { interpret, formatDuration } from '@/lib/commands';
import { speak, stopSpeaking, ensureAudio, activateAudio, connectMic, getAnalyser, getLevel, getMicRms, getOutputRms, setListeningActivity, releaseSpeechCache } from '@/lib/speech';
import type { SpeechEmotion, SpeechEmotionMark } from '@/lib/speech-plan';
import { useWakeListener } from '@/hooks/use-wake-listener';
import { resemblesPlayback } from '@/lib/wake-turn-gate';
import { wakeAccessErrorMessage } from '@/lib/wake-access';
import { Particles, Waveform } from '@/components/stage/canvases';
import { HoloFace } from '@/components/stage/holo-face';
import { HoloPortrait } from '@/components/stage/holo-portrait';
import { avatarById, readAvatarChoice, saveAvatarChoice } from '@/lib/avatars';
import { useStageLayout } from '@/hooks/use-stage-layout';
import { FutureScene } from '@/components/stage/future-scene';
import { MicSettings } from '@/components/stage/mic-settings';
import { AvatarAdjuster } from '@/components/stage/avatar-adjuster';
import { AVATAR_LAYOUT_STORAGE_KEY, readAvatarLayout, updateAvatarLayout, type AvatarLayoutAction } from '@/lib/avatar-layout';
import { HOLO_MEDIA } from '@/lib/holo-state';
import { getMicMode, micErrorMessage, recordUtterance, setMicMode, SERVER_FALLBACK_ERRORS, transcribeOnServer, type MicMode } from '@/lib/mic-config';
import { CosmosRenderer, type CosmosScene } from '@/components/stage/cosmos/renderer';
import { CosmosOverview } from '@/components/stage/cosmos/CosmosOverview';
import { NeuralWeb } from '@/components/stage/neural-web';
import './stage.css';

type State = 'idle' | 'listening' | 'thinking' | 'talking' | 'intro';
type Provider = 'auto' | 'groq' | 'gemini' | 'openai' | 'claude' | 'cerebras' | 'openrouter' | 'mistral' | 'github' | 'nvidia' | 'cloudflare' | 'huggingface' | 'cohere';
type Entry = { role: 'user' | 'assistant'; content: string; link?: string };
type Note = { text: string; at: number };
type VisualQuality = 'auto' | 'high' | 'medium' | 'low';

const STATE_LABEL: Record<State, string> = { idle: 'Online', listening: 'Ouvindo', thinking: 'Pensando', talking: 'Falando', intro: 'Apresentação' };
const AUTO_PROVIDER_IDS = new Set(['groq', 'gemini', 'cerebras', 'openrouter', 'mistral', 'github', 'nvidia', 'cloudflare', 'huggingface', 'cohere']);
const PROVIDER_NAMES: Record<Provider, string> = {
  auto: 'Automático',
  groq: 'Groq',
  gemini: 'Gemini',
  openai: 'OpenAI',
  claude: 'Claude',
  cerebras: 'Cerebras',
  openrouter: 'OpenRouter',
  mistral: 'Mistral',
  github: 'GitHub Models',
  nvidia: 'NVIDIA',
  cloudflare: 'Cloudflare',
  huggingface: 'Hugging Face',
  cohere: 'Cohere',
};
const media = (f: string) => `${import.meta.env.BASE_URL}media/${f}`;
const NOTES_KEY = 'icaro.notes';
const VOICE_SELECTION_KEY = 'icaro.voice-test.selection';
type StoredVoiceSelection = Pick<AiVoiceCatalog['voices'][number], 'voiceId' | 'name'>;
const readVoiceSelection = (): StoredVoiceSelection | null => {
  try {
    const value = JSON.parse(localStorage.getItem(VOICE_SELECTION_KEY) || 'null');
    return value && typeof value.voiceId === 'string' && typeof value.name === 'string'
      ? { voiceId: value.voiceId, name: value.name }
      : null;
  } catch { return null; }
};
const QUALITY_KEY = 'icaro.stage.quality';
const QUALITY_OPTIONS: { value: VisualQuality; label: string }[] = [
  { value: 'auto', label: 'Auto' }, { value: 'high', label: 'Alta' }, { value: 'medium', label: 'Média' }, { value: 'low', label: 'Baixa' },
];
const readQuality = (): VisualQuality => {
  try {
    const value = localStorage.getItem(QUALITY_KEY);
    return value === 'high' || value === 'medium' || value === 'low' ? value : 'auto';
  } catch { return 'auto'; }
};
const timeValue = (value: number) => new Date(value < 1e12 ? value * 1000 : value);
const loadNotes = (): Note[] => { try { const v = JSON.parse(localStorage.getItem(NOTES_KEY) || '[]'); return Array.isArray(v) ? v.filter((n) => n && typeof n.text === 'string') : []; } catch { return []; } };

function errMsg(e: unknown) {
  if (e && typeof e === 'object' && 'data' in e) { const d = (e as { data: unknown }).data; if (d && typeof d === 'object' && 'error' in d && typeof (d as { error: unknown }).error === 'string') return (d as { error: string }).error; }
  return 'Não consegui falar com o provedor de IA agora. Tente novamente ou troque o provedor na aba Conexão.';
}

export default function Stage() {
  const status = useGetAiStatus({ query: { queryKey: getGetAiStatusQueryKey() } });
  const feeds = useGetCosmosFeeds({ query: { queryKey: getGetCosmosFeedsQueryKey(), refetchInterval: 30000 } });
  const sendMessage = useSendAiMessage();
  const sendRef = useRef(sendMessage.mutate); sendRef.current = sendMessage.mutate;
  const aiAbortRef = useRef<AbortController | null>(null);

  const [state, setState] = useState<State>('idle');
  const [emotion, setEmotion] = useState<SpeechEmotion>('sério');
  const [longListening, setLongListening] = useState(false);
  const [caption, setCaption] = useState('');
  const [captionWords, setCaptionWords] = useState<{ words: string[]; activeIndex: number } | null>(null);
  const [captionsVisible, setCaptionsVisible] = useState(false);
  const [audioActivated, setAudioActivated] = useState(false);
  const [speechError, setSpeechError] = useState('');
  const [micMode, setMicModeState] = useState<MicMode>(getMicMode);
  const [recording, setRecording] = useState(false);
  const [panel, setPanel] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const helpRef = useRef(false); helpRef.current = helpOpen;
  const panelRef = useRef(false); panelRef.current = panel;
  const [tab, setTab] = useState<'conversa' | 'voz' | 'ferramentas' | 'conexao' | 'sobre'>('conversa');
  const [scene, setScene] = useState<CosmosScene>('galaxy');
  const [sceneMode, setSceneMode] = useState<'all' | 'single'>('all');
  const [quality, setQuality] = useState<VisualQuality>(readQuality);
  const [avatarLayout, setAvatarLayout] = useState(readAvatarLayout);
  const [avatarId, setAvatarId] = useState(() => readAvatarChoice().id);
  const stageLayout = useStageLayout();
  const [avatarControlsOpen, setAvatarControlsOpen] = useState(false);
  const [avatarLayoutSaveError, setAvatarLayoutSaveError] = useState('');
  const [sceneVisible, setSceneVisible] = useState(false);
  const [sceneFade, setSceneFade] = useState(false);
  const [materializing, setMaterializing] = useState(false);
  const [ambientOn, setAmbientOn] = useState(false);
  const [ambientError, setAmbientError] = useState('');
  const [renderFps, setRenderFps] = useState<number | null>(null);
  const [assetsStatus, setAssetsStatus] = useState('NASA GIBS · carregamento sob demanda');
  const [responseMeta, setResponseMeta] = useState<{ source: string; durationMs: number | null }>({ source: '—', durationMs: null });
  const [feiraTarget, setFeiraTarget] = useState(false);
  const ambientRef = useRef<AudioContext | null>(null);
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState('');
  const [log, setLog] = useState<Entry[]>([]);
  const [provider, setProvider] = useState<Provider>('auto');
  const bargeCandidateRef = useRef<{ text: string; at: number } | null>(null);
  const bargeHandledRef = useRef(false);
  const pitch = .95, rate = .92, voiceURI = null;
  const [voiceOn, setVoiceOn] = useState(true);
  const voiceOnRef = useRef(voiceOn); voiceOnRef.current = voiceOn;
  const speechPendingRef = useRef(false);
  const [notes, setNotes] = useState<Note[]>(loadNotes);
  const [timerEnd, setTimerEnd] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [searchLink, setSearchLink] = useState<string | null>(null);
  const [engine, setEngine] = useState<string | null>(null);
  const [voiceSearch, setVoiceSearch] = useState('');
  const [debouncedVoiceSearch, setDebouncedVoiceSearch] = useState('');
  const [selectedVoice, setSelectedVoice] = useState<StoredVoiceSelection | null>(readVoiceSelection);
  const voiceCatalog = useGetAiVoices(
    { search: debouncedVoiceSearch },
    {
      query: {
        queryKey: getGetAiVoicesQueryKey({ search: debouncedVoiceSearch }),
        enabled: tab === 'voz',
        staleTime: 60_000,
        retry: 1,
      },
    },
  );
  const voiceOptions = voiceCatalog.data?.voices ?? [];
  const selectedVoiceMetadata = voiceOptions.find((voice) => voice.voiceId === selectedVoice?.voiceId);
  const selectedVoiceName = selectedVoiceMetadata?.name ?? selectedVoice?.name;

  const stageRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const introRef = useRef<HTMLVideoElement>(null);
  const activeRef = useRef(false);
  const turnRef = useRef(0);
  const commandCompleteRef = useRef<(playedAudio?: boolean) => void>(() => undefined);
  const lastAnswerRef = useRef('');
  const captionTimerRef = useRef(0);
  const recordAbortRef = useRef<AbortController | null>(null);
  const logRef = useRef(log); logRef.current = log;
  const stateRef = useRef(state); stateRef.current = state;
  const logEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      if (sessionStorage.getItem('icaro.materialized')) return;
      sessionStorage.setItem('icaro.materialized', '1');
    } catch { /* session storage may be blocked; still show the one-time entrance for this mount */ }
    setMaterializing(true);
    const id = window.setTimeout(() => setMaterializing(false), 4000);
    return () => window.clearTimeout(id);
  }, []);
  useEffect(() => {
    const node = stageRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => {
      setSceneVisible(entry.isIntersecting);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (sceneMode === 'all') return;
    const id = window.setInterval(() => {
      setScene((current) => current === 'galaxy' ? 'system' : current === 'system' ? 'earth' : 'galaxy');
      setFeiraTarget(false);
      setSceneFade(true);
      window.setTimeout(() => setSceneFade(false), 1000);
    }, 90000);
    return () => window.clearInterval(id);
  }, [sceneMode]);
  useEffect(() => {
    try { localStorage.setItem(QUALITY_KEY, quality); } catch { /* storage can be disabled */ }
  }, [quality]);
  useEffect(() => {
    try {
      localStorage.setItem(AVATAR_LAYOUT_STORAGE_KEY, JSON.stringify(avatarLayout));
      setAvatarLayoutSaveError('');
    } catch {
      setAvatarLayoutSaveError('O ajuste funciona, mas não foi possível salvá-lo neste dispositivo.');
    }
  }, [avatarLayout]);
  useEffect(() => {
    if (!avatarControlsOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAvatarControlsOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [avatarControlsOpen]);
  useEffect(() => () => {
    void ambientRef.current?.close().catch(() => undefined);
    ambientRef.current = null;
  }, []);

  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(id); }, []);
  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedVoiceSearch(voiceSearch.trim()), 300);
    return () => window.clearTimeout(id);
  }, [voiceSearch]);
  useEffect(() => {
    try {
      if (selectedVoice) localStorage.setItem(VOICE_SELECTION_KEY, JSON.stringify(selectedVoice));
      else localStorage.removeItem(VOICE_SELECTION_KEY);
    } catch { /* voice selection still applies for the current page */ }
  }, [selectedVoice]);
  useEffect(() => {
    const dock = dockRef.current;
    if (!dock) return;
    const update = () => stageRef.current?.style.setProperty('--dock-height', `${dock.getBoundingClientRect().height}px`);
    const observer = new ResizeObserver(update);
    observer.observe(dock); update();
    return () => observer.disconnect();
  }, []);
  useEffect(() => () => {
    turnRef.current++;
    aiAbortRef.current?.abort();
    window.clearTimeout(captionTimerRef.current);
    stopSpeaking();
    releaseSpeechCache();
  }, []);
  useEffect(() => { logEnd.current?.scrollIntoView({ block: 'end' }); }, [log, panel]);

  const prime = useCallback(() => {
    // Every gesture may unlock audio: the first can occur before the avatar loads.
    ensureAudio();
  }, []);

  const say = useCallback((t: string, link?: string, emotionMarks?: readonly SpeechEmotionMark[]) => {
    const turn = turnRef.current;
    lastAnswerRef.current = t;
    setSpeechError('');
    window.clearTimeout(captionTimerRef.current);
    setLog((l) => [...l, { role: 'assistant', content: t, link }]);
    setCaptionWords(null);
    setCaption(t);
    if (!voiceOnRef.current) { activeRef.current = false; setState('idle'); commandCompleteRef.current(); return; }
    speechPendingRef.current = true;
    setState('thinking');
    let playedAudio = false;
    speak(t, {
      pitch, rate, voiceURI, voiceId: selectedVoice?.voiceId, neural: true, emotionMarks, onEmotion: setEmotion,
      onProvider: setEngine,
      onChunk: (c) => { if (turnRef.current === turn) setCaption(c); },
      onWords: (words, activeIndex) => { if (turnRef.current === turn) setCaptionWords({ words, activeIndex }); },
      onStart: () => { if (turnRef.current === turn) { playedAudio = true; setState('talking'); } },
      onError: (message) => { if (turnRef.current === turn) setSpeechError(message); },
      onEnd: () => {
        if (turnRef.current !== turn) return;
        speechPendingRef.current = false;
        activeRef.current = false; setState('idle'); commandCompleteRef.current(playedAudio);
        captionTimerRef.current = window.setTimeout(() => { if (turnRef.current === turn) { setCaption(''); setCaptionWords(null); } }, 2000);
      },
    });
  }, [voiceOn, selectedVoice]);
  const sayRef = useRef(say); sayRef.current = say;

  // timer
  useEffect(() => {
    if (timerEnd && now >= timerEnd) { setTimerEnd(null); sayRef.current('Tempo encerrado, professor.'); }
  }, [now, timerEnd]);

  const playIntro = useCallback(() => {
    speechPendingRef.current = false;
    stopSpeaking();
    const v = introRef.current; if (!v) return;
    v.currentTime = 0; v.muted = false; setState('intro'); setCaption(''); setCaptionWords(null); setPanel(false);
    v.play().catch(() => { setState('idle'); setCaption(''); commandCompleteRef.current(); });
  }, []);
  const endIntro = () => { introRef.current?.pause(); setState(activeRef.current ? 'listening' : 'idle'); setCaption(''); setCaptionWords(null); commandCompleteRef.current(); };

  const fullscreen = () => { const el = stageRef.current; if (!el) return; if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined); else el.requestFullscreen?.().catch(() => undefined); };
  const selectAvatar = (id: string) => {
    saveAvatarChoice(id);
    setAvatarId(avatarById(id).id);
  };
  const adjustAvatar = (action: AvatarLayoutAction) => {
    setAvatarLayout((current) => updateAvatarLayout(current, action));
  };

  const handle = useCallback((raw: string) => {
    const q = raw.trim().slice(0, 4000); if (!q) return;
    aiAbortRef.current?.abort();
    aiAbortRef.current = null;
    const turn = ++turnRef.current;
    activeRef.current = false;
    speechPendingRef.current = false;
    window.clearTimeout(captionTimerRef.current);
    setCaptionWords(null);
    stopSpeaking();
    prime(); setSearchLink(null);
    if (stateRef.current === 'intro') endIntro();
    setLog((l) => [...l, { role: 'user', content: q }]);
    const r = interpret(q);
    switch (r.kind) {
      case 'scene':
        setFeiraTarget(false);
        setScene(r.scene);
        setSceneMode('single');
        setSceneFade(true); window.setTimeout(() => setSceneFade(false), 1000);
        return sayRef.current(r.text);
      case 'flyFeira':
        setScene('earth'); setSceneMode('single'); setFeiraTarget(true);
        setSceneFade(true); window.setTimeout(() => setSceneFade(false), 1000);
        return sayRef.current(r.text);
      case 'say': return sayRef.current(r.text);
      case 'intro': setLog((l) => [...l, { role: 'assistant', content: 'Reproduzindo a apresentação original.' }]); return playIntro();
      case 'fullscreen': fullscreen(); return sayRef.current(r.text);
      case 'timer': setTimerEnd(Date.now() + r.seconds * 1000); setNow(Date.now()); return sayRef.current(r.text);
      case 'cancelTimer': setTimerEnd(null); return sayRef.current(r.text);
      case 'note': {
        const next = [...loadNotes(), { text: r.note, at: Date.now() }].slice(-100);
        localStorage.setItem(NOTES_KEY, JSON.stringify(next)); setNotes(next);
        return sayRef.current(r.text);
      }
      case 'listNotes': {
        const n = loadNotes();
        if (!n.length) return sayRef.current('Você ainda não tem anotações.');
        const last = n.slice(-3).reverse().map((x) => x.text).join('; ');
        return sayRef.current(`Você tem ${n.length} anotaç${n.length === 1 ? 'ão' : 'ões'}. As mais recentes: ${last}.`);
      }
      case 'search': {
        const url = `https://www.google.com/search?q=${encodeURIComponent(r.query)}`;
        setSearchLink(url); return sayRef.current(r.text, url);
      }
      case 'ai': {
        setState('thinking'); setCaption(''); setCaptionWords(null);
        const history = logRef.current.slice(-12).map(({ role, content }) => ({ role, content: content.slice(0, 4000) }));
        const requestStartedAt = performance.now();
        if (provider !== 'openai' && provider !== 'claude') {
          const controller = new AbortController();
          aiAbortRef.current = controller;
          let streamedText = '';
          void requestAiChatStream({
            provider,
            persona: 'icaro',
            question: q,
            history,
            dataset: null,
            knowledgeMode: 'auto',
          }, controller.signal, (chunk) => {
            streamedText += chunk;
            if (turnRef.current === turn) setCaption(streamedText);
          }).then((res) => {
            if (turnRef.current !== turn) return;
            const providerId = res.provider;
            const source = providerId === 'local'
              ? 'BANCO LOCAL'
              : res.layer
                ? `BASE ${res.layer}`
                : `IA · ${PROVIDER_NAMES[providerId as Provider] ?? providerId.toUpperCase()}`;
            setResponseMeta({ source, durationMs: Math.round(performance.now() - requestStartedAt) });
            sayRef.current(res.answer, undefined, res.emotionMarks);
          }).catch((error: unknown) => {
            if (controller.signal.aborted || turnRef.current !== turn) return;
            speechPendingRef.current = false;
            activeRef.current = false;
            setState('idle'); setCaption(''); setCaptionWords(null);
            const message = error instanceof Error ? error.message : errMsg(error);
            setLog((l) => [...l, { role: 'assistant', content: message }]);
            commandCompleteRef.current(false);
          }).finally(() => {
            if (aiAbortRef.current === controller) aiAbortRef.current = null;
          });
          return;
        }
        sendRef.current({ data: { provider, persona: 'icaro', question: q, history, dataset: null } }, {
          onSuccess: (res: AiChatResponse) => {
            if (turnRef.current !== turn) return;
            const providerId = String(res.provider);
            const source = providerId === 'local'
              ? 'BANCO LOCAL'
              : res.layer
                ? `BASE ${String(res.layer)}`
                : `IA · ${PROVIDER_NAMES[providerId as Provider] ?? providerId.toUpperCase()}`;
            setResponseMeta({ source, durationMs: Math.round(performance.now() - requestStartedAt) });
            sayRef.current(res.answer);
          },
          onError: (e) => {
            if (turnRef.current !== turn) return;
            speechPendingRef.current = false;
            activeRef.current = false;
            setState('idle'); setCaption(''); setCaptionWords(null);
            setLog((l) => [...l, { role: 'assistant', content: errMsg(e) }]);
            commandCompleteRef.current(false);
          },
        });
      }
    }
  }, [prime, playIntro, provider]);
  const handleRef = useRef(handle); handleRef.current = handle;

  const listener = useWakeListener({
    busy: state === 'talking' || state === 'thinking' || state === 'intro',
    allowWakeDuringWait: state === 'thinking',
    onQuestion: (question) => handleRef.current(question),
    onBargeSpeech: (transcript) => {
      if (stateRef.current === 'talking' && !resemblesPlayback(transcript, lastAnswerRef.current)) {
        bargeCandidateRef.current = { text: transcript, at: Date.now() };
      }
    },
    isEcho: (transcript) => resemblesPlayback(transcript, lastAnswerRef.current),
    onTranscript: () => { setCaption(''); setCaptionWords(null); },
    onWake: () => {
      aiAbortRef.current?.abort();
      setHelpOpen(false);
      activeRef.current = true; turnRef.current++; stopSpeaking(); prime();
      speechPendingRef.current = false;
      window.clearTimeout(captionTimerRef.current);
      setCaptionWords(null);
      setState('listening'); setCaption('');
    },
    onStop: () => {
      aiAbortRef.current?.abort();
      activeRef.current = false; turnRef.current++;
      speechPendingRef.current = false;
      window.clearTimeout(captionTimerRef.current);
      setCaptionWords(null);
      stopSpeaking(); introRef.current?.pause();
      setState('idle');
      setCaption('');
    },
  });
  const activateListenerRef = useRef(listener.activate);
  activateListenerRef.current = listener.activate;
  commandCompleteRef.current = listener.complete;
  const useServerMic = micMode === 'server'
    || (micMode === 'auto' && (listener.status === 'unsupported' || (!!listener.error && SERVER_FALLBACK_ERRORS.has(listener.error))));
  const micTestRestoreListenerRef = useRef(false);
  const micTestActiveRef = useRef(false);
  const [micTestActive, setMicTestActive] = useState(false);
  const listenerStatusRef = useRef(listener.status);
  listenerStatusRef.current = listener.status;
  const serverMicRef = useRef(useServerMic);
  serverMicRef.current = useServerMic;
  const beginMicTest = async () => {
    if (micTestActiveRef.current) return false;
    micTestActiveRef.current = true;
    setMicTestActive(true);
    const canResume = !useServerMic
      && listener.supported
      && listener.status !== 'paused'
      && listener.status !== 'blocked';
    micTestRestoreListenerRef.current = canResume;
    const shouldPause = listener.supported
      && listener.status !== 'paused'
      && listener.status !== 'blocked';
    if (shouldPause) await listener.pause();
    return true;
  };
  const endMicTest = () => {
    if (!micTestActiveRef.current) return;
    micTestActiveRef.current = false;
    setMicTestActive(false);
    const shouldResume = micTestRestoreListenerRef.current;
    micTestRestoreListenerRef.current = false;
    if (shouldResume && !serverMicRef.current && listenerStatusRef.current === 'paused') listener.enable();
  };
  const chooseMicMode = (mode: MicMode) => {
    if (micTestActiveRef.current) return;
    setMicMode(mode);
    setMicModeState(mode);
    if (mode === 'server' && listener.status !== 'paused' && listener.supported) listener.pause();
    else if (mode !== 'server' && (listener.status === 'paused' || listener.status === 'error' || listener.status === 'blocked')) listener.enable();
  };
  useEffect(() => {
    if (micMode === 'server' && listener.supported && listener.status !== 'paused') listener.pause();
  }, [micMode, listener.status, listener.supported]);
  useEffect(() => () => recordAbortRef.current?.abort(), []);
  const listenOnServer = async () => {
    if (micTestActiveRef.current) return;
    if (recordAbortRef.current) {
      recordAbortRef.current.abort();
      return;
    }
    if (listener.supported) await listener.pause();
    prime();
    stopSpeaking();
    const controller = new AbortController();
    recordAbortRef.current = controller;
    setRecording(true);
    setHelpOpen(false);
    setSpeechError('');
    setState('listening');
    setCaption('Pode falar…');
    setCaptionWords(null);
    try {
      const audio = await recordUtterance({
        signal: controller.signal,
        onSpeech: () => { if (!controller.signal.aborted) setCaption('Ouvindo…'); },
      });
      if (controller.signal.aborted) { setState('idle'); setCaption(''); return; }
      if (!audio) {
        setState('idle');
        setCaption('Não ouvi nada. Toque no microfone e fale.');
        setHelpOpen(true);
        return;
      }
      setState('thinking');
      setCaption('Transcrevendo…');
      const question = await transcribeOnServer(audio, controller.signal);
      if (controller.signal.aborted) { setState('idle'); setCaption(''); return; }
      if (!question) {
        setState('idle');
        setCaption('Não entendi. Tente de novo, mais perto do microfone.');
        setHelpOpen(true);
        return;
      }
      setCaption('');
      handleRef.current(question);
    } catch (error) {
      setState('idle');
      setCaption('');
      if (controller.signal.aborted) return;
      setSpeechError(error instanceof DOMException ? micErrorMessage(error) : error instanceof Error ? error.message : 'O microfone falhou.');
      setHelpOpen(true);
    } finally {
      if (recordAbortRef.current === controller) recordAbortRef.current = null;
      setRecording(false);
    }
  };
  const listenOnServerRef = useRef(listenOnServer);
  listenOnServerRef.current = listenOnServer;
  useEffect(() => {
    const listening = state === 'listening';
    if ((!listening && state !== 'talking') || (state === 'talking' && !voiceOn)) {
      bargeCandidateRef.current = null;
      bargeHandledRef.current = false;
      setLongListening(false);
      setListeningActivity(false);
      return;
    }
    let stopped = false;
    let stream: MediaStream | null = null;
    let disconnect: () => void = () => undefined;
    let frame = 0;
    let aboveSince = 0;
    let listeningActivity = false;
    let longListeningActive = false;

    const monitor = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) return;
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
        });
        if (stopped) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        disconnect = connectMic(stream);
        const check = () => {
          if (stopped) return;
          const now = performance.now();
          const micLevel = getMicRms();
          const outputLevel = getOutputRms();
          const strongVoice = listening
            ? micLevel > 0.035
            : micLevel > 0.055 && micLevel > outputLevel * 1.35;
          if (strongVoice) {
            if (!aboveSince) {
              aboveSince = now;
              if (listening && !listeningActivity) {
                listeningActivity = true;
                setListeningActivity(true);
              }
            }
          } else {
            aboveSince = 0;
            if (listening && listeningActivity) {
              listeningActivity = false;
              setListeningActivity(false);
              setLongListening(false);
              longListeningActive = false;
            }
          }

          if (listening && aboveSince && now - aboveSince >= 4000 && !longListeningActive) {
            longListeningActive = true;
            setLongListening(true);
          }
          if (!listening && aboveSince && now - aboveSince >= 400 && !bargeHandledRef.current) {
            if (serverMicRef.current) {
              bargeHandledRef.current = true;
              listenOnServerRef.current();
            } else {
              const candidate = bargeCandidateRef.current;
              if (candidate && Date.now() - candidate.at < 1500
                && !resemblesPlayback(candidate.text, lastAnswerRef.current)) {
                bargeHandledRef.current = true;
                handleRef.current(candidate.text);
              }
            }
          }
          frame = requestAnimationFrame(check);
        };
        frame = requestAnimationFrame(check);
      } catch {
        // Browser wake recognition remains available when a second mic meter is blocked.
      }
    };
    void monitor();
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      disconnect();
      stream?.getTracks().forEach((track) => track.stop());
      if (listening) {
        setListeningActivity(false);
        setLongListening(false);
      }
    };
  }, [state, voiceOn]);
  useEffect(() => { if (!listener.supported) { setTyping(true); setCaption(''); } }, [listener.supported]);
  const microphoneHelpShown = useRef(false);
  useEffect(() => {
    if ((listener.status === 'blocked' || listener.status === 'unsupported' || listener.status === 'error') && !microphoneHelpShown.current && micMode !== 'server') {
      microphoneHelpShown.current = true;
      setHelpOpen(true);
    }
  }, [listener.status, micMode]);
  const toggleMic = () => {
    if (micTestActiveRef.current) return;
    prime();
    if (useServerMic) { void listenOnServer(); return; }
    if (!listener.supported) { setTyping(true); return; }
    if (listener.active) listener.standby(); else listener.activate();
  };
  const toggleVoice = () => {
    const enabled = !voiceOnRef.current;
    voiceOnRef.current = enabled; setVoiceOn(enabled);
    if (!enabled && speechPendingRef.current) {
      const playedAudio = stateRef.current === 'talking';
      turnRef.current++; speechPendingRef.current = false; activeRef.current = false;
      stopSpeaking(); window.clearTimeout(captionTimerRef.current);
      setCaptionWords(null); setCaption(lastAnswerRef.current);
      setState('idle'); commandCompleteRef.current(playedAudio);
    }
  };
  const activateVoice = async () => {
    setSpeechError('');
    if (!await activateAudio()) {
      setSpeechError('Não foi possível ativar a saída de áudio. Confira o volume do dispositivo e tente novamente.');
      return;
    }
    setAudioActivated(true);
    voiceOnRef.current = true;
    setVoiceOn(true);
    sayRef.current('Olá, o áudio do Ícaro está ativado.');
  };
  const listenLabel = useServerMic
    ? (recording ? 'Gravando… pare de falar para enviar' : 'Microfone pelo servidor · toque no microfone e fale')
    : {
    starting: listener.installingLocal ? 'Instalando reconhecimento local…' : 'Conectando reconhecimento local…',
    listening: listener.active ? 'Escuta ativa' : 'Em espera · detector local',
    blocked: 'Escuta local indisponível', unsupported: 'Voz local não suportada',
    error: 'Reconectando reconhecimento…', paused: 'Microfone pausado',
  }[listener.status];
  const showListenerError = !!listener.error && !useServerMic;
  const visibleCaption = caption;
  const activateRef = useRef<() => void>(() => undefined);
  activateRef.current = () => {
    if (micTestActiveRef.current) return;
    prime();
    if (useServerMic) { void listenOnServerRef.current(); return; }
    if (!listener.supported) { setTyping(true); return; }
    listener.activate();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!shouldActivateStageShortcut(e, { panelOpen: panelRef.current, helpOpen: helpRef.current })) return;
      e.preventDefault(); activateRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!stageLayout.editing) return;
    const onEsc = (event: KeyboardEvent) => { if (event.key === 'Escape') stageLayout.setEditing(false); };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [stageLayout.editing, stageLayout.setEditing]);

  const submit = () => { const t = text; setText(''); handle(t); };
  const clock = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'America/Sao_Paulo' }).format(now);
  const remaining = timerEnd ? Math.max(0, Math.ceil((timerEnd - now) / 1000)) : 0;
  const mmss = `${String(Math.floor(remaining / 3600)).padStart(2, '0')}:${String(Math.floor((remaining % 3600) / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
  const energy = state === 'talking' ? .85 : state === 'listening' ? .6 : state === 'thinking' ? .35 : .1;
  const provName = PROVIDER_NAMES;
  const selectScene = (next: CosmosScene) => {
    setFeiraTarget(false);
    setScene(next);
    setSceneMode('single');
    setSceneFade(true);
    window.setTimeout(() => setSceneFade(false), 1000);
  };
  const ambientToggle = () => {
    setAmbientError('');
    if (ambientRef.current) {
      void ambientRef.current.close().catch(() => undefined);
      ambientRef.current = null;
      setAmbientOn(false);
      return;
    }
    try {
      const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) {
        setAmbientError('Este navegador não oferece áudio ambiente.');
        return;
      }
      const context = new AudioContextCtor();
      const resume = context.state === 'suspended' ? context.resume() : Promise.resolve();
      const master = context.createGain();
      master.gain.value = .12;
      master.connect(context.destination);
      [[36, 'sine', .25], [54, 'triangle', .08], [72, 'sine', .035]].forEach(([frequency, type, volume]) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = type as OscillatorType;
        oscillator.frequency.value = frequency as number;
        gain.gain.value = volume as number;
        oscillator.connect(gain);
        gain.connect(master);
        oscillator.start();
      });
      const noiseBuffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
      const noiseData = noiseBuffer.getChannelData(0);
      for (let i = 0; i < noiseData.length; i++) noiseData[i] = (Math.random() * 2 - 1) * .32;
      const noise = context.createBufferSource();
      noise.buffer = noiseBuffer;
      noise.loop = true;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 260;
      filter.Q.value = .7;
      const noiseGain = context.createGain();
      noiseGain.gain.value = .16;
      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(master);
      noise.start();
      ambientRef.current = context;
      void resume.then(() => {
        if (context.state !== 'running') throw new Error('AudioContext did not resume');
        setAmbientOn(true);
      }).catch(() => {
        if (ambientRef.current === context) ambientRef.current = null;
        void context.close().catch(() => undefined);
        setAmbientOn(false);
        setAmbientError('Não foi possível iniciar o som ambiente. Tente novamente.');
      });
    } catch {
      setAmbientOn(false);
      setAmbientError('Não foi possível iniciar o som ambiente. Tente novamente.');
    }
  };

  return (
    <div ref={stageRef} className="stage" data-state={state} data-scene-mode={sceneMode} data-voice-active={listener.active} data-voice-enabled={voiceOn} data-layout-editing={stageLayout.editing || undefined} onPointerDown={prime}>
      {sceneMode === 'all' ? (
        <CosmosOverview
          quality={quality}
          visible={sceneVisible}
          feeds={feeds.data}
          targetCity={feiraTarget}
          state={state}
          getAudioLevel={getLevel}
        />
      ) : (
        <CosmosRenderer
          scene={scene}
          quality={quality}
          visible={sceneVisible}
          feeds={feeds.data}
          targetCity={feiraTarget}
          state={state}
          getAudioLevel={getLevel}
          onFps={setRenderFps}
          onAssetsStatus={setAssetsStatus}
        />
      )}
      <div className={`scene-fade ${sceneFade ? 'scene-fade--active' : ''}`} aria-hidden="true" />
      <NeuralWeb state={state} scene={scene} emotion={emotion} longListening={longListening} thoughtTitle={state === 'thinking' ? 'SÍNTESE EM CURSO' : ''} />
      <FutureScene />
      <Particles />
      {avatarById(avatarId).kind === 'engine' ? (
        <HoloFace state={state} getLevel={getLevel} layout={avatarLayout} />
      ) : (
        <HoloPortrait definition={avatarById(avatarId)} state={state} getLevel={getLevel} layout={avatarLayout} />
      )}
      <video ref={introRef} className="intro" src={media('intro.mp4')} playsInline onEnded={endIntro} style={{ opacity: state === 'intro' ? 1 : 0, pointerEvents: 'none' }} data-testid="video-intro" />
      <div className="scan" /><div className="vig" />
      <Waveform energy={energy} analyser={state === 'talking' ? getAnalyser() : null} />

      <header className="stage-header" data-testid="stage-header" {...stageLayout.chrome('header')}>
        <div className="stage-brand">
          <span className="stage-brand__mark" aria-hidden="true">ᛟ</span>
          <div><div className="stage-brand__name">ÍCARO</div><div className="stage-brand__sub">CENTRO DE OPERAÇÕES · UEFS</div></div>
        </div>
        <div className="scene-switcher" role="group" aria-label="Visualização das cenas">
          <button
            type="button"
            className="scene-button"
            aria-label="Mostrar as três cenas"
            aria-pressed={sceneMode === 'all'}
            onClick={() => setSceneMode('all')}
            data-testid="button-scene-all"
          >
            <Layers size={14} aria-hidden="true" /><span>Todas</span>
          </button>
          {([
            ['galaxy', 'Galáxia', <Orbit size={14} key="g" />],
            ['system', 'Sistema solar', <Radio size={14} key="s" />],
            ['earth', 'Terra ao vivo', <Globe2 size={14} key="e" />],
          ] as const).map(([value, label, icon]) => (
            <button key={value} className="scene-button" aria-pressed={sceneMode === 'single' && scene === value} onClick={() => selectScene(value)} data-testid={`button-scene-${value}`}>
              {icon}<span>{label}</span>
            </button>
          ))}
        </div>
        <div className="mobile-feed" data-testid="status-cosmos-mobile">
          {feeds.isLoading && <span>Conectando à telemetria pública…</span>}
          {feeds.isError && <span className="mobile-feed__error">Feed indisponível <button onClick={() => void feeds.refetch()}>Tentar novamente</button></span>}
          {feeds.data && <span>{feeds.data.stale ? 'Em cache · ' : 'AO VIVO · '}ISS {feeds.data.iss.current.latitude.toFixed(1)}° / {feeds.data.iss.current.longitude.toFixed(1)}° · {feeds.data.earthquakes.length} sismos</span>}
        </div>
      </header>
      <aside className="stage-readout stage-readout--left" aria-label="Ícaro em atividade" {...stageLayout.chrome('readout-left')}>
        <svg className="readout-frame" viewBox="0 0 240 500" preserveAspectRatio="none" aria-hidden="true"><path d="M25 2Q12 2 9 19L3 47Q1 60 5 74L5 424Q4 440 18 446Q32 451 45 483L195 483Q211 481 214 464L235 429Q239 420 237 403L237 39Q237 22 220 19L93 18Q75 18 66 8Q58 1 43 2Z" /></svg>
        <div className="readout-kicker"><span className="readout-dot" /> SISTEMA ATIVO</div>
        <div className="readout-title">{scene === 'galaxy' ? 'Espaço profundo' : scene === 'system' ? 'Sistema solar' : feiraTarget ? 'Feira de Santana' : 'Órbita terrestre'}</div>
        <div className="readout-line"><span>ESTADO</span><strong>{STATE_LABEL[state]}</strong></div>
        <div className="readout-line"><span>CENA</span><strong>{scene === 'galaxy' ? 'GALÁXIA' : scene === 'system' ? 'SOLAR' : 'TERRA'}</strong></div>
        <div className="readout-line"><span>FEIRA · LOCAL</span><strong>{clock}</strong></div>
        <div className="readout-line"><span>REDE NEURAL</span><strong>{state === 'idle' ? 2 : Math.max(1, Math.round(12 + getLevel() * 84))} sinapses/s</strong></div>
        <div className="readout-line"><span>ÚLTIMA FONTE</span><strong>{responseMeta.source}</strong></div>
        <div className="readout-line"><span>TEMPO DE RESPOSTA</span><strong>{responseMeta.durationMs === null ? '—' : `${responseMeta.durationMs} ms`}</strong></div>
        <div className="readout-line"><span>RENDERIZAÇÃO</span><strong>{renderFps === null ? 'medindo' : `${renderFps} FPS`}</strong></div>
        <div className="readout-divider" />
        <p className="readout-assets" title={assetsStatus}>{assetsStatus}</p>
        <p>Presença neural estável. Canal de voz pronto para a próxima instrução.</p>
      </aside>
      <aside className="stage-readout stage-readout--right" aria-label="Dados orbitais e sísmicos" {...stageLayout.chrome('readout-right')}>
        <svg className="readout-frame" viewBox="0 0 240 500" preserveAspectRatio="none" aria-hidden="true"><path d="M25 2Q12 2 9 19L3 47Q1 60 5 74L5 424Q4 440 18 446Q32 451 45 483L195 483Q211 481 214 464L235 429Q239 420 237 403L237 39Q237 22 220 19L93 18Q75 18 66 8Q58 1 43 2Z" /></svg>
        <div className="readout-kicker"><span className={`readout-dot ${feeds.data?.stale ? 'readout-dot--stale' : ''}`} /> TELEMETRIA PÚBLICA</div>
        {feeds.isLoading && <div className="feed-skeleton" role="status" data-testid="status-cosmos-loading"><i /><i /><i /></div>}
        {feeds.isError && <div className="feed-error" role="alert" data-testid="status-cosmos-error">Sinal indisponível <button onClick={() => void feeds.refetch()} data-testid="button-retry-cosmos">Tentar de novo</button></div>}
        {feeds.data && <>
          {feeds.data.stale && <div className="feed-stale" role="status" data-testid="status-cosmos-stale">Dados em cache · aguardando atualização</div>}
          <div className="readout-title">ISS · Estação espacial</div>
          <div className="readout-coordinate">{feeds.data.iss.current.latitude.toFixed(2)}° · {feeds.data.iss.current.longitude.toFixed(2)}°</div>
          <div className="readout-line"><span>ALTITUDE</span><strong>{feeds.data.iss.current.altitudeKm.toFixed(1)} km</strong></div>
          <div className="readout-line"><span>VELOCIDADE</span><strong>{Math.round(feeds.data.iss.current.velocityKmh).toLocaleString('pt-BR')} km/h</strong></div>
          <div className="readout-line"><span>VISIBILIDADE</span><strong>{feeds.data.iss.current.visibility}</strong></div>
          {feeds.data.iss.nextPassAt && <div className="readout-line"><span>PRÓXIMA PASSAGEM</span><strong>{timeValue(feeds.data.iss.nextPassAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}{feeds.data.iss.nextPassDistanceKm !== null ? ` · ${feeds.data.iss.nextPassDistanceKm.toFixed(0)} km` : ''}</strong></div>}
          <div className="readout-divider" />
          <div className="readout-title readout-title--small">Sismos recentes <span>{feeds.data.earthquakes.length}</span></div>
          {feeds.data.earthquakes.slice(0, 2).map((quake) => (
            <a key={quake.id} className="quake-row" href={quake.url} target="_blank" rel="noopener noreferrer" data-testid={`link-quake-${quake.id}`}>
              <span className="quake-magnitude">M{quake.magnitude.toFixed(1)}</span><span className="quake-place" title={`${quake.place} · ${quake.depthKm.toFixed(1)} km · ${timeValue(quake.occurredAt).toLocaleString('pt-BR')}`}>{quake.place}<small>{quake.depthKm.toFixed(1)} km · {timeValue(quake.occurredAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</small></span>
            </a>
          ))}
          <div className="readout-updated">ATUALIZADO {timeValue(feeds.data.updatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · TTL {feeds.data.ttlSeconds}s</div>
        </>}
      </aside>
      {timerEnd && <div className="hud mono text-[13px] text-[color:var(--warn)]" data-testid="text-timer-hud">T− {mmss}</div>}
      <StageHelp open={helpOpen} onOpen={() => setHelpOpen(true)} onClose={() => setHelpOpen(false)} clock={clock} stateLabel={state === 'idle' ? 'Em espera' : STATE_LABEL[state]}>
        <h3>Microfone</h3>
        <p role="status" data-testid="status-listening">{listenLabel}</p>
        {showListenerError && <p role="alert" data-testid="status-listening-error">{wakeAccessErrorMessage(listener.error!)}</p>}
        {useServerMic && micMode === 'auto' && listener.error && <p data-testid="status-mic-fallback">A detecção local não está disponível ({listener.error}). Para usar o servidor, toque no microfone; o áudio só será captado após esse toque.</p>}
        <div className="sh-row"><button onClick={() => void activateVoice()} data-testid="button-audio-activate-help">Ativar e testar áudio do Ícaro</button></div>
        {speechError && <p role="alert" data-testid="status-audio-error-help">{speechError}</p>}
        {(listener.inFrame || listener.error === 'iframe-policy' || listener.error === 'local-policy') && <a className="hbtn mt-2" href={import.meta.env.BASE_URL} target="_blank" rel="noopener noreferrer" data-testid="link-open-stage-tab">Abrir Ícaro em uma nova aba</a>}
        {listener.status === 'unsupported' && <p>{listener.error === 'local-unsupported' ? 'Reconhecimento local indisponível. Use o microfone para ativar manualmente ou digite sua pergunta.' : 'Reconhecimento de voz indisponível neste navegador. Use o teclado para digitar.'}</p>}
        {listener.localInstallAvailable && (listener.installingLocal || listener.error === 'local-pack-required' || listener.error === 'local-pack-install-failed') && (
          <div className="sh-row">
            <button onClick={() => void listener.installLocalPack()} disabled={listener.installingLocal} data-testid="button-install-local-speech">
              {listener.installingLocal ? 'Instalando pacote local…' : 'Instalar pacote local de português'}
            </button>
          </div>
        )}
        <div className="sh-row">
          {listener.status === 'blocked' && !['iframe-policy', 'insecure-context', 'local-unavailable', 'local-pack-required', 'local-pack-install-failed', 'local-policy'].includes(listener.error ?? '') && <button onClick={() => { prime(); listener.enable(); }} data-testid="button-enable-listening">Retomar microfone</button>}
          {listener.supported && <button onClick={() => { prime(); if (listener.status === 'paused') listener.enable(); else listener.pause(); }} data-testid="button-pause-listening">{listener.status === 'paused' ? 'Retomar microfone' : 'Pausar microfone'}</button>}
        </div>
        <MicSettings mode={micMode} onMode={chooseMicMode} usingServer={useServerMic} busy={micTestActive} onTestStart={beginMicTest} onTestEnd={endMicTest} />
      </StageHelp>

      <AvatarAdjuster
        layout={avatarLayout}
        open={avatarControlsOpen}
        saveError={avatarLayoutSaveError}
        avatarId={avatarId}
        onSelectAvatar={selectAvatar}
        onOpenChange={setAvatarControlsOpen}
        onAction={adjustAvatar}
      />
      {stageLayout.editing && (
        <div className="layout-banner" role="status" data-testid="banner-layout-editing">
          <Move size={14} aria-hidden="true" />
          <span>Arraste os elementos para reorganizar a tela</span>
          <button type="button" className="hbtn" onClick={stageLayout.resetLayout} data-testid="button-layout-reset"><RotateCcw size={13} /> Restaurar</button>
          <button type="button" className="hbtn" onClick={() => stageLayout.setEditing(false)} data-testid="button-layout-done"><Check size={13} /> Concluir</button>
        </div>
      )}
      <button className="menu hbtn disp text-lg" onClick={() => setPanel(true)} aria-label="Abrir painel" data-testid="button-open-panel" {...stageLayout.chrome('menu')}><Menu size={18} /></button>
      {state === 'intro' && <button className="hbtn absolute right-4 top-16 z-[6] text-xs" onClick={endIntro} data-testid="button-stop-intro"><X size={14} className="mr-1 inline" />Encerrar apresentação</button>}

      <div className="caption" hidden={!stageLayout.editing && (!captionsVisible || !visibleCaption)} aria-live="polite" aria-atomic="true" data-testid="text-caption" {...stageLayout.chrome('caption')}>
        <span>{captionWords
          ? captionWords.words.map((word, index) => <span key={`${index}-${word}`} className={`caption-word ${index < captionWords.activeIndex ? 'said' : index === captionWords.activeIndex ? 'now' : 'upcoming'}`}>{word}{' '}</span>)
          : (visibleCaption || (stageLayout.editing ? 'As legendas do Ícaro aparecem aqui' : ''))}</span>
      </div>

      <div ref={dockRef} className="dock" {...stageLayout.chrome('dock')}>
        {searchLink && <a href={searchLink} target="_blank" rel="noopener noreferrer" className="hbtn mono flex items-center gap-2 text-xs" data-testid="link-search">Abrir pesquisa <ExternalLink size={12} /></a>}
        {speechError && <div className="audio-error" role="alert" data-testid="status-audio-error">{speechError}</div>}
        {typing && (
          <div className="typebar">
            <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder="Digite sua pergunta ao ÍCARO" aria-label="Pergunta ao ÍCARO" maxLength={4000} data-testid="input-question" />
            <button className="btn-holo" onClick={submit} disabled={!text.trim()} data-testid="button-send">Enviar</button>
          </div>
        )}
        <div className="dock-actions">
          <button className="hbtn dock-action" onClick={() => void activateVoice()} aria-label={audioActivated ? 'Testar voz do Ícaro' : 'Ativar áudio do Ícaro'} data-testid="button-audio-activate">
            <Volume2 size={16} /> {audioActivated ? 'Testar voz' : 'Ativar áudio'}
          </button>
          <button className="hbtn dock-action" onClick={() => setCaptionsVisible((visible) => !visible)} aria-pressed={captionsVisible} aria-label={captionsVisible ? 'Ocultar legendas' : 'Mostrar legendas'} data-testid="button-captions-toggle">
            {captionsVisible ? <EyeOff size={16} /> : <Eye size={16} />} Legendas {captionsVisible ? 'ligadas' : 'desligadas'}
          </button>
          <button className="hbtn dock-action" onClick={() => stageLayout.setEditing(!stageLayout.editing)} aria-pressed={stageLayout.editing} aria-label={stageLayout.editing ? 'Concluir reorganização da tela' : 'Reorganizar os elementos da tela'} data-testid="button-layout-edit">
            <Move size={16} /> {stageLayout.editing ? 'Concluir' : 'Reorganizar'}
          </button>
        </div>
        <button className="mic" onClick={toggleMic} aria-label={recording ? 'Parar gravação' : useServerMic ? 'Falar com Ícaro pelo microfone' : listener.active ? 'Voltar ao modo de espera' : 'Ativar Ícaro manualmente'} aria-pressed={listener.active || recording} data-testid="button-mic" data-recording={recording || undefined}><Mic size={34} /></button>
        <button onClick={() => setTyping((v) => !v)} className="hbtn" aria-label="Digitar pergunta" aria-expanded={typing} data-testid="button-toggle-typing"><Keyboard size={18} /></button>
      </div>

      <aside className="panel" data-open={panel} aria-hidden={!panel} inert={!panel} style={{ visibility: panel ? 'visible' : 'hidden' }} aria-label="Painel do ÍCARO">
        <div className="flex items-center justify-between border-b border-[color:var(--line)] px-5 py-4">
          <div className="flex items-center gap-3">
            <img src={media(HOLO_MEDIA.avatar)} alt="" className="h-9 w-9 rounded-full border border-[color:var(--line)] object-cover" />
            <div><div className="disp font-semibold tracking-[.2em] text-[color:var(--holo)]">ÍCARO</div><div className="mono text-[10px] text-[color:var(--dim)]">ITCONT 2026 · Contabilidade UEFS</div></div>
          </div>
          <button className="hbtn" onClick={() => setPanel(false)} aria-label="Fechar painel" data-testid="button-close-panel"><X size={16} /></button>
        </div>
        <div className="disp flex border-b border-[color:var(--line)]" role="tablist">
          {([['conversa', 'Conversa'], ['voz', 'Voz'], ['ferramentas', 'Ferramentas'], ['conexao', 'Conexão'], ['sobre', 'Sobre']] as const).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} className="tab" onClick={() => setTab(k)} data-testid={`tab-${k}`}>{l}</button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-5 text-sm">
          {tab === 'conversa' && (
            <div className="flex h-full flex-col gap-4">
              <div className="mono text-[11px] text-[color:var(--dim)]">Motor: <span className="text-[color:var(--ok)]">{provName[provider]}</span> · persona ÍCARO</div>
              <div className="card min-h-[180px] flex-1 space-y-3 overflow-y-auto" data-testid="list-conversation">
                {!log.length && <p className="text-[color:var(--dim)]">A conversa aparece aqui. Experimente um dos atalhos abaixo.</p>}
                {log.map((m, i) => (
                  <div key={i} className={m.role === 'user' ? 'text-right' : ''} data-testid={`entry-${m.role}-${i}`}>
                    <div className="mono text-[10px] uppercase tracking-widest text-[color:var(--dim)]">{m.role === 'user' ? 'Você' : 'ÍCARO'}</div>
                    <div className={m.role === 'user' ? 'text-[color:var(--ink)]' : 'text-[color:var(--holo)]'}>{m.content}</div>
                    {m.link && <a href={m.link} target="_blank" rel="noopener noreferrer" className="mono text-xs underline">Abrir pesquisa <ExternalLink size={12} /></a>}
                  </div>
                ))}
                {sendMessage.isPending && <div className="h-3 w-24 animate-pulse rounded bg-[color:var(--line)]" />}
                <div ref={logEnd} />
              </div>
              <div className="flex flex-wrap gap-2">
                {[['Apresente-se', 'Apresente-se para a turma'], ['O que é ÍCARO?', 'O que significa ÍCARO?'], ['Dados x Análise', 'Qual a diferença entre ciência de dados e análise de dados na contabilidade?'], ['IA na auditoria', 'Como a inteligência artificial pode ajudar na auditoria contábil?'], ['30% de 200', 'calcule 30% de 200'], ['Timer 5 min', 'temporizador de 5 minutos']].map(([l, q]) => (
                  <button key={l} className="chip" onClick={() => { setPanel(false); handle(q); }} data-testid={`chip-${l}`}>{l}</button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button className="pbtn" onClick={playIntro} data-testid="button-intro"><Play size={14} /> Apresentação original</button>
                <button className="pbtn" onClick={fullscreen} data-testid="button-fullscreen"><Maximize size={14} /> Tela cheia</button>
                 <button className="pbtn" onClick={toggleVoice} data-testid="button-voice-toggle">{voiceOn ? <Volume2 size={14} /> : <VolumeX size={14} />} Voz {voiceOn ? 'ligada' : 'desligada'}</button>
                <Link href="/analysis" className="pbtn" data-testid="link-analysis"><BarChart3 size={14} /> Análise de CSV</Link>
              </div>
            </div>
          )}
          {tab === 'voz' && (
            <div className="space-y-5">
              <MicSettings mode={micMode} onMode={chooseMicMode} usingServer={useServerMic} busy={micTestActive} onTestStart={beginMicTest} onTestEnd={endMicTest} />
              <div className="card space-y-3">
                <div className="mono text-[10px] uppercase tracking-widest text-[color:var(--ok)]">Palco visual</div>
                <label className="setting-label" htmlFor="stage-quality">Qualidade gráfica</label>
                <select id="stage-quality" value={quality} onChange={(event) => setQuality(event.target.value as VisualQuality)} data-testid="select-stage-quality">
                  {QUALITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                <p className="text-xs text-[color:var(--dim)]">Auto reduz os detalhes quando a renderização fica lenta. A preferência fica salva neste dispositivo.</p>
                <button className="pbtn w-full" onClick={ambientToggle} aria-pressed={ambientOn} data-testid="button-ambient-toggle">
                  {ambientOn ? <Volume2 size={14} /> : <VolumeX size={14} />} Som ambiente {ambientOn ? 'ligado' : 'desligado'}
                </button>
                {ambientError && <p role="alert" className="text-xs text-[color:var(--bad)]" data-testid="status-ambient-error">{ambientError}</p>}
              </div>
              <div className="card space-y-2">
                <div className="mono text-[10px] uppercase tracking-widest text-[color:var(--ok)]">Ativação por voz</div>
                <p>Diga <strong>“Ok, Ícaro”</strong> ou <strong>“Let’s go, Ícaro”</strong>, seguido da pergunta, ou espere a indicação “Escuta ativa”. Cada ativação autoriza uma pergunta; após responder, o ÍCARO volta à espera. Sem pergunta em 10 segundos, a ativação expira em silêncio. Diga <strong>“Stop, Ícaro”</strong> para interromper.</p>
                <p className="privacy-note text-xs text-[color:var(--dim)]">Em espera, o reconhecimento local mantém o microfone ativo no dispositivo; áudio e transcrição não são enviados a um serviço de voz. Após ativar, a pergunta autorizada é enviada ao ÍCARO. O teste de microfone só captura após clique; a validação falada pode usar o serviço do navegador. No modo Servidor, o áudio é enviado para transcrição após tocar.</p>
                <p className="text-xs text-[color:var(--warn)]">Requer permissão e um navegador recente com reconhecimento local em português (Chrome ou Edge). Se o pacote local não estiver instalado, instale-o pelo aviso; sem suporte local, a escuta fica desligada.</p>
              </div>
              <div className="card space-y-3" data-testid="card-voice-options">
                <div className="mono text-[10px] uppercase tracking-widest text-[color:var(--ok)]">Vozes para teste</div>
                <label className="setting-label" htmlFor="voice-account-search">Buscar nome ou sotaque na conta</label>
                <input
                  id="voice-account-search"
                  type="search"
                  value={voiceSearch}
                  onChange={(event) => setVoiceSearch(event.target.value)}
                  placeholder="Emanuel, Bahia, Feira de Santana…"
                  autoComplete="off"
                  data-testid="input-voice-search"
                  className="w-full rounded-md border border-[color:var(--edge)] bg-[color:var(--panel)] px-3 py-2 text-sm"
                />
                <label className="setting-label" htmlFor="voice-test-selection">Voz para testar</label>
                <select
                  id="voice-test-selection"
                  value={selectedVoice?.voiceId ?? ''}
                  onChange={(event) => {
                    const voice = voiceOptions.find((option) => option.voiceId === event.target.value);
                    if (!event.target.value) setSelectedVoice(null);
                    else if (voice) setSelectedVoice({ voiceId: voice.voiceId, name: voice.name });
                  }}
                  data-testid="select-test-voice"
                >
                  <option value="">Usar a voz padrão atual do Ícaro</option>
                  {selectedVoice && !voiceOptions.some((voice) => voice.voiceId === selectedVoice.voiceId) && (
                    <option value={selectedVoice.voiceId}>{selectedVoice.name} · selecionada</option>
                  )}
                  {voiceOptions.map((voice) => {
                    const tags = [voice.labels.language, voice.labels.accent, voice.labels.gender].filter(Boolean).join(' · ');
                    return <option key={voice.voiceId} value={voice.voiceId}>{tags ? `${voice.name} — ${tags}` : voice.name}</option>;
                  })}
                </select>
                {selectedVoiceMetadata?.description && (
                  <p className="text-xs text-[color:var(--dim)]" data-testid="text-selected-voice-description">
                    {selectedVoiceMetadata.description}
                  </p>
                )}
                {voiceCatalog.isLoading && <p className="text-xs text-[color:var(--dim)]">Carregando vozes masculinas da conta…</p>}
                {voiceCatalog.isError && <p role="alert" className="text-xs text-[color:var(--bad)]">Não foi possível carregar as vozes da conta ElevenLabs.</p>}
                {voiceCatalog.data && voiceOptions.length === 0 && (
                  <p className="text-xs text-[color:var(--dim)]">
                    {debouncedVoiceSearch
                      ? 'Nenhuma voz masculina da conta correspondeu. A busca depende do nome e das etiquetas cadastradas na ElevenLabs.'
                      : 'A conta não retornou vozes masculinas identificadas como português.'}
                  </p>
                )}
                <p className="text-xs text-[color:var(--dim)]">
                  A lista vem da conta ElevenLabs. Pesquise “Emanuel”, “Bahia” ou “Feira de Santana”; a região só aparece se estiver identificada nos dados da voz.
                  Enquanto escolhida, essa voz será usada em todas as falas deste navegador. A seleção fica salva neste dispositivo e não altera a voz padrão do servidor.
                </p>
                <button
                  className="pbtn w-full"
                  onClick={() => setSelectedVoice(null)}
                  disabled={!selectedVoice}
                  data-testid="button-voice-default"
                >
                  Voltar à voz padrão
                </button>
              </div>
              <div className="card space-y-3">
                <div className="mono text-[10px] uppercase tracking-widest text-[color:var(--dim)]">Motor de voz</div>
                <div className="text-[color:var(--holo)]" data-testid="text-voice-engine">
                  {selectedVoiceName
                    ? `Voz de teste ativa · ${selectedVoiceName}`
                    : status.data?.speechAvailable || voiceCatalog.data
                      ? 'Voz neural do servidor · padrão atual'
                      : 'Voz neural indisponível'}
                </div>
                {engine && <div className="mono text-[11px] text-[color:var(--dim)]" data-testid="text-voice-last">Última fala: {engine === 'browser' ? 'navegador' : engine}</div>}
                <p className="text-xs text-[color:var(--dim)]">O rosto usa os recortes originais do pacote, sem vídeo em loop. A boca fica fechada quando não há áudio de resposta.</p>
                <p className="text-xs text-[color:var(--dim)]">{engine === 'ElevenLabs' ? 'Sincronia por tempos de caracteres fornecidos pela voz.' : 'Com a voz atual, os tempos dos lábios e das palavras são estimados e seguem o relógio do áudio.'}</p>
                <p className="text-xs text-[color:var(--dim)]">Sem troca automática para voz robótica do navegador. UEFS aparece na legenda e é pronunciada “Uéfis”.</p>
                {!status.data?.speechAvailable && !voiceCatalog.data && <p className="text-xs text-[color:var(--dim)]">Nenhum provedor de voz neural configurado no servidor.</p>}
              </div>
              <div className="flex gap-2">
                <button className="pbtn" onClick={() => say('Olá, professor Rômulo. Esta é a minha voz.')} data-testid="button-voice-test">Testar voz</button>
              </div>
            </div>
          )}
          {tab === 'ferramentas' && (
            <div className="space-y-4">
              <div className="card">
                <div className="mono text-[10px] uppercase tracking-widest text-[color:var(--dim)]">Temporizador</div>
                {timerEnd ? <div className="mt-2 flex items-center justify-between"><span className="mono text-3xl text-[color:var(--warn)]" data-testid="text-timer">{mmss}</span><button className="pbtn" onClick={() => { setTimerEnd(null); say('Temporizador cancelado.'); }} data-testid="button-cancel-timer">Cancelar</button></div>
                  : <p className="mt-2 text-[color:var(--dim)]">Nenhum temporizador ativo. Diga "temporizador de 5 minutos".</p>}
                {timerEnd && <p className="mt-1 text-xs text-[color:var(--dim)]">Restam {formatDuration(remaining)}.</p>}
              </div>
              <div className="card">
                <div className="mono mb-2 text-[10px] uppercase tracking-widest text-[color:var(--dim)]">Anotações ({notes.length})</div>
                {!notes.length ? <p className="text-[color:var(--dim)]">Diga "anote revisar o balanço patrimonial".</p> : (
                  <ul className="max-h-60 space-y-2 overflow-y-auto" data-testid="list-notes">
                    {notes.slice().reverse().map((n) => <li key={n.at} className="border-l-2 border-[color:var(--holo)] pl-3"><div>{n.text}</div><div className="mono text-[10px] text-[color:var(--dim)]">{new Date(n.at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</div></li>)}
                  </ul>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="pbtn" onClick={() => { localStorage.removeItem(NOTES_KEY); setNotes([]); }} data-testid="button-clear-notes"><Trash2 size={14} /> Apagar anotações</button>
                <button className="pbtn" onClick={() => setLog([])} data-testid="button-clear-log"><Trash2 size={14} /> Limpar conversa</button>
              </div>
            </div>
          )}
          {tab === 'conexao' && (
            <div className="space-y-3">
              {status.isLoading ? [0, 1, 2].map((i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-[color:var(--panel)]" />)
                : status.isError ? <div className="card text-[color:var(--bad)]">Não foi possível consultar os provedores. <button className="underline" onClick={() => status.refetch()} data-testid="button-retry-status">Tentar novamente</button></div>
                : [
                  {
                    id: 'auto' as Provider,
                    name: 'Automático',
                    available: status.data?.providers.some((item) => AUTO_PROVIDER_IDS.has(item.id) && item.available) ?? false,
                  },
                  ...(status.data?.providers ?? []).map((item) => ({
                    id: item.id as Provider,
                    name: item.name,
                    available: item.available,
                  })),
                ].map(({ id: p, name, available: ok }) => {
                  return (
                    <button key={p} disabled={!ok} onClick={() => setProvider(p)} className="card flex w-full items-center justify-between text-left disabled:opacity-50" style={{ borderColor: provider === p ? 'var(--holo)' : undefined }} data-testid={`button-provider-${p}`}>
                      <span className="disp font-semibold">{name || provName[p]}</span>
                      <span className="mono text-xs" style={{ color: ok ? 'var(--ok)' : 'var(--bad)' }}>{ok ? (provider === p ? 'em uso · disponível' : 'disponível') : 'indisponível'}</span>
                    </button>
                  );
                })}
              <p className="text-xs leading-5 text-[color:var(--dim)]">No modo automático, ÍCARO tenta apenas provedores configurados e disponíveis. Se a conexão falhar antes de começar a resposta, ele tenta o próximo; depois do primeiro trecho, mantém o mesmo provedor. A voz continua no Gemini, com Orus. Chaves permanecem no ambiente seguro e nunca aparecem nesta tela.</p>
              <Link href="/assistant" className="mono inline-flex items-center gap-1 text-xs text-[color:var(--holo)]" data-testid="link-assistant">Abrir chat completo <ExternalLink size={12} /></Link>
            </div>
          )}
          {tab === 'sobre' && (
            <div className="about-content space-y-5" data-testid="content-about">
              <div className="about-mark" aria-hidden="true">ᛟ</div>
              <div><div className="mono text-[10px] uppercase tracking-[.2em] text-[color:var(--ok)]">Sobre o sistema</div><h2 className="font-display mt-2 text-3xl">Um olhar para além da sala.</h2></div>
              <p>ÍCARO é um assistente operacional sempre ativo, concebido para acompanhar a turma de Contabilidade da UEFS. Seu rosto original permanece no centro; o ambiente ao redor é uma janela para sistemas em movimento.</p>
              <div className="card space-y-3">
                <div className="mono text-[10px] uppercase tracking-widest text-[color:var(--dim)]">Cenas do palco</div>
                <p><strong>Galáxia</strong> — espiral procedural de 90 mil partículas e poeira estelar.</p>
                <p><strong>Sistema solar</strong> — oito planetas com posições calculadas pelo Astronomy Engine.</p>
                <p><strong>Terra ao vivo</strong> — terminador solar, luzes noturnas, nuvens e telemetria pública em cache.</p>
              </div>
              <div className="card about-credits">
                <div className="mono text-[10px] uppercase tracking-widest text-[color:var(--dim)]">Créditos</div>
                <p>NASA GIBS: Blue Marble Next Generation, VIIRS Black Marble e MODIS Terra Cloud Fraction. Dados e imagens públicos da NASA.</p>
                <p>Solar System Scope — texturas planetárias 2K, CC BY 4.0; texturas procedurais são usadas como fallback quando o host não está disponível.</p>
                <p>Astronomy Engine — cálculo de posições planetárias, licença MIT.</p>
                <p>A telemetria ISS e os eventos sísmicos são exibidos a partir do feed público em cache do servidor.</p>
              </div>
              <div className="mono text-[10px] text-[color:var(--dim)]">ITCONT · UEFS · ÍCARO sempre em órbita.</div>
            </div>
          )}
        </div>
      </aside>
      {panel && <div className="fixed inset-0 z-[15]" onClick={() => setPanel(false)} aria-hidden />}
      {materializing && <div className="materialize" role="status" data-testid="overlay-materialize">
        <div className="materialize__point" /><div className="materialize__galaxy" /><div className="materialize__earth" />
        <div className="materialize__neural" /><div className="materialize__face-scan" /><div className="materialize__scan" />
        <div className="materialize__mark">ᛟ</div>
        <div className="materialize__title">ÍCARO</div><div className="materialize__status">ESTABELECENDO PRESENÇA NEURAL</div>
        <div className="materialize__online">ÍCARO · CONSCIÊNCIA ONLINE</div>
        <div className="materialize__progress"><i /></div>
        <button className="hbtn materialize__skip" onClick={() => setMaterializing(false)} data-testid="button-skip-materialize"><SkipForward size={13} /> Pular</button>
      </div>}
    </div>
  );
}
