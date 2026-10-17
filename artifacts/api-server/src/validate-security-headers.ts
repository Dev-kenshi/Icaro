import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { once } from "node:events";
import os from "node:os";
import path from "node:path";

const staticDir = await mkdtemp(path.join(os.tmpdir(), "itcont-security-headers-"));
const previousStaticDir = process.env.STATIC_DIR;
process.env.STATIC_DIR = staticDir;
await writeFile(path.join(staticDir, "index.html"), "<!doctype html><title>header check</title>");

const { default: app } = await import("./app");
const server = app.listen(0, "127.0.0.1");

try {
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string", "servidor não abriu uma porta TCP");

  const origin = `http://127.0.0.1:${address.port}`;
  const requiredHeaders: Array<[string, string]> = [
    ["strict-transport-security", "max-age=31536000; includeSubDomains"],
    ["x-content-type-options", "nosniff"],
    ["referrer-policy", "strict-origin-when-cross-origin"],
    ["x-frame-options", "SAMEORIGIN"],
    ["permissions-policy", "camera=(), geolocation=(), microphone=(), payment=()"],
  ];
  const reportOnly = process.env.CSP_REPORT_ONLY === "1";
  const expectedCspHeader = reportOnly
    ? "content-security-policy-report-only"
    : "content-security-policy";
  const otherCspHeader = reportOnly
    ? "content-security-policy"
    : "content-security-policy-report-only";
  for (const route of ["/", "/itcont"]) {
    const response = await fetch(`${origin}${route}`);
    const html = await response.text();
    assert.equal(response.status, 200, `GET ${route} deve servir o HTML do site`);
    assert.match(response.headers.get("content-type") ?? "", /text\/html/);
    assert.match(html, /header check/);
    for (const [name, expected] of requiredHeaders) {
      assert.equal(response.headers.get(name), expected, `header ${name} ausente ou incorreto em ${route}`);
    }
    const csp = response.headers.get(expectedCspHeader);
    assert.ok(csp, `${expectedCspHeader} ausente em ${route}`);
    assert.equal(response.headers.get(otherCspHeader), null, `${otherCspHeader} não deve estar ativo em ${route}`);
    assert.match(csp, /frame-ancestors 'self'/);
    assert.match(csp, /worker-src 'self' blob:/);
  }

  const stage = await fetch(`${origin}/stage`);
  assert.equal(stage.status, 200, "GET /stage deve continuar servindo o HTML");
  assert.equal(stage.headers.get("permissions-policy"), null, "Permissions-Policy não deve bloquear a geolocalização no Stage");
  assert.equal(stage.headers.get("content-security-policy"), null, "CSP pública do ITCONT não deve ser aplicada ao Stage");
  assert.equal(stage.headers.get("content-security-policy-report-only"), null);
  console.log(`Security headers: / e /itcont protegidos, /stage inalterado (${reportOnly ? "Report-Only" : "CSP efetiva"})`);
} finally {
  await new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => error ? rejectClose(error) : resolveClose());
  });
  if (previousStaticDir === undefined) delete process.env.STATIC_DIR;
  else process.env.STATIC_DIR = previousStaticDir;
  await rm(staticDir, { recursive: true, force: true });
}
