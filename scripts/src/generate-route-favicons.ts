import assert from "node:assert/strict";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const publicDir = path.join(workspaceRoot, "artifacts/icaro/public");
const itcontLogoPath = path.join(publicDir, "itcont-event-logo.png");
const icaroPortraitPath = path.join(publicDir, "avatar-portrait/base.jpg");
const sizes = [16, 32, 48, 180] as const;
const background = "#06122e";

const [logoMetadata, portraitMetadata] = await Promise.all([
  sharp(itcontLogoPath).metadata(),
  sharp(icaroPortraitPath).metadata(),
]);
assert.ok(logoMetadata.width && logoMetadata.width >= 68 && logoMetadata.height && logoMetadata.height >= 150,
  "a logo completa do ITCONT deve ter pelo menos 68×150 px");
assert.ok(portraitMetadata.width && portraitMetadata.width >= 480 && portraitMetadata.height && portraitMetadata.height >= 480,
  "o retrato-base do Ícaro deve ter pelo menos 480×480 px");

await mkdir(publicDir, { recursive: true });
await Promise.all(
  ["itcont", "icaro"].map((route) => rm(path.join(publicDir, `favicon-${route}-192.png`), { force: true })),
);

// The leftmost 68×150px isolate the blue 3D “I” from the official event lockup and its lower rule.
const itcontMark = await sharp(itcontLogoPath)
  .extract({ left: 0, top: 0, width: 68, height: 150 })
  .png()
  .toBuffer();

const portraitCanvasSize = 512;
const portraitRadius = 228;
const ringRadius = 234;
const portraitMask = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${portraitCanvasSize}" height="${portraitCanvasSize}"><circle cx="256" cy="256" r="${portraitRadius}" fill="#fff"/></svg>`,
);
const cyanRing = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${portraitCanvasSize}" height="${portraitCanvasSize}"><circle cx="256" cy="256" r="${ringRadius}" fill="none" stroke="#55e8ff" stroke-width="12"/></svg>`,
);
const portraitSquare = await sharp(icaroPortraitPath)
  .rotate()
  .resize(portraitCanvasSize, portraitCanvasSize, { fit: "cover", position: "centre" })
  .png()
  .toBuffer();
const circularPortrait = await sharp(portraitSquare)
  .composite([{ input: portraitMask, blend: "dest-in" }])
  .png()
  .toBuffer();
const icaroMaster = await sharp({
  create: {
    width: portraitCanvasSize,
    height: portraitCanvasSize,
    channels: 4,
    background,
  },
})
  .composite([{ input: circularPortrait }, { input: cyanRing }])
  .png()
  .toBuffer();

for (const size of sizes) {
  const markHeight = Math.min(150, Math.floor(size * 0.88));
  const markWidth = Math.max(1, Math.round((68 * markHeight) / 150));
  const resizedMark = await sharp(itcontMark)
    .resize(markWidth, markHeight, { kernel: "lanczos3" })
    .png()
    .toBuffer();
  const itcontIcon = await sharp({
    create: { width: size, height: size, channels: 4, background },
  })
    .composite([{
      input: resizedMark,
      left: Math.floor((size - markWidth) / 2),
      top: Math.floor((size - markHeight) / 2),
    }])
    .png({ compressionLevel: 9 })
    .toBuffer();

  await Promise.all([
    sharp(itcontIcon).png({ compressionLevel: 9 }).toFile(path.join(publicDir, `favicon-itcont-${size}.png`)),
    sharp(icaroMaster)
      .resize(size, size, { kernel: "lanczos3" })
      .png({ compressionLevel: 9 })
      .toFile(path.join(publicDir, `favicon-icaro-${size}.png`)),
  ]);
}

console.log(`Generated ${sizes.length * 2} route-specific PNG icons in ${publicDir}.`);
