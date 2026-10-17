import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = resolve(root, 'generated-artifacts/audit');
const widths = [320, 360, 390, 414, 430, 768, 840, 1024, 1280, 1366, 1440, 1568, 1920];
const selectedWidths = process.env.ITCONT_AUDIT_WIDTHS
  ? process.env.ITCONT_AUDIT_WIDTHS.split(',').map(Number).filter((value) => widths.includes(value))
  : widths;
const heights: Record<number, number> = {
  320: 800, 360: 800, 390: 844, 414: 896, 430: 932, 768: 1024, 840: 900,
  1024: 900, 1280: 900, 1366: 900, 1440: 900, 1568: 736, 1920: 1080,
};
const port = Number(process.env.ITCONT_AUDIT_PORT ?? 4173);
const baseUrl = `http://127.0.0.1:${port}`;
const preview = spawn('pnpm', ['--filter', '@workspace/icaro', 'run', 'serve'], {
  cwd: root,
  env: { ...process.env, PORT: String(port), BASE_PATH: '/' },
  detached: true,
  stdio: 'ignore',
});

function stopPreview() {
  if (!preview.pid) return;
  try { process.kill(-preview.pid, 'SIGTERM'); }
  catch { preview.kill('SIGTERM'); }
}

async function waitForPreview() {
  const until = Date.now() + 45_000;
  while (Date.now() < until) {
    if (preview.exitCode !== null) throw new Error(`Production preview exited with code ${preview.exitCode}`);
    try {
      const response = await fetch(`${baseUrl}/itcont`);
      if (response.ok) return;
    } catch { /* preview ainda iniciando */ }
    await new Promise((resolveWait) => setTimeout(resolveWait, 400));
  }
  throw new Error(`Production preview did not respond at ${baseUrl}/itcont`);
}

type Finding = { check: string; detail: string };
type CaseResult = { width: number; height: number; reducedMotion: boolean; location?: string; findings: Finding[] };

