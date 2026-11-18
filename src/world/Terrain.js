// PlanetBody: renders one planet. Terrain is a cube-sphere quadtree: patches
// split as the camera approaches, down to sub-metre detail underfoot, so you
// can fly from orbit to the ground with no loading screen.
import * as THREE from 'three';
import { faceDir } from '../universe/planet.js';
import { atmosphereMaterial, cloudMaterial, terrainMaterial, waterMaterial } from './shaders.js';

const N = 32; // cells per patch edge
const G = N + 3; // sample grid including the skirt ring
const SPLIT = 1.75;
const tmp = [0, 0, 0];
const col = [0, 0, 0];

// Shared index buffer for every patch.
const INDEX = (() => {
  const idx = [];
  for (let b = 0; b < G - 1; b++)
    for (let a = 0; a < G - 1; a++) {
      const i = b * G + a;
      idx.push(i, i + 1, i + G, i + 1, i + G + 1, i + G);
    }
  return new THREE.BufferAttribute(new Uint16Array(idx), 1);
})();

class Node {
  constructor(body, face, level, x, y) {
    this.body = body;
    this.face = face;
    this.level = level;
    this.x = x;
    this.y = y;
    this.children = null;
    this.mesh = null;
    const n = 1 << level;
    this.u0 = (x / n) * 2 - 1;
    this.v0 = (y / n) * 2 - 1;
    this.du = 2 / n;
    faceDir(face, this.u0 + this.du / 2, this.v0 + this.du / 2, tmp);
    this.dir = new THREE.Vector3(tmp[0], tmp[1], tmp[2]);
    this.size = (body.planet.radius * 1.6) / n;
    this.center = this.dir.clone().multiplyScalar(body.planet.radius);
  }

  build() {
    const planet = this.body.planet;
    const R = planet.radius;
    const pos = new Float32Array(G * G * 3);
    const hs = new Float32Array(G * G);
    for (let b = 0; b < G; b++)
      for (let a = 0; a < G; a++) {
        faceDir(this.face, this.u0 + ((a - 1) / N) * this.du, this.v0 + ((b - 1) / N) * this.du, tmp);
        const h = planet.height(tmp[0], tmp[1], tmp[2]);
        const r = R + h;
        const i = b * G + a;
        hs[i] = h;
        pos[i * 3] = tmp[0] * r;
        pos[i * 3 + 1] = tmp[1] * r;
        pos[i * 3 + 2] = tmp[2] * r;
      }
    const nor = new Float32Array(G * G * 3);
    const colr = new Float32Array(G * G * 3);
    let hMax = -1e9;
    for (let b = 1; b < G - 1; b++)
      for (let a = 1; a < G - 1; a++) {
        const i = b * G + a;
        const l = (i - 1) * 3, r = (i + 1) * 3, d = (i - G) * 3, u = (i + G) * 3;
        const ax = pos[r] - pos[l], ay = pos[r + 1] - pos[l + 1], az = pos[r + 2] - pos[l + 2];
        const bx = pos[u] - pos[d], by = pos[u + 1] - pos[d + 1], bz = pos[u + 2] - pos[d + 2];
        let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
        const px = pos[i * 3], py = pos[i * 3 + 1], pz = pos[i * 3 + 2];
        const pl = Math.hypot(px, py, pz);
        if (nx * px + ny * py + nz * pz < 0) {
          nx = -nx;
          ny = -ny;
          nz = -nz;
        }
        const nl = Math.hypot(nx, ny, nz) || 1;
        nx /= nl;
        ny /= nl;
        nz /= nl;
        nor[i * 3] = nx;
        nor[i * 3 + 1] = ny;
        nor[i * 3 + 2] = nz;
        const dot = (nx * px + ny * py + nz * pz) / pl;
        const slope = Math.sqrt(Math.max(0, 1 - dot * dot));
        planet.color(px / pl, py / pl, pz / pl, hs[i], slope, col);
        // Darken the sea bed with depth.
        const wet = hs[i] < 0 && planet.hasWater ? Math.max(0.25, 1 + hs[i] / 30) : 1;
        colr[i * 3] = col[0] * wet;
        colr[i * 3 + 1] = col[1] * wet;
        colr[i * 3 + 2] = col[2] * wet;
        if (hs[i] > hMax) hMax = hs[i];
      }
    // Skirt: the outer ring copies its inner neighbour, pulled toward the core
    // to hide cracks between patches of different detail.
    const skirt = 1 - (this.size * 0.08 + 1.5) / R;
    for (let b = 0; b < G; b++)
      for (let a = 0; a < G; a++) {
        if (a > 0 && a < G - 1 && b > 0 && b < G - 1) continue;
        const ca = Math.min(G - 2, Math.max(1, a));
        const cb = Math.min(G - 2, Math.max(1, b));
        const i = (b * G + a) * 3;
        const s = (cb * G + ca) * 3;
        pos[i] = pos[s] * skirt;
        pos[i + 1] = pos[s + 1] * skirt;
        pos[i + 2] = pos[s + 2] * skirt;
        for (let k = 0; k < 3; k++) {
          nor[i + k] = nor[s + k];
          colr[i + k] = colr[s + k];
        }
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colr, 3));
    geo.setIndex(INDEX);
    geo.boundingSphere = new THREE.Sphere(this.dir.clone().multiplyScalar(R + hMax * 0.5), this.size * 0.9 + Math.abs(hMax) + 20);
    this.mesh = new THREE.Mesh(geo, this.body.material);
    this.mesh.visible = false;
    const fine = this.level >= this.body.maxLevel - 3;
    this.mesh.castShadow = fine;
    this.mesh.receiveShadow = true;
    this.mesh.matrixAutoUpdate = false;
    this.body.group.add(this.mesh);
    this.body.built++;
  }

  dispose() {
    if (this.children) for (const c of this.children) c.dispose();
    this.children = null;
    if (this.mesh) {
      this.body.group.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh = null;
    }
  }
}

