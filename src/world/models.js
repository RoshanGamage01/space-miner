// Procedural models. Everything is assembled from primitives into at most two
// meshes per model: a lit PBR mesh with vertex colours and an unlit HDR
// "glow" mesh (windows, engines, crystals) that the bloom pass picks up.
import * as THREE from 'three';

const BASE = {
  box: () => new THREE.BoxGeometry(1, 1, 1),
  sphere: () => new THREE.SphereGeometry(0.5, 18, 12),
  cyl: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 14),
  taper: () => new THREE.CylinderGeometry(0.3, 0.5, 1, 14),
  cone: () => new THREE.ConeGeometry(0.5, 1, 14),
  capsule: () => new THREE.CapsuleGeometry(0.5, 1, 6, 12),
  torus: () => new THREE.TorusGeometry(0.5, 0.06, 8, 40),
  ring: () => new THREE.TorusGeometry(0.5, 0.14, 10, 40),
  ico: () => new THREE.IcosahedronGeometry(0.5, 1),
  rock: () => new THREE.IcosahedronGeometry(0.5, 2),
  octa: () => new THREE.OctahedronGeometry(0.5, 0),
  disc: () => new THREE.CylinderGeometry(0.5, 0.5, 0.02, 24),
  dome: () => new THREE.SphereGeometry(0.5, 18, 9, 0, Math.PI * 2, 0, Math.PI / 2),
};
const geoCache = {};
const base = (k) => (geoCache[k] ||= BASE[k]().toNonIndexed());

export const LIT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.08 });
export const LIT_FLAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.02, flatShading: true });
export const METAL = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.3 });
export const GLOW = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const eul = new THREE.Euler();
const v3 = new THREE.Vector3();
const hex = (c) => (typeof c === 'string' ? new THREE.Color(c).toArray() : c);