const inspectPage = () => {
  const issues: Finding[] = [];
  const add = (check: string, detail: string) => issues.push({ check, detail });
  const width = window.innerWidth;
  const root = document.documentElement;
  const body = document.body;
  if (Math.max(root.scrollWidth, body.scrollWidth) > width + 1) {
    add('horizontal-overflow', `scrollWidth ${Math.max(root.scrollWidth, body.scrollWidth)}px > viewport ${width}px`);
  }
  const logo = document.querySelector<HTMLImageElement>('.itc-ribbon-logo');
  if (!logo) add('hero-logo-missing', 'logo do ITCONT não foi renderizada');
  else {
    const renderedWidth = logo.getBoundingClientRect().width;
    if (logo.naturalWidth < renderedWidth * 3) {
      add('hero-logo-source-density', `imagem ${logo.naturalWidth}px para ${renderedWidth.toFixed(1)}px renderizados; exige ao menos 3x`);
    }
  }
  const isVisible = (element: Element) => {
    if (element.closest('[aria-hidden="true"], .sr-only')) return false;
    for (let node: Element | null = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) < .03 || style.contentVisibility === 'hidden') return false;
    }
    return true;
  };
  const textRects: Array<{ text: string; left: number; right: number; top: number; bottom: number; parent: Element }> = [];
  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const text = node.textContent?.trim();
    const parent = node.parentElement;
    if (!text || !parent || !isVisible(parent)) continue;
    const fontSize = Number.parseFloat(getComputedStyle(parent).fontSize);
    if (fontSize < 12) add('text-below-12px', `${JSON.stringify(text.slice(0, 50))} at ${fontSize.toFixed(1)}px (${parent.tagName.toLowerCase()}.${String((parent as HTMLElement).className).slice(0, 60)})`);
    const range = document.createRange();
    range.selectNodeContents(node);
    for (const rect of Array.from(range.getClientRects())) {
      if (rect.width <= 0 || rect.height <= 0) continue;
      let horizontalScroller: Element | null = null;
      for (let ancestor: Element | null = parent; ancestor; ancestor = ancestor.parentElement) {
        const overflowX = getComputedStyle(ancestor).overflowX;
        if (['auto', 'scroll'].includes(overflowX) && (ancestor as HTMLElement).scrollWidth > (ancestor as HTMLElement).clientWidth + 1) {
          horizontalScroller = ancestor;
          break;
        }
      }
      let left = rect.left;
      let right = rect.right;
      if (horizontalScroller) {
        const clip = horizontalScroller.getBoundingClientRect();
        left = Math.max(left, clip.left);
        right = Math.min(right, clip.right);
      }
      if (right <= left) continue;
      textRects.push({ text, left, right, top: rect.top, bottom: rect.bottom, parent });
      if (!horizontalScroller && (rect.left < -1 || rect.right > width + 1)) {
        add('text-outside-viewport', `${JSON.stringify(text.slice(0, 50))} (${parent.tagName.toLowerCase()}.${String((parent as HTMLElement).className).slice(0, 60)}): x=${rect.left.toFixed(1)}..${rect.right.toFixed(1)}px`);
      }
    }
  }
  const hero = document.querySelector<HTMLElement>('#inicio');
  const intro = hero?.querySelector<HTMLElement>('.itc-intro-content');
  const counter = hero?.querySelector<HTMLElement>(':scope > .itc-section');
  const overlaps = (a: DOMRect, b: DOMRect) => a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1;
  if (intro && counter && overlaps(intro.getBoundingClientRect(), counter.getBoundingClientRect())) add('hero-content-overlap', 'intro content intersects the countdown block');
  const motionButton = hero?.querySelector<HTMLElement>('[data-testid="button-enable-motion"]');
  if (motionButton && isVisible(motionButton)) {
    const label = motionButton.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    if (!label.includes('Ativar movimento') || motionButton.scrollWidth > motionButton.clientWidth + 1) {
      add('motion-button-label', `motion control label is clipped or incomplete: ${JSON.stringify(label)}`);
    }
    const buttonBox = motionButton.getBoundingClientRect();
    const clearance = (box: DOMRect) => {
      const dx = Math.max(0, box.left - buttonBox.right, buttonBox.left - box.right);
      const dy = Math.max(0, box.top - buttonBox.bottom, buttonBox.top - box.bottom);
      return Math.hypot(dx, dy);
    };
    const otherHeroContent = [intro, counter].filter((node): node is HTMLElement => !!node && isVisible(node));
    for (const other of otherHeroContent) {
      if (clearance(other.getBoundingClientRect()) < 24) {
        add('motion-button-clearance', `motion control is ${clearance(other.getBoundingClientRect()).toFixed(1)}px from ${other.className || other.id}`);
      }
    }
    const nav = document.querySelector<HTMLElement>('.itc-nav');
    if (nav && getComputedStyle(nav).display !== 'none') {
      for (const link of Array.from(nav.querySelectorAll<HTMLElement>('a'))) {
        if (clearance(link.getBoundingClientRect()) < 24) {
          add('motion-button-clearance', 'motion control is less than 24px from side navigation');
          break;
        }
      }
    }
  }
  const about = document.querySelector<HTMLElement>('#sobre');
  if (about && hero) {
    const transitionStyle = getComputedStyle(hero, '::after');
    const transition = transitionStyle.backgroundImage;
    const transitionHeight = transitionStyle.height;
    if (!transition.includes('linear-gradient') || transitionHeight !== '200px') {
      const matchingRules = Array.from(document.styleSheets).flatMap((sheet) => {
        try { return Array.from(sheet.cssRules); } catch { return []; }
      }).filter((rule) => rule.cssText.includes('#sobre') && rule.cssText.includes('200px')).map((rule) => rule.cssText).slice(-2);
      add('about-transition', `hero-to-about transition is not a 200px gradient: ${transition}; class=${about.className}; root=${!!about.closest('.itc')}; matching=${JSON.stringify(matchingRules)}`);
    }
    if (!/rgba?\(0,\s*0,\s*0,\s*0\)/i.test(transition) || getComputedStyle(about).backgroundColor !== 'rgb(20, 33, 43)') {
      add('about-transition-seam', `the transition begins with an opaque color and can create a horizontal contrast line: ${transition}`);
    }
    const aboutStyle = getComputedStyle(about);
    const aboutPseudoStyles = [getComputedStyle(about, '::before'), getComputedStyle(about, '::after')];
    if (Number.parseFloat(aboutStyle.borderTopWidth) > 0 || aboutStyle.boxShadow !== 'none' ||
        aboutPseudoStyles.some((style) => Number.parseFloat(style.borderTopWidth) > 0 || style.boxShadow !== 'none')) {
      add('about-transition-edge', 'a border or shadow can draw a straight line at the hero-to-about join');
    }
  }
  const cosmos = hero?.querySelector<HTMLElement>(':scope > .itc-cosmos-backdrop');
  if (cosmos && isVisible(cosmos)) {
    const h = hero!.getBoundingClientRect();
    const c = cosmos.getBoundingClientRect();
    if (c.left < h.left - 1 || c.right > h.right + 1 || c.top < h.top - 1 || c.bottom > h.bottom + 1) {
      add('cosmos-clipped-to-hero', 'solar-system scene extends outside the hero area');
    }
    const sceneStyle = getComputedStyle(cosmos);
    const earthLayer = hero?.querySelector<HTMLElement>(':scope > [data-testid="background-earth"]');
    const earthStyle = earthLayer ? getComputedStyle(earthLayer) : null;
    const mask = `${sceneStyle.maskImage} ${sceneStyle.webkitMaskImage}`;
    if (!mask.includes('radial-gradient') || !mask.includes('51%') || !mask.includes('50%')) {
      add('solar-earth-occlusion', `solar scene lacks the Earth-centered radial mask: ${mask}`);
    }
    if (earthLayer && earthStyle && parseInt(sceneStyle.zIndex, 10) >= parseInt(earthStyle.zIndex, 10)) {
      add('solar-depth-order', `solar scene z-index ${sceneStyle.zIndex} is not behind Earth z-index ${earthStyle.zIndex}`);
    }
    if (earthLayer && window.innerWidth >= 1200) {
      const e = earthLayer.getBoundingClientRect();
      const earthRadiusAndHalo = Math.max(e.width, e.height) * .56;
      const maskRadius = Math.min(c.width, c.height) * .49 * .90;
      const maskCenterX = c.left + c.width * .51;
      const maskCenterY = c.top + c.height * .5;
      const earthCenterX = e.left + e.width * .5;
      const earthCenterY = e.top + e.height * .5;
      const offset = Math.hypot(earthCenterX - maskCenterX, earthCenterY - maskCenterY);
      if (offset + earthRadiusAndHalo > maskRadius) {
        add('solar-object-earth-intersection', `Earth disk+halo exceed solar mask by ${(offset + earthRadiusAndHalo - maskRadius).toFixed(1)}px`);
      }
    }
  }
  const solarFallback = hero?.querySelector<HTMLElement>(':scope > .itc-solar-fallback');
  if (solarFallback && getComputedStyle(solarFallback).display !== 'none') {
    add('solar-fallback-hidden', 'loose decorative orbit fallback is still visible');
  }
  const earthLayers = Array.from(document.querySelectorAll<HTMLElement>('#itc-page-earth, [data-testid="background-earth"]'));
  for (const earthLayer of earthLayers) {
    if (!hero?.contains(earthLayer)) add('earth-layer-outside-hero', `${earthLayer.id || earthLayer.className || 'Earth layer'} is not inside #inicio`);
    const style = getComputedStyle(earthLayer);
    if (style.position !== 'absolute') add('earth-layer-not-contained', `${earthLayer.id || earthLayer.className || 'Earth layer'} uses ${style.position} positioning`);
    const mask = `${style.maskImage} ${style.webkitMaskImage}`;
    if (!mask.includes('radial-gradient')) add('earth-radial-fade', `${earthLayer.id || earthLayer.className || 'Earth layer'} lacks a radial edge mask`);
  }
  const globeCanvases = Array.from(document.querySelectorAll<HTMLElement>('.itc-earth-globo .globo-terra canvas'));
  for (const canvas of globeCanvases) {
    if (!hero?.contains(canvas)) add('globe-canvas-outside-hero', 'a globe canvas is not inside #inicio');
  }
  if (document.querySelector('.itc-earth-lightning')) add('earth-lightning', 'lightning strokes remain over the Earth');
  const sideNav = document.querySelector<HTMLElement>('.itc-nav');
  const bottomNav = document.querySelector<HTMLElement>('.itc-bottom-nav');
  const sideVisible = !!sideNav && getComputedStyle(sideNav).display !== 'none';
  const bottomVisible = !!bottomNav && getComputedStyle(bottomNav).display !== 'none';
  if (width < 1280 && sideVisible) add('navigation-breakpoint', 'side navigation is visible below 1280px');
  if (width < 1280 && !bottomVisible) add('navigation-breakpoint', 'bottom navigation is hidden below 1280px');
  if (width >= 1280 && !sideVisible) add('navigation-breakpoint', 'side navigation is hidden at or above 1280px');
  if (sideVisible && sideNav) {
    const links = Array.from(sideNav.querySelectorAll<HTMLElement>('a')).map((el) => el.getBoundingClientRect());
    for (const text of textRects) {
      if (sideNav.contains(text.parent)) continue;
      const textRect = new DOMRect(text.left, text.top, text.right - text.left, text.bottom - text.top);
      if (links.some((link) => overlaps(link, textRect))) {
        add('side-nav-overlap', `side navigation intersects ${JSON.stringify(text.text.slice(0, 45))}`);
        break;
      }
    }
    for (const card of Array.from(document.querySelectorAll<HTMLElement>('.itc-card, .itc-pillar, .itc-speaker, .itc-session, .itc-map, .itc-register-main'))) {
      if (sideNav.contains(card)) continue;
      const box = card.getBoundingClientRect();
      if (links.some((link) => overlaps(link, box))) {
        add('side-nav-overlap', `side navigation intersects ${card.className}`);
        break;
      }
    }
  }
  const expected = ['dias', 'horas', 'minutos', 'segundos'];
  const cells = expected.map((unit) => document.querySelector<HTMLElement>(`[data-testid="count-${unit}"]`));
  if (cells.some((cell) => !cell || getComputedStyle(cell).display === 'none')) add('countdown-blocks', 'countdown must show days, hours, minutes, and seconds');
  for (const cell of cells) {
    const digit = cell?.querySelector<HTMLElement>('.itc-digit');
    if (digit && Number.parseFloat(getComputedStyle(digit).fontSize) < 32) add('countdown-digit-size', `${digit.textContent} at ${getComputedStyle(digit).fontSize} (strong ${getComputedStyle(digit.parentElement!).fontSize})`);
  }
  if (width >= 600 && width <= 1100 && cells[0] && cells[1]) {
    const a = cells[0].getBoundingClientRect();
    const b = cells[1].getBoundingClientRect();
    if (Math.abs(a.top - b.top) > 2) add('countdown-grid', 'tablet countdown is not arranged in two columns');
    if (hero && getComputedStyle(hero).gridTemplateColumns.split(' ').length > 1) add('tablet-hero-columns', 'tablet hero is not single-column');
  }
  for (const metric of Array.from(document.querySelectorAll<HTMLElement>('.itc-event-metric'))) {
    const box = metric.getBoundingClientRect();
    for (const text of textRects.filter((entry) => metric.contains(entry.parent))) {
      if (text.left < box.left - 1 || text.right > box.right + 1) {
        add('event-metric-text-overflow', `${JSON.stringify(text.text)} extends outside its metric`);
        break;
      }
    }
  }
  return issues;
};

