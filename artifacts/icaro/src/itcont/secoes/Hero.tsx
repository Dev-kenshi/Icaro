import { useEffect, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { ITCONT } from '../dados';
import QrEvento from './QrEvento';

export default function Hero() {
  const [gyroEnabled, setGyroEnabled] = useState(false);
  const [gyroMessage, setGyroMessage] = useState('');
  useEffect(() => {
    if (!gyroEnabled) return;
    const orient = (event: DeviceOrientationEvent) => {
      const root = document.querySelector<HTMLElement>('.itc');
      root?.style.setProperty('--itc-gyro-x', `${Math.max(-7, Math.min(7, (event.gamma ?? 0) / 6))}deg`);
      root?.style.setProperty('--itc-gyro-y', `${Math.max(-7, Math.min(7, (event.beta ?? 0) / 10))}deg`);
    };
    window.addEventListener('deviceorientation', orient);
    return () => window.removeEventListener('deviceorientation', orient);
  }, [gyroEnabled]);
  const enableGyro = async () => {
    const orientation = DeviceOrientationEvent as typeof DeviceOrientationEvent & { requestPermission?: () => Promise<string> };
    if (orientation.requestPermission) {
      try {
        const permission = await orientation.requestPermission();
        if (permission !== 'granted') { setGyroMessage('A permissão do sensor não foi concedida.'); return; }
      } catch { setGyroMessage('Não foi possível ativar o sensor neste navegador.'); return; }
    }
    setGyroEnabled(true);
    setGyroMessage('Efeito 3D ativado.');
  };
  return (
    <section className="itc-hero itc-intro" id="inicio" aria-labelledby="itc-title">
      <div className="itc-shell itc-intro-content">
        <span className="itc-eyebrow">{ITCONT.sigla} · {ITCONT.local.instituicao}</span>
        <h1 className="itc-title" id="itc-title">Uma imersão em novas possibilidades</h1>
        <ul className="itc-intro-speakers" aria-label="Convidados do evento">
          {ITCONT.convidados.map(({ nome }) => <li key={nome}>{nome}</li>)}
        </ul>
        <QrEvento />
        <p className="itc-intro-summary">{ITCONT.resumo}</p>
        <a className="itc-primary itc-intro-register" href={ITCONT.inscricaoUrl} target="_blank" rel="noopener noreferrer" data-testid="link-hero-register">
          Garantir minha vaga gratuita <ArrowUpRight size={17} aria-hidden="true" />
        </a>
        <span className="sr-only" role="status" aria-live="polite">{gyroMessage}</span>
        <button type="button" className="itc-gyro-toggle" onClick={enableGyro} data-testid="button-enable-3d">
          {gyroEnabled ? 'Efeito 3D ativado' : 'Ativar efeito 3D'}
        </button>
      </div>
    </section>
  );
}
