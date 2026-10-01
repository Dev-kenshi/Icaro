import './future-scene.css';

/** Decorative, noninteractive star field: pitch black with drifting cyan-blue particles. */
export function FutureScene() {
  return (
    <div className="future-scene" aria-hidden="true">
      <div className="future-scene__stars future-scene__stars--far" />
      <div className="future-scene__stars future-scene__stars--near" />
      <div className="future-scene__glow" />
    </div>
  );
}
