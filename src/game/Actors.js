// Actors: everything alive on a planet's surface. Villagers, creatures,
// sentinels, raiders and the Warden, plus the bolts and particles they throw.
// Positions are planet-local.
import * as THREE from 'three';
import { GLOW, animateHumanoid, creature, humanoid, sentinel, warden } from '../world/models.js';
import { FACTIONS } from '../universe/data.js';

const m4 = new THREE.Matrix4();
const X = new THREE.Vector3();
const Z = new THREE.Vector3();
const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const q = new THREE.Quaternion();
const one = new THREE.Vector3(1, 1, 1);
const col = new THREE.Color();

// Orientation with +Y along `up` and +Z along the tangent `fwd`.
export function basisQuat(up, fwd, out = new THREE.Quaternion()) {
  Z.copy(fwd).addScaledVector(up, -fwd.dot(up));
  if (Z.lengthSq() < 1e-8) Z.set(1, 0, 0).addScaledVector(up, -up.x);
  Z.normalize();
  X.crossVectors(up, Z).normalize();
  m4.makeBasis(X, up, Z);
  return out.setFromRotationMatrix(m4);
}

const STYLE = { thalori: { height: 1.18, width: 0.9 }, grumm: { height: 0.92, width: 1.35 }, vesh: { height: 1.05, width: 0.85 } };

