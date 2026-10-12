import { ITCONT } from '../dados';

export default function Faq() {
  return (
    <section className="itc-section" id="faq" aria-labelledby="itc-faq-title">
      <div className="itc-shell">
        <header className="itc-section-head">
          <h2 id="itc-faq-title"><span>Informação direta para planejar sua participação</span>Perguntas frequentes</h2>
        </header>
        <div className="itc-faq-list">
          {ITCONT.faq.map(({ p, r }, index) => <details className="itc-card" key={p} data-testid={`faq-item-${index}`}>
            <summary data-testid={`faq-question-${index}`}>{p}</summary>
            <p>{r}</p>
          </details>)}
        </div>
      </div>
    </section>
  );
}
