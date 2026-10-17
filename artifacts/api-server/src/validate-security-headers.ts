import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { once } from "node:events";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const staticDir = await mkdtemp(path.join(os.tmpdir(), "itcont-security-headers-"));
const previousStaticDir = process.env.STATIC_DIR;
process.env.STATIC_DIR = staticDir;
await writeFile(
  path.join(staticDir, "index.html"),
  [
    "<!doctype html>",
    "<title>Ícaro Inteligência e Operações</title>",
    '<meta name="description" content="old description">',
    '<meta property="og:title" content="old title">',
    '<meta property="og:description" content="old description">',
    '<meta property="og:url" content="https://old.example/">',
    '<meta property="og:image" content="https://old.example/image.png">',
    '<meta name="twitter:title" content="old title">',
    '<meta name="twitter:description" content="old description">',
    '<link rel="canonical" href="https://old.example/">',
  ].join(""),
);

const { default: app } = await import("./app");
const server = app.listen(0, "127.0.0.1");

try {
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string", "servidor não abriu uma porta TCP");

  const origin = `http://127.0.0.1:${address.port}`;
  const requestWithHost = (requestPath: string, host: string) =>
    new Promise<{ statusCode: number | undefined; headers: http.IncomingHttpHeaders }>((resolve, reject) => {
      const request = http.request({
        hostname: "127.0.0.1",
        port: address.port,
        method: "GET",
        path: requestPath,
        headers: { host },
      }, (response) => {
        response.resume();
        response.once("end", () => resolve({ statusCode: response.statusCode, headers: response.headers }));
      });
      request.once("error", reject);
      request.end();
    });
  const commonHeaders: Array<[string, string]> = [
    ["strict-transport-security", "max-age=31536000; includeSubDomains"],
    ["x-content-type-options", "nosniff"],
    ["referrer-policy", "strict-origin-when-cross-origin"],
    ["x-frame-options", "SAMEORIGIN"],
  ];
  const canonicalHost = (process.env.CANONICAL_HOST ?? "itcont-uefs.onrender.com")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "")
    .toLowerCase();
  const reportOnly = process.env.CSP_REPORT_ONLY === "1";
  const expectedCspHeader = reportOnly
    ? "content-security-policy-report-only"
    : "content-security-policy";
  const otherCspHeader = reportOnly
    ? "content-security-policy"
    : "content-security-policy-report-only";
  const itcontTitle = "ITCONT 2026 · I Imersão Tecnológica Contábil";
  const icaroTitle = "Ícaro Inteligência e Operações";
  for (const route of ["/", "/itcont", "/itcont/programacao"]) {
    const response = await fetch(`${origin}${route}`);
    const html = await response.text();
    assert.equal(response.status, 200, `GET ${route} deve servir o HTML do site`);
    assert.match(response.headers.get("content-type") ?? "", /text\/html/);
    assert.ok(html.includes(`<title>${itcontTitle}</title>`), `título ITCONT ausente em ${route}`);
    assert.ok(html.includes(`href="https://${canonicalHost}/"`), `canonical ITCONT incorreto em ${route}`);
    assert.ok(html.includes(`property="og:url" content="https://${canonicalHost}/"`), `og:url ITCONT incorreto em ${route}`);
    assert.ok(html.includes(`property="og:image" content="https://${canonicalHost}/itcont-event-logo.png"`));
    assert.equal(response.headers.get("permissions-policy"), "camera=(), geolocation=(), microphone=(), payment=()");
    for (const [name, expected] of commonHeaders) {
      assert.equal(response.headers.get(name), expected, `header ${name} ausente ou incorreto em ${route}`);
    }
    const csp = response.headers.get(expectedCspHeader);
    assert.ok(csp, `${expectedCspHeader} ausente em ${route}`);
    assert.equal(response.headers.get(otherCspHeader), null, `${otherCspHeader} não deve estar ativo em ${route}`);
    assert.match(csp, /frame-ancestors 'self'/);
    assert.match(csp, /worker-src 'self' blob:/);
    assert.match(csp, /https:\/\/gibs\.earthdata\.nasa\.gov/);
  }

  for (const route of ["/icaro", "/overview", "/analysis", "/stage"]) {
    const response = await fetch(`${origin}${route}`);
    const html = await response.text();
    assert.equal(response.status, 200, `GET ${route} deve servir o HTML do Ícaro`);
    assert.ok(html.includes(`<title>${icaroTitle}</title>`), `título Ícaro ausente em ${route}`);
    assert.ok(html.includes(`href="https://${canonicalHost}${route}"`), `canonical Ícaro incorreto em ${route}`);
    assert.ok(html.includes(`property="og:image" content="https://${canonicalHost}/favicon-icaro-180.png"`));
    assert.equal(
      response.headers.get("permissions-policy"),
      "camera=(), geolocation=(self), microphone=(self), payment=()",
      `microfone ou geolocalização bloqueados em ${route}`,
    );
    for (const [name, expected] of commonHeaders) {
      assert.equal(response.headers.get(name), expected, `header ${name} ausente ou incorreto em ${route}`);
    }
    const csp = response.headers.get(expectedCspHeader);
    assert.ok(csp, `${expectedCspHeader} ausente em ${route}`);
    assert.equal(response.headers.get(otherCspHeader), null, `${otherCspHeader} não deve estar ativo em ${route}`);
    assert.match(csp, /worker-src 'self' blob:/);
    assert.match(csp, /script-src[^;]*https:\/\/open\.spotify\.com/);
    assert.match(csp, /connect-src[^;]*https:\/\/photon\.komoot\.io/);
    assert.match(csp, /connect-src[^;]*https:\/\/server\.arcgisonline\.com/);
    assert.match(csp, /frame-src[^;]*https:\/\/www\.google\.com/);
  }

  const legacyHost = `${["icaro", "0q50"].join("-")}.onrender.com`;
  const legacyRoute = "/icaro/overview?view=summary&tab=map";
  const legacyRedirect = await requestWithHost(legacyRoute, legacyHost);
  assert.equal(legacyRedirect.statusCode, 301, "host legado deve redirecionar com 301");
  assert.equal(
    legacyRedirect.headers.location,
    `https://${canonicalHost}${legacyRoute}`,
    "redirecionamento deve preservar caminho e query",
  );

  const legacyHealth = await requestWithHost("/api/healthz?probe=1", legacyHost);
  assert.equal(legacyHealth.statusCode, 200, "healthz deve permanecer acessível no host legado");

  for (const host of ["localhost", "127.0.0.1", "preview.replit.dev", "preview.replit.app"]) {
    const response = await requestWithHost("/icaro", host);
    assert.equal(response.statusCode, 200, `${host} não deve ser redirecionado`);
    assert.equal(response.headers.location, undefined);
  }

  const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const skippedDirectories = new Set([
    ".git", ".local", ".agents", "node_modules", "dist", "build", "coverage",
    "generated-artifacts", "attached_assets", ".pnpm-store",
  ]);
  const forbiddenHost = `${["icaro", "0q50"].join("-")}.onrender.com`;
  const legacyReferences: Array<{ file: string; line: number; allowed: boolean }> = [];
  const scanTextFiles = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && skippedDirectories.has(entry.name)) continue;
      const filePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await scanTextFiles(filePath);
        continue;
      }
      if (!entry.isFile()) continue;
      const content = await readFile(filePath);
      if (content.includes(0)) continue;
      const text = content.toString("utf8");
      text.split(/\r?\n/).forEach((line, index) => {
        if (!line.includes(forbiddenHost)) return;
        const relativeFile = path.relative(workspaceRoot, filePath).split(path.sep).join("/");
        const allowed = relativeFile === "artifacts/api-server/src/app.ts"
          && /^\s*const LEGACY_HOSTS\s*=\s*new Set\(\["[^"]+"\]\);$/.test(line);
        legacyReferences.push({ file: relativeFile, line: index + 1, allowed });
      });
    }
  };
  await scanTextFiles(workspaceRoot);
  assert.deepEqual(
    legacyReferences.filter((reference) => !reference.allowed),
    [],
    "o domínio legado só pode aparecer na lista LEGACY_HOSTS",
  );
  assert.equal(legacyReferences.filter((reference) => reference.allowed).length, 1);

  console.log(
    `Domain and security validation: canonical redirect, route titles, CSP and permissions verified (${reportOnly ? "Report-Only" : "CSP efetiva"}).`,
  );
} finally {
  await new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => error ? rejectClose(error) : resolveClose());
  });
  if (previousStaticDir === undefined) delete process.env.STATIC_DIR;
  else process.env.STATIC_DIR = previousStaticDir;
  await rm(staticDir, { recursive: true, force: true });
}
