declare module 'three/addons/controls/OrbitControls.js' {
  import type { Camera, Vector3 } from 'three';

  export type OrbitControlsEvent = 'start' | 'end' | 'change';

  export class OrbitControls {
    constructor(camera: Camera, domElement?: HTMLElement | null);
    target: Vector3;
    enabled: boolean;
    enableDamping: boolean;
    dampingFactor: number;
    enablePan: boolean;
    enableRotate: boolean;
    enableZoom: boolean;
    screenSpacePanning: boolean;
    rotateSpeed: number;
    zoomSpeed: number;
    panSpeed: number;
    minDistance: number;
    maxDistance: number;
    minPolarAngle: number;
    maxPolarAngle: number;
    touches: { ONE?: number; TWO?: number };
    rotateLeft(angle: number): void;
    rotateUp(angle: number): void;
    update(deltaTime?: number | null): boolean;
    addEventListener(type: OrbitControlsEvent, listener: () => void): void;
    removeEventListener(type: OrbitControlsEvent, listener: () => void): void;
    dispose(): void;
  }
}
