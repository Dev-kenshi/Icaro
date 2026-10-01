import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// Reframe, rather than rescale, the original atlas: every old pixel and sprite
// keeps its coordinates relative to the unchanged 720px face at (120, 120).
const root = path.resolve(import.meta.dirname, '../..');
const source = path.join(root, 'artifacts/icaro/public/avatar/assets');
const destination = path.join(root, 'artifacts/icaro/public/avatar-portrait');
const image = process.argv[2];
if (!image) throw new Error('Informe a imagem estendida do retrato como argumento.');
mkdirSync(destination, { recursive: true });

const atlas = JSON.parse(readFileSync(path.join(source, 'atlas.json'), 'utf8'));
const offset = 120;
if (atlas.size !== 720) throw new Error('O atlas original precisa ter 720px.');
atlas.size += offset * 2;
for (const feature of [atlas.mouth, atlas.eyes]) {
  feature.box[0] += offset;
  feature.box[1] += offset;
}
for (const anchor of Object.values(atlas.anchors) as number[][]) {
  anchor[0] += offset;
  anchor[1] += offset;
}

// Generative outpainting can alter the centre. Composite the original back in,
// preserving the eyes/mouth/face pixels used by the immutable animation atlas.
const render = spawnSync('ffmpeg', [
  '-hide_banner', '-loglevel', 'error',
  '-i', path.resolve(root, image), '-i', path.join(source, 'base.jpg'),
  '-filter_complex',
  '[0:v]scale=960:960:flags=lanczos[extended];[extended][1:v]overlay=120:120:format=auto[out]',
  '-map', '[out]', '-frames:v', '1', '-q:v', '2', '-y', path.join(destination, 'base.jpg'),
], { encoding: 'utf8', timeout: 60_000 });
if (render.status !== 0) throw new Error(render.stderr || 'Não foi possível compor o retrato.');
writeFileSync(path.join(destination, 'atlas.json'), `${JSON.stringify(atlas, null, 2)}\n`);
for (const name of ['mouth.webp', 'eyes.webp']) {
  copyFileSync(path.join(source, name), path.join(destination, name));
}
console.log('Retrato 960px criado; rosto e sprites originais preservados, margem 120px.');