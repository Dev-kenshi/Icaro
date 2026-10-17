import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const logoPath = join(root, "artifacts/icaro/public/itcont-event-logo.png");
const outputPath = join(root, "artifacts/icaro/public/og-itcont.png");
const logoData = (await readFile(logoPath)).toString("base64");
const markup = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><style>
*{box-sizing:border-box}
html,body{width:1200px;height:630px;margin:0;overflow:hidden}
body{font-family:Arial,Helvetica,sans-serif;color:#eff7ff}
main{position:relative;width:1200px;height:630px;overflow:hidden;padding:56px 72px;background:radial-gradient(ellipse at 79% 35%,rgba(23,132,196,.28),transparent 35%),radial-gradient(ellipse at 15% 95%,rgba(31,89,170,.25),transparent 45%),#081a44}
main:before,main:after{position:absolute;content:"";pointer-events:none}
main:before{inset:24px;border:1px solid rgba(137,206,242,.42);border-radius:24px}
main:after{width:570px;height:570px;right:-90px;top:-72px;border:1px solid rgba(140,206,240,.18);border-radius:50%;box-shadow:0 0 0 34px rgba(82,161,214,.04),0 0 0 74px rgba(82,161,214,.035),0 0 0 116px rgba(82,161,214,.025)}
.layout{position:relative;z-index:1;display:grid;grid-template-columns:690px 1fr;align-items:center;gap:32px;height:100%}
.eyebrow{margin:0 0 16px;color:#b4e6fb;font-size:19px;font-weight:700;letter-spacing:3px;text-transform:uppercase}
.logo{display:block;width:355px;height:auto;object-fit:contain;margin:0 0 12px}
h1{margin:4px 0 12px;font-size:46px;line-height:1.04;letter-spacing:-1.4px;font-weight:800;text-transform:uppercase}
h1 span{display:block;color:#86d8f6}
.edition{margin:0 0 25px;color:#d6eaf7;font-size:24px;font-weight:700;letter-spacing:2px}
.date{display:flex;align-items:baseline;gap:14px;margin:0 0 13px}
.date strong{font-size:45px;letter-spacing:-1px}
.date span{color:#9cd9f4;font-size:19px;font-weight:700;letter-spacing:2px}
.place{margin:0;color:#d3e4ef;font-size:20px}
.free{display:inline-flex;align-items:center;min-height:42px;margin-top:22px;padding:0 20px;border:1px solid #7ec9ec;border-radius:22px;background:#126fa0;color:#fff;font-size:17px;font-weight:700;letter-spacing:.4px}
.right{align-self:stretch;display:flex;flex-direction:column;align-items:center;justify-content:center;padding-top:22px;text-align:center}
.globe{position:relative;width:250px;height:250px;border-radius:50%;background:radial-gradient(circle at 33% 25%,#d1f1ff 0,#63c4ed 15%,#237eb9 45%,#124b89 70%,#092b62 100%);box-shadow:inset -25px -20px 48px rgba(2,14,45,.6),0 0 42px rgba(53,167,222,.27)}
.globe:before{position:absolute;content:"";inset:23px 40px;border:1px solid rgba(207,241,255,.58);border-radius:50%;transform:rotate(-24deg)}
.globe:after{position:absolute;content:"";left:17px;right:17px;top:103px;height:40px;border-top:1px solid rgba(207,241,255,.62);border-bottom:1px solid rgba(207,241,255,.45);border-radius:50%;transform:rotate(-20deg)}
.motto{max-width:300px;margin:28px 0 0;color:#bfe7fa;font-size:15px;font-weight:700;line-height:1.7;letter-spacing:2px}
.footer{position:absolute;z-index:2;right:78px;bottom:47px;color:#aedff5;font-size:14px;font-weight:700;letter-spacing:1px}
</style></head><body><main><div class="layout"><section><p class="eyebrow">Universidade Estadual de Feira de Santana</p><img class="logo" src="data:image/png;base64,${logoData}" alt=""><h1>Imersão Tecnológica <span>Contábil</span></h1><p class="edition">ITCONT 2026</p><p class="date"><strong>21 e 22</strong><span>OUTUBRO DE 2026</span></p><p class="place">Auditório III do Módulo IV, UEFS, Feira de Santana, BA</p><span class="free">Inscrição gratuita</span></section><aside class="right"><div class="globe"></div><p class="motto">INOVAÇÃO<br>PRÁTICA<br>CONEXÕES</p></aside></div><div class="footer">CONTABILIDADE, TECNOLOGIA E FUTURO</div></main></body></html>`;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/repl/tools/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(markup, { waitUntil: "load" });
  await page.locator(".logo").evaluate(async (image: HTMLImageElement) => image.decode());
  await page.screenshot({ path: outputPath, type: "png" });
  const png = await readFile(outputPath);
  assert.equal(png.readUInt32BE(16), 1200, "OG image width must be 1200px.");
  assert.equal(png.readUInt32BE(20), 630, "OG image height must be 630px.");
  console.log(`Generated ${outputPath} (${png.length} bytes, 1200×630).`);
} finally {
  await browser.close();
}
