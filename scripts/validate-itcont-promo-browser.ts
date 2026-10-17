import assert from "node:assert/strict";
import { once } from "node:events";
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const buildDir = resolve(root, "artifacts/icaro/dist/public");
assert.ok(existsSync(resolve(buildDir, "index.html")), "Execute o build do Ícaro antes da matriz de cartões.");

const temporaryRoot = await mkdtemp(join(tmpdir(), "itcont-promo-browser-"));
const staticDir = join(temporaryRoot, "public");
await symlink(buildDir, staticDir, "dir");
const previousStaticDir = process.env.STATIC_DIR;
const previousCspMode = process.env.CSP_REPORT_ONLY;
process.env.STATIC_DIR = staticDir;
process.env.CSP_REPORT_ONLY = "1";

const { default: app } = await import("../artifacts/api-server/src/app");
const server = app.listen(0, "127.0.0.1");
const listening = once(server, "listening");
let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;

const phraseCases = [
  { id: "eu-vou", text: "Eu vou!" },
  { id: "estarei-la", text: "Estarei lá!" },
  { id: "partiu-itcont", text: "Partiu ITCONT!" },
  { id: "presenca-confirmada", text: "Presença confirmada!" },
  { id: "vaga-garantida", text: "Já garanti minha vaga!" },
  { id: "te-vejo-la", text: "Te vejo lá!" },
  { id: "bora-aprender-ia", text: "Bora aprender IA!" },
  { id: "contador-futuro", text: "Contador do futuro!" },
  { id: "nao-vou-perder", text: "Eu não vou perder!" },
  { id: "custom", text: "Vou!" },
  { id: "custom", text: "Quero estar lá!" },
  { id: "custom", text: "Já garanti minha vaga!" },
] as const;
const formatCases = [
  { id: "feed", tab: "promo-format-feed", width: 1080, height: 1350, minGap: 10 },
  { id: "stories", tab: "promo-format-stories", width: 1080, height: 1920, minGap: 8 },
] as const;
const samplePng = resolve(root, "generated-artifacts/itcont-promo-exemplo-frase-mais-longa.png");
const outputDirectory = dirname(samplePng);

async function waitForCard(page: import("playwright-core").Page, phrase: string, format: string, width: number, height: number) {
  await page.waitForFunction(({ phrase: expectedPhrase, format: expectedFormat, width: expectedWidth, height: expectedHeight }) => {
    const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="canvas-promo-card"]');
    return canvas?.dataset.phraseText === expectedPhrase
      && canvas.dataset.cardFormat === expectedFormat
      && canvas.width === expectedWidth * 2
      && canvas.height === expectedHeight * 2;
  }, { phrase, format, width, height }, { timeout: 20_000 });
  await page.evaluate(() => new Promise<void>((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame()))));
}

async function inspectCard(page: import("playwright-core").Page, phrase: string, format: (typeof formatCases)[number]) {
  const state = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="canvas-promo-card"]');
    if (!canvas) throw new Error("Prévia do cartão ausente.");
    return {
      phrase: canvas.dataset.phraseText ?? "",
      fontSize: Number(canvas.dataset.phraseFontSize),
      lineCount: Number(canvas.dataset.phraseLineCount),
      left: Number(canvas.dataset.phrasePillLeft),
      right: Number(canvas.dataset.phrasePillRight),
      top: Number(canvas.dataset.phrasePillTop),
      pillHeight: Number(canvas.dataset.phrasePillHeight),
      textWidth: Number(canvas.dataset.phraseTextWidth),
      previousBottom: Number(canvas.dataset.phrasePreviousBottom),
      nextTop: Number(canvas.dataset.phraseNextTop),
      minGap: Number(canvas.dataset.phraseMinGap),
      gapBefore: Number(canvas.dataset.phraseGapBefore),
      gapAfter: Number(canvas.dataset.phraseGapAfter),
      photoReady: canvas.getAttribute("aria-label")?.includes("Arraste para ajustar a foto.") ?? false,
      photoWidth: canvas.dataset.photoWidth ?? "",
      width: canvas.width,
      height: canvas.height,
    };
  });
  assert.equal(state.phrase, phrase);
  assert.ok(state.fontSize >= 40, `fonte ficou abaixo de 40 px: ${state.fontSize}`);
  assert.ok(state.left >= 80 && state.right <= 1000, `pílula fora da margem segura: ${state.left}–${state.right}`);
  assert.ok(state.right > state.left && state.right - state.left - state.textWidth >= 63, "pílula sem respiro lateral para o texto");
  assert.ok(state.lineCount >= 1 && state.lineCount <= 2, `quebra inesperada da frase em ${state.lineCount} linhas`);
  assert.ok(state.top > state.previousBottom, "pílula encostou no bloco do nome");
  assert.ok(state.nextTop > state.top + state.pillHeight, "pílula encostou no bloco seguinte");
  assert.ok(state.gapBefore >= format.minGap && state.gapAfter >= format.minGap, "espaçamento mínimo entre blocos não foi mantido");
  assert.equal(state.minGap, format.minGap);
  assert.deepEqual([state.width, state.height], [format.width * 2, format.height * 2]);
  return state;
}