export class PlanetBody {
  constructor(planet, quality = {}) {
    this.planet = planet;
    this.group = new THREE.Group();
    this.group.matrixAutoUpdate = true;
    this.material = terrainMaterial();
    this.built = 0;
    this.queue = [];
    this.maxLevel = Math.max(4, Math.round(Math.log2((planet.radius * 1.6) / 26)));
    this.roots = [];
    for (let f = 0; f < 6; f++) {
      const n = new Node(this, f, 0, 0, 0);
      n.build();
      this.roots.push(n);
    }
    const b = planet.biome;
    const R = planet.radius;
    this.atmoTop = R * 1.0 + Math.max(260, R * 0.28);
    if (planet.hasWater) {
      this.waterMat = waterMaterial({ color: b.waterColor, lava: !!b.lava, sky: b.sky });
      this.water = new THREE.Mesh(new THREE.SphereGeometry(R, 160, 80), this.waterMat);
      this.water.renderOrder = 1;
      this.group.add(this.water);
    }
    if (planet.desc.atmosphere) {
      const seg = 64;
      const geo = new THREE.SphereGeometry(this.atmoTop, seg, seg / 2);
      const steps = quality.sky || [14, 5];
      this.skyIn = new THREE.Mesh(geo, atmosphereMaterial({ radius: R, top: this.atmoTop, tint: b.sky, inside: true, steps: steps[0], lsteps: steps[1] }));
      this.skyOut = new THREE.Mesh(geo, atmosphereMaterial({ radius: R, top: this.atmoTop, tint: b.sky, inside: false, steps: steps[0], lsteps: steps[1] }));
      this.skyIn.renderOrder = 2;
      this.skyOut.renderOrder = 4;
      this.skyIn.frustumCulled = this.skyOut.frustumCulled = false;
      this.group.add(this.skyIn, this.skyOut);
      if (b.clouds > 0.05) {
        this.cloudMat = cloudMaterial({ cover: b.clouds, seed: planet.seed });
        this.clouds = new THREE.Mesh(new THREE.SphereGeometry(R + 210, 96, 48), this.cloudMat);
        this.clouds.renderOrder = 3;
        this.group.add(this.clouds);
      }
    }
  }

  // camLocal: camera position relative to the planet centre.
  update(camLocal, sunDir, time, budget = 2) {
    const dist = camLocal.length();
    const R = this.planet.radius;
    this.queue.length = 0;
    // Patches beyond the horizon are never refined.
    const horizon = Math.acos(Math.min(1, R / Math.max(dist, R + 1))) + 0.35;
    this.cosHorizon = Math.cos(Math.min(Math.PI, horizon + 0.25));
    this.camDir = camLocal.clone().normalize();
    for (const r of this.roots) this.visit(r, camLocal);
    this.queue.sort((a, b) => a.d - b.d);
    for (let i = 0; i < Math.min(budget, this.queue.length); i++) {
      const n = this.queue[i].n;
      if (!n.children) n.children = [0, 1, 2, 3].map((k) => new Node(this, n.face, n.level + 1, n.x * 2 + (k & 1), n.y * 2 + (k >> 1)));
      for (const c of n.children) if (!c.mesh) {
        c.build();
        break;
      }
    }
    for (const m of [this.skyIn, this.skyOut]) {
      if (!m) continue;
      m.material.uniforms.uCenter.value.copy(this.group.position);
      m.material.uniforms.uSun.value.copy(sunDir);
      m.material.uniforms.uCamInside.value = dist < this.atmoTop ? 1 : 0;
    }
    if (this.waterMat) {
      this.waterMat.uniforms.uTime.value = time;
      this.waterMat.uniforms.uSun.value.copy(sunDir);
    }
    if (this.cloudMat) {
      this.cloudMat.uniforms.uTime.value = time;
      this.cloudMat.uniforms.uSun.value.copy(sunDir);
    }
    return this.queue.length;
  }

  visit(node, cam) {
    const d = Math.max(1, cam.distanceTo(node.center) - node.size * 0.5);
    const facing = node.level < 2 || node.dir.dot(this.camDir) > this.cosHorizon - node.size / this.planet.radius;
    const want = node.level < this.maxLevel && facing && d < node.size * SPLIT;
    if (want) {
      const ready = node.children && node.children.every((c) => c.mesh);
      if (!ready) {
        this.queue.push({ n: node, d });
        if (node.mesh) node.mesh.visible = true;
        if (node.children) for (const c of node.children) this.hide(c);
      } else {
        if (node.mesh) node.mesh.visible = false;
        for (const c of node.children) this.visit(c, cam);
      }
    } else {
      if (node.mesh) node.mesh.visible = true;
      if (node.children) {
        // Keep children briefly so small camera moves do not thrash.
        if (d > node.size * SPLIT * 1.5) {
          for (const c of node.children) c.dispose();
          node.children = null;
        } else for (const c of node.children) this.hide(c);
      }
    }
  }

  hide(node) {
    if (node.mesh) node.mesh.visible = false;
    if (node.children) for (const c of node.children) this.hide(c);
  }

  dispose() {
    for (const r of this.roots) r.dispose();
    this.material.dispose();
    for (const m of [this.water, this.skyIn, this.skyOut, this.clouds]) if (m) {
      m.geometry.dispose();
      m.material.dispose();
    }
  }
}
