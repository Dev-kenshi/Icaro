import { useState } from 'react';
import { CalendarPlus, Download, ExternalLink } from 'lucide-react';
import { ITCONT, type Sessao } from '../dados';
import { dataExtenso, duracaoMin, faseDoEvento, gerarICS, googleAgendaUrl, horaCurta, sessoesPorDia } from '../logica';

function downloadICS(sessoes: Sessao[], file = 'itcont-agenda.ics') {
  const blob = new Blob([gerarICS(sessoes)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function Programacao() {
  const days = sessoesPorDia();
  const [dayIndex, setDayIndex] = useState(0);
  const phase = faseDoEvento(new Date());
  return (
    <section className="itc-section" id="programacao" aria-labelledby="itc-program-title">
      <div className="itc-shell">
        <header className="itc-section-head">
          <h2 id="itc-program-title"><span>Encontros para aprender e conversar</span>Programação</h2>
          <p>Uma programação presencial em duas noites. Cada horário segue o horário de Brasília.</p>
        </header>
        <div className="itc-days" role="tablist" aria-label="Noites da programação">
          {days.map((day, index) => <button type="button" key={day.data} id={`day-tab-${index}`} className="itc-day-tab" role="tab" tabIndex={dayIndex === index ? 0 : -1} aria-selected={dayIndex === index} aria-controls={`day-panel-${index}`} onClick={() => setDayIndex(index)} onKeyDown={(event) => {
            const next = event.key === 'ArrowRight' ? (index + 1) % days.length
              : event.key === 'ArrowLeft' ? (index - 1 + days.length) % days.length
                : event.key === 'Home' ? 0 : event.key === 'End' ? days.length - 1 : -1;
            if (next >= 0) {
              event.preventDefault();
              setDayIndex(next);
              document.getElementById(`day-tab-${next}`)?.focus();
            }
          }} data-testid={`button-agenda-day-${index}`}>
            {day.rotulo.split(' · ')[0]}
          </button>)}
        </div>
        <div className="itc-agenda-board">
          {days.map((day, index) => <section className="itc-night" key={day.data} id={`day-panel-${index}`} role="tabpanel" aria-labelledby={`day-heading-${index}`} data-selected={dayIndex === index}>
            <h3 className="itc-night-heading" id={`day-heading-${index}`}>{day.rotulo}</h3>
            <div className="itc-timeline">
              {day.sessoes.map((session) => {
                const live = phase.fase === 'ao-vivo' && phase.atual.id === session.id;
                return <article className="itc-session itc-card" key={session.id} data-live={live} data-testid={`session-${session.id}`}>
                  <div className="itc-session-time">{horaCurta(session.inicio)} — {horaCurta(session.fim)}</div>
                  <div>
                    <span className="itc-eyebrow">{session.tipo === 'palestra' ? 'Palestra' : 'Bate-papo'} · {duracaoMin(session)} min{live ? ' · Acontecendo agora' : ''}</span>
                    <h3>{session.titulo}</h3>
                    <p>{dataExtenso(session.data)} · {ITCONT.local.nome}</p>
                  </div>
                  <div className="itc-session-actions">
                    <a className="itc-secondary" href={googleAgendaUrl(session)} target="_blank" rel="noopener noreferrer" data-testid={`link-google-agenda-${session.id}`}>
                      <CalendarPlus size={15} aria-hidden="true" /> Google Agenda
                    </a>
                    <button type="button" className="itc-secondary" onClick={() => downloadICS([session], `${session.id}.ics`)} data-testid={`button-download-ics-${session.id}`}>
                      <Download size={15} aria-hidden="true" /> Baixar .ics
                    </button>
                  </div>
                </article>;
              })}
            </div>
          </section>)}
        </div>
        <button type="button" className="itc-primary itc-all-ics" onClick={() => downloadICS([...ITCONT.sessoes])} data-testid="button-download-full-ics">
          <Download size={16} aria-hidden="true" /> Adicionar o evento inteiro <ExternalLink size={14} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