export class Actors {
  constructor(game, pl, group) {
    this.game = game;
    this.pl = pl;
    this.planet = pl.planet;
    this.group = new THREE.Group();
    group.add(this.group);
    this.list = [];
    this.bolts = [];
    this.parts = [];
    const bg = new THREE.CapsuleGeometry(0.09, 1.3, 3, 6).rotateX(Math.PI / 2);
    this.boltMesh = new THREE.InstancedMesh(bg, GLOW, 220);
    this.boltMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(220 * 3), 3);
    this.partMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), GLOW, 500);
    this.partMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(500 * 3), 3);
    for (const m of [this.boltMesh, this.partMesh]) {
      m.count = 0;
      m.frustumCulled = false;
      this.group.add(m);
    }
  }

  ground(v, hover = 0) {
    const n = tmp.copy(v).normalize();
    return this.planet.groundRadius(n.x, n.y, n.z) + hover;
  }

  add(a) {
    a.up = a.pos.clone().normalize();
    a.fwd = a.fwd || new THREE.Vector3(1, 0, 0).addScaledVector(a.up, -a.up.x).normalize();
    a.vel = new THREE.Vector3();
    a.maxHp = a.hp;
    a.t = Math.random() * 3;
    a.cool = 1 + Math.random() * 2;
    a.home = a.home || a.pos.clone();
    a.goal = a.pos.clone();
    a.hit = 0;
    this.group.add(a.model);
    this.list.push(a);
    return a;
  }

  spawnNpc(pos, { faction, role = 'villager', name, roam = 14 }) {
    const f = FACTIONS[faction];
    const h = humanoid({ skin: f.skin, accent: new THREE.Color(f.color).toArray(), style: faction, ...STYLE[faction] });
    return this.add({ kind: 'npc', pos, model: h.group, h, hp: 9999, radius: 0.6, faction, role, name, roam, hover: 0, speed: 1.3 });
  }

  spawnCreature(pos, rnd, hostile = false) {
    const b = this.planet.biome;
    const size = hostile ? 1.3 + rnd() * 0.5 : 0.7 + rnd() * 0.9;
    const c = creature({ color: [b.mid[0] * 0.7 + rnd() * 0.4, b.mid[1] * 0.6 + rnd() * 0.3, b.mid[2] * 0.6 + rnd() * 0.4], belly: [0.85, 0.8, 0.65], size, legs: rnd() < 0.3 ? 6 : 4, hostile });
    return this.add({ kind: 'creature', pos, model: c.group, c, hp: hostile ? 70 * size : 30 * size, radius: 0.9 * size, hostile, roam: 30, hover: 0, speed: hostile ? 7.2 : 2 });
  }

  spawnSentinel(pos, tough = 1) {
    return this.add({ kind: 'sentinel', pos, model: sentinel(), hp: 60 * tough, radius: 0.8, hostile: true, roam: 22, hover: 3.2, speed: 7, dmg: 8 * tough });
  }

  spawnRaider(pos, tough = 1) {
    const h = humanoid({ skin: [0.3, 0.12, 0.12], accent: [0.8, 0.1, 0.1], style: 'raider', width: 1.1 });
    return this.add({ kind: 'raider', pos, model: h.group, h, hp: 80 * tough, radius: 0.7, hostile: true, roam: 18, hover: 0, speed: 3.6, dmg: 9 * tough });
  }

  spawnWarden(pos) {
    const w = warden();
    return this.add({ kind: 'warden', pos, model: w.group, w, hp: 2400, radius: 6, hostile: true, roam: 60, hover: 24, speed: 9, dmg: 13, boss: true, pattern: 0, ringT: 6, summonT: 10 });
  }

  bolt(from, dir, speed, dmg, team, color) {
    if (this.bolts.length >= 200) this.bolts.shift();
    this.bolts.push({ pos: from.clone(), vel: dir.clone().multiplyScalar(speed), life: 3.2, dmg, team, color });
  }

  burst(pos, color, n = 12, speed = 6, life = 0.7) {
    for (let i = 0; i < n && this.parts.length < 480; i++) {
      this.parts.push({ pos: pos.clone(), vel: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.3 + Math.random())), life: life * (0.5 + Math.random()), max: life, color });
    }
  }

  damage(a, dmg) {
    if (a.kind === 'npc' || a.dead) return false;
    a.hp -= dmg;
    a.hit = 0.12;
    a.alert = 8;
    if (a.hp > 0) return false;
    a.dead = true;
    this.burst(a.pos, a.kind === 'creature' ? [1.6, 0.5, 0.3] : [3, 1.2, 0.3], a.boss ? 160 : 26, a.boss ? 26 : 9, a.boss ? 2 : 0.9);
    this.group.remove(a.model);
    this.list.splice(this.list.indexOf(a), 1);
    this.game.onKill(a);
    return true;
  }

  // Player bolts and beams hit the nearest actor along a ray.
  raycast(origin, dir, maxDist, hostileOnly = false) {
    let best = null;
    let bt = maxDist;
    for (const a of this.list) {
      if (a.kind === 'npc' || (hostileOnly && !a.hostile)) continue;
      tmp.copy(a.pos).addScaledVector(a.up, a.kind === 'raider' ? 1 : a.radius * 0.6).sub(origin);
      const tca = tmp.dot(dir);
      if (tca < 0) continue;
      const d2 = tmp.lengthSq() - tca * tca;
      if (d2 > a.radius * a.radius) continue;
      const t = tca - Math.sqrt(a.radius * a.radius - d2);
      if (t < bt) {
        bt = t;
        best = a;
      }
    }
    return best ? { actor: best, dist: bt } : null;
  }

  update(dt, player, time) {
    const pp = player.local;
    const alive = player.health > 0 && player.active;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const a = this.list[i];
      a.t -= dt;
      a.cool -= dt;
      if (a.hit > 0) a.hit -= dt;
      if (a.alert > 0) a.alert -= dt;
      const toP = tmp2.copy(pp).sub(a.pos);
      const dist = toP.length();
      if (dist > 420 && !a.keep) {
        this.group.remove(a.model);
        this.list.splice(i, 1);
        continue;
      }
      a.model.visible = dist < 320;
      let move = null;
      let speed = a.speed;
      let face = null;
      const sees = alive && (dist < (a.boss ? 260 : a.kind === 'creature' ? 34 : 62) || a.alert > 0);
      if (a.kind === 'npc') {
        if (dist < 5) face = toP;
        else {
          if (a.t <= 0 || a.goal.distanceTo(a.pos) < 1) {
            a.t = 4 + Math.random() * 6;
            a.goal.copy(a.home).add(tmp.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(a.roam * 2));
            a.idle = Math.random() < 0.4;
          }
          if (!a.idle) move = tmp.copy(a.goal).sub(a.pos);
        }
      } else if (a.kind === 'creature') {
        if (a.hostile && sees) {
          move = toP;
          if (dist < a.radius + 1.6 && a.cool <= 0) {
            a.cool = 1.2;
            player.damage(12 * (a.model.scale.x || 1));
          }
          if (dist < a.radius + 1.2) move = null;
        } else if (!a.hostile && alive && dist < 9) {
          move = toP.clone().negate();
          speed = 6;
        } else {
          if (a.t <= 0 || a.goal.distanceTo(a.pos) < 2) {
            a.t = 5 + Math.random() * 8;
            a.goal.copy(a.home).add(tmp.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(a.roam * 2));
            a.idle = Math.random() < 0.35;
          }
          if (!a.idle) move = tmp.copy(a.goal).sub(a.pos);
          speed = 2;
        }
      } else if (a.kind === 'sentinel' || a.kind === 'raider') {
        if (sees) {
          face = toP;
          const want = a.kind === 'sentinel' ? 16 : 14;
          a.strafe = a.strafe || (Math.random() < 0.5 ? 1 : -1);
          if (dist > want + 5) move = toP;
          else if (dist < want - 5) move = toP.clone().negate();
          else move = new THREE.Vector3().crossVectors(a.up, toP).multiplyScalar(a.strafe);
          if (a.t <= 0) {
            a.t = 2 + Math.random() * 3;
            a.strafe *= -1;
          }
          if (a.cool <= 0 && dist < 70) {
            a.cool = a.kind === 'sentinel' ? 1.25 : 1.05;
            const from = a.pos.clone().addScaledVector(a.up, a.kind === 'raider' ? 1.4 : 0);
            const aim = pp.clone().addScaledVector(player.up, 1.1).add(tmp.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(dist * 0.06)).sub(from).normalize();
            this.bolt(from, aim, 62, a.dmg, 'enemy', a.kind === 'sentinel' ? [4, 0.5, 0.3] : [4, 1.4, 0.2]);
            this.game.audio?.play('enemyShot');
          }
        } else if (a.t <= 0 || a.goal.distanceTo(a.pos) < 2) {
          a.t = 4 + Math.random() * 5;
          a.goal.copy(a.home).add(tmp.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(a.roam));
        } else {
          move = tmp.copy(a.goal).sub(a.pos);
          speed = 2;
        }
      } else if (a.kind === 'warden') {
        this.wardenAI(a, dt, player, toP, dist, sees);
        a.w.rings.forEach((r, k) => {
          r.rotation.x += dt * (0.5 + k * 0.3);
          r.rotation.y += dt * (0.3 + k * 0.2);
        });
        if (sees) {
          move = new THREE.Vector3().crossVectors(a.up, toP).multiplyScalar(dist > 60 ? 0.2 : 1).add(dist > 55 ? toP.clone().normalize().multiplyScalar(40) : dist < 35 ? toP.clone().normalize().multiplyScalar(-40) : tmp.set(0, 0, 0));
        }
      }

      let moving = 0;
      if (move) {
        move.addScaledVector(a.up, -move.dot(a.up));
        if (move.lengthSq() > 0.01) {
          move.normalize();
          a.pos.addScaledVector(move, speed * dt);
          a.fwd.lerp(move, Math.min(1, dt * 6)).normalize();
          moving = speed;
        }
      }
      if (face) {
        tmp.copy(face).addScaledVector(a.up, -face.dot(a.up)).normalize();
        a.fwd.lerp(tmp, Math.min(1, dt * 8)).normalize();
      }
      // Stay on (or hover above) the ground; walkers avoid deep water.
      const r = this.ground(a.pos, a.hover + (a.hover ? Math.sin(time * 2 + a.maxHp) * 0.5 : 0));
      a.pos.setLength(Math.max(r, a.hover ? 0 : this.planet.radius - 0.4));
      a.up.copy(a.pos).normalize();
      a.model.position.copy(a.pos);
      basisQuat(a.up, a.fwd, a.model.quaternion);
      if (a.h) animateHumanoid(a.h, time + a.maxHp, moving, a.kind === 'raider' && sees);
      if (a.c) {
        const sw = Math.sin(time * (moving > 3 ? 14 : 7) + a.maxHp) * Math.min(1, moving / 2) * 0.6;
        a.c.parts.legs.forEach((l, k) => (l.rotation.x = k % 2 ? sw : -sw));
        a.c.parts.body.position.y = 0.75 + Math.abs(sw) * 0.06;
      }
      if (a.kind === 'sentinel') a.model.rotateY(Math.sin(time * 3 + a.maxHp) * 0.1);
    }
    this.updateBolts(dt, player);
    this.updateParts(dt);
  }

  wardenAI(a, dt, player, toP, dist, sees) {
    if (!sees) return;
    const enraged = a.hp < a.maxHp * 0.5;
    const from = a.pos;
    const target = player.local.clone().addScaledVector(player.up, 1);
    if (a.cool <= 0) {
      a.cool = enraged ? 1.5 : 2.3;
      // Aimed burst.
      for (let k = -2; k <= 2; k++) {
        const aim = target.clone().addScaledVector(new THREE.Vector3().crossVectors(a.up, toP).normalize(), k * 3.2).sub(from).normalize();
        this.bolt(from, aim, 66, a.dmg, 'enemy', [4, 0.6, 0.2]);
      }
      this.game.audio?.play('bossShot');
    }
    a.ringT -= dt;
    if (a.ringT <= 0) {
      a.ringT = enraged ? 4.5 : 7;
      // A ring of bolts raining outward and down.
      const t1 = new THREE.Vector3().crossVectors(a.up, toP).normalize();
      const t2 = new THREE.Vector3().crossVectors(a.up, t1);
      for (let k = 0; k < 20; k++) {
        const an = (k / 20) * Math.PI * 2;
        const d = t1.clone().multiplyScalar(Math.cos(an)).addScaledVector(t2, Math.sin(an)).addScaledVector(a.up, -0.5).normalize();
        this.bolt(from, d, 34, a.dmg, 'enemy', [3, 0.4, 3]);
      }
    }
    a.summonT -= dt;
    if (a.summonT <= 0) {
      a.summonT = enraged ? 11 : 16;
      if (this.list.filter((x) => x.kind === 'sentinel').length < 4) {
        for (let k = 0; k < 2; k++) this.spawnSentinel(a.pos.clone().add(tmp.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(16)), 1.2).alert = 30;
      }
    }
  }

  updateBolts(dt, player) {
    const pc = tmp2.copy(player.local).addScaledVector(player.up, 1);
    let n = 0;
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.life -= dt;
      b.pos.addScaledVector(b.vel, dt);
      let dead = b.life <= 0;
      if (!dead && b.team === 'enemy') {
        if (player.active && b.pos.distanceToSquared(pc) < 1.1) {
          player.damage(b.dmg);
          this.burst(b.pos, b.color, 6, 4, 0.3);
          dead = true;
        }
      } else if (!dead) {
        for (const a of this.list) {
          if (a.kind === 'npc') continue;
          const c = tmp.copy(a.pos).addScaledVector(a.up, a.kind === 'raider' ? 1 : a.radius * 0.5);
          if (b.pos.distanceToSquared(c) < (a.radius + 0.4) ** 2) {
            this.burst(b.pos, b.color, 8, 5, 0.35);
            this.game.onHit(a, b.dmg);
            this.damage(a, b.dmg);
            dead = true;
            break;
          }
        }
      }
      if (!dead && b.pos.length() < this.ground(b.pos)) {
        this.burst(b.pos, b.color, 5, 3, 0.3);
        dead = true;
      }
      if (dead) this.bolts.splice(i, 1);
    }
    for (const b of this.bolts) {
      Z.copy(b.vel).normalize();
      q.setFromUnitVectors(tmp.set(0, 0, 1), Z);
      m4.compose(b.pos, q, one);
      this.boltMesh.setMatrixAt(n, m4);
      this.boltMesh.setColorAt(n, col.setRGB(b.color[0], b.color[1], b.color[2]));
      n++;
    }
    this.boltMesh.count = n;
    this.boltMesh.instanceMatrix.needsUpdate = true;
    this.boltMesh.instanceColor.needsUpdate = true;
  }

  updateParts(dt) {
    let n = 0;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.parts.splice(i, 1);
        continue;
      }
      p.pos.addScaledVector(p.vel, dt);
      p.vel.multiplyScalar(1 - dt * 1.5);
    }
    for (const p of this.parts) {
      const k = Math.max(0.1, p.life / p.max) * (p.size || 1);
      m4.compose(p.pos, q.identity(), tmp.set(k, k, k));
      this.partMesh.setMatrixAt(n, m4);
      this.partMesh.setColorAt(n, col.setRGB(p.color[0], p.color[1], p.color[2]));
      n++;
    }
    this.partMesh.count = n;
    this.partMesh.instanceMatrix.needsUpdate = true;
    this.partMesh.instanceColor.needsUpdate = true;
  }

  dispose() {
    this.group.parent?.remove(this.group);
  }
}
