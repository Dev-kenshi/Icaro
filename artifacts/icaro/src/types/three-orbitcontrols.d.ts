declare module 'three/addons/controls/OrbitControls.js' {
  import type { Camera, Vector3 } from 'three';

  export class OrbitControls {
    constructor(camera: Camera, domElement?: HTMLElement | null);
    target: Vector3;
    enableDamping: boolean;
    dampingFactor: number;
    enablePan: boolean;
    screenSpacePanning: boolean;
    rotateSpeed: number;
    zoomSpeed: number;
    minDistance: number;
    maxDistance: number;
    update(): boolean;
    dispose(): void;
  }
}