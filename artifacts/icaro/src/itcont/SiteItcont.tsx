import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { ITCONT } from './dados';
import { layoutPara } from './logica';
import './tokens.css';
import './site.css';
import Navegacao from './secoes/Navegacao';
import Hero from './secoes/Hero';
import Sobre from './secoes/Sobre';
import Programacao from './secoes/Programacao';
import Convidados from './secoes/Convidados';
import Inscricao from './secoes/Inscricao';
import Faq from './secoes/Faq';
import Rodape from './secoes/Rodape';

const GloboTerraSite = lazy(() => import('@/components/stage/globo-terra').then(({ GloboTerra }) => ({ default: GloboTerra })));
const CosmosRendererSite = lazy(() => import('@/components/stage/cosmos/renderer').then(({ CosmosRenderer }) => ({ default: CosmosRenderer })));
const TerraFundoSite = lazy(() => import('./secoes/TerraFundo'));
const LocalSite = lazy(() => import('./secoes/Local'));
const silencio = () => 0;

function LocalSobDemanda() {
  const slot = useRef<HTMLDivElement>(null);
  const [requested, setRequested] = useState(false);
  useEffect(() => {
    const node = slot.current;
    if (!node) return;
    if (!('IntersectionObserver' in window)) { setRequested(true); return; }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setRequested(true);
      observer.disconnect();
    }, { rootMargin: '240px 0px', threshold: 0 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return (
    <div id="local" ref={slot} className="itc-local-deferred">
      {requested
        ? <Suspense fallback={<div className="itc-section itc-local-loading" aria-hidden="true" />}>
            <LocalSite />
          </Suspense>
        : <div className="itc-local-loading" aria-hidden="true" />}
    </div>
  );
}

export default function SiteItcont() {
  const siteRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState(() => layoutPara(window.innerWidth, window.innerHeight));
  const [reduzMovimento, setReduzMovimento] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [movimentoAtivado, setMovimentoAtivado] = useState(() => {
    try { return window.localStorage.getItem('itcont-motion-choice') === 'on'; } catch { return false; }
  });
  const [falhaGlobo, setFalhaGlobo] = useState(false);
  const [webglPronto, setWebglPronto] = useState(false);
  const [cosmosVisivel, setCosmosVisivel] = useState(false);
  const [cenaSolicitada, setCenaSolicitada] = useState(false);
  const [documentoVisivel, setDocumentoVisivel] = useState(() => !document.hidden);
  const [modoCosmos, setModoCosmos] = useState<'pending' | 'webgl' | 'static'>('pending');
  const [sceneIdle, setSceneIdle] = useState(false);
  useEffect(() => {
    siteRef.current?.setAttribute('data-css-ready', 'true');
  }, []);
  const ativarMovimento = () => {
    setMovimentoAtivado(true);
    try { window.localStorage.setItem('itcont-motion-choice', 'on'); } catch { /* storage pode estar indisponível */ }
  };
  useEffect(() => {
    let timer = 0;
    let idleHandle = 0;
    let active = true;
    const win = window as Window & { requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    const scheduleIdle = () => {
      if (!active) return;
      if (win.requestIdleCallback) idleHandle = win.requestIdleCallback(() => setSceneIdle(true), { timeout: 2500 });
      else timer = window.setTimeout(() => setSceneIdle(true), 1200);
    };
    if (document.readyState === 'complete') scheduleIdle();
    else window.addEventListener('load', scheduleIdle, { once: true });
    return () => {
      active = false;
      window.removeEventListener('load', scheduleIdle);
      window.clearTimeout(timer);
      if (idleHandle) win.cancelIdleCallback?.(idleHandle);
    };
  }, []);
  useEffect(() => {
    const root = siteRef.current;
    if (!root) return;
    const trackGlow = (event: PointerEvent) => {
      const button = (event.target as HTMLElement).closest<HTMLElement>('.itc-primary, .itc-secondary');
      if (!button || !root.contains(button)) return;
      const rect = button.getBoundingClientRect();
      button.style.setProperty('--itc-pointer-x', `${event.clientX - rect.left}px`);
      button.style.setProperty('--itc-pointer-y', `${event.clientY - rect.top}px`);
    };
    root.addEventListener('pointermove', trackGlow);
    return () => root.removeEventListener('pointermove', trackGlow);
  }, []);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduzMovimento(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (!sceneIdle) return;
    if (layout === 'celular' || layout === 'celular-deitado') {
      setWebglPronto(true);
      setModoCosmos('static');
      return;
    }
    const canvas = document.createElement('canvas');
    let gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
    try {
      gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    } catch { /* céu CSS continua disponível sem WebGL */ }
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    setWebglPronto(Boolean(gl));
    setModoCosmos(gl ? 'pending' : 'static');
  }, [sceneIdle, layout]);
  useEffect(() => {
    const earth = document.getElementById('itc-page-earth');
    const hero = siteRef.current?.querySelector<HTMLElement>('#inicio');
    if (earth && hero && earth.parentElement !== hero) {
      earth.classList.add('itc-earth-still');
      const content = hero.querySelector('.itc-intro-content');
      if (content) hero.insertBefore(earth, content);
      else hero.prepend(earth);
    }
    earth?.setAttribute('data-live', modoCosmos === 'webgl' && !falhaGlobo ? 'true' : 'false');
  }, [modoCosmos, falhaGlobo]);
  useEffect(() => {
    const hero = siteRef.current?.querySelector<HTMLElement>('#inicio');
    if (!hero) return;
    if (!('IntersectionObserver' in window)) {
      setCosmosVisivel(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      setCosmosVisivel(entry.isIntersecting);
    }, { rootMargin: '120px 0px', threshold: 0 });
    observer.observe(hero);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (sceneIdle && cosmosVisivel) setCenaSolicitada(true);
  }, [sceneIdle, cosmosVisivel]);
  useEffect(() => {
    const update = () => setDocumentoVisivel(!document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  useEffect(() => {
    let timer = 0;
    const update = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        setLayout(layoutPara(window.innerWidth, window.innerHeight));
      }, 120);
    };
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    update();
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  useEffect(() => {
    const revealNodes = Array.from(document.querySelectorAll<HTMLElement>('.itc-section-head, .itc-card, .itc-night-heading, .itc-intelligence'));
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
      revealNodes.forEach((node) => node.classList.add('itc-revealed'));
      return;
    }
    revealNodes.forEach((node) => node.classList.add('itc-reveal'));
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('itc-revealed');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -5% 0px' });
    revealNodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!window.location.hash) return;
    const id = decodeURIComponent(window.location.hash.slice(1));
    const timer = window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'auto', block: 'start' }), 80);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const title = document.title;
    const nodes = new Map<string, { node: HTMLMetaElement | null; content: string | null }>();
    const themeColor = getComputedStyle(document.querySelector('.itc') ?? document.documentElement).getPropertyValue('--itc-fundo').trim();
    const ogImage = document.head.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content || ITCONT.banner;
    const specs: Array<[string, string, string]> = [
      ['name', 'description', ITCONT.descricao],
      ['property', 'og:title', `${ITCONT.sigla} 2026 · ${ITCONT.titulo}`],
      ['property', 'og:description', ITCONT.resumo],
      ['property', 'og:image', ogImage],
      ['name', 'theme-color', themeColor],
    ];
    specs.forEach(([key, value, content]) => {
      const selector = `meta[${key}="${value}"]`;
      const node = document.head.querySelector<HTMLMetaElement>(selector);
      nodes.set(selector, { node, content: node?.getAttribute('content') ?? null });
      const target = node ?? document.createElement('meta');
      target.setAttribute(key, value);
      target.setAttribute('content', content);
      if (!node) document.head.appendChild(target);
    });
    document.title = `${ITCONT.sigla} 2026 · ${ITCONT.titulo}`;
    return () => {
      document.title = title;
      nodes.forEach(({ node, content }, selector) => {
        const current = document.head.querySelector<HTMLMetaElement>(selector);
        if (!node) current?.remove();
        else if (content !== null) node.setAttribute('content', content);
        else node.removeAttribute('content');
      });
    };
  }, []);

  useEffect(() => {
    const keySequence: string[] = [];
    let resetTimer = 0;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;
      keySequence.push(event.key.toLowerCase());
      window.clearTimeout(resetTimer);
      if (keySequence.slice(-2).join('') === 'gp') document.getElementById('programacao')?.scrollIntoView({ behavior: 'smooth' });
      if (keySequence.slice(-2).join('') === 'gi') document.getElementById('inscricao')?.scrollIntoView({ behavior: 'smooth' });
      if (keySequence.length > 2) keySequence.shift();
      resetTimer = window.setTimeout(() => { keySequence.length = 0; }, 900);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(resetTimer);
    };
  }, []);

  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const full = document.documentElement.scrollHeight - window.innerHeight;
        const progress = full > 0 ? Math.round(window.scrollY / full * 100) : 0;
        const earthLayers = siteRef.current?.querySelectorAll<HTMLElement>(
          '#inicio > .itc-earth-backdrop, #inicio > #itc-page-earth',
        );
        const hero = siteRef.current?.querySelector<HTMLElement>('#inicio');
        const away = hero ? Math.max(0, -hero.getBoundingClientRect().top) : 0;
        const fade = Math.max(0, Math.min(1, away / Math.max(1, window.innerHeight * .82)));
        document.documentElement.style.setProperty('--itc-scroll', `${progress}%`);
        document.documentElement.style.setProperty('--itc-cosmos-parallax', reduzMovimento && !movimentoAtivado ? '0px' : `${Math.min(window.scrollY * .055, 110)}px`);
        document.documentElement.style.setProperty('--itc-earth-parallax', reduzMovimento && !movimentoAtivado ? '0px' : `${Math.min(window.scrollY * .085, 150)}px`);
        earthLayers?.forEach((earth) => {
          earth.style.setProperty('--itc-earth-opacity', String(1 - fade));
          earth.style.setProperty('--itc-earth-scale', String(1 - fade * .16));
        });
        const indicator = document.querySelector<HTMLElement>('.itc-topline');
        indicator?.setAttribute('aria-valuenow', String(progress));
        indicator?.setAttribute('aria-valuetext', `${progress}% da página percorrida`);
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    onScroll();
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
      document.documentElement.style.removeProperty('--itc-scroll');
      document.documentElement.style.removeProperty('--itc-cosmos-parallax');
      document.documentElement.style.removeProperty('--itc-earth-parallax');
    };
  }, [layout, reduzMovimento, movimentoAtivado]);

  useEffect(() => {
    const pointer = (event: PointerEvent) => {
      if (layout !== 'desktop' || event.pointerType !== 'mouse') return;
      const card = (event.target as HTMLElement | null)?.closest<HTMLElement>('.itc-card');
      if (!card) return;
      const rect = card.getBoundingClientRect();
      card.style.setProperty('--itc-tilt-x', `${((event.clientX - rect.left) / rect.width - .5) * 8}deg`);
      card.style.setProperty('--itc-tilt-y', `${(.5 - (event.clientY - rect.top) / rect.height) * 8}deg`);
    };
    const reset = (event: PointerEvent) => {
      const card = (event.target as HTMLElement | null)?.closest<HTMLElement>('.itc-card');
      card?.style.removeProperty('--itc-tilt-x');
      card?.style.removeProperty('--itc-tilt-y');
    };
    window.addEventListener('pointermove', pointer);
    window.addEventListener('pointerout', reset);
    return () => {
      window.removeEventListener('pointermove', pointer);
      window.removeEventListener('pointerout', reset);
    };
  }, [layout]);

  const earthBackdrop = cosmosVisivel && layout !== 'celular'
    ? modoCosmos === 'webgl' && !falhaGlobo
      ? <>
        <div
          className="itc-earth-backdrop itc-earth-globo"
          aria-hidden="true"
          data-testid="background-earth"
          data-motion={reduzMovimento && !movimentoAtivado ? 'paused' : 'on'}
          inert={true}
        >
          <Suspense fallback={null}>
            <GloboTerraSite
              reduzido={reduzMovimento && !movimentoAtivado}
              ocultarControles
              giroContinuo
              decorativo
              onOnde={() => undefined}
              onFalha={() => setFalhaGlobo(true)}
            />
          </Suspense>
        </div>
        <span className="itc-earth-credit">Imagens: Esri, Maxar, Earthstar Geographics · Rótulos: Esri</span>
      </>
      : <Suspense fallback={null}><TerraFundoSite /></Suspense>
    : null;
  const cosmicBackdrop = cenaSolicitada ? (
    <>
      <div className="itc-cosmos-backdrop" aria-hidden="true" data-testid="background-cosmos">
        {webglPronto && !falhaGlobo && <Suspense fallback={null}>
          <CosmosRendererSite
            scene="system"
            quality={layout === 'celular' || layout === 'celular-deitado' ? 'low' : 'medium'}
            visible={cosmosVisivel && documentoVisivel}
            transparentBackground
            motion={movimentoAtivado ? 'on' : 'system'}
            onEnableMotion={ativarMovimento}
            decorativo
            state="idle"
            getAudioLevel={silencio}
            keyboardShortcuts={false}
            onRenderMode={setModoCosmos}
            decorativeComposition="itcont-hero"
            forceStatic={layout === 'celular' || layout === 'celular-deitado'}
          />
        </Suspense>}
      </div>
      {cosmosVisivel && modoCosmos === 'static' && !webglPronto && <div className="itc-solar-fallback" aria-hidden="true" data-testid="background-solar-fallback">
        <span className="itc-solar-sun" />
        {[0, 1, 2, 3].map((orbit) => <div className={`itc-solar-orbit itc-solar-orbit-${orbit + 1}`} key={orbit}><span /></div>)}
      </div>}
    </>
  ) : null;

  return (
    <div
      ref={siteRef}
      className="itc"
      data-layout={layout}
      data-motion-enabled={movimentoAtivado ? 'true' : 'false'}
      data-css-ready="false"
      data-testid="page-itcont"
    >
      {(!webglPronto || modoCosmos === 'static' || falhaGlobo) && <div className="itc-sky-stars" aria-hidden="true" data-testid="background-sky-stars" />}
      <div className="itc-main-site">
        <Navegacao />
        <main id="conteudo">
          <Hero motionPrompt={reduzMovimento && !movimentoAtivado} onEnableMotion={ativarMovimento} earthBackdrop={earthBackdrop} cosmosBackdrop={cosmicBackdrop} />
          <Sobre />
          <Programacao />
          <Convidados />
          <LocalSobDemanda />
          <Inscricao />
          <Faq />
        </main>
        <Rodape />
      </div>
    </div>
  );
}
