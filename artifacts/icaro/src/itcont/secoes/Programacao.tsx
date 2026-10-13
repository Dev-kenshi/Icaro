import { useEffect, useState, type CSSProperties } from 'react';
import { Download, ExternalLink } from 'lucide-react';
import { ITCONT, type Sessao } from '../dados';
import { dataExtenso, duracaoMin, faseDoEvento, fimSessao, gerarICS, googleAgendaUrl, horaCurta, inicioSessao, sessoesPorDia } from '../logica';
import { MarcaIcone } from './MarcaIcone';

function downloadICS(sessoes: Sessao[], file = 'itcont-agenda.ics') {
  const blob = new Blob([gerarICS(sessoes)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export default function Programacao() {
  const days = sessoesPorDia();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timer = 0;
    const stop = () => {
      window.clearInterval(timer);
      timer = 0;
    };
    const refresh = () => {
      setNow(new Date());
      stop();
      if (!document.hidden) timer = window.setInterval(() => setNow(new Date()), 30_000);
    };
    const visibility = () => document.hidden ? stop() : refresh();
    refresh();
    document.addEventListener('visibilitychange', visibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);

  const phase = faseDoEvento(now);
  return (
    <section className="itc-section" id="programacao" aria-labelledby="itc-program-title">
      <div className="itc-shell">
        <header className="itc-section-head">
          <h2 id="itc-program-title"><span>02 · Programação</span>Encontros para aprender e conversar</h2>
          <p>Uma programação presencial em duas noites. Cada horário segue o horário de Brasília.</p>
        </header>
        <div className="itc-agenda-board">
          {days.map((day, index) => {
            const start = inicioSessao(day.sessoes[0]).getTime();
            const end = fimSessao(day.sessoes[day.sessoes.length - 1]).getTime();
            const duration = Math.max(1, end - start);
            const progress = Math.round(Math.max(0, Math.min(1, (now.getTime() - start) / duration)) * 100);
            const isLiveNight = phase.fase === 'ao-vivo' && day.sessoes.some((session) => session.id === phase.atual.id);
            return <section className="itc-night" key={day.data} aria-labelledby={`day-heading-${index}`} data-testid={`agenda-night-${index}`}>
              <h3 className="itc-night-heading" id={`day-heading-${index}`}>{day.rotulo}</h3>
              <div className="itc-timeline" data-live={isLiveNight} data-progress={progress} style={{ '--itc-progress': `${progress}%` } as CSSProperties} aria-label={`Linha do tempo: ${day.rotulo}`}>
                {day.sessoes.map((session) => {
                  const live = phase.fase === 'ao-vivo' && phase.atual.id === session.id;
                  const complete = now.getTime() >= fimSessao(session).getTime();
                  return <article className="itc-session itc-card" key={session.id} data-live={live} data-complete={complete} data-testid={`session-${session.id}`}>
                    <div className="itc-session-time" aria-label={`${horaCurta(session.inicio)} até ${horaCurta(session.fim)}`}>
                      <strong>{horaCurta(session.inicio)}</strong><span aria-hidden="true">a</span><strong>{horaCurta(session.fim)}</strong>
                    </div>
                    <div className="itc-session-copy">
                      <div className="itc-session-meta">
                        <span className="itc-session-type">{session.tipo === 'palestra' ? 'Palestra' : 'Bate-papo'}</span>
                        <span>{duracaoMin(session)} min</span>
                        {live && <span className="itc-live-label" role="status">Acontecendo agora</span>}
                      </div>
                      <h4>{session.titulo}</h4>
                      <p>{dataExtenso(session.data)} · {ITCONT.local.nome}</p>
                    </div>
                    <div className="itc-session-actions">
                      <a className="itc-secondary" href={googleAgendaUrl(session)} target="_blank" rel="noopener noreferrer" data-testid={`link-google-agenda-${session.id}`}>
                        <MarcaIcone marca="calendar" /> Google Agenda
                      </a>
                      <button type="button" className="itc-secondary" onClick={() => downloadICS([session], `${session.id}.ics`)} data-testid={`button-download-ics-${session.id}`}>
                        <Download size={15} aria-hidden="true" /> Baixar .ics
                      </button>
                    </div>
                  </article>;
                })}
              </div>
            </section>;
          })}
        </div>
        <button type="button" className="itc-primary itc-all-ics" onClick={() => downloadICS([...ITCONT.sessoes])} data-testid="button-download-full-ics">
          <Download size={16} aria-hidden="true" /> Adicionar o evento inteiro <ExternalLink size={14} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