const inspectEarthOutsideSection = (sectionId: string) => {
  const findings: Finding[] = [];
  const hero = document.querySelector<HTMLElement>('#inicio');
  const earthLayers = Array.from(document.querySelectorAll<HTMLElement>('#itc-page-earth, [data-testid="background-earth"]'));
  const globeCanvases = Array.from(document.querySelectorAll<HTMLElement>('.itc-earth-globo .globo-terra canvas'));
  const section = document.querySelector<HTMLElement>(sectionId);
  const visuallyInViewport = (element: HTMLElement) => {
    if (!element.isConnected) return false;
    let opacity = 1;
    for (let node: HTMLElement | null = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || style.contentVisibility === 'hidden') return false;
      opacity *= Number.parseFloat(style.opacity || '1');
    }
    const rect = element.getBoundingClientRect();
    return opacity > .03 && rect.width > 0 && rect.height > 0
      && rect.right > 0 && rect.left < window.innerWidth
      && rect.bottom > 0 && rect.top < window.innerHeight;
  };
  if (!section) findings.push({ check: 'earth-scope-target-missing', detail: `${sectionId} was not found` });
  if (earthLayers.some((layer) => !hero?.contains(layer))) {
    findings.push({ check: 'earth-layer-outside-hero', detail: `an Earth layer is outside #inicio while viewing ${sectionId}` });
  }
  const visibleEarth = earthLayers.filter(visuallyInViewport);
  if (visibleEarth.length) {
    findings.push({
      check: 'earth-straight-cut-outside-hero',
      detail: `${visibleEarth.length} Earth layer(s) remain visible in the ${sectionId} viewport`,
    });
  }
  const visibleCanvases = globeCanvases.filter(visuallyInViewport);
  if (visibleCanvases.length) {
    findings.push({
      check: 'globe-canvas-outside-hero',
      detail: `${visibleCanvases.length} globe canvas/canvases remain visible in the ${sectionId} viewport`,
    });
  }
  return findings;
};

