import { CosmosRenderer, type CosmosScene } from './shared/CosmosRenderer';
import './_group.css';

const PANELS: { scene: CosmosScene; label: string }[] = [
  { scene: 'galaxy', label: 'Galáxia' },
  { scene: 'system', label: 'Sistema Solar' },
  { scene: 'earth', label: 'Terra ao vivo' },
];

export function Current() {
  return (
    <main className="stage" data-state="idle" data-scene-mode="all">
      <div className="cosmos-demo__brand">
        Ícaro · visão cósmica
        <small>APRESENTAÇÃO ATUAL · TRÊS QUADROS</small>
      </div>
      <div className="cosmos-demo__center-glow" aria-hidden="true" />
      <div className="cosmos-overview cosmos-overview--current" role="group" aria-label="Terra, Galáxia e Sistema Solar" data-testid="cosmos-overview">
        {PANELS.map(({ scene, label }) => (
          <section
            key={scene}
            className="cosmos-panel cosmos-panel--current"
            aria-label={`Painel ${label}`}
            data-testid={`panel-scene-${scene}`}
          >
            <span className="cosmos-panel__label" data-testid={`label-scene-${scene}`}>{label}</span>
            <CosmosRenderer
              scene={scene}
              quality="medium"
              visible
              targetCity={false}
              state="idle"
              getAudioLevel={() => 0}
              navigationLabel={`Controles de ${label}`}
            />
          </section>
        ))}
      </div>
    </main>
  );
}