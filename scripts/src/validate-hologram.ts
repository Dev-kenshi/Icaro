/**
 * Valida a integração do avatar canvas do pacote ÍCARO.
 * Os testes são locais, exceto o último, que consulta os assets públicos do app.
 *
 * Uso: pnpm --filter @workspace/scripts run validate:hologram
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

const ROOT = path.resolve(import.meta.dirname, "../../artifacts/icaro");
const PACKAGE = path.resolve(import.meta.dirname, "../../vendor/icaro-humano/avatar");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");
const checks: Array<[string, () => void | Promise<void>]> = [];
const check = (name: string, fn: () => void | Promise<void>) => checks.push([name, fn]);

check("Os avatares compartilham o mesmo palco e mantêm a fala sincronizada", () => {
  const face = read("src/components/stage/holo-face.tsx");
  const stage = read("src/pages/stage.tsx");
  const speech = read("src/lib/speech.ts");
  const css = read("src/pages/stage.css");
  assert.match(face, /<canvas[\s\S]*?data-testid="holo-face-canvas"/);
  assert.match(face, /createHoloAvatar\(canvas\)/);
  assert.match(face, /setSpeechAvatar\(instance\)/);
  assert.match(face, /<HoloPortrait definition=\{definition\} \/>/);
  assert.match(face, /className="face"/);
  assert.match(face, /className="face-orb"/);
  assert.match(stage, /<HoloFace\s+definition=\{avatarById\(avatarId\)\}\s+state=\{state\}\s+getLevel=\{getLevel\}\s+layout=\{avatarLayout\}\s*\/>/);
  assert.match(speech, /new Constructor\(canvas, \{ assets: avatarAssetsUrl\(\) \}\)/);
  assert.match(speech, /await waitForSpeechAvatar\(\)/);
  assert.match(css, /\.holo-avatar__scan/);
  assert.match(css, /\.holo-avatar__sweep/);
  assert.doesNotMatch(face, /<video\b/i);
  assert.doesNotMatch(stage, /holo-talk\.mp4|holo-boot\.mp4|holo-idle\.jpg/i);
  assert.match(stage, /src=\{media\('intro\.mp4'\)\}/);
});

check("Os dois perfis usam a mesma apresentação holográfica e carregam retratos próprios", () => {
  const avatars = read("src/lib/avatars.ts");
  const face = read("src/components/stage/holo-face.tsx");
  assert.match(avatars, /id:\s*'feirense',[\s\S]*?image:\s*'avatars\/feirense-hd\.png'/);
  assert.match(avatars, /id:\s*'classico',[\s\S]*?image:\s*'avatar-portrait\/base\.jpg'/);
  assert.ok(existsSync(path.join(ROOT, "public/avatar-portrait/base.jpg")), "retrato clássico ausente");
  assert.match(face, /<HoloPortrait definition=\{definition\} \/>/);
});

check("Retrato acompanha a abertura da boca sincronizada pelo motor de fala", () => {
  const face = read("src/components/stage/holo-face.tsx");
  const avatar = read("src/lib/icaro-avatar.ts");
  const speech = read("src/lib/speech.ts");
  const engine = read("public/avatar/avatar-engine.js");
  const css = read("src/pages/stage.css");
  const portrait = read("src/components/stage/holo-portrait.tsx");
  assert.match(avatar, /mouth:\s*\{\s*open:\s*\{\s*x:\s*number\s*\}\s*\}/);
  assert.match(speech, /mouth:\s*actual\.mouth/);
  assert.match(engine, /this\.mouth\.open\.x/);
  assert.match(face, /currentState === 'talking'[\s\S]*?avatarRef\.current\?\.mouth\.open\.x/);
  assert.match(face, /setProperty\('--talk',\s*mouthOpen\.toFixed\(3\)\)/);
  assert.match(css, /\.holo-avatar__jaw\s*\{[\s\S]*?translateY\(calc\(var\(--talk,0\)\*12px\)\)/);
  assert.match(css, /scaleY\(calc\(1 \+ var\(--talk,0\)\*\.55\)\)/);
  assert.match(portrait, /definition\.id === 'classico'[\s\S]*?holo-avatar__mouth-opening/);
  assert.match(css, /\.stage \.face\[data-avatar-id="classico"\]\s+\.holo-avatar__jaw \{ display:none;\s*\}/);
  assert.match(css, /\.holo-avatar__mouth-opening\s*\{[\s\S]*?top:68\.7%[\s\S]*?opacity:var\(--talk,0\)[\s\S]*?scaleY\(var\(--talk,0\)\)/);
});

check("Assets do pacote permanecem originais fora das extensões de expressão e fala do P10", () => {
  const packageFiles = (dir: string): string[] => readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => entry.isDirectory()
      ? packageFiles(path.join(dir, entry.name)).map((f) => path.join(entry.name, f))
      : [entry.name])
    .sort();
  const deployedFiles = packageFiles(path.join(ROOT, "public/avatar"));
  assert.deepEqual(deployedFiles, packageFiles(PACKAGE), "arquivos do pacote publicado divergiram");
  const p10Extensions = new Set(["avatar-engine.js", "speech-player.js"]);
  for (const rel of deployedFiles) {
    if (p10Extensions.has(rel)) continue;
    assert.deepEqual(
      readFileSync(path.join(ROOT, "public/avatar", rel)),
      readFileSync(path.join(PACKAGE, rel)),
      `${rel} difere do vendor`,
    );
  }
  const engine = read("public/avatar/avatar-engine.js");
  assert.match(engine, /setEmotion\(/);
  assert.match(engine, /setListeningActivity\(/);
  assert.match(engine, /smileTarget/);
  const player = read("public/avatar/speech-player.js");
  assert.match(player, /emotion/);
  assert.match(player, /gapAfter/);
  assert.match(player, /playbackRate/);
});

check("Motor do avatar fecha a boca quando a voz está em silêncio", () => {
  const source = readFileSync(path.join(ROOT, "public/avatar/avatar-engine.js"), "utf8");
  const context = {
    self: { IcaroVisemes: { sample: () => ({ open: 0.7, width: 0.5, press: false }) } },
    window: { devicePixelRatio: 1 },
    performance: { now: () => 1000 },
    requestAnimationFrame: () => 0,
    Image: class {},
    document: {},
    Math,
    Set,
    Object,
    Promise,
    fetch: () => { throw new Error("unexpected asset request"); },
  };
  vm.runInNewContext(source, context);
  const proto = (context.self as unknown as { IcaroAvatar: { prototype: { _mouthTarget: (now: number) => { open: number } } } }).IcaroAvatar.prototype;
  const target = proto._mouthTarget.call({
    state: "speaking",
    tl: { emphasis: [] },
    clock: () => 0.4,
    neutralWidth: 0.45,
    useLevelGate: true,
    level: 0,
    levelAt: 900,
    _silentSince: 700,
    _t: () => 1000,
  }, 1000);
  assert.equal(target.open, 0, "silêncio real deve fechar a boca mesmo no estado speaking");
});

check("Player integra frases, prefetch, relógio de áudio, timestamps e interrupção", () => {
  const player = read("public/avatar/speech-player.js");
  const visemes = read("public/avatar/visemes-ptbr.js");
  assert.match(player, /splitSentences/);
  assert.match(player, /prefetch:\s*2/);
  assert.match(player, /normalized_alignment/);
  assert.match(player, /ctx\.currentTime\s*-\s*start/);
  assert.match(visemes, /character_start_times_seconds/);
  assert.match(player, /this\.avatar\.speak\(d\.tl,\s*clock\)/);
  assert.match(player, /this\.o\.onWord/);
  assert.match(player, /new AbortController\(\)/);
  assert.match(player, /for \(const a of this\.aborts\) a\.abort\(\)/);
  assert.match(player, /s\.stop\(\)/);
  assert.match(player, /async _fallback/);
  assert.match(player, /this\.o\.fallback\(text,\s*emotion\)/);
  assert.match(visemes, /function splitSentences/);
});

check("Canvas mantém o rosto responsivo em tamanhos menores e permite movimento zero", () => {
  const face = read("src/components/stage/holo-face.tsx");
  const engine = read("public/avatar/avatar-engine.js");
  const css = read("src/pages/stage.css");
  assert.match(face, /className="icaro-face"/);
  assert.match(face, /data-testid="holo-face-orb"/);
  assert.match(css, /width:min\(100cqh,100cqw,500px\)/);
  assert.match(css, /height:min\(100cqh,100cqw,500px\)/);
  assert.match(css, /border-radius:50%/);
  assert.match(css, /container-type:size/);
  assert.match(css, /mask-image:none/);
  assert.match(engine, /motion:\s*1/);
  assert.match(engine, /this\.opts\.motion/);
  assert.match(engine, /Math\.min\(px,\s*s \* 2\)/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /animation:\s*none\s*!important/);
  assert.match(css, /transition:\s*none\s*!important/);
});

check("Retrato expandido preserva posições da boca, dos olhos e os sprites originais", () => {
  const original = JSON.parse(read("public/avatar/assets/atlas.json"));
  const portrait = JSON.parse(read("public/avatar-portrait/atlas.json"));
  assert.equal(portrait.size, original.size + 240);
  for (const feature of ["mouth", "eyes"]) {
    assert.deepEqual(portrait[feature].box, [
      original[feature].box[0] + 120, original[feature].box[1] + 120,
      ...original[feature].box.slice(2),
    ]);
    assert.deepEqual(portrait[feature].frames, original[feature].frames);
    assert.deepEqual(readFileSync(path.join(ROOT, `public/avatar-portrait/${feature}.webp`)),
      readFileSync(path.join(ROOT, `public/avatar/assets/${feature}.webp`)));
  }
  for (const name of Object.keys(original.anchors)) {
    assert.deepEqual(portrait.anchors[name], original.anchors[name].map((n: number) => n + 120));
  }
});

check("AO VIVO: servidor entrega o retrato expandido e atlas com MIME correto", async () => {
  const base = process.env.ICARO_URL
    || `http://localhost:${process.env.ICARO_PORT || 80}`;
  const root = new URL("/avatar-portrait/", base.endsWith("/") ? base : `${base}/`);
  const requests = [
    { file: "atlas.json", type: /application\/json/ },
    { file: "base.jpg", type: /image\/jpeg/ },
    { file: "eyes.webp", type: /image\/webp/ },
    { file: "mouth.webp", type: /image\/webp/ },
  ];
  for (const { file, type } of requests) {
    const response = await fetch(new URL(file, root), { signal: AbortSignal.timeout(20_000) });
    assert.equal(response.status, 200, `${file}: status ${response.status}`);
    assert.match(response.headers.get("content-type") || "", type, `${file}: MIME inesperado`);
    const body = await response.arrayBuffer();
    assert.ok(body.byteLength > 0, `${file} vazio`);
    if (file === "atlas.json") {
      const atlas = JSON.parse(Buffer.from(body).toString("utf8"));
      assert.ok(atlas.mouth?.frames?.length > 0, "atlas sem recortes de boca");
      assert.ok(atlas.eyes?.frames?.length > 0, "atlas sem recortes de olhos");
    }
  }
});

let failed = 0;
for (const [i, [name, fn]] of checks.entries()) {
  const n = String(i + 1).padStart(2, "0");
  try {
    await fn();
    console.log(`✓ ${n}. ${name}`);
  } catch (error) {
    failed++;
    console.log(`✗ ${n}. ${name}\n    ${error instanceof Error ? error.message : String(error)}`);
  }
}
console.log(`\n${checks.length - failed}/${checks.length} validações do avatar passaram.`);
process.exit(failed ? 1 : 0);