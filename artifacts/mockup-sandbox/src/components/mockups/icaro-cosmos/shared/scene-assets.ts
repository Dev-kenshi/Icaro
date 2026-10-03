type ThreeModule = typeof import('three');

const WMS_ROOT = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi';
const PLANET_COLORS = ['#82786d', '#c99c68', '#2879a0', '#ad5b49', '#d5b477', '#c7ad86', '#6ea7bd', '#30628e'];

export const NASA_EARTH_MAPS = {
  day: wmsUrl('BlueMarble_NextGeneration', 'image/jpeg'),
  night: wmsUrl('VIIRS_Black_Marble', 'image/jpeg'),
  clouds: wmsUrl('MODIS_Terra_Cloud_Fraction_Day', 'image/png'),
};

export const SOLAR_SYSTEM_SCOPE_TEXTURES = [
  'https://www.solarsystemscope.com/textures/download/2k_mercury.jpg',
  'https://www.solarsystemscope.com/textures/download/2k_venus_surface.jpg',
  'https://www.solarsystemscope.com/textures/download/2k_earth_daymap.jpg',
  'https://www.solarsystemscope.com/textures/download/2k_mars.jpg',
  'https://www.solarsystemscope.com/textures/download/2k_jupiter.jpg',
  'https://www.solarsystemscope.com/textures/download/2k_saturn.jpg',
  'https://www.solarsystemscope.com/textures/download/2k_uranus.jpg',
  'https://www.solarsystemscope.com/textures/download/2k_neptune.jpg',
] as const;

function wmsUrl(layer: string, format: string) {
  const params = new URLSearchParams({
    SERVICE: 'WMS',
    VERSION: '1.1.1',
    REQUEST: 'GetMap',
    LAYERS: layer,
    STYLES: '',
    SRS: 'EPSG:4326',
    BBOX: '-180,-90,180,90',
    WIDTH: '1024',
    HEIGHT: '512',
    FORMAT: format,
  });
  return `${WMS_ROOT}?${params}`;
}

function makeTexture(THREE: ThreeModule, draw: (context: CanvasRenderingContext2D, width: number, height: number) => void) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas texture context is unavailable');
  draw(context, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 2;
  return texture;
}

function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function drawMapPolygon(context: CanvasRenderingContext2D, width: number, height: number, points: number[][]) {
  context.beginPath();
  points.forEach(([x, y], index) => {
    if (index === 0) context.moveTo(x * width, y * height);
    else context.lineTo(x * width, y * height);
  });
  context.closePath();
  context.fill();
}