async function main() {
  await mkdir(outputDir, { recursive: true });
  await waitForPreview();
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH ?? '/repl/tools/bin/chromium',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  const cases: CaseResult[] = [];
  const screenshots: string[] = [];
  const transitionScreenshots: string[] = [];
  const sectionScreenshots: string[] = [];
  const cardPngs: string[] = [];
  try {
    for (const width of selectedWidths) {
      for (const reducedMotion of [false, true]) {
        const height = heights[width];
        const context = await browser.newContext({
          viewport: { width, height },
          isMobile: width <= 430,
          hasTouch: width <= 430,
          reducedMotion: reducedMotion ? 'reduce' : 'no-preference',
        });
        const page = await context.newPage();
        await page.addInitScript('window.__name = (fn) => fn;');
        await page.goto(`${baseUrl}/itcont`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
        await page.locator('#inicio').waitFor({ state: 'visible', timeout: 20_000 });
        await page.waitForFunction(() => document.querySelector('.itc')?.getAttribute('data-css-ready') === 'true', undefined, { timeout: 20_000 });
        await page.waitForFunction(() => document.querySelector<HTMLImageElement>('.itc-ribbon-logo')?.complete === true, undefined, { timeout: 20_000 });
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(350);
        const findings = await page.evaluate(inspectPage);
        cases.push({ width, height, reducedMotion, findings });
        if (!reducedMotion) {
          const filename = `itcont-${width}px.png`;
          await page.screenshot({ path: resolve(outputDir, filename), fullPage: false, animations: 'disabled' });
          screenshots.push(filename);
        }
        await context.close();
      }
    }
    for (const deviceScaleFactor of [1, 2, 3]) {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor,
        isMobile: true,
        hasTouch: true,
        reducedMotion: 'reduce',
      });
      const page = await context.newPage();
      await page.goto(`${baseUrl}/itcont`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      await page.waitForFunction(() => document.querySelector<HTMLImageElement>('.itc-ribbon-logo')?.complete === true, undefined, { timeout: 20_000 });
      const result = await page.locator('.itc-ribbon-logo').evaluate((image) => {
        const logo = image as HTMLImageElement;
        return {
          naturalWidth: logo.naturalWidth,
          renderedWidth: logo.getBoundingClientRect().width,
          currentSrc: logo.currentSrc,
        };
      });
      const expectedSource = deviceScaleFactor === 1
        ? 'itcont-logo.png'
        : `itcont-logo-${deviceScaleFactor}x.png`;
      const findings: Finding[] = [];
      if (!result.currentSrc.endsWith(expectedSource)) {
        findings.push({ check: 'hero-logo-srcset', detail: `DPR ${deviceScaleFactor} escolheu ${result.currentSrc}` });
      }
      if (result.naturalWidth * deviceScaleFactor < result.renderedWidth * 3) {
        findings.push({
          check: 'hero-logo-source-density',
          detail: `DPR ${deviceScaleFactor}: imagem ${result.naturalWidth * deviceScaleFactor}px, exibição ${result.renderedWidth.toFixed(1)}px`,
        });
      }
      cases.push({ width: 390, height: 844, reducedMotion: true, location: `logo-dpr-${deviceScaleFactor}`, findings });
      await context.close();
    }
    for (const [width, height] of [[1568, 736], [390, 844]] as const) {
      for (const section of ['#programacao', '#inscricao']) {
        const context = await browser.newContext({
          viewport: { width, height },
          isMobile: width <= 414,
          hasTouch: width <= 414,
          reducedMotion: 'reduce',
        });
        const page = await context.newPage();
        await page.addInitScript('window.__name = (fn) => fn;');
        await page.goto(`${baseUrl}/itcont`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
        await page.locator('#inicio').waitFor({ state: 'visible', timeout: 20_000 });
        await page.waitForFunction(() => document.querySelector('.itc')?.getAttribute('data-css-ready') === 'true', undefined, { timeout: 20_000 });
        await page.waitForFunction(() => document.getElementById('itc-page-earth')?.parentElement?.id === 'inicio', undefined, { timeout: 20_000 });
        await page.evaluate(() => document.fonts.ready);
        await page.locator(section).scrollIntoViewIfNeeded();
        await page.waitForTimeout(350);
        const findings = await page.evaluate(inspectEarthOutsideSection, section);
        cases.push({ width, height, reducedMotion: true, location: section, findings });
        const filename = `itcont-earth-scope-${section.slice(1)}-${width}px.png`;
        await page.screenshot({ path: resolve(outputDir, filename), fullPage: false, animations: 'disabled' });
        sectionScreenshots.push(filename);
        await context.close();
      }
    }
    for (const [width, height] of [[1568, 736], [390, 844]] as const) {
      const context = await browser.newContext({
        viewport: { width, height },
        isMobile: width <= 414,
        hasTouch: width <= 414,
        reducedMotion: 'reduce',
      });
      const page = await context.newPage();
      await page.addInitScript('window.__name = (fn) => fn;');
      await page.goto(`${baseUrl}/itcont`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      await page.locator('#sobre').waitFor({ state: 'visible', timeout: 20_000 });
      await page.waitForFunction(() => document.querySelector('.itc')?.getAttribute('data-css-ready') === 'true', undefined, { timeout: 20_000 });
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => {
        const about = document.querySelector<HTMLElement>('#sobre');
        if (about) window.scrollTo(0, Math.max(0, about.getBoundingClientRect().top + window.scrollY - window.innerHeight * .58));
      });
      await page.waitForTimeout(250);
      const filename = `itcont-transition-${width}x${height}.png`;
      await page.screenshot({ path: resolve(outputDir, filename), fullPage: false, animations: 'disabled' });
      transitionScreenshots.push(filename);
      await context.close();
    }

    const cardPage = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await cardPage.goto(`${baseUrl}/itcont`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await cardPage.locator('#inicio').waitFor({ state: 'visible', timeout: 20_000 });
    await cardPage.waitForFunction(() => document.querySelector('.itc')?.getAttribute('data-css-ready') === 'true', undefined, { timeout: 20_000 });
    await cardPage.evaluate(() => document.fonts.ready);
    await cardPage.locator('#inscricao').scrollIntoViewIfNeeded();
    const canvas = cardPage.locator('[data-testid="canvas-promo-card"]');
    await canvas.waitFor({ state: 'visible', timeout: 20_000 });
    await cardPage.locator('[data-testid="input-promo-photo"]').setInputFiles(
      resolve(root, 'artifacts/icaro/public/itcont-earth-small.webp'),
    );
    await cardPage.waitForFunction(() => {
      const preview = document.querySelector<HTMLCanvasElement>('[data-testid="canvas-promo-card"]');
      return preview?.getAttribute('aria-label')?.includes('Arraste para ajustar a foto.') === true;
    }, undefined, { timeout: 30_000 });
    await cardPage.waitForFunction(() => !document.body.innerText.includes('Carregando a logo oficial do ITCONT…'), undefined, { timeout: 30_000 });
    if (await cardPage.locator('.itc-promo-error').count()) throw new Error('A logo oficial não carregou para gerar as imagens de validação.');

    const cardCases = [
      { format: 'feed', tab: 'promo-format-feed', phrase: 'Eu vou!', slug: 'eu-vou', previewWidth: 2160, previewHeight: 2700, width: 1080, height: 1350 },
      { format: 'feed', tab: 'promo-format-feed', phrase: 'Estarei lá', slug: 'estarei-la', previewWidth: 2160, previewHeight: 2700, width: 1080, height: 1350 },
      { format: 'stories', tab: 'promo-format-stories', phrase: 'Eu vou!', slug: 'eu-vou', previewWidth: 2160, previewHeight: 3840, width: 1080, height: 1920 },
      { format: 'stories', tab: 'promo-format-stories', phrase: 'Estarei lá', slug: 'estarei-la', previewWidth: 2160, previewHeight: 3840, width: 1080, height: 1920 },
    ] as const;
    for (const card of cardCases) {
      await cardPage.locator(`[data-testid="${card.tab}"]`).click();
      await cardPage.getByRole('button', { name: card.phrase, exact: true }).click();
      await cardPage.waitForFunction(({ format, previewWidth, previewHeight }) => {
        const preview = document.querySelector<HTMLCanvasElement>('[data-testid="canvas-promo-card"]');
        return preview?.dataset.cardFormat === format
          && preview.width === previewWidth
          && preview.height === previewHeight
          && Boolean(preview.dataset.photoWidth);
      }, { format: card.format, previewWidth: card.previewWidth, previewHeight: card.previewHeight }, { timeout: 15_000 });
      await cardPage.evaluate(() => new Promise<void>((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame()))));
      const dataUrl = await canvas.evaluate((element, outputSize) => {
        const output = document.createElement('canvas');
        output.width = outputSize.width;
        output.height = outputSize.height;
        const context = output.getContext('2d');
        if (!context) throw new Error('Não foi possível criar o PNG de validação.');
        context.drawImage(element as HTMLCanvasElement, 0, 0, output.width, output.height);
        return output.toDataURL('image/png');
      }, { width: card.width, height: card.height });
      const base64 = dataUrl.split(',')[1];
      if (!base64) throw new Error(`Não foi possível codificar o cartão ${card.format}/${card.slug} como PNG.`);
      const filename = `itcont-card-${card.format}-${card.slug}.png`;
      await writeFile(resolve(outputDir, filename), Buffer.from(base64, 'base64'));
      cardPngs.push(filename);
    }
    await cardPage.close();
  } finally {
    await browser.close();
    stopPreview();
  }
  const failures = cases.flatMap((entry) => entry.findings.map((finding) => ({
    width: entry.width,
    height: entry.height,
    reducedMotion: entry.reducedMotion,
    location: entry.location,
    ...finding,
  })));
  const report = {
    schemaVersion: 1,
    artifact: 'ITCONT',
    baseUrl: `${baseUrl}/itcont`,
    generatedAt: new Date().toISOString(),
    widths,
    reducedMotionCases: [false, true],
    caseCount: cases.length,
    cases,
    screenshots,
    transitionScreenshots,
    sectionScreenshots,
    cardPngs,
    failureCount: failures.length,
    failures,
  };
  await writeFile(resolve(outputDir, 'itcont-layout-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`ITCONT production responsive audit: ${cases.length} cases, ${failures.length} failure(s).`);
  console.log(`Report: generated-artifacts/audit/itcont-layout-report.json`);
  if (failures.length) console.error(failures.slice(0, 30));
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  stopPreview();
  console.error(error);
  process.exitCode = 1;
});
