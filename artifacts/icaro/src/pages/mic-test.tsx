import { useEffect, useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';
import { wakeAccessBlockReason, wakeAccessErrorMessage } from '@/lib/wake-access';
import { WakeTurnGate } from '@/lib/wake-turn-gate';

interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
}

type Line = { at: string; text: string; final: boolean; wake: boolean; question: string };
type TestEvent = 'transcript' | 'wake' | 'question' | 'answer' | 'error';
type AiResponse = { answer?: unknown; error?: unknown };

/** Página de diagnóstico do microfone: mostra em tempo real tudo o que o
 * reconhecimento de voz do navegador entrega e envia cada transcrição final
 * ao servidor (POST /api/mic-test), onde fica registrada no log. */
export default function MicTest() {
  const [status, setStatus] = useState('Parado. Clique em Iniciar e fale.');
  const [lines, setLines] = useState<Line[]>([]);
  const [running, setRunning] = useState(false);
  const [answer, setAnswer] = useState('');
  const recRef = useRef<Recognition | null>(null);
  const gateRef = useRef(new WakeTurnGate());
  const busyRef = useRef(false);
  const requestRef = useRef<AbortController | null>(null);
  const supported = typeof window !== 'undefined' && !!(
    (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition
    ?? (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
  );

  const recordEvent = (type: TestEvent, text: string) => {
    void fetch(`${import.meta.env.BASE_URL}api/mic-test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ type, text }),
    }).then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    }).catch(() => setStatus('Não consegui registrar o teste no servidor. Confira se sua sessão continua conectada.'));
  };

  const askIcaro = async (question: string) => {
    busyRef.current = true;
    setAnswer('');
    setStatus('Pergunta reconhecida. Consultando a resposta real do Ícaro…');
    recordEvent('question', question);
    const controller = new AbortController();
    requestRef.current = controller;
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}api/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        signal: controller.signal,
        body: JSON.stringify({
          provider: 'groq',
          persona: 'icaro',
          question,
          history: [],
          dataset: null,
        }),
      });
      const data = await response.json() as AiResponse;
      if (!response.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : `A API respondeu HTTP ${response.status}.`);
      }
      if (typeof data.answer !== 'string' || !data.answer.trim()) {
        throw new Error('A API não retornou uma resposta de texto.');
      }
      const text = data.answer.trim();
      setAnswer(text);
      setStatus('Teste aprovado: microfone, ativação, pergunta e resposta da IA funcionaram. Áudio de saída não testado nesta página.');
      recordEvent('answer', text);
    } catch (error) {
      if (controller.signal.aborted) return;
      const message = error instanceof Error ? error.message : 'Falha ao consultar o Ícaro.';
      setStatus(`Falha no teste de resposta: ${message}`);
      recordEvent('error', message);
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
      busyRef.current = false;
      gateRef.current.complete(Date.now(), false);
    }
  };

  const stop = () => {
    const rec = recRef.current;
    recRef.current = null;
    if (rec) { rec.onstart = rec.onend = rec.onresult = rec.onerror = null; rec.abort(); }
    requestRef.current?.abort();
    requestRef.current = null;
    busyRef.current = false;
    gateRef.current.stop();
    setRunning(false);
    setStatus('Parado.');
  };

  const start = () => {
    const block = wakeAccessBlockReason(
      document as unknown as Parameters<typeof wakeAccessBlockReason>[0],
      window.isSecureContext,
    );
    if (block) { setStatus(wakeAccessErrorMessage(block)); return; }
    const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) { setStatus(wakeAccessErrorMessage('unsupported')); return; }
    const rec = new Ctor();
    recRef.current = rec;
    gateRef.current.newRecognitionSession();
    setLines([]);
    setAnswer('');
    rec.lang = 'pt-BR'; rec.interimResults = true; rec.continuous = true; rec.maxAlternatives = 1;
    rec.onstart = () => { setRunning(true); setStatus('Ouvindo… fale agora.'); };
    rec.onerror = ({ error }) => {
      if (error !== 'no-speech' && error !== 'aborted') setStatus(wakeAccessErrorMessage(error));
    };
    rec.onend = () => {
      if (recRef.current === rec) {
        // Reinicia enquanto o teste estiver ligado, como o palco faz.
        gateRef.current.newRecognitionSession();
        try { rec.start(); } catch { stop(); }
      }
    };
    rec.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        const text = r[0].transcript.trim();
        if (!text) continue;
        const actions = gateRef.current.receive(
          text,
          r.isFinal,
          i,
          Date.now(),
          busyRef.current,
        );
        const wake = actions.some((action) => action.type === 'wake');
        const question = actions.find((action) => action.type === 'question');
        const line: Line = {
          at: new Date().toLocaleTimeString('pt-BR'),
          text, final: r.isFinal, wake, question: question?.type === 'question' ? question.text : '',
        };
        setLines((l) => [...l.slice(-29), line]);
        if (r.isFinal) recordEvent('transcript', text);
        for (const action of actions) {
          if (action.type === 'wake') {
            setStatus('Ativação reconhecida. Faça uma pergunta agora, ou diga “Ok, Ícaro” e a pergunta na mesma frase.');
            recordEvent('wake', text);
          } else if (action.type === 'question') {
            void askIcaro(action.text);
          } else if (action.type === 'stop') {
            requestRef.current?.abort();
            requestRef.current = null;
            busyRef.current = false;
            setStatus('Comando de parada reconhecido.');
          } else if (action.type === 'expired') {
            setStatus('Ativação expirou sem pergunta. Diga “Ok, Ícaro” para tentar novamente.');
          }
        }
      }
    };
    try { rec.start(); } catch { setStatus(wakeAccessErrorMessage('not-allowed')); recRef.current = null; }
  };

  useEffect(() => () => { recRef.current?.abort(); recRef.current = null; }, []);

  return (
    <div className="mic-test" style={{ maxWidth: 720, margin: '0 auto', padding: 24, color: '#cfe6ff', fontFamily: 'inherit' }}>
      <h1 style={{ fontSize: 22 }}>Teste de microfone do Ícaro</h1>
      <p style={{ opacity: 0.8 }}>
        Clique em Iniciar e diga <strong>“Ok, Ícaro”</strong> seguido de uma pergunta.
        Também pode falar a ativação e a pergunta na mesma frase. A página testa
        o microfone, o comando de ativação e uma resposta real da IA; o áudio de
        saída não é testado aqui. O resultado é registrado no servidor para conferência.
      </p>
      {!supported && <p role="alert">{wakeAccessErrorMessage('unsupported')}</p>}
      <div style={{ display: 'flex', gap: 12, margin: '16px 0' }}>
        {!running
          ? <button className="hbtn" onClick={start} data-testid="button-mic-test-start"><Mic size={16} /> Iniciar</button>
          : <button className="hbtn" onClick={stop} data-testid="button-mic-test-stop"><Square size={16} /> Parar</button>}
      </div>
      <p role="status" data-testid="text-mic-test-status">{status}</p>
      {answer && (
        <section aria-live="polite" data-testid="panel-mic-test-answer" style={{ margin: '16px 0', padding: 16, border: '1px solid #1d698c', borderRadius: 8, background: '#081a27' }}>
          <h2 style={{ fontSize: 16, marginTop: 0 }}>Resposta do Ícaro</h2>
          <p style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>{answer}</p>
        </section>
      )}
      <ul style={{ listStyle: 'none', padding: 0 }} data-testid="list-mic-test-transcripts">
        {lines.map((l, i) => (
          <li key={`${l.at}-${i}`} style={{ padding: '6px 0', borderBottom: '1px solid #1d3a55', opacity: l.final ? 1 : 0.55 }}>
            <span style={{ opacity: 0.6, marginRight: 8 }}>{l.at}</span>
            {l.text}
            {l.wake && <strong style={{ color: '#5fd0ff', marginLeft: 8 }}>← ativação detectada{l.question ? `: “${l.question}”` : ''}</strong>}
            {!l.wake && l.question && <strong style={{ color: '#5fd0ff', marginLeft: 8 }}>← pergunta enviada: “{l.question}”</strong>}
            {!l.final && <em style={{ marginLeft: 8, opacity: 0.6 }}>(parcial)</em>}
          </li>
        ))}
      </ul>
    </div>
  );
}
