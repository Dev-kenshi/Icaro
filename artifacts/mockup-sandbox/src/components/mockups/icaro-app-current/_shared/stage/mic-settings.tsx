import { useState } from 'react';
import {
  diagnoseMicrophone,
  micErrorMessage,
  type MicDiagnosis,
  type MicMode,
} from '@/lib/mic-config';

const MODES: Array<[MicMode, string, string]> = [
  ['auto', 'Automático', 'Usa detecção local; se ela não estiver disponível, o servidor só grava após tocar no microfone.'],
  ['browser', 'Navegador', 'Detecta “Ok, Ícaro” no dispositivo, sem enviar áudio a um serviço de reconhecimento. Requer navegador e pacote local compatíveis.'],
  ['server', 'Servidor (Whisper)', 'Só começa a gravar após tocar no microfone; envia o áudio ao servidor para transcrição.'],
];

export function MicSettings({
  mode,
  onMode,
  usingServer,
  busy = false,
  onTestStart,
  onTestEnd,
}: {
  mode: MicMode;
  onMode: (mode: MicMode) => void;
  usingServer: boolean;
  busy?: boolean;
  onTestStart?: () => boolean | void | Promise<boolean | void>;
  onTestEnd?: () => void;
}) {
  const [level, setLevel] = useState(0);
  const [testing, setTesting] = useState(false);
  const [diagnosis, setDiagnosis] = useState<MicDiagnosis | null>(null);

  const testMicrophone = async () => {
    setTesting(true);
    setDiagnosis(null);
    let started = false;
    try {
      const allowed = await onTestStart?.();
      if (allowed === false) {
        setDiagnosis({ ok: false, steps: [], advice: 'Outro teste de microfone já está em andamento. Aguarde e tente novamente.' });
        return;
      }
      started = true;
      setDiagnosis(await diagnoseMicrophone(setLevel));
    } catch (error) {
      setDiagnosis({ ok: false, steps: [], advice: micErrorMessage(error) });
    } finally {
      if (started) onTestEnd?.();
      setTesting(false);
    }
  };

  return (
    <section className="card space-y-3" data-testid="card-mic-settings" aria-label="Configurações do microfone">
      <div className="mono text-[10px] uppercase tracking-widest text-[color:var(--dim)]">Microfone</div>
      <div className="grid gap-2" role="radiogroup" aria-label="Como o Ícaro ouve">
        {MODES.map(([value, label, hint]) => (
          <button
            key={value}
            type="button"
            className="pbtn !justify-start text-left"
            role="radio"
            aria-checked={mode === value}
            onClick={() => onMode(value)}
            disabled={testing || busy}
            style={{ borderColor: mode === value ? 'var(--holo)' : undefined }}
            data-testid={`button-mic-mode-${value}`}
          >
            <span>
              <strong>{label}</strong>
              <span className="block text-xs text-[color:var(--dim)]">{hint}</span>
            </span>
          </button>
        ))}
      </div>
      <p className="text-xs text-[color:var(--holo)]" data-testid="text-mic-engine">
        Em uso agora: {usingServer ? 'servidor (Whisper), após toque' : 'reconhecimento local do navegador'}
      </p>
      <p className="text-xs text-[color:var(--dim)]" data-testid="text-mic-default-device">
        Entrada fixa: microfone padrão do Chrome/Windows. Para trocar de aparelho, altere a entrada nas configurações do navegador ou do sistema.
      </p>
      <button
        type="button"
        className="pbtn"
        onClick={() => void testMicrophone()}
        disabled={testing || busy}
        data-testid="button-mic-test"
      >
        {testing ? 'Testando… fale agora' : busy ? 'Outro teste em andamento' : 'Testar microfone'}
      </button>
      <div
        className="h-2 overflow-hidden rounded bg-[color:var(--line)]"
        aria-label="Volume do microfone"
        role="meter"
        aria-valuenow={Math.round(level * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="h-full bg-[color:var(--holo)] transition-[width] duration-75" style={{ width: `${Math.round(level * 100)}%` }} />
      </div>
      {diagnosis && (
        <div className="space-y-1 text-xs" data-testid="text-mic-diagnosis">
          {diagnosis.steps.map((step) => <div key={step} className="mono text-[color:var(--dim)]">· {step}</div>)}
          <p role={diagnosis.ok ? 'status' : 'alert'} style={{ color: diagnosis.ok ? 'var(--ok)' : 'var(--warn)' }}>
            {diagnosis.advice}
          </p>
        </div>
      )}
    </section>
  );
}