async function comparePreviewWithDownload(page: import("playwright-core").Page, actualBase64: string, width: number, height: number) {
  return page.evaluate(async ({ png, expectedWidth, expectedHeight }) => {
    const preview = document.querySelector<HTMLCanvasElement>('[data-testid="canvas-promo-card"]');
    if (!preview) throw new Error("Prévia do cartão ausente durante a comparação.");
    const expected = document.createElement("canvas");
    expected.width = expectedWidth;
    expected.height = expectedHeight;
    const expectedContext = expected.getContext("2d");
    if (!expectedContext) throw new Error("Não foi possível comparar a prévia com o PNG.");
    expectedContext.drawImage(preview, 0, 0, expectedWidth, expectedHeight);
    const expectedPixels = expectedContext.getImageData(0, 0, expectedWidth, expectedHeight).data;

    const image = new Image();
    image.src = `data:image/png;base64,${png}`;
    await image.decode();
    if (image.width !== expectedWidth || image.height !== expectedHeight) {
      return { width: image.width, height: image.height, mismatchedPixels: -1 };
    }
    const actual = document.createElement("canvas");
    actual.width = expectedWidth;
    actual.height = expectedHeight;
    const actualContext = actual.getContext("2d");
    if (!actualContext) throw new Error("Não foi possível ler o PNG exportado.");
    actualContext.drawImage(image, 0, 0);
    const actualPixels = actualContext.getImageData(0, 0, expectedWidth, expectedHeight).data;
    let mismatchedPixels = 0;
    for (let index = 0; index < expectedPixels.length; index += 4) {
      if (
        expectedPixels[index] !== actualPixels[index]
        || expectedPixels[index + 1] !== actualPixels[index + 1]
        || expectedPixels[index + 2] !== actualPixels[index + 2]
        || expectedPixels[index + 3] !== actualPixels[index + 3]
      ) mismatchedPixels += 1;
    }
    return { width: image.width, height: image.height, mismatchedPixels };
  }, { png: actualBase64, expectedWidth: width, expectedHeight: height });
}

