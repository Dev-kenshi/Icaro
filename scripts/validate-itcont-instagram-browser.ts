import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import {
  ITCONT_INSTAGRAM_ARIA_LABEL,
  ITCONT_INSTAGRAM_URL,
} from "../artifacts/icaro/src/itcont/seo-static";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const buildDir = resolve(root, "artifacts/icaro/dist/public");
const tempRoot = await mkdtemp(join(tmpdir(), "itcont-instagram-browser-"));
const staticDir = join(tempRoot, "public");
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
  assert.ok(address && typeof address !== "string");
  const pageOrigin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH ?? "/repl/tools/bin/chromium",
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  const page = await browser.newPage({
    viewport: { width: 360, height: 800 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  const response = await page.goto(pageOrigin, {
    waitUntil: "domcontentloaded",
    timeout: 45_000,
  });
  assert.equal(response?.status(), 200);
  await page.locator("#inicio").waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForFunction(
    () => document.querySelector(".itc")?.getAttribute("data-css-ready") === "true",
    undefined,
    { timeout: 30_000 },
  );
  for (const testId of [
    "link-instagram-hero",
    "link-instagram-signup",
    "link-instagram-footer",
  ]) {
    await page.getByTestId(testId).waitFor({ state: "visible", timeout: 30_000 });
  }

  const result = await page.evaluate(() => {
    const selectors = [
      "#inicio [data-testid='link-instagram-hero']",
      "#inscricao [data-testid='link-instagram-signup']",
      "footer [data-testid='link-instagram-footer']",
    ];
    const links = selectors.map((selector) => {
      const element = document.querySelector<HTMLAnchorElement>(selector);
      if (!element) return null;
      const bounds = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        href: element.href,
        target: element.target,
        rel: element.rel,
        ariaLabel: element.getAttribute("aria-label"),
        height: bounds.height,
        width: bounds.width,
        minHeight: Number.parseFloat(style.minHeight),
        minWidth: Number.parseFloat(style.minWidth),
        left: bounds.left,
        right: bounds.right,
      };
    });
    const audience = document.querySelector(".itc-hero-audience");
    const heroLink = document.querySelector("#inicio [data-testid='link-instagram-hero']");
    const signupCopy = document.querySelector("#inscricao .itc-instagram-signup-note")?.textContent ?? "";

    return {
      links,
      heroBelowAudience: Boolean(
        audience
        && heroLink
        && (audience.compareDocumentPosition(heroLink) & Node.DOCUMENT_POSITION_FOLLOWING),
      ),
      signupCopy,
      innerWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
    };
  });

  assert.equal(result.links.length, 3);
  for (const [index, link] of result.links.entries()) {
    assert.ok(link, `Instagram link ${index + 1} is missing`);
    assert.equal(link.href, ITCONT_INSTAGRAM_URL);
    assert.equal(link.target, "_blank");
    assert.equal(link.rel, "noopener noreferrer");
    assert.equal(link.ariaLabel, ITCONT_INSTAGRAM_ARIA_LABEL);
    assert.ok(link.height >= 44, `Instagram link ${index + 1} is shorter than 44px`);
    assert.ok(link.width >= 44, `Instagram link ${index + 1} is narrower than 44px`);
    assert.ok(link.minHeight >= 44, `Instagram link ${index + 1} lacks 44px minimum height`);
    assert.ok(link.minWidth >= 44, `Instagram link ${index + 1} lacks 44px minimum width`);
    assert.ok(link.left >= 0 && link.right <= result.innerWidth, `Instagram link ${index + 1} exceeds the 360px viewport`);
  }
  assert.ok(result.heroBelowAudience, "The hero Instagram link must follow the audience statement.");
  assert.match(result.signupCopy, /Siga\s+@cont_amanha\s+e marque a gente no seu Stories/);
  assert.doesNotMatch(result.signupCopy, /[—–]/);
  assert.ok(
    result.documentWidth <= result.innerWidth,
    `The page causes horizontal scrolling at 360px (${result.documentWidth}px wide).`,
  );
  assert.deepEqual(errors, [], "Instagram page produced browser errors.");
  console.log("Instagram validado no hero, inscrição e rodapé: links acessíveis, toque ≥44px e sem rolagem horizontal a 360px.");
} finally {
  await browser?.close();
  await new Promise<void>((resolveClose, reject) => {
    server.close((error) => error ? reject(error) : resolveClose());
  });
  if (previousStaticDir === undefined) delete process.env.STATIC_DIR;
  else process.env.STATIC_DIR = previousStaticDir;
  if (previousCspMode === undefined) delete process.env.CSP_REPORT_ONLY;
  else process.env.CSP_REPORT_ONLY = previousCspMode;
  await rm(tempRoot, { recursive: true, force: true });
}