export function createPlanetFallbackTexture(THREE: ThreeModule, index: number) {
  return makeTexture(THREE, (context, width, height) => {
    const random = seededRandom(index + 51);
    const base = PLANET_COLORS[index] ?? '#8296a5';
    context.fillStyle = base;
    context.fillRect(0, 0, width, height);

    if (index === 2) {
      context.fillStyle = '#24724f';
      [
        [[.08,.28],[.16,.20],[.23,.24],[.27,.32],[.24,.42],[.19,.47],[.16,.58],[.12,.52],[.10,.40]],
        [[.27,.49],[.34,.53],[.37,.64],[.34,.78],[.30,.90],[.27,.76],[.25,.61]],
        [[.43,.30],[.50,.27],[.55,.31],[.57,.38],[.53,.43],[.51,.56],[.48,.67],[.44,.58],[.45,.45]],
        [[.53,.27],[.63,.22],[.73,.27],[.80,.35],[.76,.43],[.69,.44],[.64,.51],[.58,.45],[.55,.36]],
        [[.72,.59],[.78,.57],[.82,.62],[.80,.72],[.76,.78],[.72,.71]],
      ].forEach((polygon) => drawMapPolygon(context, width, height, polygon));
      context.fillStyle = 'rgba(239,245,235,.48)';
      context.fillRect(0, 0, width, 24);
      context.fillRect(0, height - 22, width, 22);
      context.fillStyle = 'rgba(201,234,238,.35)';
      for (let i = 0; i < 90; i++) {
        const x = random() * width, y = random() * height;
        context.beginPath();
        context.ellipse(x, y, 15 + random() * 32, 2 + random() * 5, random() * Math.PI, 0, Math.PI * 2);
        context.fill();
      }
      return;
    }

    if (index >= 4) {
      const bandColors = index === 4
        ? ['#d9bb82', '#b97855', '#e7cd98', '#bf8662', '#e2c78f']
        : ['#e4d3af', '#a98f70', '#d8c8aa', '#8b847a', '#e9d8b9'];
      for (let y = 0; y < height; y += 18 + index) {
        context.fillStyle = bandColors[Math.floor(random() * bandColors.length)];
        context.fillRect(0, y, width, 10 + random() * 16);
      }
      context.strokeStyle = 'rgba(255,244,220,.16)';
      context.lineWidth = 2;
      for (let band = 0; band < 28; band++) {
        const y = random() * height;
        context.beginPath();
        context.moveTo(0, y);
        context.bezierCurveTo(width * .3, y + 15, width * .68, y - 12, width, y + 7);
        context.stroke();
      }
      if (index === 4) {
        context.fillStyle = '#a95f48';
        context.beginPath(); context.ellipse(width * .73, height * .61, 42, 22, -.12, 0, Math.PI * 2); context.fill();
      }
      return;
    }

    context.strokeStyle = 'rgba(238,222,195,.38)';
    for (let crater = 0; crater < 180; crater++) {
      const x = random() * width, y = random() * height, radius = 2 + random() * (index === 0 ? 21 : 13);
      context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.stroke();
      context.fillStyle = 'rgba(20,15,12,.12)';
      context.beginPath(); context.arc(x + radius * .18, y + radius * .16, radius * .72, 0, Math.PI * 2); context.fill();
    }
    context.fillStyle = 'rgba(255,231,190,.12)';
    for (let band = 0; band < 16; band++) {
      const y = random() * height;
      context.fillRect(0, y, width, 1 + random() * 3);
    }
  });
}

export function createEarthFallbackMaps(THREE: ThreeModule) {
  const day = createPlanetFallbackTexture(THREE, 2);
  const night = makeTexture(THREE, (context, width, height) => {
    context.fillStyle = '#020712';
    context.fillRect(0, 0, width, height);
    const cities = [[.17,.30],[.24,.38],[.31,.33],[.48,.34],[.51,.41],[.57,.38],[.65,.34],[.73,.39],[.79,.52],[.29,.62],[.53,.62],[.76,.68]];
    cities.forEach(([x, y]) => {
      const glow = context.createRadialGradient(x * width, y * height, 1, x * width, y * height, 38);
      glow.addColorStop(0, 'rgba(255,196,106,.95)');
      glow.addColorStop(1, 'rgba(255,157,71,0)');
      context.fillStyle = glow;
      context.fillRect(x * width - 40, y * height - 40, 80, 80);
    });
  });
  const clouds = makeTexture(THREE, (context, width, height) => {
    context.clearRect(0, 0, width, height);
    const random = seededRandom(903);
    context.fillStyle = 'rgba(255,255,255,.52)';
    for (let i = 0; i < 140; i++) {
      const x = random() * width, y = random() * height;
      context.beginPath();
      context.ellipse(x, y, 8 + random() * 30, 2 + random() * 8, random() * Math.PI, 0, Math.PI * 2);
      context.fill();
    }
  });
  return { day, night, clouds };
}

export function createCloudMaskTexture(THREE: ThreeModule, image: HTMLImageElement) {
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Cloud mask canvas context is unavailable');
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let index = 0; index < pixels.data.length; index += 4) {
    const luminance = pixels.data[index] * .2126 + pixels.data[index + 1] * .7152 + pixels.data[index + 2] * .0722;
    const alpha = pixels.data[index + 3] / 255;
    const mask = smoothstep(36, 176, luminance) * alpha;
    pixels.data[index] = pixels.data[index + 1] = pixels.data[index + 2] = Math.round(mask * 255);
    pixels.data[index + 3] = 255;
  }
  context.putImageData(pixels, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.anisotropy = 2;
  return texture;
}

