import { useEffect, useState } from 'react';
import { faseDoEvento, contagem, dataExtenso, horaCurta } from '../logica';
import { ITCONT } from '../dados';

export default function Contagem() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let interval = 0;
    const run = () => {
      window.clearInterval(interval);
      if (!document.hidden) {
        setNow(new Date());
        interval = window.setInterval(() => setNow(new Date()), 1000);
      }
    };
    const visibility = () => run();
    run();
    document.addEventListener('visibilitychange', visibility);
    return () => { window.clearInterval(interval); document.removeEventListener('visibilitychange', visibility); };
  }, []);
  const count = contagem(now);
  const phase = faseDoEvento(now);
  const status = phase.fase === 'antes'
    ? `Faltam ${count.dias} ${count.dias === 1 ? 'dia' : 'dias'}`
    : phase.fase === 'ao-vivo'
      ? `AO VIVO: ${phase.atual.titulo}`
      : phase.fase === 'intervalo'
        ? `Próxima: ${phase.proxima.titulo} · ${dataExtenso(phase.proxima.data)} às ${horaCurta(phase.proxima.inicio)}`
        : 'Obrigado! Até a próxima edição.';
  const values = [
    [count.dias, 'dias'], [count.horas, 'horas'], [count.minutos, 'minutos'], [count.segundos, 'segundos'],
  ];
  return (
    <section className="itc-section" aria-label="Status do evento">
      <div className="itc-shell">
        <div className="itc-counter itc-card">
          <div>
            <div className="itc-eyebrow">O tempo até a próxima sessão</div>
            <div className="itc-count-grid" aria-label={`${count.dias} dias, ${count.horas} horas, ${count.minutos} minutos`}>
              {values.map(([number, label]) => (
                <div className="itc-count-cell" key={label} data-testid={`count-${label}`}>
                  <strong>{String(number).padStart(2, '0')}</strong><span>{label}</span>
                </div>
              ))}
            </div>
            <span className="sr-only" aria-live="polite">{now.getSeconds() === 0 ? `${count.dias} dias, ${count.horas} horas e ${count.minutos} minutos para ${ITCONT.sigla}` : ''}</span>
          </div>
          <div className="itc-status" data-live={phase.fase === 'ao-vivo'} data-done={phase.fase === 'encerrado'} role="status" data-testid="status-event-phase">
            <span className="itc-eyebrow">Status do evento</span>
            <strong>{status}</strong>
          </div>
        </div>
      </div>
    </section>
  );
}