try {
  await listening;
  const address = server.address();
  assert.ok(address && typeof address !== "string", "servidor local não abriu uma porta TCP");
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH ?? "/repl/tools/bin/chromium",
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: "pt-BR",
    acceptDownloads: true,
  });
  const page = await context.newPage();
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const origin = `http://127.0.0.1:${address.port}`;
  const openCard = async () => {
    const response = await page.goto(`${origin}/itcont`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    assert.equal(response?.status(), 200);
    await page.locator("#inscricao").scrollIntoViewIfNeeded();
    await page.getByTestId("canvas-promo-card").waitFor({ state: "visible", timeout: 30_000 });
    await page.waitForFunction(() => document.querySelector<HTMLImageElement>(".itc-itcont-logo")?.naturalWidth > 0, undefined, { timeout: 30_000 });
  };

  await openCard();
  await page.waitForFunction(() => document.querySelector<HTMLCanvasElement>('[data-testid="canvas-promo-card"]')?.dataset.phraseText === "Eu vou!");
  assert.equal(await page.getByTestId("promo-phrase-eu-vou").getAttribute("aria-pressed"), "true", "a frase padrão deve ser Eu vou!");
  const mobileColumns = await page.getByRole("group", { name: "Frases para o cartão" }).evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length);
  assert.equal(mobileColumns, 2, "celular deve mostrar duas colunas de frases");

  const selectedPhraseButton = page.getByTestId("promo-phrase-estarei-la");
  await selectedPhraseButton.click();
  await waitForCard(page, "Estarei lá!", "feed", 1080, 1350);
  await page.waitForFunction(() => Boolean(window.localStorage.getItem("itcont-promo-phrase-v1")));
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("#inscricao").scrollIntoViewIfNeeded();
  await page.getByTestId("canvas-promo-card").waitFor({ state: "visible" });
  await page.waitForFunction(() => document.querySelector<HTMLCanvasElement>('[data-testid="canvas-promo-card"]')?.dataset.phraseText === "Estarei lá!");
  assert.equal(await page.getByTestId("promo-phrase-estarei-la").getAttribute("aria-pressed"), "true", "a escolha deve sobreviver à atualização da página");

  await page.getByTestId("promo-phrase-custom").click();
  const customInput = page.getByTestId("input-promo-custom-phrase");
  await customInput.fill("Merda🚀—Vou!");
  await page.waitForFunction(() => document.querySelector<HTMLCanvasElement>('[data-testid="canvas-promo-card"]')?.dataset.phraseText === "Vou!");
  assert.equal(await customInput.inputValue(), "Vou!", "emoji, palavrão e travessão devem ser filtrados");
  assert.equal(await page.getByTestId("promo-custom-phrase-count").innerText(), "4/22");

  await page.setViewportSize({ width: 1440, height: 1000 });
  const desktopColumns = await page.getByRole("group", { name: "Frases para o cartão" }).evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length);
  assert.equal(desktopColumns, 3, "desktop deve mostrar três colunas de frases");
  await page.setViewportSize({ width: 390, height: 844 });

  const photoData = await page.evaluate(() => {
    const image = document.createElement("canvas");
    image.width = 320;
    image.height = 240;
    const context = image.getContext("2d");
    if (!context) throw new Error("Não foi possível preparar a foto de teste.");
    const gradient = context.createLinearGradient(0, 0, image.width, image.height);
    gradient.addColorStop(0, "#1777c8");
    gradient.addColorStop(1, "#edc467");
    context.fillStyle = gradient;
    context.fillRect(0, 0, image.width, image.height);
    context.beginPath();
    context.arc(160, 120, 64, 0, Math.PI * 2);
    context.fillStyle = "#f7fafc";
    context.fill();
    return image.toDataURL("image/png").split(",")[1];
  });
  assert.ok(photoData, "foto sintética não foi codificada");
  const photoBuffer = Buffer.from(photoData, "base64");
  let scenarioCount = 0;

  for (const phraseCase of phraseCases) {
    await openCard();
    if (phraseCase.id === "custom") {
      await page.getByTestId("promo-phrase-custom").click();
      await page.getByTestId("input-promo-custom-phrase").fill(phraseCase.text);
    } else {
      await page.getByTestId(`promo-phrase-${phraseCase.id}`).click();
    }
    for (const photoState of [false, true]) {
      if (photoState) {
        await page.getByTestId("input-promo-photo").setInputFiles({
          name: "foto-de-validacao.png",
          mimeType: "image/png",
          buffer: photoBuffer,
        });
        await page.waitForFunction(() => {
          const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="canvas-promo-card"]');
          return Boolean(canvas?.dataset.photoWidth && canvas.getAttribute("aria-label")?.includes("Arraste para ajustar a foto."));
        }, undefined, { timeout: 30_000 });
      } else {
        await page.waitForFunction(() => !document.querySelector<HTMLCanvasElement>('[data-testid="canvas-promo-card"]')?.dataset.photoWidth);
      }

      for (const format of formatCases) {
        await page.getByTestId(format.tab).click();
        await waitForCard(page, phraseCase.text, format.id, format.width, format.height);
        const layout = await inspectCard(page, phraseCase.text, format);
        assert.equal(layout.photoReady, photoState, "estado da foto não corresponde ao caso da matriz");
        assert.equal(Boolean(layout.photoWidth), photoState, "metadados da foto não correspondem ao caso da matriz");

        const [download] = await Promise.all([
          page.waitForEvent("download", { timeout: 30_000 }),
          page.getByTestId("button-download-promo").click(),
        ]);
        assert.match(download.suggestedFilename(), /^itcont-(feed-4x5|stories-9x16)\.png$/);
        const path = await download.path();
        assert.ok(path, "o PNG do cartão não foi criado");
        const png = await readFile(path);
        assert.ok(png.length > 1_000, "o PNG exportado está vazio");
        const pixelComparison = await comparePreviewWithDownload(page, png.toString("base64"), format.width, format.height);
        assert.deepEqual(pixelComparison, { width: format.width, height: format.height, mismatchedPixels: 0 }, "a prévia deve coincidir com o PNG baixado");

        if (phraseCase.id === "vaga-garantida" && format.id === "feed" && !photoState) {
          await mkdir(outputDirectory, { recursive: true });
          await copyFile(path, samplePng);
        }
        scenarioCount += 1;
      }
    }
  }

  assert.equal(scenarioCount, 48, "a matriz deve cobrir 12 frases × 2 formatos × 2 estados de foto");
  assert.ok(existsSync(samplePng), "PNG de exemplo com a frase mais longa ausente");
  assert.deepEqual(pageErrors, [], `erros no navegador: ${pageErrors.join("; ")}`);
  console.log(`Cartões validados: ${scenarioCount} combinações; prévia e PNG idênticos em todas.`);
  console.log("Frases, sanitização, contador, persistência, margens, fonte mínima, respiro e colunas responsivas verificados.");
  console.log("Exemplo PNG: generated-artifacts/itcont-promo-exemplo-frase-mais-longa.png");
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
  await rm(temporaryRoot, { recursive: true, force: true });
}
