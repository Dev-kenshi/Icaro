import { CosmosOverview } from './shared/CosmosOverview';
import './_group.css';

export function Floating() {
  return (
    <main className="stage" data-state="idle" data-scene-mode="all">
      <div className="cosmos-demo__brand">
        Ícaro · visão cósmica
        <small>CENAS LIVRES · ARRASTE PARA POSICIONAR</small>
      </div>
      <div className="cosmos-demo__center-glow" aria-hidden="true" />
      <CosmosOverview
        quality="medium"
        visible
        feeds={undefined}
        targetCity={false}
        state="idle"
        getAudioLevel={() => 0}
      />
    </main>
  );
}