import { useEffect, useRef, useState } from 'react';
import { ITCONT } from '../dados';
import { iniciais } from '../logica';

function FotoConvidado({ foto, nome, onError, testId }: { foto: string; nome: string; onError: () => void; testId: string }) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [requested, setRequested] = useState(false);
  useEffect(() => {
    const image = imageRef.current;
    if (!image) return;
    if (!('IntersectionObserver' in window)) { setRequested(true); return; }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setRequested(true);
      observer.disconnect();
    }, { rootMargin: '500px 0px', threshold: 0 });
    observer.observe(image);
    return () => observer.disconnect();
  }, []);
  return <img ref={imageRef} className="itc-speaker-photo" src={requested ? foto : undefined} alt={nome} width={960} height={1200} loading="lazy" decoding="async" fetchPriority="low" referrerPolicy="no-referrer" onError={onError} data-testid={testId} />;
}

export default function Convidados() {
  const [failed, setFailed] = useState<string[]>([]);
  return (
    <section className="itc-section" id="convidados" aria-labelledby="itc-guests-title">
      <div className="itc-shell">
        <header className="itc-section-head">
          <h2 id="itc-guests-title"><span>03 · Convidados</span>Conhecimento em diálogo</h2>
          <p>As pessoas que participam desta imersão, conforme a página oficial do evento.</p>
        </header>
        <div className="itc-speakers">
          {ITCONT.convidados.map(({ nome, foto }) => (
            <article className="itc-speaker itc-card" key={nome} data-testid={`card-guest-${iniciais(nome).toLowerCase()}`}>
              <div className="itc-speaker-photo-frame">
                {failed.includes(nome)
                  ? <div className="itc-speaker-fallback" aria-label={`Iniciais de ${nome}`}>{iniciais(nome)}</div>
                  : <FotoConvidado foto={foto} nome={nome} onError={() => setFailed((current) => current.includes(nome) ? current : [...current, nome])} testId={`img-guest-${iniciais(nome).toLowerCase()}`} />}
                <span className="itc-speaker-name">{nome}</span>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
