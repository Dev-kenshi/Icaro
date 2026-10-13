import { useEffect, useState } from 'react';
import { ITCONT } from './dados';
import { layoutPara } from './logica';
import './tokens.css';
import './site.css';
import Navegacao from './secoes/Navegacao';
import Hero from './secoes/Hero';
import Contagem from './secoes/Contagem';
import Sobre from './secoes/Sobre';
import Programacao from './secoes/Programacao';
import Convidados from './secoes/Convidados';
import Local from './secoes/Local';
import Inscricao from './secoes/Inscricao';
import Faq from './secoes/Faq';
import Rodape from './secoes/Rodape';

export default function SiteItcont() {
  const [layout, setLayout] = useState(() => layoutPara(window.innerWidth, window.innerHeight));
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
    const title = document.title;
    const nodes = new Map<string, { node: HTMLMetaElement | null; content: string | null }>();
    const themeColor = getComputedStyle(document.querySelector('.itc') ?? document.documentElement).getPropertyValue('--itc-abismo').trim();
    const specs: Array<[string, string, string]> = [
      ['name', 'description', ITCONT.descricao],
      ['property', 'og:title', `${ITCONT.sigla} 2026 · ${ITCONT.titulo}`],
      ['property', 'og:description', ITCONT.resumo],
      ['property', 'og:image', ITCONT.banner],
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
        document.documentElement.style.setProperty('--itc-scroll', `${full > 0 ? window.scrollY / full * 100 : 0}%`);
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
      document.documentElement.style.removeProperty('--itc-scroll');
    };
  }, []);

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

  return (
    <div className="itc" data-layout={layout} data-testid="page-itcont">
      <div className="itc-main-site">
        <Navegacao />
        <main id="conteudo">
          <Hero />
          <Contagem />
          <Sobre />
          <Programacao />
          <Convidados />
          <Local />
          <Inscricao />
          <Faq />
        </main>
        <Rodape />
      </div>
    </div>
  );
}
