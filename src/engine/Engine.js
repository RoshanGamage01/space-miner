// Engine: WebGL renderer, HDR post-processing (bloom + filmic tone mapping),
// sun/sky lighting with shadows, and a camera that always sits at the world
// origin (floating origin) so planets thousands of kilometres apart stay
// precise.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export const QUALITY = {
  low: { scale: 0.6, shadows: 0, bloom: false, msaa: 0, props: 0.5, lod: 1, sky: [8, 3] },
  medium: { scale: 0.8, shadows: 1024, bloom: true, msaa: 0, props: 0.8, lod: 2, sky: [10, 4] },
  high: { scale: 1, shadows: 2048, bloom: true, msaa: 4, props: 1, lod: 3, sky: [14, 5] },
  ultra: { scale: 1, shadows: 4096, bloom: true, msaa: 8, props: 1.3, lod: 4, sky: [20, 7] },
};

export class Engine {
  constructor(canvas, quality = 'high') {
    this.canvas = canvas;
    this.q = QUALITY[quality] || QUALITY.high;
    this.qualityName = quality;
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, logarithmicDepthBuffer: true, powerPreference: 'high-performance' }));
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.82;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = this.q.shadows > 0;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000004);
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.12, 6e7);
    this.scene.add(this.camera);

    this.sun = new THREE.DirectionalLight(0xffffff, 3.2);
    this.sun.castShadow = this.q.shadows > 0;
    if (this.q.shadows) {
      const s = this.sun.shadow;
      s.mapSize.set(this.q.shadows, this.q.shadows);
      s.camera.left = s.camera.bottom = -110;
      s.camera.right = s.camera.top = 110;
      s.camera.near = 10;
      s.camera.far = 900;
      s.bias = -0.0006;
      s.normalBias = 0.6;
    }
    this.scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0x9fc4ff, 0x40362c, 0.6);
    this.scene.add(this.hemi);
    this.fog = new THREE.FogExp2(0x9fb8d0, 0);
    this.scene.fog = this.fog;

    const size = new THREE.Vector2(2, 2);
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: this.q.msaa });
    this.composer = new EffectComposer(r, target);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    if (this.q.bloom) {
      this.bloom = new UnrealBloomPass(size, 0.4, 0.6, 1.0);
      this.composer.addPass(this.bloom);
    }
    this.composer.addPass(new OutputPass());
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = this.canvas.clientWidth || innerWidth;
    const h = this.canvas.clientHeight || innerHeight;
    const pr = Math.min(devicePixelRatio || 1, 2) * this.q.scale;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // sunDir: unit vector toward the sun. day: 0 night .. 1 noon at the camera.
  setLighting(sunDir, color, day, skyColor, ambient) {
    this.sun.position.copy(sunDir).multiplyScalar(400);
    this.sun.target.position.set(0, 0, 0);
    this.sun.color.setRGB(color[0], color[1], color[2]);
    this.sun.intensity = 3.0 * day;
    this.hemi.color.setRGB(skyColor[0], skyColor[1], skyColor[2]);
    this.hemi.intensity = ambient;
  }

  render() {
    this.composer.render();
  }
}
