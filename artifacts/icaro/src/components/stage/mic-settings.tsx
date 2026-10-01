import { useCallback, useEffect, useState } from 'react';
import { diagnoseMicrophone, getMicDeviceId, listMicrophones, setMicDeviceId, type MicDiagnosis, type MicMode } from '@/lib/mic-config';

const MODES: Array<[MicMode, string, string]> = [
  ['auto', 'Automático', 'Usa o navegador e troca sozinho para o servidor se ele falhar.'],
  ['browser', 'Navegador', 'Escuta contínua com “Ok, Ícaro”. Depende do serviço de voz do Google.'],
  ['server', 'Servidor (Whisper)', 'Toque no microfone, fale e pare: transcreve no servidor. Funciona em qualquer rede.'],
];

export function MicSettings({ mode, onMode, usingServer }: { mode: MicMode; onMode: (mode: MicMode) => void; usingServer: boolean }) {
  const [devices, setDevices] = useState<Array<{ id: string; label: string }>>([]);
  const [device, setDevice] = useState(getMicDeviceId);
  const [level, setLevel] = useState(0);
  const [testing, setTesting] = useState(false);
  const [diag, setDiag] = useState<MicDiagnosis | null>(null);

  const refresh = useCallback(() => { void listMicrophones().then(setDevices).catch(() => setDevices([])); }, []);
  useEffect(() => {
    refresh();
    navigator.mediaDevices?.addEventListener?.('devicechange', refresh);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', refresh);
  }, [refresh]);

  const test = async () => {
    setTesting(true); setDiag(null);
    try { setDiag(await diagnoseMicrophone(setLevel)); } finally { setTesting(false); refresh(); }
  };

  return (
    <div className="card space-y-3" data-testid="card-mic-settings">
      <div className="mono text-[10px] uppercase tracking-widest text-[color:var(--dim)]">Microfone</div>
      <div className="grid gap-2" role="radiogroup" aria-label="Como o Ícaro ouve">
        {MODES.map(([value, label, hint]) => (
          <button key={value} className="pbtn !justify-start text-left" role="radio" aria-checked={mode === value} onClick={() => onMode(value)}
            style={{ borderColor: mode === value ? 'var(--holo)' : undefined }} data-testid={`button-mic-mode-${value}`}>
            <span><strong>{label}</strong><span className="block text-xs text-[color:var(--dim)]">{hint}</span></span>
          </button>
        ))}
      </div>
      <p className="text-xs text-[color:var(--holo)]" data-testid="text-mic-engine">Em uso agora: {usingServer ? 'servidor (Whisper)' : 'reconhecimento do navegador'}</p>

      <label className="block text-xs">
        <span className="text-[color:var(--dim)]">Aparelho</span>
        <select className="mt-1 w-full rounded-lg border border-[color:var(--line)] bg-transparent p-2" value={device}
          onChange={(e) => { setDevice(e.target.value); setMicDeviceId(e.target.value); }} data-testid="select-mic-device">
          <option value="">Padrão do sistema</option>
          {devices.filter((d) => d.id && d.id !== 'default').map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
        </select>
      </label>
      <p className="text-xs text-[color:var(--dim)]">No modo Navegador, o Chrome usa o microfone escolhido em chrome://settings/content/microphone. O aparelho acima vale para o teste e para o modo Servidor.</p>

      <button className="pbtn" onClick={() => void test()} disabled={testing} data-testid="button-mic-test">{testing ? 'Testando… fale agora' : 'Testar microfone'}</button>
      <div className="h-2 overflow-hidden rounded bg-[color:var(--line)]" aria-label="Volume do microfone" role="meter" aria-valuenow={Math.round(level * 100)} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full bg-[color:var(--holo)] transition-[width] duration-75" style={{ width: `${Math.round(level * 100)}%` }} />
      </div>
      {diag && (
        <div className="space-y-1 text-xs" data-testid="text-mic-diagnosis">
          {diag.steps.map((s) => <div key={s} className="mono text-[color:var(--dim)]">· {s}</div>)}
          <p role={diag.ok ? 'status' : 'alert'} style={{ color: diag.ok ? 'var(--ok)' : 'var(--warn)' }}>{diag.advice}</p>
        </div>
      )}
    </div>
  );
}
