import { useEffect, useRef, useState } from 'react';
import { Minus, Plus, RotateCcw } from 'lucide-react';
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
  isOverview?: boolean;
  transparentBackground?: boolean;
  feeds?: CosmosFeedsResponse;
  targetCity?: boolean;
  state: string;
  getAudioLevel: () => number;
  onFps?: (fps: number) => void;
  onAssetsStatus?: (status: string) => void;
  navigationLabel?: string;
};

type NavigationApi = {
  zoomIn: () => void;
  zoomOut: () => void;
  reset: () => void;
};

const EARTH_RADIUS = 3.2;
const EARTH_BACKGROUND_DIAMETER_RATIO = 1.6;
const COSMOS_CAMERA_FOV_DEGREES = 42;
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
  const armCount = 4;
  const colorCore = new THREE.Color('#ffd8aa');
  const colorArm = new THREE.Color('#73d9ef');
  const colorOuter = new THREE.Color('#5268cc');
  for (let i = 0; i < count; i++) {
    const inBulge = random() < .22;
    const radius = inBulge
      ? Math.pow(random(), 2.3) * 1.45
      : Math.pow(random(), .68) * 5.6;
    const arm = Math.floor(random() * armCount);
    const angle = arm * Math.PI * 2 / armCount
      + radius * 1.04
      + Math.sin(radius * 1.9 + arm) * .055
      + (random() - .5) * (.16 + radius * .055);
    const thickness = .032 + radius * .021;
    positions[i * 3] = Math.cos(angle) * radius + (random() - .5) * thickness;
    positions[i * 3 + 1] = Math.sin(angle) * radius * .62 + (random() - .5) * thickness;
    positions[i * 3 + 2] = (random() - .5) * (.18 + radius * .1);
    const color = radius < 1.1
      ? colorCore.clone().lerp(colorArm, radius / 1.1)
      : colorArm.clone().lerp(colorOuter, smoothstep(1.1, 5.6, radius));
    const sparkle = (inBulge ? .72 : .52) + random() * .58;
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

function createStarfield(THREE: typeof import('three'), count = 1900) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const random = deterministicRandom(2401);
  const palette = [
    new THREE.Color('#d9e7ff'),
    new THREE.Color('#ffffff'),
    new THREE.Color('#ffebd0'),
    new THREE.Color('#a9ceff'),
  ];

  for (let i = 0; i < count; i++) {
    const y = random() * 2 - 1;
    const angle = random() * Math.PI * 2;
    const radial = Math.sqrt(1 - y * y);
    const distance = 92 + random() * 34;
    positions[i * 3] = Math.cos(angle) * radial * distance;
    positions[i * 3 + 1] = y * distance;
    positions[i * 3 + 2] = Math.sin(angle) * radial * distance;

    const color = palette[Math.floor(random() * palette.length)];
    const brightness = .62 + random() * .55;
    colors[i * 3] = color.r * brightness;
    colors[i * 3 + 1] = color.g * brightness;
    colors[i * 3 + 2] = color.b * brightness;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const stars = new THREE.Points(geometry, new THREE.PointsMaterial({
    size: .2,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: .78,
    depthWrite: false,
  }));
  stars.renderOrder = -1;
  return stars;
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
  isOverview = false,
  transparentBackground = false,
  feeds,
  targetCity = false,
  state,
  getAudioLevel,
  onFps,
  onAssetsStatus,
  navigationLabel,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const navigationRef = useRef<NavigationApi | null>(null);
  const [mobileViewport, setMobileViewport] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches);
  const sceneRef = useRef(scene);
  const qualityRef = useRef(quality);
  const transparentBackgroundRef = useRef(transparentBackground);
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
  transparentBackgroundRef.current = transparentBackground;
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
    let staticFrame = 0;
    let staticRedrawFrame = 0;
    let lastStaticFrameAt = 0;
    let renderer: RendererLike | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let cleanup: (() => void) | undefined;
    let controlsCleanup: (() => void) | null = null;
    let composer: { render: () => void; setSize: (width: number, height: number) => void; dispose?: () => void } | null = null;
    let bloomPass: { enabled: boolean } | null = null;
    let frameDuration = 0;
    let lastSceneKey = '';
    let lastEarthKey = '';
    let lastAstroUpdate = 0;
    let lastFrameAt = 0;
    let fpsWindowStart = 0;
    let fpsFrames = 0;
    let autoQuality: 'high' | 'medium' | 'low' = mobileViewport ? 'medium' : 'high';
    let solarTexturesStarted = false;
    let earthTexturesStarted = false;
    const assetStatus: Record<AssetKind, string> = {
      earth: 'NASA GIBS aguardando',
      solar: 'Solar System Scope aguardando',
    };
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const staticMode = qualityRef.current === 'low' || reduced;
    const staticNavigation = { zoom: 1, x: 0, y: 0 };
    const staticDrag = { pointerId: -1, lastX: 0, lastY: 0 };
    const staticPointers = new Map<number, { x: number; y: number }>();
    const staticPinch = { startDistance: 0, startZoom: 1 };
    const pointerParallax = { x: 0, y: 0, targetX: 0, targetY: 0 };
    const scheduleStaticRedraw = () => {
      if (staticRedrawFrame) return;
      staticRedrawFrame = requestAnimationFrame(() => {
        staticRedrawFrame = 0;
        staticDrawRef.current?.();
      });
    };
    const updatePointerParallax = (event: PointerEvent) => {
      if (reduced || event.pointerType !== 'mouse' || event.buttons !== 0) return;
      const rect = host.getBoundingClientRect();
      pointerParallax.targetX = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width - .5) * 2));
      pointerParallax.targetY = Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height - .5) * 2));
    };
    const resetPointerParallax = () => {
      pointerParallax.targetX = 0;
      pointerParallax.targetY = 0;
    };
    host.addEventListener('pointermove', updatePointerParallax);
    host.addEventListener('pointerleave', resetPointerParallax);
    const reportAsset = (kind: AssetKind, value: string) => {
      assetStatus[kind] = value;
      assetsCallbackRef.current?.(`${assetStatus.earth} · ${assetStatus.solar}`);
    };
    const applyStaticTransform = () => {
      scheduleStaticRedraw();
    };
    const zoomStatic = (factor: number) => {
      staticNavigation.zoom = Math.max(.7, Math.min(4, staticNavigation.zoom * factor));
      applyStaticTransform();
    };
    const resetStatic = () => {
      staticNavigation.zoom = 1;
      staticNavigation.x = 0;
      staticNavigation.y = 0;
      applyStaticTransform();
    };
    const staticNavigationApi: NavigationApi = {
      zoomIn: () => zoomStatic(1.25),
      zoomOut: () => zoomStatic(.8),
      reset: resetStatic,
    };
    const pointerDistance = (points: { x: number; y: number }[]) => points.length < 2
      ? 0
      : Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
    const onStaticPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof HTMLCanvasElement) || !event.target.classList.contains('cosmos-static')) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      staticPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (staticPointers.size === 1) {
        staticDrag.pointerId = event.pointerId;
        staticDrag.lastX = event.clientX;
        staticDrag.lastY = event.clientY;
      } else if (staticPointers.size >= 2) {
        staticDrag.pointerId = -1;
        staticPinch.startDistance = pointerDistance(Array.from(staticPointers.values()).slice(0, 2));
        staticPinch.startZoom = staticNavigation.zoom;
      }
      host.setPointerCapture(event.pointerId);
    };
    const onStaticPointerMove = (event: PointerEvent) => {
      if (!staticPointers.has(event.pointerId)) return;
      staticPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (staticPointers.size >= 2 && staticPinch.startDistance > 0) {
        const distance = pointerDistance(Array.from(staticPointers.values()).slice(0, 2));
        staticNavigation.zoom = Math.max(.7, Math.min(4, staticPinch.startZoom * distance / staticPinch.startDistance));
        applyStaticTransform();
      } else if (event.pointerId === staticDrag.pointerId) {
        staticNavigation.x += event.clientX - staticDrag.lastX;
        staticNavigation.y += event.clientY - staticDrag.lastY;
        staticDrag.lastX = event.clientX;
        staticDrag.lastY = event.clientY;
        applyStaticTransform();
      }
    };
    const onStaticPointerUp = (event: PointerEvent) => {
      staticPointers.delete(event.pointerId);
      if (host.hasPointerCapture(event.pointerId)) host.releasePointerCapture(event.pointerId);
      if (staticPointers.size >= 2) {
        staticPinch.startDistance = pointerDistance(Array.from(staticPointers.values()).slice(0, 2));
        staticPinch.startZoom = staticNavigation.zoom;
        staticDrag.pointerId = -1;
      } else if (staticPointers.size === 1) {
        const [pointerId, point] = Array.from(staticPointers.entries())[0];
        staticDrag.pointerId = pointerId;
        staticDrag.lastX = point.x;
        staticDrag.lastY = point.y;
        staticPinch.startDistance = 0;
      } else {
        staticDrag.pointerId = -1;
        staticPinch.startDistance = 0;
      }
    };
    const onStaticWheel = (event: WheelEvent) => {
      if (!(event.target instanceof HTMLCanvasElement) || !event.target.classList.contains('cosmos-static')) return;
      event.preventDefault();
      zoomStatic(Math.exp(-event.deltaY * .001));
    };
    host.addEventListener('pointerdown', onStaticPointerDown);
    host.addEventListener('pointermove', onStaticPointerMove);
    host.addEventListener('pointerup', onStaticPointerUp);
    host.addEventListener('pointercancel', onStaticPointerUp);
    host.addEventListener('wheel', onStaticWheel, { passive: false });

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

    let staticGlobeCacheKey = '';
    let staticGlobeCache: HTMLCanvasElement | null = null;
    const drawStatic = (now = performance.now()) => {
      if (!host || disposed) return;
      const canvas = host.querySelector<HTMLCanvasElement>('.cosmos-static') ?? document.createElement('canvas');
      if (!canvas.isConnected) {
        canvas.className = 'cosmos-static';
        canvas.setAttribute('aria-hidden', 'true');
        host.appendChild(canvas);
      }
      const context = canvas.getContext('2d');
      if (!context) return;
      const rect = host.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const pixelWidth = Math.max(1, Math.floor(rect.width * ratio));
      const pixelHeight = Math.max(1, Math.floor(rect.height * ratio));
      if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
      if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      canvas.style.transform = 'none';
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const width = rect.width, height = rect.height;
      const currentScene = sceneRef.current;
      const level = Math.max(0, Math.min(1, audioLevelRef.current() || 0));
      const motionTime = reduced ? 0 : now;
      const starsRandom = deterministicRandom(411);
      context.clearRect(0, 0, width, height);
      context.save();
      context.translate(
        width * .5 + staticNavigation.x + pointerParallax.targetX * 8,
        height * .5 + staticNavigation.y + pointerParallax.targetY * 6,
      );
      context.scale(staticNavigation.zoom, staticNavigation.zoom);
      context.translate(-width * .5, -height * .5);
      if (!transparentBackgroundRef.current) {
        context.fillStyle = '#020a13';
        context.fillRect(0, 0, width, height);
      }
      const glow = context.createRadialGradient(width * .5, height * .43, 0, width * .5, height * .43, Math.max(width, height) * .65);
      glow.addColorStop(0, 'rgba(26,103,139,.25)');
      glow.addColorStop(.58, 'rgba(17,62,92,.10)');
      glow.addColorStop(1, 'transparent');
      context.fillStyle = glow;
      context.fillRect(0, 0, width, height);
      for (let i = 0; i < 260; i++) {
        const x = starsRandom() * width, y = starsRandom() * height;
        const alpha = (.10 + starsRandom() * .5) * (reduced ? 1 : .68 + .32 * (Math.sin(motionTime * .0016 + i * 1.7) + 1) / 2);
        context.fillStyle = `rgba(177,234,255,${alpha})`;
        context.beginPath();
        context.arc(x, y, starsRandom() > .97 ? 1.25 : .55, 0, Math.PI * 2);
        context.fill();
      }

      if (currentScene === 'galaxy') {
        const centerX = width * .5, centerY = height * .43;
        const particleCount = reduced ? 9000 : mobileViewport ? 2400 : 4200;
        for (let i = 0; i < particleCount; i++) {
          const arm = i % 5;
          const radius = Math.sqrt(starsRandom()) * Math.min(width, height) * .33;
          const angle = arm * Math.PI * 2 / 5 + radius * .011 + (starsRandom() - .5) * .45 + motionTime * .000003;
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
          const angle = index * 1.48 + .6 + motionTime * .00009 / (index + 1);
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
        const cx = width * .5;
        const cy = height * (isOverview ? .40 : .50);
        const radius = Math.min(width, height) * (
          isOverview ? .245 : EARTH_BACKGROUND_DIAMETER_RATIO / 2
        );
        const atmosphere = context.createRadialGradient(cx, cy, radius * .68, cx, cy, radius * 1.44);
        atmosphere.addColorStop(0, 'rgba(74,212,246,.20)');
        atmosphere.addColorStop(1, 'transparent');
        context.fillStyle = atmosphere;
        context.beginPath(); context.arc(cx, cy, radius * 1.44, 0, Math.PI * 2); context.fill();
        const globeSize = Math.min(
          2048,
          Math.max(160, Math.floor(radius * 2 * Math.min(staticNavigation.zoom, 4) * ratio)),
        );
        const images = staticEarthImagesRef.current;
        const globeKey = [
          globeSize,
          images.day?.naturalWidth ?? 0,
          images.night?.naturalWidth ?? 0,
          images.clouds?.naturalWidth ?? 0,
          reduced ? 0 : Math.floor(motionTime / 60_000),
        ].join(':');
        if (globeKey !== staticGlobeCacheKey) {
          staticGlobeCacheKey = globeKey;
          staticGlobeCache = createProjectedEarth(globeSize, images, new Date());
        }
        const globe = staticGlobeCache;
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
            context.beginPath(); context.arc(p.x, p.y, 2.4 + Math.sin(motionTime * .006) * .65, 0, Math.PI * 2); context.fill();
            context.shadowBlur = 0;
          }
        }
        const city = project(CITY.latitude, CITY.longitude, 1.03);
        context.strokeStyle = '#d6fff1';
        context.lineWidth = 1.2;
        context.beginPath(); context.arc(city.x, city.y, targetCity ? 8 + Math.sin(motionTime * .005) * 2 : 5 + Math.sin(motionTime * .004) * 1.2, 0, Math.PI * 2); context.stroke();
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
          ? (index % 47 === Math.floor(motionTime / 600) % 47 ? .9 : .17)
          : Math.min(.95, .18 + level * .8 + (stateRef.current === 'thinking' && index % 8 === 0 ? .58 : 0));
        context.fillStyle = pulse > .65 ? `rgba(255,244,218,${pulse})` : `rgba(157,235,255,${pulse})`;
        context.beginPath(); context.arc(node.x, node.y, pulse > .65 ? 1.8 : .85, 0, Math.PI * 2); context.fill();
      });
      context.restore();
      return () => canvas.remove();
    };

    const tickStatic = (now: number) => {
      staticFrame = 0;
      if (disposed || document.hidden || reduced) return;
      const targetFps = mobileViewport ? 18 : 24;
      if (!lastStaticFrameAt || now - lastStaticFrameAt >= 1000 / targetFps) {
        lastStaticFrameAt = now;
        drawStatic(now);
      }
      staticFrame = requestAnimationFrame(tickStatic);
    };
    const startStaticMotion = () => {
      if (!reduced && !document.hidden && !staticFrame) staticFrame = requestAnimationFrame(tickStatic);
    };

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
        cancelAnimationFrame(staticFrame);
        cancelAnimationFrame(staticRedrawFrame);
        frame = 0;
        staticFrame = 0;
        staticRedrawFrame = 0;
        lastFrameAt = 0;
      } else if (renderer && !frame) {
        frame = requestAnimationFrame(tick);
      } else {
        startStaticMotion();
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    if (staticMode) {
      navigationRef.current = staticNavigationApi;
      cleanup = drawStatic();
      staticDrawRef.current = () => { drawStatic(); };
      resizeObserver = new ResizeObserver(() => { staticDrawRef.current?.(); });
      resizeObserver.observe(host);
      startStaticMotion();
    } else {
      void Promise.all([
        import('three'),
        import('astronomy-engine'),
        import('three/addons/controls/OrbitControls.js'),
      ]).then(async ([THREE, Astronomy, controlsModule]) => {
        if (disposed || !host) return;
        const width = Math.max(1, host.clientWidth), height = Math.max(1, host.clientHeight);
        const activeRenderer = new THREE.WebGLRenderer({
          alpha: true,
          antialias: qualityRef.current === 'high' || qualityRef.current === 'auto',
          powerPreference: 'high-performance',
        });
        renderer = activeRenderer as unknown as RendererLike;
        const pixelRatio = Math.min(
          window.devicePixelRatio || 1,
          qualityRef.current === 'high' ? 2.25 : qualityRef.current === 'medium' ? 1.6 : 1.15,
        );
        activeRenderer.setPixelRatio(pixelRatio);
        activeRenderer.setSize(width, height);
        activeRenderer.setClearColor(0x020b14, 0);
        activeRenderer.domElement.className = 'cosmos-webgl';
        host.appendChild(activeRenderer.domElement);

        const world = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(COSMOS_CAMERA_FOV_DEGREES, width / height, .1, 1000);
        const controls = new controlsModule.OrbitControls(camera, activeRenderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = .075;
        controls.enablePan = true;
        controls.screenSpacePanning = true;
        controls.rotateSpeed = .72;
        controls.zoomSpeed = .85;
        controls.target.set(0, 0, 0);
        controlsCleanup = () => controls.dispose();
        const earthHalfFovTangent = Math.tan(COSMOS_CAMERA_FOV_DEGREES * Math.PI / 360)
          * Math.min(1, width / height);
        const earthApparentHalfAngle = Math.atan(
          EARTH_BACKGROUND_DIAMETER_RATIO * earthHalfFovTangent,
        );
        const backgroundEarthDistance = EARTH_RADIUS / Math.sin(earthApparentHalfAngle);
        const defaultDistances: Record<CosmosScene, number> = {
          galaxy: 16,
          system: 16,
          earth: isOverview ? 11.2 : backgroundEarthDistance,
        };
        const distanceLimits: Record<CosmosScene, [number, number]> = {
          galaxy: [1.8, 48],
          system: [1.5, 42],
          earth: [EARTH_RADIUS + .22, 36],
        };
        const viewStates = new Map<CosmosScene, { position: typeof camera.position; target: typeof controls.target }>();
        let activeScene = sceneRef.current;
        let cityViewActive = false;
        let cityPoseBackup: { position: typeof camera.position; target: typeof controls.target } | null = null;
        camera.position.set(0, 0, defaultDistances[activeScene]);
        controls.minDistance = distanceLimits[activeScene][0];
        controls.maxDistance = distanceLimits[activeScene][1];
        controls.update();
        viewStates.set(activeScene, { position: camera.position.clone(), target: controls.target.clone() });
        const groupGalaxy = new THREE.Group();
        const groupSystem = new THREE.Group();
        const groupEarth = new THREE.Group();
        world.add(groupGalaxy, groupSystem, groupEarth);
        const backgroundStars = createStarfield(THREE);
        world.add(backgroundStars);
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
          color: 0x8395ff,
          transparent: true,
          opacity: .21,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }));
        galaxyGlow.scale.set(4.3, 2.6, 1);
        galaxyGlow.position.set(0, 0, -.2);
        groupGalaxy.add(galaxyGlow);
        const galaxyCore = new THREE.Sprite(new THREE.SpriteMaterial({
          map: drawRadialTexture(THREE),
          color: 0xffc17e,
          transparent: true,
          opacity: .42,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }));
        galaxyCore.scale.set(1.7, 1.2, 1);
        galaxyCore.position.set(0, 0, .08);
        groupGalaxy.add(galaxyCore);

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
        const beltCount = 2400;
        const beltPositions = new Float32Array(beltCount * 3);
        const beltColors = new Float32Array(beltCount * 3);
        const beltRandom = deterministicRandom(610);
        const beltColor = new THREE.Color('#a99c91');
        for (let i = 0; i < beltCount; i++) {
          const radius = 3.55 + beltRandom() * .46;
          const angle = beltRandom() * Math.PI * 2;
          beltPositions[i * 3] = Math.cos(angle) * radius;
          beltPositions[i * 3 + 1] = Math.sin(angle) * radius * .018 + (beltRandom() - .5) * .12;
          beltPositions[i * 3 + 2] = Math.sin(angle) * radius;
          const brightness = .35 + beltRandom() * .48;
          beltColors[i * 3] = beltColor.r * brightness;
          beltColors[i * 3 + 1] = beltColor.g * brightness;
          beltColors[i * 3 + 2] = beltColor.b * brightness;
        }
        const beltGeometry = new THREE.BufferGeometry();
        beltGeometry.setAttribute('position', new THREE.BufferAttribute(beltPositions, 3));
        beltGeometry.setAttribute('color', new THREE.BufferAttribute(beltColors, 3));
        groupSystem.add(new THREE.Points(beltGeometry, new THREE.PointsMaterial({
          size: .025,
          sizeAttenuation: true,
          vertexColors: true,
          transparent: true,
          opacity: .62,
          depthWrite: false,
        })));
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
            new THREE.MeshBasicMaterial({ color: 0xa7c4d6, transparent: true, opacity: .13, side: THREE.DoubleSide, depthWrite: false }),
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
        const earthGeometry = new THREE.SphereGeometry(EARTH_RADIUS, 96, 64);
        const earthMaterial = new THREE.ShaderMaterial({
          uniforms: {
            uDayMap: { value: earthFallback.day },
            uNightMap: { value: earthFallback.night },
            uCloudMap: { value: earthFallback.clouds },
            uSunDirection: { value: new THREE.Vector3(...subsolarDirection(new Date())) },
            uCloudOffset: { value: 0 },
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
            uniform float uCloudOffset;
            uniform float uCloudsLoaded;
            varying vec2 vUv;
            varying vec3 vLocalNormal;
            void main() {
              float illumination = dot(normalize(vLocalNormal), normalize(uSunDirection));
              float day = smoothstep(-.13, .08, illumination);
              vec3 dayColor = texture2D(uDayMap, vUv).rgb;
              vec3 nightColor = texture2D(uNightMap, vUv).rgb;
              vec3 color = mix(nightColor, dayColor, day);
              float cloudValue = texture2D(uCloudMap, vec2(fract(vUv.x + uCloudOffset), vUv.y)).r;
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
              float alpha = fresnel * .34;
              gl_FragColor = vec4(.18, .55, .98, alpha);
              }
            `,
          }),
        );
        groupEarth.add(atmosphere);
        const grid = new THREE.Mesh(
          new THREE.SphereGeometry(EARTH_RADIUS * 1.005, 18, 12),
          new THREE.MeshBasicMaterial({ color: 0x87e8f1, wireframe: true, transparent: true, opacity: .022, depthWrite: false }),
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
          const snapshot = () => ({ position: camera.position.clone(), target: controls.target.clone() });
          const restorePose = (pose: { position: typeof camera.position; target: typeof controls.target }) => {
            camera.position.copy(pose.position);
            controls.target.copy(pose.target);
          };

          if (which !== activeScene) {
            const poseToSave = activeScene === 'earth' && cityViewActive && cityPoseBackup
              ? cityPoseBackup
              : snapshot();
            viewStates.set(activeScene, {
              position: poseToSave.position.clone(),
              target: poseToSave.target.clone(),
            });
            activeScene = which;
            cityViewActive = false;
            cityPoseBackup = null;
            const savedPose = viewStates.get(which);
            if (savedPose) restorePose(savedPose);
            else {
              camera.position.set(0, 0, defaultDistances[which]);
              controls.target.set(0, 0, 0);
            }
          }

          const [minDistance, maxDistance] = distanceLimits[which];
          controls.minDistance = minDistance;
          controls.maxDistance = maxDistance;

          if (which === 'earth' && city && !cityViewActive) {
            cityPoseBackup = snapshot();
            camera.position.copy(cityVector.clone().normalize().multiplyScalar(9.6));
            controls.target.set(0, 0, 0);
          } else if (which === 'earth' && !city && cityViewActive && cityPoseBackup) {
            restorePose(cityPoseBackup);
            cityPoseBackup = null;
          }
          cityViewActive = which === 'earth' && city;
          controls.update();
          viewStates.set(which, snapshot());

          if (which === 'system') loadSolarTextures();
          if (which === 'earth') {
            loadEarthTextures();
          }
        };
        navigationRef.current = {
          zoomIn: () => {
            camera.position.sub(controls.target).multiplyScalar(.8).add(controls.target);
            controls.update();
          },
          zoomOut: () => {
            camera.position.sub(controls.target).multiplyScalar(1.25).add(controls.target);
            controls.update();
          },
          reset: () => {
            const which = sceneRef.current;
            const city = which === 'earth' && cityRef.current;
            if (city) camera.position.copy(cityVector.clone().normalize().multiplyScalar(9.6));
            else camera.position.set(0, 0, defaultDistances[which]);
            controls.target.set(0, 0, 0);
            cityViewActive = city;
            controls.update();
            viewStates.set(which, { position: camera.position.clone(), target: controls.target.clone() });
          },
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
            const ratio = Math.min(
              window.devicePixelRatio || 1,
              qualityName === 'high' ? 2.25 : qualityName === 'medium' ? 1.6 : 1.15,
            );
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
        let animationLastTime = 0;
        renderer.__animate = (time, audioLevel, currentState) => {
          const delta = animationLastTime ? Math.min(2.5, (time - animationLastTime) / 16.667) : 1;
          animationLastTime = time;
          pointerParallax.x += (pointerParallax.targetX - pointerParallax.x) * .055;
          pointerParallax.y += (pointerParallax.targetY - pointerParallax.y) * .055;
          groupGalaxy.rotation.z += .00012 * delta;
          groupGalaxy.rotation.x += (pointerParallax.y * .035 - groupGalaxy.rotation.x) * .025;
          groupGalaxy.rotation.y += (pointerParallax.x * .045 - groupGalaxy.rotation.y) * .025;
          groupSystem.rotation.y += .00022 * delta;
          groupSystem.rotation.x += (pointerParallax.y * .028 - groupSystem.rotation.x) * .025;
          groupSystem.rotation.z += (pointerParallax.x * .035 - groupSystem.rotation.z) * .025;
          groupEarth.rotation.y += .00032 * delta;
          groupEarth.rotation.x += (pointerParallax.y * .028 - groupEarth.rotation.x) * .025;
          groupEarth.rotation.z += (pointerParallax.x * .035 - groupEarth.rotation.z) * .025;
          backgroundStars.rotation.y += .000006 * delta;
          planets.forEach(({ mesh }, index) => {
            mesh.rotation.y += (.0012 + .00035 / (index + 1)) * delta;
          });
          earthMaterial.uniforms.uCloudOffset.value = (time * .00001) % 1;
          sunMaterial.uniforms.uTime.value = time / 1000;
          cityMarker.scale.setScalar(1 + .18 * Math.sin(time * .004));
          cityHalo.scale.setScalar(1 + .12 * Math.sin(time * .003));
          controls.update();
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
          resizeObserver?.disconnect();
          composer?.dispose?.();
          composer = null;
          controlsCleanup?.();
          controlsCleanup = null;
          renderer?.dispose();
          renderer?.domElement.remove();
          renderer = null;
          host.replaceChildren();
          navigationRef.current = staticNavigationApi;
          cleanup = drawStatic();
          staticDrawRef.current = () => { drawStatic(); };
          resizeObserver = new ResizeObserver(() => { staticDrawRef.current?.(); });
          resizeObserver.observe(host);
          startStaticMotion();
        }
      });
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      cancelAnimationFrame(staticFrame);
      cancelAnimationFrame(staticRedrawFrame);
      document.removeEventListener('visibilitychange', onVisibility);
      host.removeEventListener('pointermove', updatePointerParallax);
      host.removeEventListener('pointerleave', resetPointerParallax);
      host.removeEventListener('pointerdown', onStaticPointerDown);
      host.removeEventListener('pointermove', onStaticPointerMove);
      host.removeEventListener('pointerup', onStaticPointerUp);
      host.removeEventListener('pointercancel', onStaticPointerUp);
      host.removeEventListener('wheel', onStaticWheel);
      resizeObserver?.disconnect();
      cleanup?.();
      staticDrawRef.current = null;
      composer?.dispose?.();
      controlsCleanup?.();
      navigationRef.current = null;
      renderer?.dispose();
      renderer?.domElement.remove();
      host.replaceChildren();
    };
  }, [visible, quality, mobileViewport]);

  useEffect(() => {
    const isStatic = quality === 'low' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (visible && isStatic) staticDrawRef.current?.();
  }, [scene, quality, feeds, targetCity, state, visible]);

  const simpleNavigation = quality === 'low' ||
    (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  return (
    <>
      <div ref={hostRef} className="cosmos-viewport" data-scene={scene} aria-hidden="true" />
      {visible && (
        <div className="cosmos-navigation" role="group" aria-label={navigationLabel ?? 'Navegação das cenas'}>
          <span className="cosmos-navigation__hint">
            {simpleNavigation
              ? 'Arraste para mover · use +/− para zoom'
              : `Arraste para girar · ${mobileViewport ? 'pinça para zoom' : 'roda para zoom'}`}
          </span>
          <div className="cosmos-navigation__buttons">
            <button type="button" aria-label="Afastar" title="Afastar" onClick={() => navigationRef.current?.zoomOut()} data-testid={`button-cosmos-zoom-out-${scene}`}>
              <Minus size={15} aria-hidden="true" />
            </button>
            <button type="button" aria-label="Aproximar" title="Aproximar" onClick={() => navigationRef.current?.zoomIn()} data-testid={`button-cosmos-zoom-in-${scene}`}>
              <Plus size={15} aria-hidden="true" />
            </button>
            <button type="button" aria-label="Restaurar vista" title="Restaurar vista" onClick={() => navigationRef.current?.reset()} data-testid={`button-cosmos-reset-${scene}`}>
              <RotateCcw size={13} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </>
  );
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