import { useCallback, useEffect, useState } from 'react';
import {
  diagnoseMicrophone,
  getMicDeviceId,
  listMicrophones,
  micErrorMessage,
  setMicDeviceId,
  type MicDiagnosis,
  type MicMode,
} from '@/lib/mic-config';

const MODES: Array<[MicMode, string, string]> = [
  ['auto', 'Automático', 'Usa o navegador; no caso de falha compatível, oferece a transcrição pelo servidor.'],
  ['browser', 'Navegador', 'Escuta contínua com “Ok, Ícaro”. Depende do serviço de voz do navegador.'],
  ['server', 'Servidor (Whisper)', 'Toque no microfone, fale e pare: transcreve no servidor.'],
];

export function MicSettings({
  mode,
  onMode,
  usingServer,
}: {
  mode: MicMode;
  onMode: (mode: MicMode) => void;
  usingServer: boolean;
}) {
  const [devices, setDevices] = useState<Array<{ id: string; label: string }>>([]);
  const [device, setDevice] = useState(getMicDeviceId);
  const [level, setLevel] = useState(0);
  const [testing, setTesting] = useState(false);
  const [diagnosis, setDiagnosis] = useState<MicDiagnosis | null>(null);

  const refresh = useCallback(() => {
    void listMicrophones().then(setDevices).catch(() => setDevices([]));
  }, []);

  useEffect(() => {
    refresh();
    navigator.mediaDevices?.addEventListener?.('devicechange', refresh);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', refresh);
  }, [refresh]);

  const testMicrophone = async () => {
    setTesting(true);
    setDiagnosis(null);
    try {
      setDiagnosis(await diagnoseMicrophone(setLevel));
    } catch (error) {
      setDiagnosis({ ok: false, steps: [], advice: micErrorMessage(error) });
    } finally {
      setTesting(false);
      refresh();
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
        Em uso agora: {usingServer ? 'servidor (Whisper)' : 'reconhecimento do navegador'}
      </p>
      <label className="block text-xs">
        <span className="text-[color:var(--dim)]">Aparelho de entrada</span>
        <select
          className="mt-1 w-full rounded-lg border border-[color:var(--line)] bg-transparent p-2"
          value={device}
          onChange={(event) => { setDevice(event.target.value); setMicDeviceId(event.target.value); }}
          data-testid="select-mic-device"
        >
          <option value="">Padrão do sistema</option>
          {devices.filter((entry) => entry.id && entry.id !== 'default').map((entry) => (
            <option key={entry.id} value={entry.id}>{entry.label}</option>
          ))}
        </select>
      </label>
      <p className="text-xs text-[color:var(--dim)]">
        No modo Navegador, o Chrome usa o microfone padrão definido nas configurações do site. A seleção acima vale para o teste e para o modo Servidor.
      </p>
      <button
        type="button"
        className="pbtn"
        onClick={() => void testMicrophone()}
        disabled={testing}
        data-testid="button-mic-test"
      >
        {testing ? 'Testando… fale agora' : 'Testar microfone'}
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