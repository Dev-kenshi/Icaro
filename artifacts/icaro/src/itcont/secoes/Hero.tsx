import { ArrowDown, ArrowUpRight, CalendarDays, MapPin, Play } from 'lucide-react';
import type { ReactNode } from 'react';
import { ITCONT } from '../dados';
import { dataExtenso, horaCurta } from '../logica';
import Contagem from './Contagem';

type HeroProps = { motionPrompt?: boolean; onEnableMotion?: () => void; earthBackdrop?: ReactNode; cosmosBackdrop?: ReactNode };

export default function Hero({ motionPrompt = false, onEnableMotion, earthBackdrop, cosmosBackdrop }: HeroProps) {
  const inicio = ITCONT.sessoes[0];
  return (
    <section className="itc-hero itc-intro" id="inicio" aria-labelledby="itc-title">
      {cosmosBackdrop}
      {earthBackdrop}
      <div className="itc-shell itc-intro-content">
        <span className="itc-eyebrow itc-hero-kicker">{ITCONT.local.instituicao} <i aria-hidden="true" /> {ITCONT.sigla}</span>
        <img
          className="itc-ribbon-logo"
          src={`${import.meta.env.BASE_URL}itcont-logo.png`}
          srcSet={`${import.meta.env.BASE_URL}itcont-logo.png 1x, ${import.meta.env.BASE_URL}itcont-logo-2x.png 2x, ${import.meta.env.BASE_URL}itcont-logo-3x.png 3x`}
          width={112}
          height={53}
          alt="Logo do ITCONT"
          decoding="async"
          fetchPriority="high"
        />
        <h1 className="itc-title" id="itc-title">
          <span className="itc-title-first"><i aria-hidden="true">I</i> Imersão</span>
          <span className="itc-title-second">Tecnológica</span>
          <span className="itc-chrome">Contábil</span>
        </h1>
        <p className="itc-hero-slogan">INOVAÇÃO <b>•</b> PRÁTICA <b>•</b> CONEXÕES</p>
        <p className="itc-intro-summary">{ITCONT.resumo}</p>
        <div className="itc-hero-facts" aria-label="Data, horário e local do evento">
          <span><CalendarDays size={17} aria-hidden="true" /><span>{dataExtenso(ITCONT.inicio)} e {dataExtenso(ITCONT.fim)}, a partir das {horaCurta(inicio.inicio)}</span></span>
          <span><MapPin size={17} aria-hidden="true" /><span>{ITCONT.local.nome} · {ITCONT.local.cidade}/{ITCONT.local.uf}</span></span>
        </div>
        <div className="itc-hero-actions">
          <a className="itc-primary itc-intro-register" href={ITCONT.inscricaoUrl} target="_blank" rel="noopener noreferrer" data-testid="link-hero-register">
            Garantir minha vaga gratuita <ArrowUpRight size={17} aria-hidden="true" />
          </a>
          <a className="itc-secondary" href="#programacao" data-testid="link-hero-program">
            Ver programação <ArrowDown size={16} aria-hidden="true" />
          </a>
        </div>
        <p className="itc-hero-audience">Uma imersão UEFS para estudantes, docentes, profissionais e comunidade.</p>
      </div>
      <Contagem />
      {motionPrompt && <button type="button" className="itc-motion-enable" onClick={onEnableMotion} data-testid="button-enable-motion">
        <Play size={16} aria-hidden="true" /> Ativar movimento
      </button>}
    </section>
  );
}
