import assert from "node:assert/strict";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import type { Server } from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import sharp from "sharp";
import {
  applyRouteFavicon,
  faviconRouteForPath,
  routeFaviconPaths,
} from "../../artifacts/icaro/src/lib/route-favicons";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const publicDir = path.join(workspaceRoot, "artifacts/icaro/public");
const buildDir = path.join(workspaceRoot, "artifacts/icaro/dist/public");
const screenshotDir = path.join(workspaceRoot, "generated-artifacts/route-favicons");
const sizes = [16, 32, 48, 180] as const;

assert.ok(existsSync(path.join(buildDir, "index.html")), "execute o build do Ícaro antes de validar favicons");
assert.equal(existsSync(path.join(publicDir, "favicon.svg")), false, "favicon SVG laranja obsoleto ainda existe");

for (const [pathname, baseUrl, expected] of [
  ["/", "/", "itcont"],
  ["/itcont", "/", "itcont"],
  ["/itcont/", "/", "itcont"],
  ["/itcont/convidados", "/", "itcont"],
  ["/icaro", "/", "icaro"],
  ["/overview", "/", "icaro"],
  ["/music", "/", "icaro"],
  ["/admin/cerebro", "/", "icaro"],
  ["/eventos/itcont", "/", "icaro"],
  ["/app/itcont", "/app/", "itcont"],
  ["/app/overview", "/app/", "icaro"],
] as const) {
  assert.equal(faviconRouteForPath(pathname, baseUrl), expected, `rota de favicon incorreta para ${pathname}`);
}

const linkStore = new Map<string, {
  id: string;
  rel: string;
  type: string;
  sizes: string;
  href: string;
}>();
const fakeDocument = {
  getElementById: (id: string) => linkStore.get(id) ?? null,
  createElement: () => ({ id: "", rel: "", type: "", sizes: "", href: "" }),
  head: {
    appendChild: (link: { id: string; rel: string; type: string; sizes: string; href: string }) => {
      linkStore.set(link.id, link);
      return link;
    },
  },
} as unknown as Document;

applyRouteFavicon("itcont", "/", fakeDocument);
assert.equal(linkStore.get("route-favicon-16")?.href, "/favicon-itcont-16.png");
assert.equal(linkStore.get("route-favicon")?.href, "/favicon-itcont-32.png");
assert.equal(linkStore.get("route-favicon-48")?.href, "/favicon-itcont-48.png");
assert.equal(linkStore.get("route-apple-icon")?.href, "/favicon-itcont-180.png");
applyRouteFavicon("icaro", "/app/", fakeDocument);
assert.equal(linkStore.get("route-favicon-16")?.href, "/app/favicon-icaro-16.png");
assert.equal(linkStore.get("route-favicon")?.href, "/app/favicon-icaro-32.png",
  "a troca de rota SPA deve atualizar o favicon e respeitar a base");
assert.equal(linkStore.get("route-favicon-48")?.href, "/app/favicon-icaro-48.png");
assert.equal(linkStore.get("route-apple-icon")?.href, "/app/favicon-icaro-180.png");

for (const route of ["itcont", "icaro"] as const) {
  const paths = routeFaviconPaths(route, "/");
  for (const size of sizes) {
    const assetPath = path.join(publicDir, `favicon-${route}-${size}.png`);
    const metadata = await sharp(assetPath).metadata();
    assert.equal(metadata.format, "png", `${path.basename(assetPath)} deve ser PNG`);
    assert.deepEqual([metadata.width, metadata.height], [size, size],
      `${path.basename(assetPath)} deve ter dimensões ${size}×${size}`);
  }
  assert.ok(paths.favicon16.endsWith(`favicon-${route}-16.png`));
  assert.ok(paths.favicon.endsWith(`favicon-${route}-32.png`));
  assert.ok(paths.favicon48.endsWith(`favicon-${route}-48.png`));
}

const staticRoot = await mkdtemp(path.join(os.tmpdir(), "route-favicons-static-"));
const staticDir = path.join(staticRoot, "public");
await symlink(buildDir, staticDir, "dir");
const previousStaticDir = process.env.STATIC_DIR;
process.env.STATIC_DIR = staticDir;
let server: Server | undefined;
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;

