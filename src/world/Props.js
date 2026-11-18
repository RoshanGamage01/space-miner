// Props: the trees, rocks, ore and plants around the player, drawn with
// instancing. Each prop is also a mining node with its own health.
import * as THREE from 'three';
import { GLOW, LIT, LIT_FLAT, propGeometry } from './models.js';

const TYPES = ['tree', 'bush', 'rock', 'copper', 'gold', 'sodium', 'oxygen', 'aetherium'];
const CAP = { tree: 1400, bush: 600, rock: 500, copper: 120, gold: 80, sodium: 120, oxygen: 120, aetherium: 80 };
export const PROP_RADIUS = { tree: 0.55, bush: 0, rock: 1.0, copper: 0.9, gold: 0.8, sodium: 0, oxygen: 0, aetherium: 0.8 };
const AIM = { tree: [2.2, 1.7], bush: [0.5, 0.9], rock: [0.5, 1.2], copper: [0.7, 1.1], gold: [0.6, 1.0], sodium: [0.6, 0.6], oxygen: [0.5, 0.6], aetherium: [0.9, 1.1] };

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const qy = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const v = new THREE.Vector3();
const s3 = new THREE.Vector3();

export class Props {
  constructor(planet, group, density = 1) {
    this.planet = planet;
    this.group = new THREE.Group();
    group.add(this.group);
    this.density = density;
    this.meshes = {};
    for (const t of TYPES) {
      if (t === 'tree' && planet.biome.tree === 'none') continue;
      const g = propGeometry(t, planet.biome);
      const mat = t === 'rock' || planet.biome.tree === 'spire' ? LIT_FLAT : LIT;
      const lit = g.lit && new THREE.InstancedMesh(g.lit, mat, CAP[t]);
      const glow = g.glow && new THREE.InstancedMesh(g.glow, GLOW, CAP[t]);
      for (const m of [lit, glow]) if (m) {
        m.count = 0;
        m.frustumCulled = false;
        m.castShadow = m === lit && t !== 'bush';
        m.receiveShadow = m === lit;
        this.group.add(m);
      }
      this.meshes[t] = { lit, glow };
    }
    this.active = [];
    this.cellKey = '';
    this.depleted = new Set();
    this.cache = new Map();
    this.radiusCells = density > 0.9 ? 3 : 2;
  }

  cell(face, i, j) {
    const key = `${face}.${i}.${j}`;
    let c = this.cache.get(key);
    if (!c) {
      c = this.planet.propsForCell(face, i, j);
      for (const p of c) {
        p.hp0 = p.hp;
        p.given = 0;
        p.v = new THREE.Vector3(p.pos[0], p.pos[1], p.pos[2]);
        p.up = new THREE.Vector3(p.dir[0], p.dir[1], p.dir[2]);
      }
      if (this.cache.size > 400) this.cache.delete(this.cache.keys().next().value);
      this.cache.set(key, c);
    }
    return c;
  }

  // Rebuild the instance buffers when the player walks into a new cell.
  update(local, force = false) {
    const pl = this.planet;
    const d = v.copy(local).normalize();
    const c = pl.cellOf(d.x, d.y, d.z);
    const key = `${c.face}.${c.i}.${c.j}`;
    if (key === this.cellKey && !force) return;
    this.cellKey = key;
    // Sample a grid of directions around the player so cells across cube
    // face edges are found too.
    const up = Math.abs(d.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : UP;
    const t = new THREE.Vector3().crossVectors(up, d).normalize();
    const bt = new THREE.Vector3().crossVectors(d, t);
    const step = 1.25 / 32; // radians per cell, approx
    const cells = new Map();
    const R = this.radiusCells;
    for (let a = -R; a <= R; a++)
      for (let b = -R; b <= R; b++) {
        const q2 = new THREE.Vector3().copy(d).addScaledVector(t, a * step).addScaledVector(bt, b * step).normalize();
        const cc = pl.cellOf(q2.x, q2.y, q2.z);
        cells.set(`${cc.face}.${cc.i}.${cc.j}`, cc);
      }
    this.active = [];
    const counts = {};
    for (const cc of cells.values()) {
      for (const p of this.cell(cc.face, cc.i, cc.j)) {
        if (this.depleted.has(p.id)) continue;
        const m = this.meshes[p.type];
        if (!m) continue;
        const n = counts[p.type] || 0;
        if (n >= CAP[p.type]) continue;
        p.slot = n;
        counts[p.type] = n + 1;
        this.active.push(p);
        this.write(p);
      }
    }
    for (const tname in this.meshes) {
      const m = this.meshes[tname];
      for (const mesh of [m.lit, m.glow]) if (mesh) {
        mesh.count = counts[tname] || 0;
        mesh.instanceMatrix.needsUpdate = true;
      }
    }
  }

  write(p, shrink = 1) {
    q.setFromUnitVectors(UP, p.up);
    qy.setFromAxisAngle(UP, p.rot);
    q.multiply(qy);
    const k = p.scale * shrink;
    m4.compose(p.v, q, s3.set(k, k, k));
    const m = this.meshes[p.type];
    if (m.lit) m.lit.setMatrixAt(p.slot, m4);
    if (m.glow) m.glow.setMatrixAt(p.slot, m4);
  }

  // Nearest prop along a ray (planet-local coordinates).
  raycast(origin, dir, maxDist) {
    let best = null;
    let bt = maxDist;
    for (const p of this.active) {
      const [h, r] = AIM[p.type];
      const cx = p.v.x + p.up.x * h * p.scale - origin.x;
      const cy = p.v.y + p.up.y * h * p.scale - origin.y;
      const cz = p.v.z + p.up.z * h * p.scale - origin.z;
      const tca = cx * dir.x + cy * dir.y + cz * dir.z;
      if (tca < 0 || tca > bt + 4) continue;
      const d2 = cx * cx + cy * cy + cz * cz - tca * tca;
      const rr = r * p.scale;
      if (d2 > rr * rr) continue;
      const t = tca - Math.sqrt(rr * rr - d2);
      if (t < bt) {
        bt = t;
        best = p;
      }
    }
    return best ? { prop: best, dist: Math.max(0, bt) } : null;
  }

  // Apply mining damage. Returns the units of resource released.
  mine(p, dmg) {
    p.hp -= dmg;
    const frac = 1 - Math.max(0, p.hp) / p.hp0;
    const due = Math.floor(p.amount * frac) - p.given;
    p.given += Math.max(0, due);
    if (p.hp <= 0) {
      this.depleted.add(p.id);
      this.update(p.v, true);
      return { res: p.res, n: Math.max(0, due), done: true };
    }
    this.write(p, 0.55 + 0.45 * (p.hp / p.hp0));
    const m = this.meshes[p.type];
    if (m.lit) m.lit.instanceMatrix.needsUpdate = true;
    if (m.glow) m.glow.instanceMatrix.needsUpdate = true;
    return { res: p.res, n: Math.max(0, due), done: false };
  }

  dispose() {
    this.group.parent?.remove(this.group);
    for (const t in this.meshes) for (const m of [this.meshes[t].lit, this.meshes[t].glow]) if (m) {
      m.geometry.dispose();
      m.dispose();
    }
  }
}
