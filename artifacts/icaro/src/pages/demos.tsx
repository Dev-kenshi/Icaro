import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { ArrowLeft, ArrowRight, Pause, Play, Presentation, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DEMO_TOURS, tourById, type DemoTour } from '@/lib/demo-tours';
import { useLang } from '@/lib/i18n';

const SPEED_MS = 9000;

export default function Demos() {
  const { t } = useLang();
  const [, navigate] = useLocation();
  const [tour, setTour] = useState<DemoTour | null>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const timer = useRef<number | null>(null);

  const clearTimer = () => { if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null; } };
  const close = useCallback(() => { clearTimer(); setTour(null); setIndex(0); setPaused(false); }, []);
  const goTo = useCallback((next: number) => {
    setTour((current) => {
      if (!current) return current;
      if (next >= current.steps.length) { window.setTimeout(close, 0); return current; }
      setIndex(Math.max(0, next));
      return current;
    });
  }, [close]);
  const open = useCallback((id: string) => {
    const found = tourById(id);
    if (!found) return;
    clearTimer(); setTour(found); setIndex(0); setPaused(false);
  }, []);

  // Voice commands arrive from the stage via a DOM event ("Ícaro, mostre o Discipulus" etc.).
  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<{ tour?: string; action?: string }>).detail;
      if (detail.tour) open(detail.tour);
      else if (detail.action === 'next') goTo(index + 1);
      else if (detail.action === 'previous') goTo(index - 1);
      else if (detail.action === 'pause') setPaused(true);
      else if (detail.action === 'resume') setPaused(false);
      else if (detail.action === 'close') close();
    };
    window.addEventListener('icaro:tour', listener);
    return () => window.removeEventListener('icaro:tour', listener);
  }, [open, goTo, close, index]);

  useEffect(() => {
    clearTimer();
    if (!tour || paused) return;
    timer.current = window.setTimeout(() => goTo(index + 1), SPEED_MS);
    return clearTimer;
  }, [tour, index, paused, goTo]);

  const step = tour?.steps[index];

  return (
    <section className="mx-auto max-w-4xl space-y-6" aria-labelledby="demos-title">
      <header>
        <p className="text-xs font-mono-data uppercase tracking-[.16em] text-secondary">{t('demosKicker')}</p>
        <h1 id="demos-title" className="mt-2 font-display text-3xl font-semibold">{t('demosTitle')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Diga “Ícaro, mostre o Discipulus” ou “Ícaro, mostre o LabEduContábil”. Durante o tour: próximo, volte, pausa, continue, feche o sistema.</p>
      </header>
      <div className="grid gap-4 sm:grid-cols-2">
        {DEMO_TOURS.map((item) => (
          <button key={item.id} type="button" onClick={() => open(item.id)} className="rounded-2xl border bg-card p-5 text-left transition hover:border-secondary" data-testid={`open-tour-${item.id}`}>
            <Presentation size={20} className="text-secondary" />
            <h2 className="mt-3 font-display text-xl font-semibold">{item.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{item.tagline}</p>
            <p className="mt-3 text-xs text-muted-foreground">{item.steps.length} etapas</p>
          </button>
        ))}
      </div>
      {tour && step && (
        <div role="dialog" aria-modal="true" aria-label={`${tour.name} — etapa ${index + 1} de ${tour.steps.length}`} className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4 backdrop-blur-sm">
          <article className="w-full max-w-2xl rounded-2xl border bg-card p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-xs font-mono-data uppercase tracking-[.16em] text-secondary">{tour.name} · {index + 1}/{tour.steps.length}</p><h2 className="mt-2 font-display text-2xl font-semibold">{step.title}</h2></div>
              <Button type="button" variant="ghost" size="icon" aria-label={t('close')} onClick={close}><X size={18} /></Button>
            </div>
            <p className="mt-4 leading-relaxed text-muted-foreground">{step.body}</p>
            <div className="mt-4 h-1 overflow-hidden rounded-full bg-muted"><div className="h-full bg-secondary transition-all" style={{ width: `${((index + 1) / tour.steps.length) * 100}%` }} /></div>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" onClick={() => goTo(index - 1)} disabled={index === 0}><ArrowLeft size={16} className="mr-2" />{t('previous')}</Button>
              <Button type="button" variant="outline" onClick={() => setPaused((p) => !p)}>{paused ? <Play size={16} className="mr-2" /> : <Pause size={16} className="mr-2" />}{paused ? t('resume') : t('pause')}</Button>
              <Button type="button" onClick={() => goTo(index + 1)}>{index + 1 === tour.steps.length ? t('close') : t('next')}<ArrowRight size={16} className="ml-2" /></Button>
            </div>
          </article>
        </div>
      )}
    </section>
  );
}
