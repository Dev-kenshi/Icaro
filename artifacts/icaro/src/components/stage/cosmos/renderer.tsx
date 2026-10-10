import { useEffect, useRef, useState } from 'react';
import { Gauge, Minus, Plus, LocateFixed } from 'lucide-react';
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
  forceContextLoss?: () => void;
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
  targetGeo?: { latitude: number; longitude: number; label: string } | null;
  state: string;
  getAudioLevel: () => number;
  onFps?: (fps: number) => void;
  onAssetsStatus?: (status: string) => void;
  navigationLabel?: string;
  /** Automatic motion preference. `system` follows prefers-reduced-motion; touch/mouse navigation always works. */
  motion?: CosmosMotion;
  onEnableMotion?: () => void;
  onInteract?: () => void;
  /** Arrow keys rotate, +/− zoom and R recentres while true. */
  keyboardShortcuts?: boolean;
};

export type CosmosMotion = 'system' | 'on' | 'off';

type NavigationApi = {
  zoomIn: () => void;
  zoomOut: () => void;
  reset: () => void;
  rotate?: (left: number, up: number) => void;
  releaseFocus?: () => void;
};

const HINT_SEEN_KEY = 'icaro.cosmos.hint-seen.v1';
const PLANET_NAMES = ['Mercúrio', 'Vênus', 'Terra', 'Marte', 'Júpiter', 'Saturno', 'Urano', 'Netuno'] as const;
/** Sidereal periods in years; the visual period compresses them while keeping their order. */
const PLANET_PERIOD_YEARS = [.2408, .6152, 1, 1.8808, 11.862, 29.457, 84.011, 164.79] as const;
const visualOrbitSeconds = (years: number) => 14 * Math.pow(years / .2408, .55);
const SPIN_SPEED_KEY = 'icaro.cosmos.spin-speed.v1';
const SPIN_SPEEDS = [.5, 1, 2, 4] as const;
function readSpinSpeed(): number {
  try {
    const raw = Number(localStorage.getItem(SPIN_SPEED_KEY));
    return (SPIN_SPEEDS as readonly number[]).includes(raw) ? raw : 1;
  } catch { return 1; }
}
const GALAXY_SPIN_RAD_PER_SECOND = .035;
const EARTH_SPIN_RAD_PER_SECOND = .06;
const EARTH_RESUME_DELAY_MS = 5000;
const SYSTEM_CAMERA_ELEVATION = .42;
const GALAXY_CAMERA_ELEVATION = .62;
let webglProbe: boolean | null = null;

function webglAvailable() {
  if (webglProbe !== null) return webglProbe;
  try {
    const canvas = document.createElement('canvas');
    const context = (canvas.getContext('webgl2') || canvas.getContext('webgl')) as WebGLRenderingContext | null;
    webglProbe = !!context;
    context?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    webglProbe = false;
  }
  return webglProbe;
}

type Disposable = { dispose?: () => void };
type TraversableObject = {
  geometry?: Disposable;
  material?: unknown;
  traverse?: (callback: (object: TraversableObject) => void) => void;
};

/** Releases every geometry, material and texture under a scene graph. */
function disposeObjectTree(root: TraversableObject) {
  const textures = new Set<Disposable>();
  const isTexture = (value: unknown): value is Disposable => !!value && typeof value === 'object' && (value as { isTexture?: boolean }).isTexture === true;
  root.traverse?.((object) => {
    object.geometry?.dispose?.();
    const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
    for (const material of materials as Array<Record<string, unknown> & Disposable>) {
      for (const value of Object.values(material)) if (isTexture(value)) textures.add(value);
      const uniforms = material.uniforms as Record<string, { value?: unknown }> | undefined;
      if (uniforms) for (const uniform of Object.values(uniforms)) if (isTexture(uniform?.value)) textures.add(uniform.value as Disposable);
      material.dispose?.();
    }
  });
  textures.forEach((texture) => texture.dispose?.());
}

function readHintSeen() {
  try { return localStorage.getItem(HINT_SEEN_KEY) === '1'; } catch { return false; }
}

function isTypingTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  if (!element || typeof element.closest !== 'function') return false;
  return !!element.closest('input,textarea,select,[contenteditable="true"],[contenteditable=""],[role="tab"],[role="slider"],dialog,#icaro-panel');
}

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
    // Circular disk on the XZ plane (Y is the galactic pole) so it can be orbited in 3D.
    const vertical = inBulge ? .55 * Math.max(0, 1 - radius / 1.6) + .08 : .05 + .16 * Math.exp(-radius * .45);
    positions[i * 3] = Math.cos(angle) * radius + (random() - .5) * thickness;
    positions[i * 3 + 2] = Math.sin(angle) * radius + (random() - .5) * thickness;
    positions[i * 3 + 1] = (random() - .5) * vertical;
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
  targetGeo = null,
  state,
  getAudioLevel,
  onFps,
  onAssetsStatus,
  navigationLabel,
  motion = 'system',
  onEnableMotion,
  onInteract,
  keyboardShortcuts = false,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const navigationRef = useRef<NavigationApi | null>(null);
  const [mobileViewport, setMobileViewport] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches);
  const [reducedMotion, setReducedMotion] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [renderMode, setRenderMode] = useState<'pending' | 'webgl' | 'static'>('pending');
  const [hintSeen, setHintSeen] = useState(readHintSeen);
  const [focusLabel, setFocusLabel] = useState<string | null>(null);
  const [texturesLoading, setTexturesLoading] = useState(false);
  const [spinSpeed, setSpinSpeed] = useState(readSpinSpeed);
  const spinSpeedRef = useRef(spinSpeed);
  spinSpeedRef.current = spinSpeed;
  const cycleSpinSpeed = () => setSpinSpeed((current) => {
    const next = SPIN_SPEEDS[(SPIN_SPEEDS.indexOf(current as typeof SPIN_SPEEDS[number]) + 1) % SPIN_SPEEDS.length] ?? 1;
    try { localStorage.setItem(SPIN_SPEED_KEY, String(next)); } catch { /* storage can be disabled */ }
    return next;
  });
  const autoMotion = motion === 'on' || (motion === 'system' && !reducedMotion);
  const autoMotionRef = useRef(autoMotion);
  autoMotionRef.current = autoMotion;
  const interactRef = useRef(onInteract);
  interactRef.current = onInteract;
  const keyboardRef = useRef(keyboardShortcuts);
  keyboardRef.current = keyboardShortcuts;
  const restartStaticMotionRef = useRef<(() => void) | null>(null);
  const markHintSeen = useRef(() => {
    setHintSeen((seen) => {
      if (!seen) { try { localStorage.setItem(HINT_SEEN_KEY, '1'); } catch { /* storage can be disabled */ } }
      return true;
    });
  }).current;
  const sceneRef = useRef(scene);
  const qualityRef = useRef(quality);
  const transparentBackgroundRef = useRef(transparentBackground);
  const feedRef = useRef(feeds);
  const cityRef = useRef(targetCity);
  const geoRef = useRef(targetGeo);
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
  geoRef.current = targetGeo;
  stateRef.current = state;
  audioLevelRef.current = getAudioLevel;
  fpsCallbackRef.current = onFps;
  assetsCallbackRef.current = onAssetsStatus;

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const motionMedia = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setMobileViewport(media.matches);
    const updateMotion = () => setReducedMotion(motionMedia.matches);
    update();
    updateMotion();
    media.addEventListener('change', update);
    motionMedia.addEventListener('change', updateMotion);
    return () => {
      media.removeEventListener('change', update);
      motionMedia.removeEventListener('change', updateMotion);
    };
  }, []);

  useEffect(() => {
    if (!autoMotion) return;
    restartStaticMotionRef.current?.();
  }, [autoMotion]);

  useEffect(() => {
    if (!visible) return;
    const onKey = (event: KeyboardEvent) => {
      if (!keyboardRef.current || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
      if (isTypingTarget(event.target) || document.querySelector('dialog[open]')) return;
      const host = hostRef.current;
      if (!host) return;
      if (isOverview) {
        const panel = host.closest('.cosmos-panel');
        if (!panel || !(panel.contains(document.activeElement) || panel.matches(':hover'))) return;
      }
      const navigation = navigationRef.current;
      if (!navigation) return;
      const step = event.shiftKey ? .3 : .14;
      const actions: Record<string, () => void> = {
        ArrowLeft: () => navigation.rotate?.(step, 0),
        ArrowRight: () => navigation.rotate?.(-step, 0),
        ArrowUp: () => navigation.rotate?.(0, step * .7),
        ArrowDown: () => navigation.rotate?.(0, -step * .7),
        '+': navigation.zoomIn, '=': navigation.zoomIn,
        '-': navigation.zoomOut, '_': navigation.zoomOut,
        r: navigation.reset, R: navigation.reset,
      };
      const action = actions[event.key];
      if (!action) return;
      event.preventDefault();
      action();
      markHintSeen();
      interactRef.current?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, isOverview, markHintSeen]);

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
    let qualityChangedAt = 0;
    let slowSince = 0;
    let fastSince = 0;
    let interacting = false;
    let interactUntil = 0;
    let lastTargetFps = 0;
    let pendingTextureLoads = 0;
    let disposeScene: (() => void) | null = null;
    let solarTexturesStarted = false;
    let earthTexturesStarted = false;
    const assetStatus: Record<AssetKind, string> = {
      earth: 'NASA GIBS aguardando',
      solar: 'Solar System Scope aguardando',
    };
    // Reduced motion pauses automatic movement only; direct manipulation stays in full 3D.
    const motionPaused = () => !autoMotionRef.current;
    // The 2D canvas is only a fallback for devices without WebGL.
    const staticMode = !webglAvailable();
    setRenderMode(staticMode ? 'static' : 'pending');
    const trackTextureLoad = (delta: number) => {
      pendingTextureLoads = Math.max(0, pendingTextureLoads + delta);
      if (!disposed) setTexturesLoading(pendingTextureLoads > 0);
    };
    const markInteraction = () => {
      interactUntil = performance.now() + 1500;
      markHintSeen();
      interactRef.current?.();
    };
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
      if (motionPaused() || event.pointerType !== 'mouse' || event.buttons !== 0) return;
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
      rotate: (left, up) => {
        staticNavigation.x += left * 160;
        staticNavigation.y += up * 160;
        applyStaticTransform();
      },
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
      markInteraction();
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
      const motionTime = motionPaused() ? 0 : now;
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
        const alpha = (.10 + starsRandom() * .5) * (motionPaused() ? 1 : .68 + .32 * (Math.sin(motionTime * .0016 + i * 1.7) + 1) / 2);
        context.fillStyle = `rgba(177,234,255,${alpha})`;
        context.beginPath();
        context.arc(x, y, starsRandom() > .97 ? 1.25 : .55, 0, Math.PI * 2);
        context.fill();
      }

      if (currentScene === 'galaxy') {
        const centerX = width * .5, centerY = height * .43;
        const particleCount = motionPaused() ? 9000 : mobileViewport ? 2400 : 4200;
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
          motionPaused() ? 0 : Math.floor(motionTime / 60_000),
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
      if (disposed || document.hidden || motionPaused()) return;
      const targetFps = mobileViewport ? 18 : 24;
      if (!lastStaticFrameAt || now - lastStaticFrameAt >= 1000 / targetFps) {
        lastStaticFrameAt = now;
        drawStatic(now);
      }
      staticFrame = requestAnimationFrame(tickStatic);
    };
    const startStaticMotion = () => {
      if (!motionPaused() && !document.hidden && !staticFrame) staticFrame = requestAnimationFrame(tickStatic);
    };
    restartStaticMotionRef.current = () => {
      if (!staticDrawRef.current) return;
      startStaticMotion();
    };

    const QUALITY_STEPS = ['low', 'medium', 'high'] as const;
    /** Adapts quality against the current frame budget, with hysteresis and a cooldown. */
    const adaptQuality = (now: number, targetFps: number) => {
      if (qualityRef.current !== 'auto' || !frameDuration) return;
      if (targetFps !== lastTargetFps) {
        lastTargetFps = targetFps;
        slowSince = fastSince = 0;
        return;
      }
      const budget = 1000 / targetFps;
      if (now - qualityChangedAt < 4000) return;
      const index = QUALITY_STEPS.indexOf(autoQuality);
      if (frameDuration > budget * 1.45) {
        fastSince = 0;
        slowSince ||= now;
        if (now - slowSince > 2000 && index > 0) {
          autoQuality = QUALITY_STEPS[index - 1];
          qualityChangedAt = now;
          slowSince = 0;
        }
      } else if (frameDuration < budget * 1.12) {
        slowSince = 0;
        fastSince ||= now;
        const ceiling = mobileViewport ? 1 : 2;
        if (now - fastSince > 6000 && index < ceiling) {
          autoQuality = QUALITY_STEPS[index + 1];
          qualityChangedAt = now;
          fastSince = 0;
        }
      } else {
        slowSince = fastSince = 0;
      }
    };

    const tick = (now: number) => {
      frame = 0;
      if (disposed || document.hidden || !renderer) return;
      // Phones idle at 30 fps to save battery, but direct manipulation runs at full rate.
      const targetFps = window.innerWidth <= 767 && !interacting && now > interactUntil ? 30 : 60;
      if (lastFrameAt && now - lastFrameAt < 1000 / targetFps - 1) {
        frame = requestAnimationFrame(tick);
        return;
      }
      if (lastFrameAt) frameDuration = frameDuration ? frameDuration * .88 + (now - lastFrameAt) * .12 : now - lastFrameAt;
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
      adaptQuality(now, targetFps);
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
        setRenderMode('webgl');
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
        disposeScene = () => disposeObjectTree(world as unknown as TraversableObject);
        const camera = new THREE.PerspectiveCamera(COSMOS_CAMERA_FOV_DEGREES, width / height, .1, 1000);
        const canvas = activeRenderer.domElement;
        const controls = new controlsModule.OrbitControls(camera, canvas);
        controls.enableDamping = true;
        controls.dampingFactor = .075;
        controls.enablePan = true;
        controls.screenSpacePanning = true;
        controls.rotateSpeed = .72;
        controls.zoomSpeed = .85;
        controls.target.set(0, 0, 0);
        // The globe stops spinning while it is being handled and resumes a few seconds later.
        let earthPausedUntil = 0;
        const pauseEarth = (forMs: number) => { earthPausedUntil = Math.max(earthPausedUntil, performance.now() + forMs); };
        const onControlsStart = () => {
          interacting = true;
          earthPausedUntil = Number.POSITIVE_INFINITY;
          markInteraction();
        };
        const onControlsEnd = () => {
          interacting = false;
          interactUntil = performance.now() + 1500;
          earthPausedUntil = performance.now() + EARTH_RESUME_DELAY_MS;
        };
        controls.addEventListener('start', onControlsStart);
        controls.addEventListener('end', onControlsEnd);
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
        let lastGeoLabel = '';
        let cityPoseBackup: { position: typeof camera.position; target: typeof controls.target } | null = null;
        const halfFovTangent = Math.tan(COSMOS_CAMERA_FOV_DEGREES * Math.PI / 360);
        /** Default framing: the Earth stays front-on; the disk scenes are inclined and widened on portrait screens. */
        const defaultCameraPosition = (which: CosmosScene) => {
          if (which === 'earth') return new THREE.Vector3(0, 0, defaultDistances.earth);
          const fitRadius = which === 'system' ? 5.7 : 5.9;
          const distance = isOverview
            ? defaultDistances[which]
            : Math.min(
              distanceLimits[which][1] * .8,
              Math.max(defaultDistances[which], fitRadius / (halfFovTangent * Math.max(.3, camera.aspect))),
            );
          const elevation = which === 'system' ? SYSTEM_CAMERA_ELEVATION : GALAXY_CAMERA_ELEVATION;
          return new THREE.Vector3(0, Math.sin(elevation) * distance, Math.cos(elevation) * distance);
        };
        camera.position.copy(defaultCameraPosition(activeScene));
        controls.minDistance = distanceLimits[activeScene][0];
        controls.maxDistance = distanceLimits[activeScene][1];
        controls.update();
        viewStates.set(activeScene, { position: camera.position.clone(), target: controls.target.clone() });
        const groupGalaxy = new THREE.Group();
        const galaxyDisk = new THREE.Group();
        groupGalaxy.add(galaxyDisk);
        const groupSystem = new THREE.Group();
        const groupEarth = new THREE.Group();
        world.add(groupGalaxy, groupSystem, groupEarth);
        const backgroundStars = createStarfield(THREE);
        world.add(backgroundStars);
        const neural = createNeuralSphere(THREE);
        world.add(neural.group);

        const galaxy = proceduralGalaxy(THREE, 90_000);
        galaxyDisk.add(galaxy);
        const dustPositions = new Float32Array(9000 * 3);
        const dustColors = new Float32Array(9000 * 3);
        const galaxyRandom = deterministicRandom(121);
        for (let i = 0; i < 9000; i++) {
          const radius = Math.sqrt(galaxyRandom()) * 5.4;
          const angle = galaxyRandom() * Math.PI * 2;
          dustPositions[i * 3] = Math.cos(angle) * radius;
          dustPositions[i * 3 + 2] = Math.sin(angle) * radius;
          dustPositions[i * 3 + 1] = (galaxyRandom() - .5) * .16;
          dustColors[i * 3] = .015;
          dustColors[i * 3 + 1] = .055;
          dustColors[i * 3 + 2] = .09;
        }
        const dustGeometry = new THREE.BufferGeometry();
        dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
        dustGeometry.setAttribute('color', new THREE.BufferAttribute(dustColors, 3));
        galaxyDisk.add(new THREE.Points(dustGeometry, new THREE.PointsMaterial({
          size: .10,
          vertexColors: true,
          transparent: true,
          opacity: .6,
          depthWrite: false,
        })));
        // Flat glow lying in the galactic plane, so it foreshortens correctly when orbited.
        const galaxyGlow = new THREE.Mesh(
          new THREE.PlaneGeometry(6.4, 6.4),
          new THREE.MeshBasicMaterial({
            map: drawRadialTexture(THREE),
            color: 0x8395ff,
            transparent: true,
            opacity: .21,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
          }),
        );
        galaxyGlow.rotation.x = -Math.PI / 2;
        galaxyDisk.add(galaxyGlow);
        const galaxyCore = new THREE.Sprite(new THREE.SpriteMaterial({
          map: drawRadialTexture(THREE),
          color: 0xffc17e,
          transparent: true,
          opacity: .42,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }));
        galaxyCore.scale.set(1.55, 1.55, 1);
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
          let startPhase = index * 1.48 + .6;
          try {
            startPhase = Astronomy.EclipticLongitude(body, new Date()) * Math.PI / 180;
          } catch {
            const vector = Astronomy.HelioVector(body, new Date());
            startPhase = Math.atan2(vector.y, vector.x);
          }
          const periodSeconds = visualOrbitSeconds(PLANET_PERIOD_YEARS[index]);
          return { body, mesh, material, fallback, ring, orbitRadius, startPhase, periodSeconds };
        });
        /** Orbits advance on a compressed clock that only runs while automatic motion is on. */
        let orbitClock = 0;
        const placePlanets = () => {
          planets.forEach(({ mesh, ring, orbitRadius, startPhase, periodSeconds }) => {
            const phase = startPhase + Math.PI * 2 * orbitClock / periodSeconds;
            mesh.position.set(Math.cos(phase) * orbitRadius, 0, -Math.sin(phase) * orbitRadius);
            if (ring) ring.position.copy(mesh.position);
          });
        };
        placePlanets();
        const focusBodies = [
          { name: 'Sol', mesh: sun as InstanceType<typeof THREE.Mesh>, radius: .52 },
          ...planets.map(({ mesh }, index) => ({ name: PLANET_NAMES[index] as string, mesh, radius: planetRadii[index] })),
        ];
        type FocusBody = (typeof focusBodies)[number];
        let focus: { body: FocusBody; distance: number; flying: boolean } | null = null;
        const focusScratch = new THREE.Vector3();
        const releaseFocus = () => {
          if (!focus) return;
          focus = null;
          controls.enablePan = true;
          if (!disposed) setFocusLabel(null);
        };
        const focusOn = (body: FocusBody) => {
          focus = { body, distance: Math.max(1.6, body.radius * 10), flying: true };
          controls.enablePan = false;
          setFocusLabel(body.name);
        };
        const pickBody = (clientX: number, clientY: number) => {
          const rect = canvas.getBoundingClientRect();
          let best: FocusBody | null = null;
          let bestDistance = Number.POSITIVE_INFINITY;
          for (const body of focusBodies) {
            const center = body.mesh.getWorldPosition(focusScratch);
            const range = camera.position.distanceTo(center);
            const projected = center.project(camera);
            if (projected.z > 1 || projected.z < -1) continue;
            const x = rect.left + (projected.x + 1) / 2 * rect.width;
            const y = rect.top + (1 - projected.y) / 2 * rect.height;
            const pixelRadius = body.radius / Math.max(.001, range * halfFovTangent) * rect.height / 2;
            const distance = Math.hypot(clientX - x, clientY - y);
            if (distance <= Math.max(22, pixelRadius + 12) && distance < bestDistance) {
              best = body;
              bestDistance = distance;
            }
          }
          return best;
        };

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
        const currentCityVector = () => { const geo = geoRef.current ?? CITY; return earthVector(THREE, geo.latitude, geo.longitude, EARTH_RADIUS * 1.035); };
        const cityMarker = new THREE.Mesh(new THREE.SphereGeometry(.055, 12, 8), new THREE.MeshBasicMaterial({ color: 0xc9fff0 }));
        cityMarker.position.copy(currentCityVector());
        const cityHalo = new THREE.Mesh(
          new THREE.RingGeometry(.08, .095, 36),
          new THREE.MeshBasicMaterial({ color: 0xb5ffec, transparent: true, opacity: .9, side: THREE.DoubleSide, depthWrite: false }),
        );
        cityHalo.position.copy(currentCityVector());
        cityHalo.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), currentCityVector().clone().normalize());
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
            trackTextureLoad(1);
            textureLoader.load(SOLAR_SYSTEM_SCOPE_TEXTURES[index], (texture: any) => {
              trackTextureLoad(-1);
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
              trackTextureLoad(-1);
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
            trackTextureLoad(1);
            textureLoader.load(url, (texture: any) => {
              trackTextureLoad(-1);
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
              trackTextureLoad(-1);
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
            releaseFocus();
            const savedPose = viewStates.get(which);
            if (savedPose) restorePose(savedPose);
            else {
              camera.position.copy(defaultCameraPosition(which));
              controls.target.set(0, 0, 0);
            }
          }

          const [minDistance, maxDistance] = distanceLimits[which];
          controls.minDistance = minDistance;
          controls.maxDistance = maxDistance;

          if (which === 'earth' && city) {
            const geoLabel = geoRef.current?.label ?? '';
            const vector = currentCityVector();
            cityMarker.position.copy(vector);
            cityHalo.position.copy(vector);
            cityHalo.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), vector.clone().normalize());
            if (!cityViewActive) cityPoseBackup = snapshot();
            if (!cityViewActive || geoLabel !== lastGeoLabel) {
              camera.position.copy(cityCameraPosition());
              controls.target.set(0, 0, 0);
            }
            lastGeoLabel = geoLabel;
          } else if (which === 'earth' && !city && cityViewActive && cityPoseBackup) {
            restorePose(cityPoseBackup);
            cityPoseBackup = null;
            lastGeoLabel = '';
          }
          cityViewActive = which === 'earth' && city;
          controls.update();
          viewStates.set(which, snapshot());

          if (which === 'system') loadSolarTextures();
          if (which === 'earth') {
            loadEarthTextures();
          }
        };
        /** The city marker lives inside the spinning globe, so its camera pose uses world coordinates. */
        const cityCameraPosition = () => {
          groupEarth.updateMatrixWorld(true);
          return groupEarth.localToWorld(currentCityVector().clone()).normalize().multiplyScalar(9.6);
        };
        navigationRef.current = {
          zoomIn: () => {
            camera.position.sub(controls.target).multiplyScalar(.8).add(controls.target);
            controls.update();
            pauseEarth(EARTH_RESUME_DELAY_MS);
          },
          zoomOut: () => {
            camera.position.sub(controls.target).multiplyScalar(1.25).add(controls.target);
            controls.update();
            pauseEarth(EARTH_RESUME_DELAY_MS);
          },
          rotate: (left, up) => {
            controls.rotateLeft(left);
            controls.rotateUp(up);
            interactUntil = performance.now() + 1500;
            pauseEarth(EARTH_RESUME_DELAY_MS);
          },
          reset: () => {
            const which = sceneRef.current;
            const city = which === 'earth' && cityRef.current;
            releaseFocus();
            controls.target.set(0, 0, 0);
            camera.position.copy(city ? cityCameraPosition() : defaultCameraPosition(which));
            cityViewActive = city;
            controls.update();
            viewStates.set(which, { position: camera.position.clone(), target: controls.target.clone() });
          },
          releaseFocus,
        };
        // Tap a planet (or the Sun) to follow it; tap empty space to let go; double tap recentres.
        const tap = { pointerId: -1, x: 0, y: 0, at: 0 };
        let lastTapAt = 0;
        const onCanvasPointerDown = (event: PointerEvent) => {
          if (!event.isPrimary) { tap.pointerId = -1; return; }
          tap.pointerId = event.pointerId;
          tap.x = event.clientX;
          tap.y = event.clientY;
          tap.at = performance.now();
        };
        const onCanvasPointerUp = (event: PointerEvent) => {
          if (event.pointerId !== tap.pointerId) return;
          tap.pointerId = -1;
          const now = performance.now();
          if (Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > 6 || now - tap.at > 350) return;
          if (now - lastTapAt < 320) {
            lastTapAt = 0;
            navigationRef.current?.reset();
            return;
          }
          lastTapAt = now;
          if (activeScene !== 'system') return;
          const body = pickBody(event.clientX, event.clientY);
          if (body) focusOn(body);
          else releaseFocus();
        };
        canvas.addEventListener('pointerdown', onCanvasPointerDown);
        canvas.addEventListener('pointerup', onCanvasPointerUp);
        controlsCleanup = () => {
          controls.removeEventListener('start', onControlsStart);
          controls.removeEventListener('end', onControlsEnd);
          canvas.removeEventListener('pointerdown', onCanvasPointerDown);
          canvas.removeEventListener('pointerup', onCanvasPointerUp);
          controls.dispose();
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
          const key = `${which}|${qualityName}|${feed?.updatedAt ?? 0}|${city}|${geoRef.current?.label ?? ''}`;
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
        let motionTime = 0;
        renderer.__animate = (time, audioLevel, currentState) => {
          const delta = animationLastTime ? Math.min(2.5, (time - animationLastTime) / 16.667) : 1;
          const seconds = delta * 16.667 / 1000;
          animationLastTime = time;
          const moving = !motionPaused();
          const spin = spinSpeedRef.current;
          if (moving) motionTime += delta * 16.667;
          pointerParallax.x += (pointerParallax.targetX - pointerParallax.x) * .055;
          pointerParallax.y += (pointerParallax.targetY - pointerParallax.y) * .055;
          // Galaxy: the inner disk spins about its pole (positive Y keeps the arms trailing);
          // the outer group only carries the subtle mouse parallax.
          if (moving && activeScene === 'galaxy') galaxyDisk.rotation.y += GALAXY_SPIN_RAD_PER_SECOND * seconds * spin;
          groupGalaxy.rotation.x += (pointerParallax.y * .035 - groupGalaxy.rotation.x) * .025;
          groupGalaxy.rotation.z += (pointerParallax.x * .045 - groupGalaxy.rotation.z) * .025;
          groupSystem.rotation.x += (pointerParallax.y * .028 - groupSystem.rotation.x) * .025;
          groupSystem.rotation.z += (pointerParallax.x * .035 - groupSystem.rotation.z) * .025;
          if (moving && activeScene === 'earth' && !cityViewActive && time > earthPausedUntil) {
            groupEarth.rotation.y += EARTH_SPIN_RAD_PER_SECOND * seconds * spin;
          }
          groupEarth.rotation.x += (pointerParallax.y * .028 - groupEarth.rotation.x) * .025;
          groupEarth.rotation.z += (pointerParallax.x * .035 - groupEarth.rotation.z) * .025;
          if (moving) {
            backgroundStars.rotation.y += .000006 * delta * spin;
            if (activeScene === 'system') {
              orbitClock += seconds * spin;
              placePlanets();
            }
            planets.forEach(({ mesh }, index) => {
              mesh.rotation.y += (.0012 + .00035 / (index + 1)) * delta * spin;
            });
          }
          if (focus) {
            // Follow the chosen body: move the orbit target with it and ease the camera in.
            const goal = focus.body.mesh.getWorldPosition(focusScratch);
            const offset = goal.sub(controls.target).multiplyScalar(focus.flying ? .14 : 1);
            controls.target.add(offset);
            camera.position.add(offset);
            if (focus.flying) {
              const arm = camera.position.clone().sub(controls.target);
              const length = arm.length();
              const next = length + (focus.distance - length) * .1;
              camera.position.copy(controls.target).add(arm.setLength(next));
              if (Math.abs(next - focus.distance) < .03 && offset.length() < .005) focus.flying = false;
            }
          }
          earthMaterial.uniforms.uCloudOffset.value = (motionTime * .00001) % 1;
          sunMaterial.uniforms.uTime.value = motionTime / 1000;
          cityMarker.scale.setScalar(1 + .18 * Math.sin(motionTime * .004));
          cityHalo.scale.setScalar(1 + .12 * Math.sin(motionTime * .003));
          controls.update();
          // The neural shell has a clear window at the screen centre, so it stays camera-aligned.
          neural.group.quaternion.copy(camera.quaternion);
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
          setRenderMode('static');
          resizeObserver?.disconnect();
          composer?.dispose?.();
          composer = null;
          controlsCleanup?.();
          controlsCleanup = null;
          disposeScene?.();
          disposeScene = null;
          renderer?.dispose();
          renderer?.forceContextLoss?.();
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
      restartStaticMotionRef.current = null;
      composer?.dispose?.();
      controlsCleanup?.();
      navigationRef.current = null;
      disposeScene?.();
      renderer?.dispose();
      renderer?.forceContextLoss?.();
      renderer?.domElement.remove();
      host.replaceChildren();
    };
  }, [visible, quality, mobileViewport]);

  useEffect(() => {
    // Only the 2D fallback needs an explicit redraw; WebGL redraws every frame.
    if (visible) staticDrawRef.current?.();
  }, [scene, quality, feeds, targetCity, state, visible, autoMotion]);

  useEffect(() => {
    if (scene !== 'system') setFocusLabel(null);
  }, [scene]);

  const hint = renderMode === 'static'
    ? 'Arraste para mover · +/− para zoom'
    : mobileViewport
      ? `Arraste para girar · pinça para zoom${scene === 'system' ? ' · toque num planeta' : ''} · toque duplo recentraliza`
      : `Arraste para girar · roda ou +/− para zoom${scene === 'system' ? ' · clique num planeta' : ''} · R recentraliza`;
  const touch = () => { markHintSeen(); interactRef.current?.(); };

  return (
    <>
      <div ref={hostRef} className="cosmos-viewport" data-scene={scene} data-render-mode={renderMode} aria-hidden="true" />
      {visible && (
        <div className="cosmos-navigation" role="group" aria-label={navigationLabel ?? 'Navegação das cenas'} data-testid={`cosmos-navigation-${scene}`}>
          <div className="cosmos-navigation__status">
            {!hintSeen && <span className="cosmos-navigation__hint" data-testid={`text-cosmos-hint-${scene}`}>{hint}</span>}
            {texturesLoading && <span className="cosmos-chip" role="status" data-testid={`status-cosmos-textures-${scene}`}>Carregando texturas…</span>}
            {focusLabel && (
              <span className="cosmos-chip cosmos-chip--focus" role="status" data-testid={`status-cosmos-focus-${scene}`}>
                Seguindo {focusLabel}
                <button type="button" onClick={() => { navigationRef.current?.releaseFocus?.(); touch(); }} data-testid={`button-cosmos-release-${scene}`}>Soltar</button>
              </span>
            )}
            {!autoMotion && onEnableMotion && (
              <span className="cosmos-chip" data-testid={`status-cosmos-motion-${scene}`}>
                Movimento automático pausado
                <button type="button" onClick={onEnableMotion} data-testid={`button-cosmos-enable-motion-${scene}`}>Ativar</button>
              </span>
            )}
          </div>
          <div className="cosmos-navigation__buttons">
            <button type="button" className="cosmos-navigation__speed" aria-label={`Velocidade do giro automático: ${spinSpeed}×`} title="Velocidade do giro automático" onClick={() => { cycleSpinSpeed(); touch(); }} data-testid={`button-cosmos-speed-${scene}`}>
              <Gauge size={14} aria-hidden="true" /><span>{spinSpeed}×</span>
            </button>
            <button type="button" aria-label="Afastar" title="Afastar (−)" onClick={() => { navigationRef.current?.zoomOut(); touch(); }} data-testid={`button-cosmos-zoom-out-${scene}`}>
              <Minus size={15} aria-hidden="true" />
            </button>
            <button type="button" aria-label="Aproximar" title="Aproximar (+)" onClick={() => { navigationRef.current?.zoomIn(); touch(); }} data-testid={`button-cosmos-zoom-in-${scene}`}>
              <Plus size={15} aria-hidden="true" />
            </button>
            <button type="button" className="cosmos-navigation__recenter" aria-label="Recentralizar a vista" title="Recentralizar (R)" onClick={() => { navigationRef.current?.reset(); touch(); }} data-testid={`button-cosmos-reset-${scene}`}>
              <LocateFixed size={14} aria-hidden="true" /><span>Recentralizar</span>
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