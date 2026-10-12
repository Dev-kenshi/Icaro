import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUpRight, MapPin } from 'lucide-react';
import { ITCONT } from '../dados';
import { dataExtenso, horaCurta, sessoesOrdenadas } from '../logica';

export default function Hero() {
  const [gyroEnabled, setGyroEnabled] = useState(false);
  const [gyroMessage, setGyroMessage] = useState('');
  const first = sessoesOrdenadas()[0];
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
    <section className="itc-hero" id="inicio" aria-labelledby="itc-title">
      <div className="itc-shell itc-hero-grid">
        <div className="itc-hero-copy">
          <span className="itc-eyebrow">UEFS · Feira de Santana · Bahia</span>
          <span className="itc-mark" aria-hidden="true">I</span>
          <h1 className="itc-title" id="itc-title">
            <span>{ITCONT.tituloOficial.split(' ').slice(0, 2).join(' ')}</span>
            <span>{ITCONT.tituloOficial.split(' ')[2]}</span>
            <span className="itc-chrome">{ITCONT.tituloOficial.split(' ')[3]}</span>
            <span className="itc-event-name">{ITCONT.tituloOficial.split(' ').slice(4).join(' ')}</span>
          </h1>
          <div className="itc-ribbon" aria-label={ITCONT.sigla}>{ITCONT.sigla.split('').join(' ')}</div>
          <p className="itc-hero-subtitle">{ITCONT.slogan.join(' • ')} / {ITCONT.missao}</p>
          <div className="itc-hero-facts">
            <span><strong>{dataExtenso(ITCONT.inicio)}</strong> — {dataExtenso(ITCONT.fim)}</span>
            <span>{horaCurta(first.inicio)} · Horário de Brasília</span>
            <span><MapPin size={16} aria-hidden="true" /> {ITCONT.local.nome}, {ITCONT.local.cidade} - {ITCONT.local.uf}</span>
          </div>
          <div className="itc-hero-actions">
            <a className="itc-primary" href={ITCONT.inscricaoUrl} target="_blank" rel="noopener noreferrer" data-testid="link-hero-register">
              Garantir minha vaga (gratuita) <ArrowUpRight size={17} aria-hidden="true" />
            </a>
            <a className="itc-secondary" href="#programacao" data-testid="link-hero-agenda">
              Ver programação <ArrowDown size={16} aria-hidden="true" />
            </a>
          </div>
          <button type="button" className="itc-gyro-toggle" onClick={enableGyro} data-testid="button-enable-3d">
            {gyroEnabled ? 'Efeito 3D ativado' : 'Ativar efeito 3D'}
          </button>
          <span className="sr-only" role="status" aria-live="polite">{gyroMessage}</span>
        </div>
        <aside className="itc-ticket itc-card" aria-label="Informações do evento">
          <img className="itc-ticket-logo" src={ITCONT.logo} alt={`Símbolo oficial do ${ITCONT.sigla}`} />
          <span className="itc-ticket-number">ENTRADA GRATUITA · PRESENCIAL</span>
          <h2>{ITCONT.local.nome}</h2>
          <p>{ITCONT.local.instituicao}<br />{ITCONT.local.cidade}, {ITCONT.local.estado}</p>
          <a href="#inscricao" className="itc-secondary" data-testid="link-ticket-register">Acessar inscrição <ArrowUpRight size={15} aria-hidden="true" /></a>
        </aside>
      </div>
    </section>
  );
}