// part: [shape, color, [x,y,z], [sx,sy,sz], [rx,ry,rz]?, glow?, jitter?]
export function build(parts) {
  const lit = { pos: [], nor: [], col: [] };
  const glow = { pos: [], nor: [], col: [] };
  for (const [shape, color, p = [0, 0, 0], s = [1, 1, 1], r = [0, 0, 0], g = 0, jitter = 0] of parts) {
    const src = base(shape);
    const c = hex(color);
    const dst = g ? glow : lit;
    const k = g ? g : 1;
    m4.compose(v3.set(p[0], p[1], p[2]), q.setFromEuler(eul.set(r[0], r[1], r[2])), new THREE.Vector3(s[0], s[1], s[2]));
    const nm = new THREE.Matrix3().getNormalMatrix(m4);
    const pa = src.attributes.position.array;
    const na = src.attributes.normal.array;
    for (let i = 0; i < pa.length; i += 3) {
      let x = pa[i], y = pa[i + 1], z = pa[i + 2];
      if (jitter) {
        // Deterministic lumpiness for rocks.
        const h = Math.sin(x * 12.9898 * jitter + y * 78.233 + z * 37.719) * 43758.5453;
        const f = 1 + ((h - Math.floor(h)) - 0.5) * 0.35;
        x *= f; y *= f; z *= f;
      }
      v3.set(x, y, z).applyMatrix4(m4);
      dst.pos.push(v3.x, v3.y, v3.z);
      v3.set(na[i], na[i + 1], na[i + 2]).applyMatrix3(nm).normalize();
      dst.nor.push(v3.x, v3.y, v3.z);
      dst.col.push(c[0] * k, c[1] * k, c[2] * k);
    }
  }
  const mk = (d, flat) => {
    if (!d.pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(d.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(d.col, 3));
    if (flat) g.computeVertexNormals();
    else g.setAttribute('normal', new THREE.Float32BufferAttribute(d.nor, 3));
    return g;
  };
  return { lit: mk(lit, parts.flat), glow: mk(glow) };
}

export function toGroup(built, mat = LIT, shadows = true) {
  const g = new THREE.Group();
  if (built.lit) {
    const m = new THREE.Mesh(built.lit, mat);
    m.castShadow = m.receiveShadow = shadows;
    g.add(m);
  }
  if (built.glow) g.add(new THREE.Mesh(built.glow, GLOW));
  return g;
}
const model = (parts, mat, shadows) => toGroup(build(parts), mat, shadows);

// ------------------------------------------------------------ characters
// A jointed humanoid. Returns { group, parts } so it can be animated.
export function humanoid({ skin = [0.9, 0.9, 0.92], accent = [1, 0.5, 0.1], visor = [0.3, 0.9, 1], height = 1, width = 1, style = 'astronaut' }) {
  const g = new THREE.Group();
  const dark = [0.12, 0.13, 0.16];
  const parts = {};
  const add = (name, list, y, mat = LIT) => {
    const o = model(list, mat);
    o.position.y = y;
    g.add(o);
    parts[name] = o;
    return o;
  };
  const w = width;
  const torso = [['capsule', skin, [0, 0, 0], [0.5 * w, 0.26, 0.34]], ['box', accent, [0, 0.12, 0.17], [0.3 * w, 0.14, 0.04]]];
  const head = [];
  if (style === 'astronaut' || style === 'raider') {
    torso.push(['box', style === 'raider' ? dark : [0.55, 0.57, 0.62], [0, 0.05, -0.24], [0.4 * w, 0.52, 0.2]], ['cyl', accent, [0.13, 0.36, -0.24], [0.08, 0.2, 0.08]], ['cyl', accent, [-0.13, 0.36, -0.24], [0.08, 0.2, 0.08]]);
    head.push(['sphere', style === 'raider' ? dark : skin, [0, 0, 0], [0.42, 0.42, 0.42]], ['sphere', [0.03, 0.04, 0.06], [0, 0, 0.07], [0.34, 0.26, 0.32]], ['box', visor, [0, 0, 0.215], [0.24, 0.07, 0.02], [0, 0, 0], 2.5]);
  } else if (style === 'thalori') {
    torso.push(['cone', accent, [0, -0.35, 0], [0.62, 0.9, 0.5]]);
    head.push(['sphere', skin, [0, 0.06, 0], [0.3, 0.46, 0.32]], ['sphere', [1, 1, 1], [0.08, 0.06, 0.14], [0.06, 0.09, 0.04], [0, 0, 0], 2.2], ['sphere', [1, 1, 1], [-0.08, 0.06, 0.14], [0.06, 0.09, 0.04], [0, 0, 0], 2.2], ['torus', accent, [0, 0.3, 0], [0.34, 0.34, 0.34], [Math.PI / 2, 0, 0]]);
  } else if (style === 'grumm') {
    torso.push(['box', dark, [0, 0.22, 0], [0.72 * w, 0.16, 0.42]], ['sphere', accent, [0.36 * w, 0.25, 0], [0.26, 0.2, 0.26]], ['sphere', accent, [-0.36 * w, 0.25, 0], [0.26, 0.2, 0.26]]);
    head.push(['sphere', skin, [0, 0, 0], [0.42, 0.36, 0.4]], ['cone', [0.95, 0.92, 0.8], [0.12, -0.08, 0.17], [0.05, 0.16, 0.05], [0.5, 0, 0]], ['cone', [0.95, 0.92, 0.8], [-0.12, -0.08, 0.17], [0.05, 0.16, 0.05], [0.5, 0, 0]], ['box', [1, 0.6, 0.1], [0, 0.05, 0.19], [0.22, 0.04, 0.02], [0, 0, 0], 2.5]);
  } else {
    torso.push(['capsule', accent, [0, -0.1, -0.06], [0.3, 0.3, 0.2]]);
    head.push(['sphere', skin, [0, 0.02, 0], [0.36, 0.34, 0.4]]);
    for (const [ex, ey] of [[0.09, 0.07], [-0.09, 0.07], [0.14, -0.02], [-0.14, -0.02], [0, 0.0]]) head.push(['sphere', [0.6, 1, 0.3], [ex, ey, 0.17], [0.06, 0.06, 0.03], [0, 0, 0], 2.5]);
    head.push(['cyl', skin, [0.1, 0.26, 0], [0.02, 0.26, 0.02], [0, 0, -0.3]], ['cyl', skin, [-0.1, 0.26, 0], [0.02, 0.26, 0.02], [0, 0, 0.3]]);
  }
  add('torso', torso, 1.12 * height);
  add('head', head, 1.62 * height);
  const limb = (name, x, y, len, col, extra = []) => {
    const o = new THREE.Group();
    o.add(model([['capsule', col, [0, -len / 2, 0], [0.15, len * 0.62, 0.15]], ...extra]));
    o.position.set(x, y, 0);
    g.add(o);
    parts[name] = o;
  };
  const limbCol = style === 'raider' ? dark : skin;
  limb('legL', 0.13 * w, 0.82 * height, 0.8 * height, limbCol, [['box', dark, [0, -0.8 * height, 0.05], [0.17, 0.1, 0.28]]]);
  limb('legR', -0.13 * w, 0.82 * height, 0.8 * height, limbCol, [['box', dark, [0, -0.8 * height, 0.05], [0.17, 0.1, 0.28]]]);
  limb('armL', 0.33 * w, 1.36 * height, 0.62 * height, limbCol);
  limb('armR', -0.33 * w, 1.36 * height, 0.62 * height, limbCol, style === 'astronaut' || style === 'raider' ? [['box', dark, [0, -0.62 * height, 0.14], [0.07, 0.1, 0.42]], ['box', style === 'raider' ? [1, 0.2, 0.1] : visor, [0, -0.62 * height, 0.36], [0.05, 0.05, 0.06], [0, 0, 0], 3]] : []);
  if (style === 'vesh') {
    limb('armL2', 0.3 * w, 1.12 * height, 0.5 * height, skin);
    limb('armR2', -0.3 * w, 1.12 * height, 0.5 * height, skin);
  }
  return { group: g, parts, phase: Math.random() * 6 };
}

// Walk / idle animation for a humanoid.
export function animateHumanoid(h, t, speed, aiming = false) {
  const p = h.parts;
  const sw = Math.sin(t * 9) * Math.min(1, speed / 4) * 0.7;
  p.legL.rotation.x = sw;
  p.legR.rotation.x = -sw;
  p.armL.rotation.x = -sw * 0.8;
  p.armR.rotation.x = aiming ? -1.45 : sw * 0.8;
  p.torso.position.y += 0; // keep
  p.head.rotation.y = speed < 0.3 ? Math.sin(t * 0.7 + h.phase) * 0.25 : 0;
  if (p.armL2) {
    p.armL2.rotation.x = Math.sin(t * 1.3 + h.phase) * 0.3 - 0.4;
    p.armR2.rotation.x = Math.cos(t * 1.1 + h.phase) * 0.3 - 0.4;
  }
}

export function creature({ color = [0.5, 0.4, 0.3], belly = [0.8, 0.7, 0.5], size = 1, legs = 4, hostile = false }) {
  const g = new THREE.Group();
  const parts = { legs: [] };
  const body = [['sphere', color, [0, 0, 0], [0.7, 0.6, 1.3]], ['sphere', belly, [0, -0.08, 0.05], [0.6, 0.5, 1.1]], ['sphere', color, [0, 0.25, 0.75], [0.45, 0.42, 0.55]], ['sphere', [0.02, 0.02, 0.02], [0.15, 0.32, 0.95], [0.08, 0.08, 0.06]], ['sphere', [0.02, 0.02, 0.02], [-0.15, 0.32, 0.95], [0.08, 0.08, 0.06]], ['cone', color, [0, 0.1, -0.85], [0.18, 0.6, 0.18], [-1.9, 0, 0]]];
  if (hostile) {
    for (let i = 0; i < 4; i++) body.push(['cone', [0.9, 0.2, 0.15], [0, 0.42, 0.3 - i * 0.3], [0.1, 0.35, 0.1]]);
    body.push(['sphere', [1, 0.2, 0.1], [0.15, 0.32, 0.97], [0.05, 0.05, 0.03], [0, 0, 0], 3], ['sphere', [1, 0.2, 0.1], [-0.15, 0.32, 0.97], [0.05, 0.05, 0.03], [0, 0, 0], 3]);
  } else body.push(['cone', belly, [0.2, 0.55, 0.7], [0.1, 0.3, 0.06]], ['cone', belly, [-0.2, 0.55, 0.7], [0.1, 0.3, 0.06]]);
  const b = model(body);
  b.position.y = 0.75;
  g.add(b);
  parts.body = b;
  const per = legs / 2;
  for (let i = 0; i < legs; i++) {
    const side = i % 2 ? 1 : -1;
    const z = per === 2 ? (i < 2 ? 0.4 : -0.4) : 0.5 - Math.floor(i / 2) * 0.5;
    const l = new THREE.Group();
    l.add(model([['capsule', color, [0, -0.3, 0], [0.14, 0.4, 0.14]]]));
    l.position.set(side * 0.26, 0.6, z);
    g.add(l);
    parts.legs.push(l);
  }
  g.scale.setScalar(size);
  return { group: g, parts };
}

export function sentinel() {
  const g = model([
    ['sphere', [0.28, 0.28, 0.33], [0, 0, 0], [0.9, 0.9, 0.9]],
    ['sphere', [1, 0.15, 0.1], [0, 0, 0.4], [0.3, 0.3, 0.14], [0, 0, 0], 4],
    ['torus', [0.5, 0.5, 0.55], [0, 0, 0], [1.5, 1.5, 1.5], [Math.PI / 2, 0, 0]],
    ['box', [0.3, 0.3, 0.34], [0.72, 0, 0], [0.3, 0.06, 0.5]],
    ['box', [0.3, 0.3, 0.34], [-0.72, 0, 0], [0.3, 0.06, 0.5]],
    ['cyl', [0.2, 0.2, 0.22], [0, -0.45, 0.2], [0.1, 0.1, 0.5], [Math.PI / 2, 0, 0]],
  ], METAL);
  return g;
}

export function warden() {
  const g = new THREE.Group();
  const core = model([
    ['ico', [0.22, 0.22, 0.27], [0, 0, 0], [6, 6, 6]],
    ['sphere', [1, 0.25, 0.1], [0, 0, 0], [3.4, 3.4, 3.4], [0, 0, 0], 3.5],
    ['octa', [0.4, 0.4, 0.48], [0, 4.5, 0], [1.6, 3, 1.6]],
    ['octa', [0.4, 0.4, 0.48], [0, -4.5, 0], [1.6, 3, 1.6]],
  ], METAL);
  g.add(core);
  const rings = [];
  for (let i = 0; i < 3; i++) {
    const r = model([['ring', [0.35, 0.36, 0.42], [0, 0, 0], [10 + i * 2.6, 10 + i * 2.6, 3]], ['box', [1, 0.3, 0.1], [5 + i * 1.3, 0, 0], [0.5, 0.5, 0.5], [0, 0, 0], 4], ['box', [1, 0.3, 0.1], [-5 - i * 1.3, 0, 0], [0.5, 0.5, 0.5], [0, 0, 0], 4]], METAL);
    g.add(r);
    rings.push(r);
  }
  return { group: g, rings };
}

// ------------------------------------------------------------ vehicles
export function shipModel(color = '#c9d1dc', trail = '#4ad8ff') {
  const c = hex(color);
  const dk = [0.14, 0.15, 0.18];
  const tr = hex(trail);
  const g = model([
    ['sphere', c, [0, 0.1, 0.4], [2.4, 1.5, 8.4]],
    ['cone', c, [0, 0.05, -4.6], [1.5, 3, 1.1], [-Math.PI / 2, 0, 0]],
    ['sphere', [0.05, 0.1, 0.16], [0, 0.62, -1.6], [1.5, 0.9, 3.2]],
    ['box', c, [3.1, -0.1, 1.2], [4.6, 0.16, 2.6], [0, -0.32, 0.06]],
    ['box', c, [-3.1, -0.1, 1.2], [4.6, 0.16, 2.6], [0, 0.32, -0.06]],
    ['box', dk, [5.2, 0.05, 2.1], [0.3, 0.5, 2.2]],
    ['box', dk, [-5.2, 0.05, 2.1], [0.3, 0.5, 2.2]],
    ['box', c, [0, 1.0, 3.3], [0.14, 1.5, 1.8], [0.5, 0, 0]],
    ['cyl', dk, [1.15, 0.05, 3.9], [1.0, 2.2, 1.0], [Math.PI / 2, 0, 0]],
    ['cyl', dk, [-1.15, 0.05, 3.9], [1.0, 2.2, 1.0], [Math.PI / 2, 0, 0]],
    ['disc', tr, [1.15, 0.05, 5.02], [0.8, 1, 0.8], [Math.PI / 2, 0, 0], 2.4],
    ['disc', tr, [-1.15, 0.05, 5.02], [0.8, 1, 0.8], [Math.PI / 2, 0, 0], 2.4],
    ['box', dk, [1.2, -0.95, -1.2], [0.14, 0.8, 0.14]],
    ['box', dk, [-1.2, -0.95, -1.2], [0.14, 0.8, 0.14]],
    ['box', dk, [0, -0.95, 2.6], [0.14, 0.8, 0.14]],
    ['box', dk, [1.2, -1.36, -1.2], [0.4, 0.08, 0.9]],
    ['box', dk, [-1.2, -1.36, -1.2], [0.4, 0.08, 0.9]],
    ['box', dk, [0, -1.36, 2.6], [0.4, 0.08, 0.9]],
    ['box', [1, 0.2, 0.1], [5.2, 0.32, 2.9], [0.12, 0.08, 0.12], [0, 0, 0], 4],
    ['box', [0.2, 1, 0.3], [-5.2, 0.32, 2.9], [0.12, 0.08, 0.12], [0, 0, 0], 4],
  ], METAL);
  return g;
}

export function stationModel(color = '#6fd0ff') {
  const c = hex(color);
  const hull = [0.3, 0.31, 0.35];
  const dk = [0.1, 0.11, 0.14];
  const parts = [
    ['ring', hull, [0, 0, 0], [900, 900, 900]],
    ['cyl', hull, [0, 0, 0], [170, 420, 170]],
    ['sphere', dk, [0, 230, 0], [240, 120, 240]],
    ['sphere', dk, [0, -230, 0], [240, 120, 240]],
    ['box', hull, [0, 0, 0], [860, 26, 26]],
    ['box', hull, [0, 0, 0], [26, 26, 860]],
    ['box', dk, [0, 0, 130], [150, 70, 120]],
    ['box', c, [0, 0, 191], [130, 54, 2], [0, 0, 0], 3],
    ['cyl', dk, [0, 330, 0], [8, 160, 8]],
    ['sphere', [1, 0.3, 0.2], [0, 412, 0], [14, 14, 14], [0, 0, 0], 5],
  ];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    parts.push(['box', i % 2 ? c : [1, 0.9, 0.6], [Math.cos(a) * 450, Math.sin(a) * 450, 64], [26, 10, 2], [0, 0, a], 2.5]);
  }
  for (const s of [1, -1]) parts.push(['box', [0.1, 0.16, 0.4], [s * 330, 0, -40], [300, 4, 110]], ['box', [0.1, 0.16, 0.4], [0, s * 330, -40], [110, 300, 4]]);
  return model(parts, METAL, false);
}

