import { ITCONT } from '../dados';
import InteligenciaEvento from './InteligenciaEvento';

export default function Faq() {
  return (
    <section className="itc-section" id="faq" aria-labelledby="itc-faq-title">
      <div className="itc-shell">
        <header className="itc-section-head">
          <h2 id="itc-faq-title"><span>06 · Dúvidas</span>Perguntas frequentes</h2>
        </header>
        <div className="itc-faq-list">
          {ITCONT.faq.map(({ p, r }, index) => <details className="itc-card" key={p} data-testid={`faq-item-${index}`}>
            <summary data-testid={`faq-question-${index}`}>{p}</summary>
            <p>{r}</p>
          </details>)}
        </div>
        <InteligenciaEvento />
      </div>
    </section>
  );
}
