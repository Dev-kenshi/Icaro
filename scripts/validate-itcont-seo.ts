import assert from "node:assert/strict";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  GOOGLE_SITE_VERIFICATION_CONTENT,
  GOOGLE_SITE_VERIFICATION_FILE,
  ITCONT_SEO_DESCRIPTION,
  ITCONT_SEO_TITLE,
  ITCONT_SEO_URL,
} from "../artifacts/icaro/src/itcont/seo-static";
import { ITCONT } from "../artifacts/icaro/src/itcont/dados";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = resolve(workspaceRoot, "artifacts/icaro/dist/public");
const html = await readFile(resolve(publicDir, "index.html"), "utf8");
const sitemapSource = await readFile(resolve(publicDir, "sitemap.xml"), "utf8");
const verificationSource = await readFile(
  resolve(publicDir, GOOGLE_SITE_VERIFICATION_FILE),
  "utf8",
);

assert.ok(ITCONT_SEO_TITLE.length >= 50 && ITCONT_SEO_TITLE.length <= 60);
assert.ok(ITCONT_SEO_DESCRIPTION.length >= 150 && ITCONT_SEO_DESCRIPTION.length <= 160);
assert.match(html, /<main\b[^>]*id="itcont-seo-prerender"/);
assert.match(html, /<h1\b[^>]*>ITCONT 2026: I Imersão Tecnológica Contábil<\/h1>/);
assert.equal([...html.matchAll(/<h1\b/gi)].length, 1, "The prerendered public document must have one H1.");
assert.match(html, /21 de outubro de 2026/);
assert.match(html, /22 de outubro de 2026/);
assert.match(html, /Av\. Transnordestina, s\/n, Novo Horizonte/);
assert.match(html, /Auditório III do Módulo IV da UEFS/);
assert.match(html, /Inscreva-se gratuitamente no Even3/);
assert.ok(ITCONT.convidados.every(({ nome }) => html.includes(nome)));
assert.ok(ITCONT.faq.every(({ p, r }) => html.includes(p) && html.includes(r)));
assert.equal(verificationSource, GOOGLE_SITE_VERIFICATION_CONTENT);

const schemas = [...html.matchAll(/<script type="application\/ld\+json" class="itcont-jsonld">([\s\S]*?)<\/script>/g)]
  .map((match) => JSON.parse(match[1]) as Record<string, any>);
assert.deepEqual(
  schemas.map((schema) => schema["@type"]).sort(),
  ["BreadcrumbList", "Event", "FAQPage", "Organization", "WebSite"].sort(),
);
const event = schemas.find((schema) => schema["@type"] === "Event");
assert.ok(event);
assert.equal(event.startDate, "2026-10-21T19:00:00-03:00");
assert.equal(event.endDate, "2026-10-22T21:30:00-03:00");
assert.equal(event.eventAttendanceMode, "https://schema.org/OfflineEventAttendanceMode");
assert.equal(event.eventStatus, "https://schema.org/EventScheduled");
assert.equal(event.location.address.streetAddress, "Av. Transnordestina, s/n, Novo Horizonte");
assert.equal(event.location.address.addressLocality, "Feira de Santana");
assert.equal(event.location.address.addressRegion, "BA");
assert.equal(event.location.address.postalCode, "44036-900");
assert.equal(event.location.address.addressCountry, "BR");
assert.deepEqual(
  [event.location.geo.latitude, event.location.geo.longitude],
  [-12.19997, -38.97132],
);
assert.equal(event.offers.price, "0");
assert.equal(event.offers.priceCurrency, "BRL");
assert.equal(event.performer.length, ITCONT.convidados.length);
const faqSchema = schemas.find((schema) => schema["@type"] === "FAQPage");
assert.equal(faqSchema?.mainEntity.length, ITCONT.faq.length);
assert.ok(schemas.find((schema) => schema["@type"] === "WebSite"));
assert.ok(schemas.find((schema) => schema["@type"] === "Organization"));
assert.ok(schemas.find((schema) => schema["@type"] === "BreadcrumbList"));
assert.match(sitemapSource, new RegExp(`<loc>${ITCONT_SEO_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}<\\/loc>`));
assert.match(sitemapSource, /<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
assert.doesNotMatch(sitemapSource, /\/(?:icaro|admin)(?:\/|<)/i);

const previousStaticDir = process.env.STATIC_DIR;
const previousCspMode = process.env.CSP_REPORT_ONLY;
process.env.STATIC_DIR = publicDir;
process.env.CSP_REPORT_ONLY = "1";
const { default: app } = await import("../artifacts/api-server/src/app");
const server = app.listen(0, "127.0.0.1");
try {
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  const get = async (path: string) => {
    const response = await fetch(`${origin}${path}`);
    return { response, body: await response.text() };
  };

  const [root, eventRoute, icaro, admin, robots, sitemap, verification] = await Promise.all([
    get("/"),
    get("/itcont"),
    get("/icaro"),
    get("/admin"),
    get("/robots.txt"),
    get("/sitemap.xml"),
    get(`/${GOOGLE_SITE_VERIFICATION_FILE}`),
  ]);
  for (const item of [root, eventRoute, icaro, admin, robots, sitemap, verification]) {
    assert.equal(item.response.status, 200);
  }
  assert.match(root.body, /<h1\b[^>]*>ITCONT 2026: I Imersão Tecnológica Contábil<\/h1>/);
  assert.match(eventRoute.body, /class="itcont-jsonld"/);
  assert.match(root.body, /<link rel="canonical" href="https:\/\/itcont-uefs\.onrender\.com\/"/);
  assert.match(icaro.body, /<meta name="robots" content="noindex, nofollow"/);
  assert.match(admin.body, /<meta name="robots" content="noindex, nofollow"/);
  assert.doesNotMatch(icaro.body, /itcont-seo-prerender|class="itcont-jsonld"/);
  assert.doesNotMatch(admin.body, /itcont-seo-prerender|class="itcont-jsonld"/);
  assert.match(robots.body, /^User-agent: \*/);
  assert.match(robots.body, /^Sitemap: https:\/\/itcont-uefs\.onrender\.com\/sitemap\.xml$/m);
  assert.match(sitemap.body, /<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(sitemap.body, /<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
  assert.doesNotMatch(sitemap.body, /\/(?:icaro|admin)(?:\/|<)/i);
  assert.equal(verification.body, GOOGLE_SITE_VERIFICATION_CONTENT);
  assert.match(verification.response.headers.get("content-type") ?? "", /text\/html/i);
} finally {
  await new Promise<void>((resolveClose, reject) => {
    server.close((error) => error ? reject(error) : resolveClose());
  });
  if (previousStaticDir === undefined) delete process.env.STATIC_DIR;
  else process.env.STATIC_DIR = previousStaticDir;
  if (previousCspMode === undefined) delete process.env.CSP_REPORT_ONLY;
  else process.env.CSP_REPORT_ONLY = previousCspMode;
}

console.log("SEO ITCONT validado: prerender, H1, JSON-LD, sitemap, robots, noindex e verificação Google.");