// ------------------------------------------------------------ flora & ore
// Each returns built geometry for an InstancedMesh (origin at ground level).
export function propGeometry(type, biome) {
  const tc = biome.treeColor;
  const trunk = [0.32, 0.22, 0.14];
  const stone = biome.cliff.map((v) => v * 1.15 + 0.06);
  switch (type) {
    case 'tree':
      switch (biome.tree) {
        case 'pine':
          return build([['taper', trunk, [0, 1.2, 0], [0.5, 2.6, 0.5]], ['cone', tc, [0, 3, 0], [3, 2.6, 3]], ['cone', tc.map((v) => v * 1.15), [0, 4.4, 0], [2.3, 2.3, 2.3]], ['cone', [0.9, 0.95, 1], [0, 5.7, 0], [1.5, 2, 1.5]]]);
        case 'palm':
          return build([['taper', trunk, [0, 1.6, 0], [0.4, 3.4, 0.4], [0, 0, 0.12]], ['taper', trunk, [-0.45, 4.4, 0], [0.32, 2.6, 0.32], [0, 0, 0.25]], ...[0, 1, 2, 3, 4, 5].map((i) => ['box', tc, [-0.8 + Math.cos(i * 1.05) * 1.3, 5.5, Math.sin(i * 1.05) * 1.3], [2.8, 0.06, 0.7], [0.2, -i * 1.05, -0.45]])]);
        case 'cactus':
          return build([['capsule', tc, [0, 1.5, 0], [0.6, 1.4, 0.6]], ['capsule', tc, [0.65, 1.8, 0], [0.34, 0.6, 0.34]], ['capsule', tc, [0.45, 1.3, 0], [0.3, 0.2, 0.3], [0, 0, 1.57]], ['capsule', tc, [-0.6, 1.3, 0], [0.3, 0.45, 0.3]], ['sphere', [1, 0.4, 0.6], [0, 3.05, 0], [0.3, 0.2, 0.3], [0, 0, 0], 1.6]]);
        case 'fungus':
          return build([['taper', [0.85, 0.82, 0.7], [0, 1.4, 0], [0.7, 2.8, 0.7]], ['dome', tc, [0, 2.6, 0], [4.2, 2.4, 4.2]], ['disc', [0.9, 0.8, 0.95], [0, 2.6, 0], [4.1, 1, 4.1]], ...[0, 1, 2, 3, 4].map((i) => ['sphere', [0.6, 1, 0.9], [Math.cos(i * 1.3) * 1.2, 3.3 + (i % 2) * 0.3, Math.sin(i * 1.3) * 1.2], [0.4, 0.2, 0.4], [0, 0, 0], 2.2])]);
        case 'spire':
          return build([['cone', tc, [0, 2.2, 0], [1.6, 4.4, 1.6], [0, 0, 0.08], 0, 3], ['cone', tc.map((v) => v * 0.8), [0.9, 1.2, 0.3], [1, 2.4, 1], [0, 0, -0.3], 0, 5], ['sphere', [1, 0.35, 0.05], [0, 0.2, 0], [1.2, 0.3, 1.2], [0, 0, 0], 2.5]]);
        case 'crystal':
          return build([['octa', tc, [0, 2, 0], [1.2, 4.4, 1.2], [0, 0, 0.1], 1.5], ['octa', tc.map((v) => v * 0.8), [0.9, 1.1, 0.4], [0.8, 2.6, 0.8], [0.2, 0, -0.5], 1.3], ['octa', [0.8, 0.5, 1], [-0.7, 0.9, -0.3], [0.6, 2, 0.6], [-0.3, 0, 0.5], 1.4]]);
        default:
          return build([['taper', trunk, [0, 1.4, 0], [0.6, 2.8, 0.6]], ['ico', tc, [0, 3.6, 0], [3.6, 3, 3.6], [0, 0, 0], 0, 2], ['ico', tc.map((v) => v * 1.18), [1, 4.4, 0.4], [2.4, 2.2, 2.4], [0, 1, 0], 0, 4], ['ico', tc.map((v) => v * 0.85), [-1, 3.9, -0.5], [2.4, 2, 2.4], [0, 2, 0], 0, 6]]);
      }
    case 'bush':
      return build([['ico', tc.map((v) => v * 1.1), [0, 0.45, 0], [1.4, 0.9, 1.4], [0, 0, 0], 0, 3], ['ico', tc, [0.5, 0.35, 0.2], [0.9, 0.7, 0.9], [0, 1, 0], 0, 5]]);
    case 'rock':
      return build([['rock', stone, [0, 0.45, 0], [2, 1.3, 1.7], [0, 0, 0], 0, 2.1], ['rock', stone.map((v) => v * 0.85), [0.9, 0.25, 0.4], [1, 0.7, 1], [0, 1, 0], 0, 4.3]]);
    case 'copper':
      return build([['rock', stone, [0, 0.3, 0], [1.6, 0.8, 1.6], [0, 0, 0], 0, 3.3], ['octa', [0.1, 0.75, 0.6], [0, 0.9, 0], [0.6, 1.4, 0.6], [0, 0, 0.15], 1.5], ['octa', [0.2, 0.9, 0.7], [0.4, 0.7, 0.2], [0.4, 0.9, 0.4], [0.3, 0, -0.4], 1.5], ['octa', [0.9, 0.5, 0.25], [-0.4, 0.6, -0.1], [0.4, 0.8, 0.4], [-0.2, 0, 0.5], 1.2]]);
    case 'gold':
      return build([['rock', stone.map((v) => v * 0.8), [0, 0.3, 0], [1.5, 0.8, 1.5], [0, 0, 0], 0, 6.1], ['ico', [1, 0.78, 0.2], [0.2, 0.75, 0.1], [0.6, 0.5, 0.6], [0, 0, 0], 2], ['ico', [1, 0.85, 0.3], [-0.35, 0.55, 0.25], [0.4, 0.35, 0.4], [0, 0, 0], 2], ['ico', [1, 0.7, 0.15], [0.1, 0.5, -0.45], [0.35, 0.3, 0.35], [0, 0, 0], 2]]);
    case 'sodium':
      return build([['cyl', [0.3, 0.5, 0.2], [0, 0.35, 0], [0.08, 0.7, 0.08]], ['sphere', [1, 0.9, 0.25], [0, 0.8, 0], [0.42, 0.42, 0.42], [0, 0, 0], 2.6], ['cone', [0.35, 0.55, 0.2], [0.25, 0.2, 0], [0.5, 0.06, 0.25], [0, 0, 0.4]], ['cone', [0.35, 0.55, 0.2], [-0.25, 0.2, 0], [0.5, 0.06, 0.25], [0, 0, -0.4]]]);
    case 'oxygen':
      return build([['cyl', [0.4, 0.2, 0.2], [0, 0.3, 0], [0.1, 0.6, 0.1]], ['sphere', [1, 0.2, 0.2], [0, 0.72, 0], [0.5, 0.36, 0.5], [0, 0, 0], 2.4], ['sphere', [1, 0.35, 0.3], [0.25, 0.45, 0.1], [0.26, 0.2, 0.26], [0, 0, 0], 2.2], ['sphere', [1, 0.35, 0.3], [-0.2, 0.4, -0.15], [0.22, 0.18, 0.22], [0, 0, 0], 2.2]]);
    case 'aetherium':
      return build([['rock', [0.15, 0.15, 0.2], [0, 0.25, 0], [1.4, 0.6, 1.4], [0, 0, 0], 0, 7.7], ['octa', [0.35, 0.95, 1], [0, 1.2, 0], [0.7, 2.2, 0.7], [0, 0, 0.1], 3], ['octa', [0.5, 1, 1], [0.45, 0.8, 0.2], [0.4, 1.3, 0.4], [0.3, 0, -0.5], 3], ['octa', [0.3, 0.8, 1], [-0.4, 0.7, -0.2], [0.4, 1.1, 0.4], [-0.3, 0, 0.5], 3]]);
  }
  return build([['box', [1, 0, 1]]]);
}

