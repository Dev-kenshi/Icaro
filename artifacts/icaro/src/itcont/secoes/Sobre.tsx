import { Lightbulb, Waypoints, Wrench } from 'lucide-react';
import { ITCONT } from '../dados';
import { sessoesPorDia } from '../logica';

const iconList = [Lightbulb, Wrench, Waypoints];
const details = [
  'Ideias para compreender a transformação contábil.',
  'Tecnologia aplicada à rotina profissional.',
  'Universidade e mercado em diálogo.',
];

function MetricCount({ value, label, suffix = '' }: { value: number | string; label: string; suffix?: string }) {
  return <div className="itc-event-metric" data-testid={`event-metric-${label.toLowerCase().replace(/\s+/g, '-')}`}>
    <strong>{value}{typeof value === 'number' ? suffix : ''}</strong>
    <span>{label}</span>
  </div>;
}

export default function Sobre() {
  const free = ITCONT.categorias.length > 0 && ITCONT.categorias.every((category) => category.precoCentavos === 0);
  return (
    <section className="itc-section itc-about" id="sobre" aria-labelledby="itc-about-title">
      <div className="itc-shell">
        <div className="itc-about-layout">
          <header className="itc-about-intro">
            <span className="itc-section-kicker">01 · Sobre</span>
            {/* Manchete curta para esta apresentação; ITCONT.chamada segue preservada nos dados oficiais. */}
            <h2 id="itc-about-title">{ITCONT.missao}</h2>
            <p>{ITCONT.resumo}</p>
          </header>
          <div className="itc-pillar-grid">
            {ITCONT.slogan.map((item, index) => {
              const Icon = iconList[index];
              return <article className="itc-pillar itc-card" key={item} data-testid={`pillar-${index}`}>
                <span className="itc-pillar-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                <Icon size={34} strokeWidth={1.5} aria-hidden="true" />
                <h3>{item}</h3>
                <p>{details[index]}</p>
              </article>;
            })}
          </div>
        </div>
        <div className="itc-event-metrics" aria-label="Números do evento">
          <MetricCount value={sessoesPorDia().length} label="Noites" />
          <MetricCount value={ITCONT.sessoes.length} label="Sessões" />
          <MetricCount value={ITCONT.convidados.length} label="Convidados" />
          <MetricCount value={free ? 'Gratuita' : 'Consulte'} label="Inscrição" />
        </div>
      </div>
    </section>
  );
}
