// StarSystem: everything you can see in one solar system. Positions are kept
// in "system space" (metres from the sun, double precision) and re-based
// around the camera every frame.
import * as THREE from 'three';
import { getPlanet } from '../universe/planet.js';
import { PlanetBody } from './Terrain.js';
import { nebulaMaterial, sunMaterial } from './shaders.js';

export class StarSystem {
  constructor(engine, sys) {
    this.engine = engine;
    this.sys = sys;
    this.group = new THREE.Group();
    engine.scene.add(this.group);
    this.time = 0;

    const tint = sys.star.color.map((c, i) => c * [0.5, 0.6, 1][i]);
    this.nebula = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), nebulaMaterial(sys.seed, tint));
    this.nebula.renderOrder = -10;
    this.nebula.frustumCulled = false;
    this.group.add(this.nebula);

    // Bright foreground stars.
    const n = 2600;
    const pos = new Float32Array(n * 3);
    const colr = new Float32Array(n * 3);
    let s = sys.seed >>> 0;
    const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < n; i++) {
      const z = rnd() * 2 - 1;
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(1 - z * z);
      pos.set([r * Math.cos(a) * 9e6, z * 9e6, r * Math.sin(a) * 9e6], i * 3);
      const t = rnd();
      const b = 0.5 + rnd() * 1.6;
      colr.set([b * (0.8 + t * 0.2), b * 0.9, b * (1 - t * 0.25)], i * 3);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    sg.setAttribute('color', new THREE.BufferAttribute(colr, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 1.7, sizeAttenuation: false, vertexColors: true, fog: false, depthWrite: false, transparent: true }));
    this.stars.renderOrder = -9;
    this.stars.frustumCulled = false;
    this.group.add(this.stars);

    this.sunMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), sunMaterial(sys.star.color));
    this.sunMesh.scale.setScalar(26000);
    this.sunMesh.frustumCulled = false;
    this.sunMesh.renderOrder = -5;
    this.group.add(this.sunMesh);

    this.planets = sys.planets.map((desc) => {
      const planet = getPlanet(desc);
      const body = new PlanetBody(planet, engine.q);
      this.group.add(body.group);
      return { planet, body, pos: new THREE.Vector3(...desc.pos) };
    });
    this.stationPos = new THREE.Vector3(...sys.station.pos);
  }

  // The planet whose surface is closest to a point in system space.
  nearest(p) {
    let best = null;
    let bd = Infinity;
    for (const pl of this.planets) {
      const d = p.distanceTo(pl.pos) - pl.planet.radius;
      if (d < bd) {
        bd = d;
        best = pl;
      }
    }
    return { pl: best, altitude: bd };
  }

  update(cam, dt) {
    this.time += dt;
    const e = this.engine;
    this.nebula.position.set(0, 0, 0);
    this.nebula.scale.setScalar(1e6);
    this.stars.position.set(0, 0, 0);
    this.sunMesh.position.copy(cam).multiplyScalar(-1);
    const sunDir = cam.clone().multiplyScalar(-1).normalize();
    const { pl: near, altitude } = this.nearest(cam);
    let pending = 0;
    for (const pl of this.planets) {
      pl.body.group.position.copy(pl.pos).sub(cam);
      const local = cam.clone().sub(pl.pos);
      const psun = pl.pos.clone().multiplyScalar(-1).normalize();
      const q = pl.body.update(local, psun, this.time, pl === near ? e.q.lod : 0);
      if (pl === near) pending = q;
    }
    // Lighting follows where the camera is: full sun in space, sky-lit and
    // fogged inside an atmosphere, dark on the night side.
    const b = near.planet.biome;
    const H = near.body.atmoTop - near.planet.radius;
    const inAtmo = near.planet.desc.atmosphere ? Math.max(0, Math.min(1, 1 - altitude / H)) : 0;
    const up = cam.clone().sub(near.pos).normalize();
    const elev = up.dot(sunDir);
    const day = altitude < H * 2 ? Math.max(0, Math.min(1, (elev + 0.12) / 0.3)) : 1;
    const dusk = Math.max(0, 1 - Math.abs(elev) * 4) * inAtmo;
    const c = this.sys.star.color;
    const sunCol = [c[0], c[1] * (1 - dusk * 0.45), c[2] * (1 - dusk * 0.75)];
    const sky = [b.sky[0] * 0.6 + 0.2, b.sky[1] * 0.6 + 0.2, b.sky[2] * 0.6 + 0.2];
    e.setLighting(sunDir, sunCol, day, sky, 0.1 + inAtmo * (0.12 + 0.6 * day));
    e.fog.density = inAtmo * inAtmo * 0.0011 * (b.thinAir ? 0.2 : 1);
    const f = 0.06 + 0.94 * day;
    e.fog.color.setRGB(b.fog[0] * f + dusk * 0.25, b.fog[1] * f + dusk * 0.08, b.fog[2] * f);
    const starFade = 1 - Math.min(1, inAtmo * 1.6) * day;
    this.stars.material.opacity = starFade;
    this.nebula.material.uniforms.uFade.value = starFade;
    this.env = { near, altitude, inAtmo, day, sunDir, up, pending };
    return this.env;
  }

  dispose() {
    for (const pl of this.planets) pl.body.dispose();
    this.engine.scene.remove(this.group);
    this.nebula.geometry.dispose();
    this.nebula.material.dispose();
    this.stars.geometry.dispose();
    this.sunMesh.geometry.dispose();
  }
}
