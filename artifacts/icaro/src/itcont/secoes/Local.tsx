import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { CalendarPlus, MapPin } from 'lucide-react';
import { ITCONT } from '../dados';
import { gerarICS, mapaUrl } from '../logica';
import { MarcaIcone } from './MarcaIcone';

const MapaLocal = lazy(() => import('./MapaLocal'));

function adicionarAgenda() {
  const blob = new Blob([gerarICS()], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'itcont-2026.ics';
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Local() {
  const mapSlot = useRef<HTMLDivElement>(null);
  const [mapRequested, setMapRequested] = useState(false);
  useEffect(() => {
    const slot = mapSlot.current;
    if (!slot) return;
    if (!('IntersectionObserver' in window)) { setMapRequested(true); return; }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setMapRequested(true);
      observer.disconnect();
    }, { rootMargin: '180px 0px', threshold: 0 });
    observer.observe(slot);
    return () => observer.disconnect();
  }, []);
  return (
    <section className="itc-section" aria-labelledby="itc-place-title">
      <div className="itc-shell">
        <header className="itc-section-head">
          <h2 id="itc-place-title"><span>04 · Local</span>Encontro presencial na UEFS</h2>
        </header>
        <div className="itc-place-grid">
          <article className="itc-place-card itc-card">
            <header className="itc-place-title">
              <MapPin size={23} aria-hidden="true" />
              <h3>Local do evento</h3>
            </header>
            <p className="itc-place-address">Auditório III do Módulo IV · UEFS · Av. Transnordestina · Feira de Santana/BA</p>
            <div className="itc-place-actions">
              <a className="itc-primary" href={mapaUrl()} target="_blank" rel="noopener noreferrer" data-testid="link-open-map">
                <MarcaIcone marca="maps" /> Como chegar
              </a>
              <button type="button" className="itc-secondary" onClick={adicionarAgenda} data-testid="button-add-to-calendar">
                <CalendarPlus size={17} aria-hidden="true" /> Adicionar à agenda
              </button>
            </div>
          </article>
          <div ref={mapSlot} className="itc-map-slot">
            {mapRequested
              ? <Suspense fallback={<div className="itc-map" aria-label="Carregando mapa" />}>
                  <MapaLocal />
                </Suspense>
              : <div className="itc-map" role="img" aria-label="Mapa interativo carregará ao se aproximar da seção" />}
          </div>
        </div>
      </div>
    </section>
  );
}