export function subsolarDirection(date: Date): [number, number, number] {
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  const dayOfYear = (Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - yearStart) / 86_400_000 + 1;
  const minutes = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
  const gamma = 2 * Math.PI / 365 * (dayOfYear - 1 + (minutes / 60 - 12) / 24);
  const equationOfTime = 229.18 * (
    .000075 + .001868 * Math.cos(gamma) - .032077 * Math.sin(gamma)
    - .014615 * Math.cos(2 * gamma) - .040849 * Math.sin(2 * gamma)
  );
  const declination = .006918 - .399912 * Math.cos(gamma) + .070257 * Math.sin(gamma)
    - .006758 * Math.cos(2 * gamma) + .000907 * Math.sin(2 * gamma)
    - .002697 * Math.cos(3 * gamma) + .00148 * Math.sin(3 * gamma);
  const longitude = ((720 - minutes - equationOfTime) / 4) * Math.PI / 180;
  return [Math.cos(declination) * Math.cos(longitude), Math.sin(declination), -Math.cos(declination) * Math.sin(longitude)];
}

export type EarthImages = {
  day: HTMLImageElement | null;
  night: HTMLImageElement | null;
  clouds: HTMLImageElement | null;
};

function getImagePixels(image: HTMLImageElement | null): ImageData | null {
  if (!image?.complete || !image.naturalWidth || !image.naturalHeight) return null;
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.drawImage(image, 0, 0);
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function createProjectedEarth(size: number, images: EarthImages, date = new Date()): HTMLCanvasElement | null {
  try {
    const day = getImagePixels(images.day);
    const night = getImagePixels(images.night);
    if (!day || !night) return null;
    const clouds = getImagePixels(images.clouds);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) return null;
    const output = context.createImageData(size, size);
    const sun = subsolarDirection(date);
    const half = size / 2;
    const sample = (data: ImageData, u: number, v: number) => {
      const x = Math.min(data.width - 1, Math.max(0, Math.floor(u * data.width)));
      const y = Math.min(data.height - 1, Math.max(0, Math.floor(v * data.height)));
      const index = (y * data.width + x) * 4;
      return [data.data[index], data.data[index + 1], data.data[index + 2], data.data[index + 3]];
    };
    for (let py = 0; py < size; py++) {
      const y = (half - py) / half;
      for (let px = 0; px < size; px++) {
        const x = (px - half) / half;
        const radiusSquared = x * x + y * y;
        if (radiusSquared > 1) continue;
        const z = Math.sqrt(1 - radiusSquared);
        const longitude = Math.atan2(-z, x);
        const latitude = Math.asin(y);
        const u = (longitude / (Math.PI * 2) + .5 + 1) % 1;
        const v = .5 - latitude / Math.PI;
        const illumination = x * sun[0] + y * sun[1] + z * sun[2];
        const dayWeight = smoothstep(-.12, .08, illumination);
        const dayColor = sample(day, u, v);
        const nightColor = sample(night, u, v);
        const pixel = (py * size + px) * 4;
        let r = nightColor[0] * (1 - dayWeight) + dayColor[0] * dayWeight;
        let g = nightColor[1] * (1 - dayWeight) + dayColor[1] * dayWeight;
        let b = nightColor[2] * (1 - dayWeight) + dayColor[2] * dayWeight;
        if (clouds && dayWeight > .01) {
          const cloud = sample(clouds, u, v);
          const luminance = cloud[0] * .2126 + cloud[1] * .7152 + cloud[2] * .0722;
          const cloudMask = smoothstep(36, 176, luminance) * (cloud[3] / 255) * dayWeight * .28;
          r = r * (1 - cloudMask) + 235 * cloudMask;
          g = g * (1 - cloudMask) + 246 * cloudMask;
          b = b * (1 - cloudMask) + 255 * cloudMask;
        }
        output.data[pixel] = r;
        output.data[pixel + 1] = g;
        output.data[pixel + 2] = b;
        output.data[pixel + 3] = Math.round(255 * smoothstep(0, .035, 1 - radiusSquared));
      }
    }
    context.putImageData(output, 0, 0);
    return canvas;
  } catch {
    return null;
  }
}