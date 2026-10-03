declare module 'three/addons/postprocessing/EffectComposer.js' {
  export class EffectComposer {
    constructor(renderer: unknown);
    addPass(pass: unknown): void;
    render(): void;
    setSize(width: number, height: number): void;
    dispose(): void;
  }
}

declare module 'three/addons/postprocessing/RenderPass.js' {
  export class RenderPass {
    constructor(scene: unknown, camera: unknown);
  }
}

declare module 'three/addons/postprocessing/UnrealBloomPass.js' {
  export class UnrealBloomPass {
    constructor(resolution: unknown, strength: number, radius: number, threshold: number);
    enabled: boolean;
  }
}