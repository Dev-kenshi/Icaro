import { useState } from 'react';
import { ITCONT } from '../dados';
import { iniciais } from '../logica';

export default function Convidados() {
  const [failed, setFailed] = useState<string[]>([]);
  return (
    <section className="itc-section" id="convidados" aria-labelledby="itc-guests-title">
      <div className="itc-shell">
        <header className="itc-section-head">
          <h2 id="itc-guests-title"><span>Conhecimento em diálogo</span>Convidados</h2>
          <p>As pessoas que participam desta imersão, conforme a página oficial do evento.</p>
        </header>
        <div className="itc-speakers">
          {ITCONT.convidados.map(({ nome, foto }) => (
            <article className="itc-speaker itc-card" key={nome} data-testid={`card-guest-${iniciais(nome).toLowerCase()}`}>
              {failed.includes(nome)
                ? <div className="itc-speaker-fallback" aria-label={`Iniciais de ${nome}`}>{iniciais(nome)}</div>
                : <img className="itc-speaker-photo" src={foto} alt={nome} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed((current) => current.includes(nome) ? current : [...current, nome])} data-testid={`img-guest-${iniciais(nome).toLowerCase()}`} />}
              <span className="itc-speaker-name">{nome}</span>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
