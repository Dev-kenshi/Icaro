import { ArrowUpRight, MapPin } from 'lucide-react';
import { ITCONT } from '../dados';
import { mapaUrl } from '../logica';

export default function Local() {
  return (
    <section className="itc-section" id="local" aria-labelledby="itc-place-title">
      <div className="itc-shell">
        <header className="itc-section-head">
          <h2 id="itc-place-title"><span>Encontro presencial na UEFS</span>Como chegar</h2>
        </header>
        <div className="itc-place-grid">
          <article className="itc-place-card itc-card">
            <MapPin size={26} aria-hidden="true" />
            <h3>{ITCONT.local.nome}</h3>
            <p>{ITCONT.local.endereco}<br />{ITCONT.local.cidade}, {ITCONT.local.estado}, {ITCONT.local.pais}</p>
            <p>{ITCONT.local.instituicao}</p>
            <a className="itc-primary" href={mapaUrl()} target="_blank" rel="noopener noreferrer" data-testid="link-open-map">
              Como chegar <ArrowUpRight size={16} aria-hidden="true" />
            </a>
          </article>
          <div className="itc-map" role="img" aria-label={`Mapa esquemático: UEFS em ${ITCONT.local.cidade}, ${ITCONT.local.estado}`}>
            <svg viewBox="0 0 640 360" aria-hidden="true">
              <path d="M38 276 C136 244 126 151 240 178 S355 279 450 205 547 142 610 87" fill="none" stroke="var(--itc-azul)" strokeWidth="3" strokeDasharray="9 11" />
              <path d="M48 70 L199 70 199 129 290 129 290 75 468 75 468 145 602 145" fill="none" stroke="var(--itc-eletrico)" strokeOpacity=".48" strokeWidth="2" />
              <path d="M72 318 L72 230 176 230 176 180 282 180 282 258 374 258 374 194 535 194 535 318" fill="none" stroke="var(--itc-azul)" strokeWidth="2" />
              <circle cx="319" cy="173" r="63" fill="var(--itc-eletrico)" fillOpacity=".12" />
              <circle cx="319" cy="173" r="35" fill="var(--itc-royal)" stroke="var(--itc-neon)" strokeWidth="3" />
              <path d="M319 153c-11 0-19 8-19 19 0 14 19 33 19 33s19-19 19-33c0-11-8-19-19-19zm0 26a7 7 0 1 1 0-14 7 7 0 0 1 0 14z" fill="var(--itc-branco)" />
              <text x="319" y="242" textAnchor="middle" className="itc-map-label">UEFS · Módulo IV</text>
              <text x="44" y="46">Feira de Santana</text>
              <text x="490" y="338">Bahia · Brasil</text>
              <circle cx="88" cy="116" r="5" fill="var(--itc-neon)" /><circle cx="548" cy="100" r="5" fill="var(--itc-neon)" />
            </svg>
          </div>
        </div>
      </div>
    </section>
  );
}
