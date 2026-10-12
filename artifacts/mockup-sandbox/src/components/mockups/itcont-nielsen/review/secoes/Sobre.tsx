import { Lightbulb, Wrench, Waypoints } from 'lucide-react';
import { ITCONT } from '../dados';

const iconList = [Lightbulb, Wrench, Waypoints];
const details = [
  'Novas ferramentas e ideias para compreender as mudanças na atuação contábil.',
  'Aprendizado aplicado, com conversas que aproximam tecnologia e rotina profissional.',
  'Encontro entre universidade, estudantes e mercado para trocar perspectivas.',
];

export default function Sobre() {
  return (
    <section className="itc-section" id="sobre" aria-labelledby="itc-about-title">
      <div className="itc-shell">
        <header className="itc-section-head">
          <h2 id="itc-about-title"><span>Uma profissão em transformação</span>{ITCONT.chamada}</h2>
          <p>{ITCONT.descricao}</p>
          <p>{ITCONT.fechamento}</p>
        </header>
        <div className="itc-pillar-grid">
          {ITCONT.slogan.map((item, index) => {
            const Icon = iconList[index];
            return <article className="itc-pillar itc-card" key={item} data-testid={`pillar-${index}`}>
              <Icon size={25} aria-hidden="true" />
              <h3>{item}</h3>
              <p>{details[index]}</p>
            </article>;
          })}
        </div>
      </div>
    </section>
  );
}
