import { useEffect, useRef, useState } from 'react';
import type { CosmosFeedsResponse } from '@workspace/api-client-react';
import {
  createCloudMaskTexture,
  createEarthFallbackMaps,
  createPlanetFallbackTexture,
  createProjectedEarth,
  EarthImages,
  NASA_EARTH_MAPS,
  SOLAR_SYSTEM_SCOPE_TEXTURES,
  subsolarDirection,
} from './scene-assets';

export type CosmosScene = 'galaxy' | 'system' | 'earth';
export type CosmosQuality = 'auto' | 'high' | 'medium' | 'low';
type AssetKind = 'earth' | 'solar';
type RendererLike = {
  domElement: HTMLCanvasElement;
  render: (scene: unknown, camera: unknown) => void;
  setPixelRatio: (ratio: number) => void;
  getPixelRatio: () => number;
  setSize: (width: number, height: number) => void;
  setClearColor: (color: number, alpha: number) => void;
  dispose: () => void;
  __scene?: unknown;
  __camera?: unknown;
  __render?: () => void;
  __setScene?: (
    scene: CosmosScene,
    quality: string,
    feeds?: CosmosFeedsResponse,
    city?: boolean,
    state?: string,
    audioLevel?: number,
    now?: number,
  ) => void;
  __animate?: (time: number, audioLevel: number, state: string) => void;
};

type Props = {
  scene: CosmosScene;
  quality: CosmosQuality;
  visible: boolean;
  feeds?: CosmosFeedsResponse;
  targetCity?: boolean;
  state: string;
  getAudioLevel: () => number;
  onFps?: (fps: number) => void;
  onAssetsStatus?: (status: string) => void;
};

const EARTH_RADIUS = 3.2;
const MAX_NEURONS = 560;
const CITY = { latitude: -12.2664, longitude: -38.9663 };
const WARM_WHITE = [1, .94, .78] as const;

function smoothstep(a: number, b: number, value: number) {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function deterministicRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function earthVector(THREE: typeof import('three'), latitude: number, longitude: number, radius: number) {
  const lat = latitude * Math.PI / 180;
  const lon = longitude * Math.PI / 180;
  return new THREE.Vector3(
    radius * Math.cos(lat) * Math.cos(lon),
    radius * Math.sin(lat),
    -radius * Math.cos(lat) * Math.sin(lon),
  );
}

function drawRadialTexture(THREE: typeof import('three')) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d')!;
  const gradient = context.createRadialGradient(128, 128, 2, 128, 128, 128);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(.18, 'rgba(255,232,190,.72)');
  gradient.addColorStop(.48, 'rgba(103,210,255,.23)');
  gradient.addColorStop(1, 'rgba(35,135,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(canvas);
}

function proceduralGalaxy(THREE: typeof import('three'), count: number) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const random = deterministicRandom(711);
  const armCount = 5;
  const colorCore = new THREE.Color('#ffd8aa');
  const colorArm = new THREE.Color('#73d9ef');
  const colorOuter = new THREE.Color('#5268cc');
  for (let i = 0; i < count; i++) {
    const radius = Math.pow(random(), .62) * 5.6;
    const arm = Math.floor(random() * armCount);
    const angle = arm * Math.PI * 2 / armCount + radius * .93 + (random() - .5) * (.18 + radius * .06);
    const thickness = .04 + radius * .025;
    positions[i * 3] = Math.cos(angle) * radius + (random() - .5) * thickness;
    positions[i * 3 + 1] = Math.sin(angle) * radius * .63 + (random() - .5) * thickness;
    positions[i * 3 + 2] = (random() - .5) * (.25 + radius * .12);
    const color = radius < 1.1
      ? colorCore.clone().lerp(colorArm, radius / 1.1)
      : colorArm.clone().lerp(colorOuter, smoothstep(1.1, 5.6, radius));
    const sparkle = .62 + random() * .5;
    colors[i * 3] = color.r * sparkle;
    colors[i * 3 + 1] = color.g * sparkle;
    colors[i * 3 + 2] = color.b * sparkle;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setDrawRange(0, count);
  return new THREE.Points(geometry, new THREE.PointsMaterial({
    size: .032,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: .88,
    depthWrite: false,
  }));
}

function createNeuralSphere(THREE: typeof import('three')) {
  const positions = new Float32Array(MAX_NEURONS * 3);
  const colors = new Float32Array(MAX_NEURONS * 3);
  const random = deterministicRandom(913);
  let count = 0;
  for (let candidate = 0; candidate < 1800 && count < MAX_NEURONS; candidate++) {
    const y = 1 - 2 * (candidate + .5) / 1800;
    const radial = Math.sqrt(Math.max(0, 1 - y * y));
    const angle = candidate * 2.399963229728653;
    const x = Math.cos(angle) * radial;
    const z = Math.sin(angle) * radial;
    const screenRadius = Math.hypot(x, y);
    if (screenRadius < .52) continue;
    const radius = 5.25 + (random() - .5) * .22;
    positions[count * 3] = x * radius;
    positions[count * 3 + 1] = y * radius;
    positions[count * 3 + 2] = z * radius;
    colors[count * 3] = .45;
    colors[count * 3 + 1] = .75;
    colors[count * 3 + 2] = .88;
    count++;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setDrawRange(0, count);
  const points = new THREE.Points(geometry, new THREE.PointsMaterial({
    size: .075,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: .94,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }));

  const edgeVertices: number[] = [];
  const vectorAt = (index: number) => new THREE.Vector3(positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2]);
  for (let i = 0; i < count; i++) {
    const a = vectorAt(i);
    const neighbors: { index: number; distance: number }[] = [];
    for (let j = 0; j < count; j++) {
      if (j === i) continue;
      const b = vectorAt(j);
      neighbors.push({ index: j, distance: a.distanceToSquared(b) });
    }
    neighbors.sort((left, right) => left.distance - right.distance);
    for (const neighbor of neighbors.slice(0, 3)) {
      if (neighbor.index <= i) continue;
      const b = vectorAt(neighbor.index);
      let outward = a.clone().add(b);
      if (outward.lengthSq() < .01) outward = new THREE.Vector3(-a.y, a.x, .1);
      outward.normalize().multiplyScalar(6.05);
      const curve = new THREE.CubicBezierCurve3(
        a,
        a.clone().lerp(outward, .48),
        b.clone().lerp(outward, .48),
        b,
      );
      const samples = curve.getPoints(5);
      for (let segment = 0; segment < samples.length - 1; segment++) {
        edgeVertices.push(...samples[segment].toArray(), ...samples[segment + 1].toArray());
      }
    }
  }
  const edgeGeometry = new THREE.BufferGeometry();
  edgeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(edgeVertices, 3));
  const edgeMaterial = new THREE.LineBasicMaterial({
    color: 0x64caee,
    transparent: true,
    opacity: .20,
    depthWrite: false,
  });
  const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
  const group = new THREE.Group();
  group.add(edges, points);
  return { group, points, geometry, colors, positions, edgeMaterial, count };
}

