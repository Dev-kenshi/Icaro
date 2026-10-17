import assert from "node:assert/strict";
import { stat } from "node:fs/promises";
import { chromium, type Download } from "playwright-core";

const SITE_URL = process.env.ITCONT_URL ?? "http://localhost:80/itcont";
const CHROMIUM = process.env.CHROMIUM_PATH ?? "/repl/tools/bin/chromium";
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7+W4cAAAAASUVORK5CYII=",
  "base64",
);

const browser = await chromium.launch({
  executablePath: CHROMIUM,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--autoplay-policy=no-user-gesture-required"],
});

try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    locale: "pt-BR",
  });
  const page = await context.newPage();
  await page.goto(SITE_URL, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.locator("#inscricao").scrollIntoViewIfNeeded();
  const canvas = page.getByTestId("canvas-promo-card");
  await canvas.waitFor({ state: "visible", timeout: 30_000 });
  const forceFfmpegOnly = process.env.FORCE_FFMPEG_ONLY === "1";

  const checkExport = async (label: string) => {
    const button = page.getByTestId("button-download-promo-video");
    await button.waitFor({ state: "visible" });
    await button.waitFor({ state: "attached" });
    await page.waitForFunction(() => {
      const button = document.querySelector<HTMLButtonElement>('[data-testid="button-download-promo-video"]');
      return Boolean(button && !button.disabled);
    }, undefined, { timeout: 15_000 });
    const downloadRef: { value: Download | null } = { value: null };
    const onDownload = (item: Download) => { downloadRef.value = item; };
    page.on("download", onDownload);
    await button.click();
    const deadline = Date.now() + 150_000;
    while (!downloadRef.value && Date.now() < deadline) {
      const error = page.getByTestId("error-promo-video");
      if (await error.isVisible().catch(() => false)) {
        throw new Error(`${label}: ${await error.innerText()}`);
      }
      const progress = await page.getByTestId("progress-promo-video").getAttribute("value").catch(() => null);
      const status = await page.getByTestId("status-promo-video").innerText().catch(() => "");
      console.log(`${label}: ${progress ?? "?"}% — ${status}`);
      await page.waitForTimeout(5_000);
    }
    page.off("download", onDownload);
    const download = downloadRef.value;
    if (!download) throw new Error(`${label}: tempo esgotado aguardando o download`);
    assert.match(download.suggestedFilename(), /^itcont-stories-9x16\.(mp4|webm)$/);
    await page.waitForFunction(() => /pronto para baixar/i.test(
      document.querySelector('[data-testid="status-promo-video"]')?.textContent ?? "",
    ), undefined, { timeout: 5_000 });
    const filePath = await download.path();
    assert.ok(filePath, `${label}: o navegador não concluiu o download`);
    const fileSize = (await stat(filePath)).size;
    assert.ok(fileSize > 0 && fileSize < 15 * 1024 * 1024, `${label}: ${fileSize} bytes fora do limite`);
    console.log(`✓ ${label}: ${download.suggestedFilename()}, ${fileSize} bytes`);
  };

  if (!forceFfmpegOnly) await checkExport("Mobile Chrome 390×844 sem foto");
  await page.locator('[data-testid="input-promo-photo"]').setInputFiles({
    name: "foto-teste.png",
    mimeType: "image/png",
    buffer: TINY_PNG,
  });
  await page.waitForFunction(() => {
    const preview = document.querySelector<HTMLCanvasElement>('[data-testid="canvas-promo-card"]');
    return Boolean(preview?.dataset.photoWidth);
  }, undefined, { timeout: 15_000 });
  if (!forceFfmpegOnly) await checkExport("Mobile Chrome 390×844 com foto local");
  await page.evaluate("Object.defineProperty(window.MediaRecorder, 'isTypeSupported', { configurable: true, value: () => false })");
  await checkExport("Mobile Chrome 390×844 com foto pelo FFmpeg local de reserva");
  await context.close();
} finally {
  await browser.close();
}
