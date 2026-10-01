import { useEffect, useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';
import { wakeAccessBlockReason, wakeAccessErrorMessage } from '@/lib/wake-access';
import { parseWakeCommand } from '@/lib/wake-commands';

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

/** Página de diagnóstico do microfone: mostra em tempo real tudo o que o
 * reconhecimento de voz do navegador entrega e envia cada transcrição final
 * ao servidor (POST /api/mic-test), onde fica registrada no log. */
export default function MicTest() {
  const [status, setStatus] = useState('Parado. Clique em Iniciar e fale.');
  const [lines, setLines] = useState<Line[]>([]);
  const [running, setRunning] = useState(false);
  const recRef = useRef<Recognition | null>(null);
  const supported = typeof window !== 'undefined' && !!(
    (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition
    ?? (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
  );

  const stop = () => {
    const rec = recRef.current;
    recRef.current = null;
    if (rec) { rec.onstart = rec.onend = rec.onresult = rec.onerror = null; rec.abort(); }
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
    rec.lang = 'pt-BR'; rec.interimResults = true; rec.continuous = true; rec.maxAlternatives = 1;
    rec.onstart = () => { setRunning(true); setStatus('Ouvindo… fale agora.'); };
    rec.onerror = ({ error }) => {
      if (error !== 'no-speech' && error !== 'aborted') setStatus(wakeAccessErrorMessage(error));
    };
    rec.onend = () => {
      if (recRef.current === rec) {
        // Reinicia enquanto o teste estiver ligado, como o palco faz.
        try { rec.start(); } catch { stop(); }
      }
    };
    rec.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        const text = r[0].transcript.trim();
        if (!text) continue;
        const parsed = parseWakeCommand(text, false);
        const line: Line = {
          at: new Date().toLocaleTimeString('pt-BR'),
          text, final: r.isFinal, wake: parsed.wake, question: parsed.question,
        };
        setLines((l) => [...l.slice(-29), line]);
        if (r.isFinal) {
          void fetch(`${import.meta.env.BASE_URL}api/mic-test`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ text }),
          }).catch(() => setStatus('Falha ao registrar no servidor (login ativo?).'));
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
        Fale no microfone e veja aqui exatamente o que o navegador transcreve.
        Cada frase final também é gravada no log do servidor para conferência.
        Diga <strong>“Ok, Ícaro”</strong> para ver a ativação sendo detectada.
      </p>
      {!supported && <p role="alert">{wakeAccessErrorMessage('unsupported')}</p>}
      <div style={{ display: 'flex', gap: 12, margin: '16px 0' }}>
        {!running
          ? <button className="hbtn" onClick={start} data-testid="button-mic-test-start"><Mic size={16} /> Iniciar</button>
          : <button className="hbtn" onClick={stop} data-testid="button-mic-test-stop"><Square size={16} /> Parar</button>}
      </div>
      <p role="status" data-testid="text-mic-test-status">{status}</p>
      <ul style={{ listStyle: 'none', padding: 0 }} data-testid="list-mic-test-transcripts">
        {lines.map((l, i) => (
          <li key={`${l.at}-${i}`} style={{ padding: '6px 0', borderBottom: '1px solid #1d3a55', opacity: l.final ? 1 : 0.55 }}>
            <span style={{ opacity: 0.6, marginRight: 8 }}>{l.at}</span>
            {l.text}
            {l.wake && <strong style={{ color: '#5fd0ff', marginLeft: 8 }}>← ativação detectada{l.question ? `: “${l.question}”` : ''}</strong>}
            {!l.final && <em style={{ marginLeft: 8, opacity: 0.6 }}>(parcial)</em>}
          </li>
        ))}
      </ul>
    </div>
  );
}
