import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildItcontJsonLdHtml,
  buildItcontPrerenderHtml,
  buildItcontSitemapXml,
  GOOGLE_SITE_VERIFICATION_CONTENT,
  GOOGLE_SITE_VERIFICATION_FILE,
} from "../artifacts/icaro/src/itcont/seo-static";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = resolve(workspaceRoot, "artifacts/icaro/dist/public");
const indexPath = resolve(publicDir, "index.html");
const html = await readFile(indexPath, "utf8");
const root = '<div id="root"></div>';
const rootIndex = html.indexOf(root);
assert.notEqual(rootIndex, -1, "Vite output did not contain the empty app root.");
assert.equal(html.indexOf(root, rootIndex + root.length), -1, "Expected one app root in the built HTML.");
assert.ok(!html.includes("class=\"itcont-jsonld\""), "JSON-LD already exists in the Vite output.");

const withPrerender = html.replace(root, `<div id="root">${buildItcontPrerenderHtml()}</div>`);
const headEnd = withPrerender.indexOf("</head>");
assert.notEqual(headEnd, -1, "Built HTML is missing </head>.");
const withSchemas = `${withPrerender.slice(0, headEnd)}${buildItcontJsonLdHtml()}\n${withPrerender.slice(headEnd)}`;
await writeFile(indexPath, withSchemas, "utf8");
await writeFile(resolve(publicDir, "sitemap.xml"), buildItcontSitemapXml(), "utf8");
await writeFile(
  resolve(publicDir, GOOGLE_SITE_VERIFICATION_FILE),
  GOOGLE_SITE_VERIFICATION_CONTENT,
  "utf8",
);

console.log("ITCONT static HTML, five JSON-LD schemas, sitemap lastmod, and exact Google verification file generated.");
