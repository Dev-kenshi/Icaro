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
    await page.waitForFunction(() => document.querySelector<HTMLImageElement>(".itc-ribbon-logo")?.naturalWidth > 0, undefined, { timeout: 20_000 });
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
