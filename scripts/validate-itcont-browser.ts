import assert from "node:assert/strict";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const buildDir = resolve(root, "artifacts/icaro/dist/public");
assert.ok(existsSync(resolve(buildDir, "index.html")), `frontend build ausente em ${buildDir}; execute o build antes da validação`);
const staticRoot = await mkdtemp(join(tmpdir(), "itcont-browser-static-"));
const staticDir = join(staticRoot, "public");
await symlink(buildDir, staticDir, "dir");
const previousStaticDir = process.env.STATIC_DIR;
const previousCspMode = process.env.CSP_REPORT_ONLY;
process.env.STATIC_DIR = staticDir;
process.env.CSP_REPORT_ONLY = "1";

const { default: app } = await import("../artifacts/api-server/src/app");
const server = app.listen(0, "127.0.0.1");
const listening = once(server, "listening");
let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;

try {
  await listening;
  const address = server.address();
  assert.ok(address && typeof address !== "string", "servidor local não abriu uma porta TCP");
  const origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH ?? "/repl/tools/bin/chromium",
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });

  for (const reportOnly of [true, false]) {
    process.env.CSP_REPORT_ONLY = reportOnly ? "1" : "0";
    console.log(`Iniciando navegador com CSP ${reportOnly ? "Report-Only" : "efetiva"}...`);
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      reducedMotion: "reduce",
    });
    const consoleErrors: string[] = [];
    const policyViolations: string[] = [];
    page.on("console", (message) => {
      const text = message.text();
      if (message.type() === "error") consoleErrors.push(text);
      if (/content security policy/i.test(text)) policyViolations.push(text);
    });
    page.on("pageerror", (error) => consoleErrors.push(error.message));
    page.on("requestfailed", (request) => {
      const reason = request.failure()?.errorText ?? "";
      if (/content security policy/i.test(reason)) policyViolations.push(`${request.url()}: ${reason}`);
    });

    const response = await page.goto(`${origin}/itcont`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    assert.equal(response?.status(), 200);
    const expectedPolicy = reportOnly
      ? "content-security-policy-report-only"
      : "content-security-policy";
    const forbiddenPolicy = reportOnly
      ? "content-security-policy"
      : "content-security-policy-report-only";
    assert.ok(response?.headers()[expectedPolicy], `${expectedPolicy} ausente`);
    assert.equal(response?.headers()[forbiddenPolicy], undefined, `${forbiddenPolicy} não deveria estar ativo`);
    console.log("HTML entregue com o cabeçalho esperado.");
    await page.locator("#inicio").waitFor({ state: "visible", timeout: 20_000 });
    await page.waitForFunction(() => document.querySelector(".itc")?.getAttribute("data-css-ready") === "true", undefined, { timeout: 20_000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => document.querySelector<HTMLImageElement>(".itc-itcont-logo")?.naturalWidth > 0, undefined, { timeout: 20_000 });
    console.log("Hero, JavaScript e fontes carregados.");

    await page.locator("#local").scrollIntoViewIfNeeded();
    console.log("Seção Local alcançada; aguardando o mapa adiado.");
    await page.locator(".itc-map-slot").waitFor({ state: "attached", timeout: 30_000 });
    await page.locator(".itc-map-slot").scrollIntoViewIfNeeded();
    await page.locator(".maplibregl-canvas").waitFor({ state: "attached", timeout: 30_000 });
    await page.waitForTimeout(1_000);
    console.log("MapLibre carregado.");

    await page.locator("#inscricao").scrollIntoViewIfNeeded();
    await page.locator('[data-testid="canvas-promo-card"]').waitFor({ state: "visible", timeout: 20_000 });
    await page.waitForFunction(
      () => !document.body.innerText.includes("Carregando a logo oficial do ITCONT…"),
      undefined,
      { timeout: 30_000 },
    );
    assert.equal(await page.locator(".itc-promo-error").count(), 0, "logo oficial do cartão falhou");
    await page.waitForTimeout(500);
    console.log("Cartão do evento carregado.");

    assert.deepEqual(policyViolations, [], `${reportOnly ? "Report-Only" : "CSP efetiva"} registrou violações`);
    assert.deepEqual(consoleErrors, [], `${reportOnly ? "Report-Only" : "CSP efetiva"} registrou erros no console`);
    console.log(`${reportOnly ? "Report-Only" : "CSP efetiva"}: ITCONT, mapa e cartão sem violações ou erros de console`);
    await page.close();
  }

  console.log("Validando o hero público em 1024×540 com movimento reduzido...");
  const heroPage = await browser.newPage({
    viewport: { width: 1024, height: 540 },
    reducedMotion: "reduce",
  });
  const heroErrors: string[] = [];
  heroPage.on("pageerror", (error) => heroErrors.push(error.message));
  const heroResponse = await heroPage.goto(`${origin}/itcont`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  assert.equal(heroResponse?.status(), 200);
  await heroPage.locator("#inicio").waitFor({ state: "visible", timeout: 20_000 });
  await heroPage.waitForFunction(() => {
    const root = document.querySelector(".itc");
    const hero = document.querySelector("#inicio");
    const logo = document.querySelector<HTMLImageElement>(".itc-itcont-logo");
    return root?.getAttribute("data-css-ready") === "true"
      && hero instanceof HTMLElement
      && logo instanceof HTMLImageElement
      && logo.naturalWidth > 0;
  }, undefined, { timeout: 20_000 });
  await heroPage.waitForTimeout(1_500);
  const heroState = await heroPage.evaluate(() => {
    const hero = document.querySelector<HTMLElement>("#inicio");
    const counter = document.querySelector<HTMLElement>("#inicio .itc-counter");
    const motionButton = document.querySelector<HTMLElement>('[data-testid="button-enable-motion"]');
    const solarFallback = document.querySelector<HTMLElement>('[data-testid="background-solar-fallback"]');
    const cosmosViewport = document.querySelector<HTMLElement>('[data-testid="background-cosmos"] .cosmos-viewport');
    return {
      heroHeight: hero?.getBoundingClientRect().height ?? Number.POSITIVE_INFINITY,
      counterBottom: counter?.getBoundingClientRect().bottom ?? Number.POSITIVE_INFINITY,
      buttonVisible: Boolean(motionButton && getComputedStyle(motionButton).display !== "none"
        && motionButton.getBoundingClientRect().top >= 0
        && motionButton.getBoundingClientRect().bottom <= window.innerHeight),
      motionEnabled: document.querySelector(".itc")?.getAttribute("data-motion-enabled"),
      earthMotion: document.querySelector<HTMLElement>('[data-testid="background-earth"]')?.getAttribute("data-motion") ?? null,
      solarFallbackVisible: Boolean(solarFallback && getComputedStyle(solarFallback).display !== "none"),
      solarFallbackAnimation: solarFallback
        ? getComputedStyle(solarFallback.querySelector(".itc-solar-orbit")!).animationName
        : "none",
      cosmosMode: cosmosViewport?.getAttribute("data-render-mode"),
      cosmosCanvasVisible: Boolean(cosmosViewport && getComputedStyle(cosmosViewport).display !== "none"
        && cosmosViewport.getBoundingClientRect().width > 0),
    };
  });
  assert.ok(heroState.heroHeight <= 542, `hero excedeu o viewport: ${heroState.heroHeight}px`);
  assert.ok(heroState.counterBottom <= 540, `contagem ficou cortada: termina em ${heroState.counterBottom}px`);
  assert.equal(heroState.buttonVisible, true, "controle de movimento deve aparecer no primeiro viewport");
  assert.equal(heroState.motionEnabled, "false", "movimento reduzido deve começar pausado");
  if (heroState.earthMotion !== null) {
    assert.equal(heroState.earthMotion, "paused", "a Terra deve começar pausada com movimento reduzido");
  }
  assert.ok(heroState.solarFallbackVisible || heroState.cosmosCanvasVisible, "a cena solar deve estar visível no primeiro viewport");
  await heroPage.getByTestId("button-enable-motion").click();
  await heroPage.waitForFunction(() => document.querySelector(".itc")?.getAttribute("data-motion-enabled") === "true");
  const enabledMotionState = await heroPage.evaluate(() => {
    const orbit = document.querySelector<HTMLElement>(".itc-solar-orbit");
    const earth = document.querySelector<HTMLElement>('[data-testid="background-earth"]');
    return {
      solarAnimation: orbit ? getComputedStyle(orbit).animationName : "not-rendered",
      earthMotion: earth?.getAttribute("data-motion") ?? null,
    };
  });
  if (heroState.earthMotion !== null) {
    assert.equal(enabledMotionState.earthMotion, "on", "ativar movimento deve liberar a rotação da Terra");
  }
  if (heroState.solarFallbackVisible) {
    assert.equal(enabledMotionState.solarAnimation, "itc-solar-orbit", "ativar movimento deve liberar a rotação do fallback solar");
  }
  assert.deepEqual(heroErrors, [], "hero do ITCONT registrou erros no navegador");
  console.log("Hero compacto, cena solar e opt-in de movimento verificados.");
} finally {
  await browser?.close();
  if (server.listening) {
    await new Promise<void>((resolveClose, rejectClose) => {
      server.close((error) => error ? rejectClose(error) : resolveClose());
    });
  }
  if (previousStaticDir === undefined) delete process.env.STATIC_DIR;
  else process.env.STATIC_DIR = previousStaticDir;
  if (previousCspMode === undefined) delete process.env.CSP_REPORT_ONLY;
  else process.env.CSP_REPORT_ONLY = previousCspMode;
  await rm(staticRoot, { recursive: true, force: true });
}