// ------------------------------------------------------------ buildings
const WALL = [0.82, 0.8, 0.74];
const DARK = [0.2, 0.21, 0.25];
export function building(kind, accent = [0.4, 0.8, 1], rnd = Math.random) {
  const a = hex(accent);
  const win = [1, 0.85, 0.5];
  switch (kind) {
    case 'hut':
      return model([['cyl', WALL, [0, 1.5, 0], [7, 3, 7]], ['dome', a, [0, 3, 0], [7.6, 5, 7.6]], ['box', DARK, [0, 1.1, 3.45], [1.4, 2.2, 0.3]], ['box', win, [2.4, 1.8, 2.5], [1.1, 0.7, 0.1], [0, 0.75, 0], 2.2], ['box', win, [-2.4, 1.8, 2.5], [1.1, 0.7, 0.1], [0, -0.75, 0], 2.2], ['cyl', DARK, [0, 5.7, 0], [0.2, 1.2, 0.2]], ['sphere', a, [0, 6.4, 0], [0.4, 0.4, 0.4], [0, 0, 0], 3]]);
    case 'house':
      return model([['box', WALL, [0, 2, 0], [8, 4, 6]], ['box', a, [0, 4.3, 0], [8.8, 0.6, 6.8]], ['box', WALL, [2, 5.6, 0], [3.4, 2.2, 4.4]], ['box', a, [2, 6.9, 0], [4, 0.4, 5]], ['box', DARK, [-1.5, 1.1, 3.02], [1.4, 2.2, 0.1]], ['box', win, [1.8, 2.3, 3.02], [2, 0.9, 0.1], [0, 0, 0], 2.2], ['box', win, [2, 5.8, 2.22], [1.6, 0.8, 0.1], [0, 0, 0], 2.2], ['box', win, [-4.02, 2.3, 0], [0.1, 0.9, 2], [0, 0, 0], 2.2]]);
    case 'tower':
      return model([['taper', WALL, [0, 7, 0], [4.4, 14, 4.4]], ['cyl', a, [0, 14.4, 0], [5.6, 0.8, 5.6]], ['dome', DARK, [0, 14.8, 0], [4, 3, 4]], ['cyl', DARK, [0, 18.4, 0], [0.16, 4, 0.16]], ['sphere', a, [0, 20.6, 0], [0.7, 0.7, 0.7], [0, 0, 0], 4], ['box', win, [0, 9, 2.0], [0.8, 1.6, 0.1], [0, 0, 0], 2.2], ['box', win, [0, 5, 2.15], [0.8, 1.6, 0.1], [0, 0, 0], 2.2]]);
    case 'stall':
      return model([['box', [0.45, 0.3, 0.2], [0, 0.5, 0], [3.4, 1, 1.4]], ['cyl', DARK, [1.6, 1.6, 0.6], [0.1, 3.2, 0.1]], ['cyl', DARK, [-1.6, 1.6, 0.6], [0.1, 3.2, 0.1]], ['cyl', DARK, [1.6, 1.6, -0.6], [0.1, 3.2, 0.1]], ['cyl', DARK, [-1.6, 1.6, -0.6], [0.1, 3.2, 0.1]], ['box', a, [0, 3.3, 0], [4, 0.14, 2.2], [0.12, 0, 0]], ['box', [0.4, 1, 0.9], [0, 1.25, 0.2], [1.2, 0.5, 0.06], [-0.4, 0, 0], 2.4], ['sphere', [1, 0.7, 0.3], [-1.1, 1.2, 0], [0.4, 0.4, 0.4]], ['box', [0.7, 0.3, 0.9], [1.1, 1.2, 0], [0.5, 0.4, 0.5]]]);
    case 'pad':
      return model([['cyl', [0.3, 0.31, 0.35], [0, 0.15, 0], [26, 0.3, 26]], ['torus', a, [0, 0.32, 0], [22, 22, 3], [Math.PI / 2, 0, 0], 2.4], ['box', a, [0, 0.32, 0], [10, 0.04, 1.2], [0, 0, 0], 2.2], ['box', a, [0, 0.32, 0], [1.2, 0.04, 10], [0, 0, 0], 2.2]], LIT, false);
    case 'lamp':
      return model([['cyl', DARK, [0, 1.8, 0], [0.12, 3.6, 0.12]], ['sphere', win, [0, 3.8, 0], [0.5, 0.5, 0.5], [0, 0, 0], 3.2]]);
    case 'palace': {
      const p = [['cyl', WALL, [0, 7, 0], [30, 14, 30]], ['dome', a, [0, 14, 0], [31, 20, 31]], ['cyl', WALL, [0, 26, 0], [9, 12, 9]], ['dome', a, [0, 32, 0], [10, 9, 10]], ['cyl', DARK, [0, 40, 0], [0.4, 9, 0.4]], ['sphere', a, [0, 45, 0], [2, 2, 2], [0, 0, 0], 4], ['box', DARK, [0, 3.5, 15], [6, 7, 1.2]], ['box', win, [0, 3.5, 15.65], [4.4, 5.6, 0.1], [0, 0, 0], 1.8]];
      for (let i = 0; i < 6; i++) {
        const an = (i / 6) * Math.PI * 2 + 0.52;
        const x = Math.cos(an) * 24, z = Math.sin(an) * 24;
        p.push(['taper', WALL, [x, 9, z], [6, 18, 6]], ['cone', a, [x, 21, z], [7, 6, 7]], ['sphere', a, [x, 24.6, z], [0.9, 0.9, 0.9], [0, 0, 0], 4], ['box', win, [x * 1.12, 12, z * 1.12], [1, 2.2, 1], [0, -an, 0], 2.2]);
      }
      for (let i = 0; i < 12; i++) {
        const an = (i / 12) * Math.PI * 2;
        p.push(['box', win, [Math.cos(an) * 15.1, 9, Math.sin(an) * 15.1], [1.6, 3, 0.3], [0, -an + Math.PI / 2, 0], 2]);
      }
      return model(p);
    }
    case 'wall': {
      const p = [];
      const R = 62;
      for (let i = 0; i < 28; i++) {
        if (i === 7) continue; // gate gap (faces +Z)
        const an = (i / 28) * Math.PI * 2;
        p.push(['box', WALL.map((v) => v * 0.8), [Math.cos(an) * R, 3, Math.sin(an) * R], [14.2, 6, 2], [0, -an + Math.PI / 2, 0]]);
        if (i % 4 === 0) p.push(['cyl', WALL, [Math.cos(an) * R, 5, Math.sin(an) * R], [4, 10, 4]], ['cone', a, [Math.cos(an) * R, 11.5, Math.sin(an) * R], [5, 3, 5]]);
      }
      return model(p);
    }
    case 'bunker':
      return model([['box', [0.26, 0.24, 0.24], [0, 1.6, 0], [9, 3.2, 7]], ['box', DARK, [0, 3.4, 0], [9.6, 0.5, 7.6]], ['box', [1, 0.2, 0.1], [0, 2.2, 3.52], [3, 0.3, 0.1], [0, 0, 0], 3], ['box', DARK, [3, 1.1, 3.52], [1.4, 2.2, 0.1]], ['cyl', DARK, [-3.4, 5.2, -2], [0.3, 3.4, 0.3]], ['sphere', [1, 0.15, 0.1], [-3.4, 7.1, -2], [0.6, 0.6, 0.6], [0, 0, 0], 4]]);
    case 'watchtower':
      return model([['cyl', DARK, [1.5, 4, 1.5], [0.3, 8, 0.3]], ['cyl', DARK, [-1.5, 4, 1.5], [0.3, 8, 0.3]], ['cyl', DARK, [1.5, 4, -1.5], [0.3, 8, 0.3]], ['cyl', DARK, [-1.5, 4, -1.5], [0.3, 8, 0.3]], ['box', [0.3, 0.26, 0.24], [0, 8.4, 0], [4.6, 0.6, 4.6]], ['box', [0.3, 0.26, 0.24], [0, 9.6, 0], [4, 1.8, 4]], ['box', [1, 0.2, 0.1], [0, 9.8, 2.02], [2.6, 0.5, 0.1], [0, 0, 0], 3]]);
    case 'crate':
      return model([['box', [0.5, 0.4, 0.24], [0, 0.6, 0], [1.3, 1.2, 1.3]], ['box', DARK, [0, 0.6, 0], [1.36, 0.2, 1.36]], ['box', [1, 0.8, 0.3], [0, 1.0, 0.66], [0.3, 0.2, 0.04], [0, 0, 0], 2.6]]);
    case 'ruins': {
      const st = [0.5, 0.48, 0.44];
      const p = [['cyl', st, [0, 0.4, 0], [12, 0.8, 12]], ['cyl', st.map((v) => v * 0.8), [0, 1.2, 0], [4, 0.9, 4]]];
      for (let i = 0; i < 8; i++) {
        const an = (i / 8) * Math.PI * 2;
        const hgt = 3 + ((i * 7) % 5) * 1.6;
        p.push(['cyl', st, [Math.cos(an) * 14, hgt / 2, Math.sin(an) * 14], [1.8, hgt, 1.8], [((i * 3) % 4) * 0.04, 0, ((i * 5) % 3) * 0.05], 0, i + 1.5]);
        p.push(['torus', [0.4, 1, 0.9], [Math.cos(an) * 14, hgt * 0.7, Math.sin(an) * 14], [2.3, 2.3, 2.3], [Math.PI / 2, 0, 0], 2.2]);
      }
      return model(p, LIT_FLAT);
    }
    case 'gate': {
      const st = [0.34, 0.33, 0.42];
      const p = [['ring', st, [0, 30, 0], [56, 56, 26]], ['cyl', st, [0, 0.6, 0], [80, 1.2, 80]], ['disc', [0.32, 0.12, 0.7], [0, 30, 0], [48, 1, 48], [Math.PI / 2, 0, 0], 1.0], ['torus', [0.6, 0.9, 1], [0, 30, 0.3], [40, 40, 6], [0, 0, 0], 2.2], ['torus', [0.8, 0.5, 1], [0, 30, 0.4], [28, 28, 6], [0, 0, 0], 2.2], ['torus', [1, 0.8, 1], [0, 30, 0.5], [14, 14, 8], [0, 0, 0], 2.6]];
      for (let i = 0; i < 16; i++) {
        const an = (i / 16) * Math.PI * 2;
        p.push(['box', [0.5, 1, 1], [Math.cos(an) * 28, 30 + Math.sin(an) * 28, 1.4], [1.2, 3.4, 0.4], [0, 0, an + Math.PI / 2], 3]);
      }
      for (const s of [1, -1]) p.push(['taper', st, [s * 44, 12, 14], [6, 24, 6]], ['octa', [0.5, 1, 1], [s * 44, 27, 14], [3, 5, 3], [0, 0, 0], 3], ['taper', st, [s * 44, 12, -14], [6, 24, 6]], ['octa', [0.5, 1, 1], [s * 44, 27, -14], [3, 5, 3], [0, 0, 0], 3]);
      return model(p, METAL);
    }
    case 'wreck':
      return model([['box', [0.3, 0.3, 0.33], [3, 0.4, 2], [3, 0.3, 1.6], [0.2, 0.6, 0.3]], ['box', [0.3, 0.3, 0.33], [-4, 0.3, -1], [2, 0.2, 2.4], [0.1, 1.2, -0.2]], ['cyl', DARK, [5, 0.5, -3], [1, 1.4, 1], [1.2, 0.3, 0]], ['disc', [0.05, 0.05, 0.05], [0, 0.05, 0], [16, 1, 16]], ['sphere', [1, 0.5, 0.1], [3.4, 0.7, 2], [0.3, 0.3, 0.3], [0, 0, 0], 3]]);
    case 'terminal':
      return model([['box', DARK, [0, 0.7, 0], [1.2, 1.4, 0.7]], ['box', a, [0, 1.6, 0.1], [1.1, 0.8, 0.08], [-0.35, 0, 0], 2.6], ['cyl', DARK, [0, 2.4, -0.2], [0.06, 1, 0.06]], ['sphere', a, [0, 3, -0.2], [0.24, 0.24, 0.24], [0, 0, 0], 4]]);
    case 'relic':
      return model([['octa', [1, 0.9, 0.6], [0, 0, 0], [0.8, 1.5, 0.8], [0, 0, 0], 3.2], ['torus', [1, 0.8, 0.4], [0, 0, 0], [1.8, 1.8, 1.8], [Math.PI / 2, 0, 0], 2.6]]);
  }
  return model([['box', [1, 0, 1]]]);
}

export function asteroidGeometry() {
  return build([['rock', [0.36, 0.33, 0.3], [0, 0, 0], [2, 1.6, 1.8], [0, 0, 0], 0, 9.3]]).lit;
}