try {
  const { default: app } = await import("../../artifacts/api-server/src/app");
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string", "API local não abriu uma porta TCP");
  const origin = `http://127.0.0.1:${address.port}`;

  await mkdir(screenshotDir, { recursive: true });
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH ?? "/repl/tools/bin/chromium",
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  for (const [pathname, expected] of [["/", "itcont"], ["/icaro", "icaro"]] as const) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
    const response = await page.goto(`${origin}${pathname}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    assert.equal(response?.status(), 200, `navegador não conseguiu abrir ${pathname}`);
    if (expected === "itcont") {
      await page.locator("#inicio").waitFor({ state: "visible", timeout: 20_000 });
    }
    const faviconHref = await page.locator("#route-favicon").getAttribute("href");
    const appleHref = await page.locator("#route-apple-icon").getAttribute("href");
    assert.equal(new URL(faviconHref ?? "", origin).pathname, `/favicon-${expected}-32.png`,
      `${pathname} deve renderizar o favicon correto no cliente`);
    assert.equal(new URL(appleHref ?? "", origin).pathname, `/favicon-${expected}-180.png`,
      `${pathname} deve renderizar o ícone de atalho correto no cliente`);
    if (expected === "itcont") {
      await page.screenshot({
        path: path.join(screenshotDir, "itcont-route-390px.png"),
        animations: "disabled",
      });
    }
    await page.close();
  }

  const comparisonPage = await browser.newPage({ viewport: { width: 840, height: 420 }, deviceScaleFactor: 1 });
  await comparisonPage.setContent(`<!doctype html>
    <html lang="pt-BR">
      <head><meta charset="utf-8"><style>
        *{box-sizing:border-box}body{margin:0;background:#071226;color:#e8f4ff;font:16px system-ui,sans-serif;padding:32px}
        main{max-width:760px;margin:auto}h1{font-size:24px;margin:0 0 8px}p{margin:0 0 24px;color:#9bb0c7}
        .cards{display:grid;grid-template-columns:1fr 1fr;gap:20px}.card{display:flex;align-items:center;gap:20px;padding:20px;border:1px solid #243d5e;border-radius:18px;background:#0c1c35}
        img{width:96px;height:96px;object-fit:contain;border-radius:16px}.name{font-weight:700;font-size:18px}.path{margin-top:6px;color:#8fa8c5;font:14px ui-monospace,monospace}
      </style></head>
      <body><main><h1>Favicons por rota</h1><p>Comparação visual dos ícones usados pelo site público e pelo app.</p>
        <div class="cards">
          <article class="card"><img src="${origin}/favicon-itcont-180.png" alt="I azul do ITCONT"><div><div class="name">ITCONT</div><div class="path">/ · /itcont</div></div></article>
          <article class="card"><img src="${origin}/favicon-icaro-180.png" alt="Retrato do Ícaro"><div><div class="name">Ícaro</div><div class="path">/icaro · rotas do app</div></div></article>
        </div>
      </main></body>
    </html>`);
  await comparisonPage.evaluate(async () => {
    await Promise.all(Array.from(document.images, (image) => image.decode()));
  });
  await comparisonPage.screenshot({
    path: path.join(screenshotDir, "route-favicons-comparison.png"),
    animations: "disabled",
  });
  await comparisonPage.close();

  for (const [pathname, expected] of [
    ["/", "itcont"],
    ["/itcont", "itcont"],
    ["/itcont/", "itcont"],
    ["/icaro", "icaro"],
    ["/icaro/overview", "icaro"],
    ["/overview", "icaro"],
    ["/assistant", "icaro"],
    ["/music", "icaro"],
  ] as const) {
    const response = await fetch(`${origin}${pathname}`, { headers: { accept: "text/html" } });
    const html = await response.text();
    assert.equal(response.status, 200, `GET ${pathname} deve servir o HTML`);
    assert.match(response.headers.get("content-type") ?? "", /text\/html/);

    for (const [id, size] of [
      ["route-favicon-16", 16],
      ["route-favicon", 32],
      ["route-favicon-48", 48],
      ["route-apple-icon", 180],
    ] as const) {
      const tags = html.match(/<link\b[^>]*>/gi) ?? [];
      const tag = tags.find((candidate) => new RegExp(`\\bid="${id}"`).test(candidate));
      assert.ok(tag, `${pathname} deve conter ${id}`);
      const href = tag.match(/\bhref="([^"]+)"/i)?.[1];
      assert.ok(href, `${id} deve ter href`);
      assert.equal(new URL(href, origin).pathname, `/favicon-${expected}-${size}.png`,
        `${pathname} deve receber o ícone ${expected}`);
    }
    assert.doesNotMatch(html, /favicon\.svg/);
  }

  for (const route of ["itcont", "icaro"] as const) {
    for (const size of sizes) {
      const response = await fetch(`${origin}/favicon-${route}-${size}.png`);
      assert.equal(response.status, 200, `asset favicon-${route}-${size}.png não foi servido`);
      assert.match(response.headers.get("content-type") ?? "", /image\/png/);
    }
  }

  console.log("Route favicons: 11 rotas, metadados sem JavaScript, troca SPA simulada, 8 assets PNG, screenshot ITCONT e comparação de ícones verificados.");
} finally {
  await browser?.close();
  if (server?.listening) {
    await new Promise<void>((resolveClose, rejectClose) => {
      server!.close((error) => error ? rejectClose(error) : resolveClose());
    });
  }
  if (previousStaticDir === undefined) delete process.env.STATIC_DIR;
  else process.env.STATIC_DIR = previousStaticDir;
  await rm(staticRoot, { recursive: true, force: true });
}