function createSunMaterial(THREE: typeof import('three')) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      varying vec3 vPosition;
      varying vec3 vNormal;
      void main() {
        vPosition = position;
        vNormal = normalize(normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec3 vPosition;
      varying vec3 vNormal;
      void main() {
        vec3 p = normalize(vPosition);
        float waveA = sin(p.x * 11.0 + p.y * 7.0 + uTime * 1.8);
        float waveB = cos(p.z * 13.0 - p.x * 5.0 - uTime * 1.3);
        float plasma = clamp(.5 + .28 * waveA + .22 * waveB, 0.0, 1.0);
        float limb = .58 + .42 * max(0.0, dot(normalize(vNormal), vec3(.15, .38, .91)));
        vec3 orange = vec3(1.0, .22, .055);
        vec3 gold = vec3(1.0, .76, .30);
        vec3 white = vec3(1.0, .96, .72);
        vec3 color = mix(orange, gold, smoothstep(.05, .78, plasma));
        color = mix(color, white, smoothstep(.82, 1.0, plasma) * .44);
        gl_FragColor = vec4(color * limb, 1.0);
      }
    `,
    toneMapped: false,
  });
}

export function CosmosRenderer({
  scene,
  quality,
  visible,
  feeds,
  targetCity = false,
  state,
  getAudioLevel,
  onFps,
  onAssetsStatus,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [mobileViewport, setMobileViewport] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches);
  const sceneRef = useRef(scene);
  const qualityRef = useRef(quality);
  const feedRef = useRef(feeds);
  const cityRef = useRef(targetCity);
  const stateRef = useRef(state);
  const audioLevelRef = useRef(getAudioLevel);
  const fpsCallbackRef = useRef(onFps);
  const assetsCallbackRef = useRef(onAssetsStatus);
  const staticDrawRef = useRef<(() => void) | null>(null);
  const staticEarthImagesRef = useRef<EarthImages>({ day: null, night: null, clouds: null });
  const staticEarthStartedRef = useRef(false);
  const staticEarthStatusRef = useRef({ finished: 0, loaded: 0 });
  sceneRef.current = scene;
  qualityRef.current = quality;
  feedRef.current = feeds;
  cityRef.current = targetCity;
  stateRef.current = state;
  audioLevelRef.current = getAudioLevel;
  fpsCallbackRef.current = onFps;
  assetsCallbackRef.current = onAssetsStatus;

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const update = () => setMobileViewport(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !visible) return;
    let disposed = false;
    let frame = 0;
    let renderer: RendererLike | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let cleanup: (() => void) | undefined;
    let composer: { render: () => void; setSize: (width: number, height: number) => void; dispose?: () => void } | null = null;
    let bloomPass: { enabled: boolean } | null = null;
    let frameDuration = 0;
    let lastSceneKey = '';
    let lastEarthKey = '';
    let lastAstroUpdate = 0;
    let lastFrameAt = 0;
    let fpsWindowStart = 0;
    let fpsFrames = 0;
    let autoQuality: 'high' | 'medium' | 'low' = 'high';
    let solarTexturesStarted = false;
    let earthTexturesStarted = false;
    const assetStatus: Record<AssetKind, string> = {
      earth: 'NASA GIBS aguardando',
      solar: 'Solar System Scope aguardando',
    };
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const staticMode = mobileViewport || qualityRef.current === 'low' || reduced;
    const pointer = { x: 0, y: 0 };
    const reportAsset = (kind: AssetKind, value: string) => {
      assetStatus[kind] = value;
      assetsCallbackRef.current?.(`${assetStatus.earth} · ${assetStatus.solar}`);
    };

    const requestStaticEarthImages = () => {
      if (staticEarthStartedRef.current) return;
      staticEarthStartedRef.current = true;
      staticEarthStatusRef.current = { finished: 0, loaded: 0 };
      const sources: [keyof EarthImages, string][] = [
        ['day', NASA_EARTH_MAPS.day],
        ['night', NASA_EARTH_MAPS.night],
        ['clouds', NASA_EARTH_MAPS.clouds],
      ];
      reportAsset('earth', 'NASA GIBS carregando');
      for (const [key, source] of sources) {
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.onload = () => {
          staticEarthImagesRef.current[key] = image;
          staticEarthStatusRef.current.loaded++;
          staticEarthStatusRef.current.finished++;
          const { finished, loaded } = staticEarthStatusRef.current;
          if (finished === sources.length) reportAsset('earth', loaded === sources.length ? 'NASA GIBS ativo' : 'NASA GIBS parcial · fallback procedural');
          if (!disposed && sceneRef.current === 'earth') staticDrawRef.current?.();
        };
        image.onerror = () => {
          staticEarthStatusRef.current.finished++;
          if (staticEarthStatusRef.current.finished === sources.length) {
            reportAsset('earth', staticEarthStatusRef.current.loaded === sources.length ? 'NASA GIBS ativo' : 'NASA GIBS parcial · fallback procedural');
          }
        };
        image.src = source;
      }
    };

    const drawStatic = () => {
      if (!host || disposed) return;
      const canvas = document.createElement('canvas');
      canvas.className = 'cosmos-static';
      canvas.setAttribute('aria-hidden', 'true');
      host.querySelector('.cosmos-static')?.remove();
      host.appendChild(canvas);
      const context = canvas.getContext('2d');
      if (!context) return;
      const rect = host.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 1.4);
      canvas.width = Math.max(1, Math.floor(rect.width * ratio));
      canvas.height = Math.max(1, Math.floor(rect.height * ratio));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      context.scale(ratio, ratio);
      const width = rect.width, height = rect.height;
      const currentScene = sceneRef.current;
      const level = Math.max(0, Math.min(1, audioLevelRef.current() || 0));
      const starsRandom = deterministicRandom(411);
      context.fillStyle = '#020a13';
      context.fillRect(0, 0, width, height);
      const glow = context.createRadialGradient(width * .5, height * .43, 0, width * .5, height * .43, Math.max(width, height) * .65);
      glow.addColorStop(0, 'rgba(26,103,139,.25)');
      glow.addColorStop(.58, 'rgba(17,62,92,.10)');
      glow.addColorStop(1, 'transparent');
      context.fillStyle = glow;
      context.fillRect(0, 0, width, height);
      for (let i = 0; i < 260; i++) {
        const x = starsRandom() * width, y = starsRandom() * height;
        const alpha = .10 + starsRandom() * .5;
        context.fillStyle = `rgba(177,234,255,${alpha})`;
        context.beginPath();
        context.arc(x, y, starsRandom() > .97 ? 1.25 : .55, 0, Math.PI * 2);
        context.fill();
      }

      if (currentScene === 'galaxy') {
        const centerX = width * .5, centerY = height * .43;
        for (let i = 0; i < 9000; i++) {
          const arm = i % 5;
          const radius = Math.sqrt(starsRandom()) * Math.min(width, height) * .33;
          const angle = arm * Math.PI * 2 / 5 + radius * .011 + (starsRandom() - .5) * .45;
          const x = centerX + Math.cos(angle) * radius;
          const y = centerY + Math.sin(angle) * radius * .48;
          context.fillStyle = `rgba(${100 + Math.floor(starsRandom() * 110)},${174 + Math.floor(starsRandom() * 80)},255,${.09 + starsRandom() * .55})`;
          context.fillRect(x, y, .8 + starsRandom() * 1.2, .8 + starsRandom() * 1.2);
        }
        const core = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, Math.min(width, height) * .19);
        core.addColorStop(0, 'rgba(255,212,157,.32)');
        core.addColorStop(.18, 'rgba(113,205,237,.13)');
        core.addColorStop(1, 'transparent');
        context.fillStyle = core;
        context.fillRect(0, 0, width, height);
      } else if (currentScene === 'system') {
        const cx = width * .5, cy = height * .43;
        const orbitRadii = [20, 30, 40, 51, 67, 82, 96, 111].map((value) => value * Math.min(width, height) / 550);
        const planetColors = ['#918b83', '#d6b38b', '#5badd2', '#be6e55', '#d7b579', '#bea47e', '#79b8cb', '#496b9a'];
        context.save();
        context.translate(cx, cy);
        context.strokeStyle = 'rgba(100,215,236,.25)';
        context.lineWidth = 1;
        orbitRadii.forEach((radius) => { context.beginPath(); context.ellipse(0, 0, radius, radius * .42, -.16, 0, Math.PI * 2); context.stroke(); });
        const sun = context.createRadialGradient(0, 0, 1, 0, 0, orbitRadii[0] * .5);
        sun.addColorStop(0, '#fff6cf');
        sun.addColorStop(.4, '#ffc768');
        sun.addColorStop(1, 'rgba(255,112,45,0)');
        context.fillStyle = sun;
        context.beginPath(); context.arc(0, 0, orbitRadii[0] * .5, 0, Math.PI * 2); context.fill();
        orbitRadii.forEach((radius, index) => {
          const angle = index * 1.48 + .6;
          const px = Math.cos(angle) * radius, py = Math.sin(angle) * radius * .42;
          const planetGlow = context.createRadialGradient(px - 1, py - 1, .2, px, py, 2.8 + index * .45);
          planetGlow.addColorStop(0, '#f5f0dc');
          planetGlow.addColorStop(.25, planetColors[index]);
          planetGlow.addColorStop(1, '#06101b');
          context.fillStyle = planetGlow;
          context.beginPath();
          context.arc(px, py, 2 + index * .38, 0, Math.PI * 2);
          context.fill();
          if (index === 5) {
            context.strokeStyle = 'rgba(216,196,157,.62)';
            context.beginPath();
            context.ellipse(px, py, 7, 3.4, -.35, 0, Math.PI * 2);
            context.stroke();
          }
        });
        context.restore();
      } else {
        requestStaticEarthImages();
        const cx = width * .5, cy = height * .40, radius = Math.min(width, height) * .245;
        const atmosphere = context.createRadialGradient(cx, cy, radius * .68, cx, cy, radius * 1.44);
        atmosphere.addColorStop(0, 'rgba(74,212,246,.20)');
        atmosphere.addColorStop(1, 'transparent');
        context.fillStyle = atmosphere;
        context.beginPath(); context.arc(cx, cy, radius * 1.44, 0, Math.PI * 2); context.fill();
        const globe = createProjectedEarth(Math.max(160, Math.floor(radius * 2)), staticEarthImagesRef.current, new Date());
        if (globe) {
          context.save();
          context.beginPath(); context.arc(cx, cy, radius, 0, Math.PI * 2); context.clip();
          context.drawImage(globe, cx - radius, cy - radius, radius * 2, radius * 2);
          context.restore();
        } else {
          const ocean = context.createRadialGradient(cx - radius * .35, cy - radius * .38, radius * .08, cx, cy, radius);
          ocean.addColorStop(0, '#367d9a');
          ocean.addColorStop(.68, '#174465');
          ocean.addColorStop(1, '#06152a');
          context.fillStyle = ocean;
          context.beginPath(); context.arc(cx, cy, radius, 0, Math.PI * 2); context.fill();
          context.save();
          context.beginPath(); context.arc(cx, cy, radius, 0, Math.PI * 2); context.clip();
          context.fillStyle = 'rgba(8,8,22,.58)';
          context.beginPath(); context.ellipse(cx + radius * .55, cy, radius * .72, radius * 1.12, -.1, -Math.PI / 2, Math.PI / 2); context.fill();
          context.restore();
          context.fillStyle = 'rgba(67,174,117,.63)';
          [
            [[.14,.29],[.29,.27],[.33,.39],[.25,.46],[.21,.61],[.15,.50]],
            [[.47,.31],[.55,.29],[.59,.40],[.54,.53],[.50,.65],[.46,.50]],
            [[.58,.29],[.77,.28],[.82,.40],[.70,.49],[.62,.43]],
            [[.74,.58],[.82,.60],[.80,.73],[.75,.72]],
          ].forEach((points) => {
            context.beginPath();
            points.forEach(([x, y], index) => index ? context.lineTo(cx + (x - .5) * radius * 2, cy + (y - .5) * radius * 2) : context.moveTo(cx + (x - .5) * radius * 2, cy + (y - .5) * radius * 2));
            context.closePath(); context.fill();
          });
        }
        context.strokeStyle = 'rgba(144,225,236,.22)';
        context.lineWidth = 1;
        for (let i = -2; i <= 2; i++) {
          context.beginPath(); context.ellipse(cx, cy, radius, Math.abs(i) * radius * .18 + radius * .31, 0, 0, Math.PI * 2); context.stroke();
        }
        const project = (latitude: number, longitude: number, scale = 1) => {
          const point = earthVectorForCanvas(latitude, longitude);
          return { x: cx + point.x * radius * scale, y: cy - point.y * radius * scale, front: point.z > -.04 };
        };
        const trajectory = feedRef.current?.iss.trajectory ?? [];
        if (trajectory.length > 1) {
          context.strokeStyle = 'rgba(145,255,225,.75)';
          context.lineWidth = 1.4;
          context.beginPath();
          let drawingFront = false;
          trajectory.forEach((point) => {
            const p = project(point.latitude, point.longitude, .91);
            if (!p.front) { drawingFront = false; return; }
            if (!drawingFront) context.moveTo(p.x, p.y); else context.lineTo(p.x, p.y);
            drawingFront = true;
          });
          context.stroke();
        }
        for (const quake of (feedRef.current?.earthquakes ?? []).slice(0, 24)) {
          const p = project(quake.latitude, quake.longitude, .95);
          if (!p.front) continue;
          context.fillStyle = '#ffc28b';
          context.beginPath(); context.arc(p.x, p.y, 1.2 + Math.min(quake.magnitude, 7) * .22, 0, Math.PI * 2); context.fill();
        }
        const iss = feedRef.current?.iss.current;
        if (iss) {
          const p = project(iss.latitude, iss.longitude, 1.02);
          if (p.front) {
            context.fillStyle = '#d9fff3';
            context.shadowColor = '#91ffe0';
            context.shadowBlur = 12;
            context.beginPath(); context.arc(p.x, p.y, 3, 0, Math.PI * 2); context.fill();
            context.shadowBlur = 0;
          }
        }
        const city = project(CITY.latitude, CITY.longitude, 1.03);
        context.strokeStyle = '#d6fff1';
        context.lineWidth = 1.2;
        context.beginPath(); context.arc(city.x, city.y, targetCity ? 8 : 5, 0, Math.PI * 2); context.stroke();
        context.fillStyle = '#a5ffe8';
        context.beginPath(); context.arc(city.x, city.y, 2.2, 0, Math.PI * 2); context.fill();
      }

      const nodes: { x: number; y: number; angle: number }[] = [];
      const radiusX = Math.min(width * .42, height * .56);
      const radiusY = Math.min(height * .39, width * .38);
      for (let i = 0; i < 120; i++) {
        const angle = i * Math.PI * 2 / 120;
        nodes.push({ x: width * .5 + Math.cos(angle) * radiusX, y: height * .43 + Math.sin(angle) * radiusY, angle });
      }
      context.lineWidth = .7;
      for (let i = 0; i < nodes.length; i += 2) {
        const a = nodes[i], b = nodes[(i + 11) % nodes.length];
        context.strokeStyle = `rgba(111,216,239,${stateRef.current === 'thinking' ? .20 : .095})`;
        context.beginPath();
        context.moveTo(a.x, a.y);
        context.quadraticCurveTo(width * .5 + Math.cos(a.angle + .35) * radiusX * 1.08, height * .43 + Math.sin(a.angle + .35) * radiusY * 1.08, b.x, b.y);
        context.stroke();
      }
      nodes.forEach((node, index) => {
        const pulse = stateRef.current === 'idle'
          ? (index % 47 === Math.floor(Date.now() / 600) % 47 ? .9 : .17)
          : Math.min(.95, .18 + level * .8 + (stateRef.current === 'thinking' && index % 8 === 0 ? .58 : 0));
        context.fillStyle = pulse > .65 ? `rgba(255,244,218,${pulse})` : `rgba(157,235,255,${pulse})`;
        context.beginPath(); context.arc(node.x, node.y, pulse > .65 ? 1.8 : .85, 0, Math.PI * 2); context.fill();
      });
      return () => canvas.remove();
    };

    const onPointerMove = (event: PointerEvent) => {
      if (reduced) return;
      const rect = host.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      pointer.x = (event.clientX - rect.left) / rect.width * 2 - 1;
      pointer.y = (event.clientY - rect.top) / rect.height * 2 - 1;
      if (staticMode) {
        const canvas = host.querySelector<HTMLCanvasElement>('.cosmos-static');
        if (canvas) canvas.style.transform = `translate3d(${-pointer.x * 4}px, ${pointer.y * 3}px, 0) scale(1.012)`;
      }
    };
    window.addEventListener('pointermove', onPointerMove, { passive: true });

    const tick = (now: number) => {
      frame = 0;
      if (disposed || document.hidden || !renderer) return;
      const targetFps = window.innerWidth <= 767 ? 30 : 60;
      if (lastFrameAt && now - lastFrameAt < 1000 / targetFps - 1) {
        frame = requestAnimationFrame(tick);
        return;
      }
      if (lastFrameAt) frameDuration = frameDuration * .88 + (now - lastFrameAt) * .12;
      lastFrameAt = now;
      fpsFrames++;
      if (!fpsWindowStart) fpsWindowStart = now;
      if (now - fpsWindowStart >= 1000) {
        const fps = Math.round(fpsFrames * 1000 / (now - fpsWindowStart));
        fpsCallbackRef.current?.(fps);
        if (host) host.dataset.fps = String(fps);
        fpsWindowStart = now;
        fpsFrames = 0;
      }
      const audioLevel = Math.max(0, Math.min(1, audioLevelRef.current() || 0));
      renderer.__setScene?.(
        sceneRef.current,
        qualityRef.current === 'auto' ? autoQuality : qualityRef.current,
        feedRef.current,
        cityRef.current,
        stateRef.current,
        audioLevel,
        now,
      );
      renderer.__animate?.(now, audioLevel, stateRef.current);
      if (qualityRef.current === 'auto' && frameDuration > 22) autoQuality = autoQuality === 'high' ? 'medium' : 'low';
      if (qualityRef.current === 'auto' && frameDuration < 16 && autoQuality !== 'high') autoQuality = autoQuality === 'low' ? 'medium' : 'high';
      renderer.__render?.();
      frame = requestAnimationFrame(tick);
    };
    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(frame);
        frame = 0;
        lastFrameAt = 0;
      } else if (renderer && !frame) {
        frame = requestAnimationFrame(tick);
      }
    };

    if (staticMode) {
      cleanup = drawStatic();
      staticDrawRef.current = () => { cleanup?.(); cleanup = drawStatic(); };
      resizeObserver = new ResizeObserver(() => { cleanup?.(); cleanup = drawStatic(); });
      resizeObserver.observe(host);
    } else {
      document.addEventListener('visibilitychange', onVisibility);
      void Promise.all([import('three'), import('astronomy-engine')]).then(async ([THREE, Astronomy]) => {
        if (disposed || !host) return;
        const width = Math.max(1, host.clientWidth), height = Math.max(1, host.clientHeight);
        const activeRenderer = new THREE.WebGLRenderer({
          alpha: true,
          antialias: qualityRef.current === 'high' || qualityRef.current === 'auto',
          powerPreference: 'high-performance',
        });
        renderer = activeRenderer as unknown as RendererLike;
        const pixelRatio = Math.min(window.devicePixelRatio || 1, qualityRef.current === 'high' ? 1.65 : 1.25);
        activeRenderer.setPixelRatio(pixelRatio);
        activeRenderer.setSize(width, height);
        activeRenderer.setClearColor(0x020b14, 0);
        activeRenderer.domElement.className = 'cosmos-webgl';
        host.appendChild(activeRenderer.domElement);

        const world = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(42, width / height, .1, 1000);
        camera.position.set(0, 0, 16);
        const cameraTarget = new THREE.Vector3(0, 0, 16);
        const cameraDesired = new THREE.Vector3();
        const groupGalaxy = new THREE.Group();
        const groupSystem = new THREE.Group();
        const groupEarth = new THREE.Group();
        world.add(groupGalaxy, groupSystem, groupEarth);
        const neural = createNeuralSphere(THREE);
        world.add(neural.group);

        const galaxy = proceduralGalaxy(THREE, 90_000);
        groupGalaxy.add(galaxy);
        const dustPositions = new Float32Array(9000 * 3);
        const dustColors = new Float32Array(9000 * 3);
        const galaxyRandom = deterministicRandom(121);
        for (let i = 0; i < 9000; i++) {
          const radius = Math.sqrt(galaxyRandom()) * 5.4;
          const angle = galaxyRandom() * Math.PI * 2;
          dustPositions[i * 3] = Math.cos(angle) * radius;
          dustPositions[i * 3 + 1] = Math.sin(angle) * radius * .62;
          dustPositions[i * 3 + 2] = (galaxyRandom() - .5) * .16;
          dustColors[i * 3] = .015;
          dustColors[i * 3 + 1] = .055;
          dustColors[i * 3 + 2] = .09;
        }
        const dustGeometry = new THREE.BufferGeometry();
        dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
        dustGeometry.setAttribute('color', new THREE.BufferAttribute(dustColors, 3));
        groupGalaxy.add(new THREE.Points(dustGeometry, new THREE.PointsMaterial({
          size: .10,
          vertexColors: true,
          transparent: true,
          opacity: .6,
          depthWrite: false,
        })));
        const galaxyGlow = new THREE.Sprite(new THREE.SpriteMaterial({
          map: drawRadialTexture(THREE),
          color: 0x75d9ff,
          transparent: true,
          opacity: .55,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }));
        galaxyGlow.scale.set(4.3, 2.6, 1);
        galaxyGlow.position.set(0, 0, -.2);
        groupGalaxy.add(galaxyGlow);

        const sunMaterial = createSunMaterial(THREE);
        const sun = new THREE.Mesh(new THREE.SphereGeometry(.52, 40, 30), sunMaterial);
        groupSystem.add(sun);
        const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
          map: drawRadialTexture(THREE),
          color: 0xffb05e,
          transparent: true,
          opacity: .8,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }));
        sunGlow.scale.set(3.1, 3.1, 1);
        groupSystem.add(sunGlow);
        world.add(new THREE.AmbientLight(0x8dbbd3, .65));
        const systemLight = new THREE.PointLight(0xffd39a, 48, 60);
        groupSystem.add(systemLight);
        const bodies = [
          Astronomy.Body.Mercury,
          Astronomy.Body.Venus,
          Astronomy.Body.Earth,
          Astronomy.Body.Mars,
          Astronomy.Body.Jupiter,
          Astronomy.Body.Saturn,
          Astronomy.Body.Uranus,
          Astronomy.Body.Neptune,
        ];
        const orbitRadii = [1.05, 1.72, 2.4, 3.13, 4.35, 5.45, 6.5, 7.45];
        const planetRadii = [.095, .145, .16, .13, .29, .25, .20, .19];
        const planets = bodies.map((body, index) => {
          const orbitRadius = orbitRadii[index];
          const orbit = new THREE.Mesh(
            new THREE.RingGeometry(orbitRadius - .006, orbitRadius + .006, 112),
            new THREE.MeshBasicMaterial({ color: 0x70d6ed, transparent: true, opacity: .22, side: THREE.DoubleSide, depthWrite: false }),
          );
          orbit.rotation.x = Math.PI * .5;
          groupSystem.add(orbit);
          const fallback = createPlanetFallbackTexture(THREE, index);
          const material = new THREE.MeshStandardMaterial({ map: fallback, roughness: index > 3 ? .62 : .84, metalness: .02 });
          const mesh = new THREE.Mesh(new THREE.SphereGeometry(planetRadii[index], 28, 20), material);
          groupSystem.add(mesh);
          let ring: InstanceType<typeof THREE.Mesh> | null = null;
          if (index === 5) {
            ring = new THREE.Mesh(
              new THREE.RingGeometry(planetRadii[index] * 1.35, planetRadii[index] * 2.45, 72),
              new THREE.MeshBasicMaterial({ color: 0xdac69d, transparent: true, opacity: .58, side: THREE.DoubleSide, depthWrite: false }),
            );
            ring.rotation.x = Math.PI * .5 + .18;
            groupSystem.add(ring);
          }
          return { body, mesh, material, fallback, ring, orbitRadius };
        });

        const earthFallback = createEarthFallbackMaps(THREE);
        const earthGeometry = new THREE.SphereGeometry(EARTH_RADIUS, 64, 48);
        const earthMaterial = new THREE.ShaderMaterial({
          uniforms: {
            uDayMap: { value: earthFallback.day },
            uNightMap: { value: earthFallback.night },
            uCloudMap: { value: earthFallback.clouds },
            uSunDirection: { value: new THREE.Vector3(...subsolarDirection(new Date())) },
            uCloudsLoaded: { value: 1 },
          },
          vertexShader: `
            varying vec2 vUv;
            varying vec3 vLocalNormal;
            void main() {
              vUv = uv;
              vLocalNormal = normalize(normal);
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `,
          fragmentShader: `
            uniform sampler2D uDayMap;
            uniform sampler2D uNightMap;
            uniform sampler2D uCloudMap;
            uniform vec3 uSunDirection;
            uniform float uCloudsLoaded;
            varying vec2 vUv;
            varying vec3 vLocalNormal;
            void main() {
              float illumination = dot(normalize(vLocalNormal), normalize(uSunDirection));
              float day = smoothstep(-.13, .08, illumination);
              vec3 dayColor = texture2D(uDayMap, vUv).rgb;
              vec3 nightColor = texture2D(uNightMap, vUv).rgb;
              vec3 color = mix(nightColor, dayColor, day);
              float cloudValue = texture2D(uCloudMap, vUv).r;
              float cloudMask = smoothstep(.42, .76, cloudValue) * uCloudsLoaded * day;
              color = mix(color, vec3(.82, .92, 1.0), cloudMask * .34);
              gl_FragColor = vec4(color, 1.0);
            }
          `,
        });
        const earth = new THREE.Mesh(earthGeometry, earthMaterial);
        groupEarth.add(earth);
        const atmosphere = new THREE.Mesh(
          new THREE.SphereGeometry(EARTH_RADIUS * 1.035, 48, 36),
          new THREE.ShaderMaterial({
            transparent: true,
            side: THREE.BackSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            vertexShader: `
              varying vec3 vNormal;
              varying vec3 vViewPosition;
              void main() {
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                vNormal = normalize(normalMatrix * normal);
                vViewPosition = -mvPosition.xyz;
                gl_Position = projectionMatrix * mvPosition;
              }
            `,
            fragmentShader: `
              varying vec3 vNormal;
              varying vec3 vViewPosition;
              void main() {
                float fresnel = pow(1.0 - max(0.0, dot(normalize(vNormal), normalize(vViewPosition))), 3.0);
                float alpha = fresnel * .48;
                gl_FragColor = vec4(.20, .72, 1.0, alpha);
              }
            `,
          }),
        );
        groupEarth.add(atmosphere);
        const grid = new THREE.Mesh(
          new THREE.SphereGeometry(EARTH_RADIUS * 1.005, 18, 12),
          new THREE.MeshBasicMaterial({ color: 0x87e8f1, wireframe: true, transparent: true, opacity: .065, depthWrite: false }),
        );
        groupEarth.add(grid);
        const issDot = new THREE.Mesh(new THREE.SphereGeometry(.085, 10, 8), new THREE.MeshBasicMaterial({ color: 0xd8fff2 }));
        const quakeGroup = new THREE.Group();
        const trajectoryGroup = new THREE.Group();
        groupEarth.add(issDot, quakeGroup, trajectoryGroup);
        const cityVector = earthVector(THREE, CITY.latitude, CITY.longitude, EARTH_RADIUS * 1.035);
        const cityMarker = new THREE.Mesh(new THREE.SphereGeometry(.055, 12, 8), new THREE.MeshBasicMaterial({ color: 0xc9fff0 }));
        cityMarker.position.copy(cityVector);
        const cityHalo = new THREE.Mesh(
          new THREE.RingGeometry(.08, .095, 36),
          new THREE.MeshBasicMaterial({ color: 0xb5ffec, transparent: true, opacity: .9, side: THREE.DoubleSide, depthWrite: false }),
        );
        cityHalo.position.copy(cityVector);
        cityHalo.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), cityVector.clone().normalize());
        groupEarth.add(cityMarker, cityHalo);
        let cityTarget = false;

        const textureLoader = new THREE.TextureLoader();
        const reportSolarTextures = (completed: number, loaded: number) => {
          if (completed === planets.length) reportAsset('solar', loaded === planets.length ? 'texturas públicas ativas' : `${loaded}/8 texturas · fallback procedural`);
        };
        const loadSolarTextures = () => {
          if (solarTexturesStarted) return;
          solarTexturesStarted = true;
          let completed = 0, loaded = 0;
          reportAsset('solar', 'texturas públicas carregando');
          planets.forEach((planet, index) => {
            textureLoader.load(SOLAR_SYSTEM_SCOPE_TEXTURES[index], (texture: any) => {
              if (disposed) { texture.dispose(); return; }
              texture.colorSpace = THREE.SRGBColorSpace;
              texture.anisotropy = 2;
              planet.material.map = texture;
              planet.material.needsUpdate = true;
              planet.fallback.dispose();
              loaded++;
              completed++;
              reportSolarTextures(completed, loaded);
            }, undefined, () => {
              completed++;
              reportSolarTextures(completed, loaded);
            });
          });
        };
        const loadEarthTextures = () => {
          if (earthTexturesStarted) return;
          earthTexturesStarted = true;
          const maps = [
            ['day', NASA_EARTH_MAPS.day],
            ['night', NASA_EARTH_MAPS.night],
            ['clouds', NASA_EARTH_MAPS.clouds],
          ] as const;
          let completed = 0, loaded = 0;
          reportAsset('earth', 'NASA GIBS carregando');
          maps.forEach(([key, url]) => {
            textureLoader.load(url, (texture: any) => {
              if (disposed) { texture.dispose(); return; }
              if (key === 'clouds') {
                const mask = createCloudMaskTexture(THREE, texture.image as HTMLImageElement);
                texture.dispose();
                texture = mask;
              } else {
                texture.colorSpace = THREE.SRGBColorSpace;
              }
              texture.anisotropy = 2;
              const uniform = key === 'day' ? 'uDayMap' : key === 'night' ? 'uNightMap' : 'uCloudMap';
              const previous = earthMaterial.uniforms[uniform].value as { dispose: () => void };
              earthMaterial.uniforms[uniform].value = texture;
              previous.dispose();
              if (key === 'clouds') earthMaterial.uniforms.uCloudsLoaded.value = 1;
              loaded++;
              completed++;
              if (completed === maps.length) reportAsset('earth', loaded === maps.length ? 'NASA GIBS ativo' : 'NASA GIBS parcial · fallback procedural');
            }, undefined, () => {
              if (key === 'clouds') earthMaterial.uniforms.uCloudsLoaded.value = 0;
              completed++;
              if (completed === maps.length) reportAsset('earth', loaded === maps.length ? 'NASA GIBS ativo' : 'NASA GIBS parcial · fallback procedural');
            });
          });
        };

        const show = (which: CosmosScene, city: boolean) => {
          groupGalaxy.visible = which === 'galaxy';
          groupSystem.visible = which === 'system';
          groupEarth.visible = which === 'earth';
          if (which === 'earth' && city) {
            cameraTarget.copy(cityVector.clone().normalize().multiplyScalar(9.6));
          } else {
            cameraTarget.set(0, 0, which === 'earth' ? 11.2 : 16);
          }
          if (reduced) camera.position.copy(cameraTarget);
          camera.lookAt(0, 0, 0);
          if (which === 'system') loadSolarTextures();
          if (which === 'earth') {
            loadEarthTextures();
          }
        };
        const update = (
          which: CosmosScene,
          qualityName: string,
          feed?: CosmosFeedsResponse,
          city = false,
          _state = 'idle',
          _audio = 0,
          now = performance.now(),
        ) => {
          const key = `${which}|${qualityName}|${feed?.updatedAt ?? 0}|${city}`;
          if (key !== lastSceneKey) {
            lastSceneKey = key;
            show(which, city);
            cityTarget = city;
            const ratio = Math.min(window.devicePixelRatio || 1, qualityName === 'high' ? 1.65 : qualityName === 'medium' ? 1.15 : .85);
            if (activeRenderer.getPixelRatio() !== ratio) activeRenderer.setPixelRatio(ratio);
            galaxy.geometry.setDrawRange(0, qualityName === 'high' ? 90_000 : qualityName === 'medium' ? 40_000 : 8_000);
            neural.geometry.setDrawRange(0, qualityName === 'high' ? 560 : qualityName === 'medium' ? 300 : 120);
            neural.edgeMaterial.opacity = qualityName === 'high' ? .22 : qualityName === 'medium' ? .16 : .11;
            if (bloomPass) bloomPass.enabled = qualityName === 'high';
          }
          if (which === 'system' && Date.now() - lastAstroUpdate > 60_000) {
            lastAstroUpdate = Date.now();
            const date = new Date();
            planets.forEach(({ body, mesh, ring, orbitRadius }) => {
              const vector = Astronomy.HelioVector(body, date);
              const phase = Math.atan2(vector.y, vector.x);
              mesh.position.set(Math.cos(phase) * orbitRadius, Math.sin(phase) * orbitRadius * .42, (vector.z || 0) * .08);
              if (ring) ring.position.copy(mesh.position);
            });
          }
          if (which === 'earth' && key !== lastEarthKey) {
            lastEarthKey = key;
            const nowDate = new Date();
            earthMaterial.uniforms.uSunDirection.value.set(...subsolarDirection(nowDate));
            const current = feed?.iss.current;
            if (current) issDot.position.copy(earthVector(THREE, current.latitude, current.longitude, EARTH_RADIUS * 1.025));
            trajectoryGroup.children.forEach((child: unknown) => {
              const object = child as { geometry?: { dispose: () => void }; material?: { dispose: () => void } };
              object.geometry?.dispose();
              if (object.material) object.material.dispose();
            });
            trajectoryGroup.clear();
            if (feed?.iss.trajectory.length) {
              const points = feed.iss.trajectory.map((point) => earthVector(THREE, point.latitude, point.longitude, EARTH_RADIUS * 1.018));
              const orbitLine = new THREE.Line(
                new THREE.BufferGeometry().setFromPoints(points),
                new THREE.LineBasicMaterial({ color: 0x8fffe1, transparent: true, opacity: .72, depthWrite: false }),
              );
              trajectoryGroup.add(orbitLine);
            }
            quakeGroup.children.forEach((child: unknown) => {
              const object = child as { geometry?: { dispose: () => void }; material?: { dispose: () => void } };
              object.geometry?.dispose();
              if (object.material) object.material.dispose();
            });
            quakeGroup.clear();
            (feed?.earthquakes ?? []).slice(0, 24).forEach((quake) => {
              const marker = new THREE.Mesh(
                new THREE.SphereGeometry(.025 + Math.min(quake.magnitude, 8) * .012, 8, 6),
                new THREE.MeshBasicMaterial({ color: 0xffb773, transparent: true, opacity: .86 }),
              );
              marker.position.copy(earthVector(THREE, quake.latitude, quake.longitude, EARTH_RADIUS * 1.012));
              quakeGroup.add(marker);
            });
          }
          if (now - lastAstroUpdate > 60_000 && which === 'earth') {
            lastAstroUpdate = now;
            earthMaterial.uniforms.uSunDirection.value.set(...subsolarDirection(new Date()));
          }
        };
        renderer.__scene = world;
        renderer.__camera = camera;
        renderer.__setScene = update;
        renderer.__animate = (time, audioLevel, currentState) => {
          groupGalaxy.rotation.z += .000025;
          groupSystem.rotation.y += .00008;
          sunMaterial.uniforms.uTime.value = time / 1000;
          cityMarker.scale.setScalar(1 + .18 * Math.sin(time * .004));
          cityHalo.scale.setScalar(1 + .12 * Math.sin(time * .003));
          const pointerOffsetX = pointer.x * .12;
          const pointerOffsetY = pointer.y * .09;
          cameraDesired.copy(cameraTarget).add(new THREE.Vector3(pointerOffsetX, pointerOffsetY, 0));
          camera.position.lerp(cameraDesired, .04);
          camera.lookAt(0, 0, 0);
          const count = currentState === 'idle' ? 1 + Math.floor((Math.sin(time * .00031) + 1) * 1.45) : 0;
          const bucket = Math.floor(time / 1000 * Math.max(1, count));
          const idleNode = Math.floor(Math.abs(Math.sin(bucket * 12.9898) * 43758.5453)) % neural.count;
          const idlePhase = (time / 1000 * Math.max(1, count)) % 1;
          const audio = currentState === 'listening' ? Math.max(.08, audioLevel) : audioLevel;
          for (let i = 0; i < neural.count; i++) {
            const x = neural.positions[i * 3], y = neural.positions[i * 3 + 1], z = neural.positions[i * 3 + 2];
            let pulse = 0;
            if (currentState === 'listening') {
              const radius = Math.hypot(x, y);
              const front = 5.18 - ((time * .0014) % 3.4);
              pulse = audio * Math.exp(-Math.pow((radius - front) / .26, 2));
            } else if (currentState === 'thinking') {
              const angleFromForehead = Math.acos(Math.max(-1, Math.min(1, y / 5.25)));
              const front = (time * .00082) % Math.PI;
              pulse = Math.exp(-Math.pow((angleFromForehead - front) / .105, 2));
            } else if (currentState === 'talking') {
              const mouthDistance = Math.hypot(x, y + 1.55);
              pulse = audio * Math.exp(-mouthDistance * mouthDistance / 4.5) * (.4 + .6 * (Math.sin(time * .024 + Math.hypot(x, y) * 3.2) + 1) / 2);
            } else {
              const phaseDistance = Math.min(Math.abs(idlePhase - .16), Math.abs(idlePhase - 1.16));
              pulse = i === idleNode ? Math.exp(-Math.pow(phaseDistance / .12, 2)) : 0;
            }
            const depth = .48 + .52 * smoothstep(-5.25, 5.25, z);
            const brightness = Math.min(1.35, .16 + pulse * 1.12) * depth;
            neural.colors[i * 3] = Math.min(1, .53 * brightness + pulse * WARM_WHITE[0] * .42);
            neural.colors[i * 3 + 1] = Math.min(1, .82 * brightness + pulse * WARM_WHITE[1] * .34);
            neural.colors[i * 3 + 2] = Math.min(1, .94 * brightness + pulse * WARM_WHITE[2] * .26);
          }
          (neural.geometry.getAttribute('color') as { needsUpdate: boolean }).needsUpdate = true;
          neural.edgeMaterial.opacity = currentState === 'thinking' ? .34 : currentState === 'talking' ? .20 + audioLevel * .12 : currentState === 'listening' ? .18 + audioLevel * .16 : .15;
        };

        const startQuality = qualityRef.current === 'auto' ? autoQuality : qualityRef.current;
        if (startQuality === 'high') {
          const [composerModule, renderPassModule, bloomModule] = await Promise.all([
            import('three/addons/postprocessing/EffectComposer.js'),
            import('three/addons/postprocessing/RenderPass.js'),
            import('three/addons/postprocessing/UnrealBloomPass.js'),
          ]);
          if (disposed) { activeRenderer.dispose(); return; }
          const effectComposer = new composerModule.EffectComposer(activeRenderer);
          effectComposer.addPass(new renderPassModule.RenderPass(world, camera));
          const effectBloom = new bloomModule.UnrealBloomPass(new THREE.Vector2(width, height), .55, .72, .18);
          effectComposer.addPass(effectBloom);
          composer = effectComposer;
          bloomPass = effectBloom;
          renderer.__render = () => effectComposer.render();
        } else {
          renderer.__render = () => activeRenderer.render(world, camera);
        }
        update(sceneRef.current, startQuality, feedRef.current, cityRef.current, stateRef.current, audioLevelRef.current(), performance.now());
        resizeObserver = new ResizeObserver(() => {
          const nextWidth = Math.max(1, host.clientWidth), nextHeight = Math.max(1, host.clientHeight);
          activeRenderer.setSize(nextWidth, nextHeight);
          camera.aspect = nextWidth / nextHeight;
          camera.updateProjectionMatrix();
          composer?.setSize(nextWidth, nextHeight);
        });
        resizeObserver.observe(host);
        if (!document.hidden) frame = requestAnimationFrame(tick);
      }).catch(() => {
        if (!disposed) {
          reportAsset('earth', 'WebGL indisponível · modo 2D');
          cleanup = drawStatic();
          staticDrawRef.current = () => { cleanup?.(); cleanup = drawStatic(); };
          resizeObserver = new ResizeObserver(() => { cleanup?.(); cleanup = drawStatic(); });
          resizeObserver.observe(host);
        }
      });
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pointermove', onPointerMove);
      resizeObserver?.disconnect();
      cleanup?.();
      staticDrawRef.current = null;
      composer?.dispose?.();
      renderer?.dispose();
      renderer?.domElement.remove();
      host.replaceChildren();
    };
  }, [visible, quality, mobileViewport]);

  useEffect(() => {
    const isStatic = quality === 'low' || mobileViewport || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (visible && isStatic) staticDrawRef.current?.();
  }, [scene, quality, feeds, targetCity, state, visible, mobileViewport]);

  return <div ref={hostRef} className="cosmos-viewport" data-scene={scene} aria-hidden="true" />;
}

function earthVectorForCanvas(latitude: number, longitude: number) {
  const lat = latitude * Math.PI / 180;
  const lon = longitude * Math.PI / 180;
  return {
    x: Math.cos(lat) * Math.cos(lon),
    y: Math.sin(lat),
    z: -Math.cos(lat) * Math.sin(lon),
  };
}