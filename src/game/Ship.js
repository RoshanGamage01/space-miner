// Ship: your starship. Arcade six-degrees-of-freedom flight that works from
// a landing pad to deep space, auto-landing, cannons, pirates and docking.
// Position is in system space.
import * as THREE from 'three';
import { GLOW, shipModel, stationModel } from '../world/models.js';
import { cosmetic, derived } from './state.js';
import { basisQuat } from './Actors.js';

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const q = new THREE.Quaternion();
const m4 = new THREE.Matrix4();
const one = new THREE.Vector3(1, 1, 1);
const col = new THREE.Color();
const AX = new THREE.Vector3(1, 0, 0);
const AY = new THREE.Vector3(0, 1, 0);
const AZ = new THREE.Vector3(0, 0, 1);

export class Ship {
  constructor(game) {
    this.game = game;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.fwd = new THREE.Vector3(0, 0, -1);
    this.upv = new THREE.Vector3(0, 1, 0);
    this.state = 'landed'; // landed | flying | landing | docked
    this.throttle = 0;
    this.hull = 300;
    this.hullMax = 300;
    this.piloted = false;
    this.fireCd = 0;
    this.repairT = 0;
    this.bolts = [];
    this.pirates = [];
    this.pirateT = 90;
    this.group = new THREE.Group();
    game.engine.scene.add(this.group);
    const bg = new THREE.CapsuleGeometry(0.35, 9, 3, 6).rotateX(Math.PI / 2);
    this.boltMesh = new THREE.InstancedMesh(bg, GLOW, 160);
    this.boltMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(160 * 3), 3);
    this.boltMesh.frustumCulled = false;
    this.boltMesh.count = 0;
    game.engine.scene.add(this.boltMesh);
    this.engineLight = new THREE.PointLight(0x66ccff, 0, 60);
    this.rebuild();
  }

  rebuild() {
    const s = this.game.save;
    if (this.model) this.group.remove(this.model);
    this.trail = new THREE.Color(cosmetic('trail', s.cosmetics.sel.trail).color).toArray();
    this.model = shipModel(cosmetic('ship', s.cosmetics.sel.ship).color, cosmetic('trail', s.cosmetics.sel.trail).color);
    this.group.add(this.model, this.engineLight);
    this.engineLight.position.set(0, 0, 6);
    this.engineLight.color.setRGB(this.trail[0], this.trail[1], this.trail[2]);
  }

  buildStation(sys) {
    if (this.station) this.game.engine.scene.remove(this.station);
    this.station = stationModel(sys.sys.faction ? { thalori: '#6fd0ff', grumm: '#ffa040', vesh: '#9dff6a' }[sys.sys.faction] : '#b98bff');
    this.game.engine.scene.add(this.station);
    this.stationPos = sys.stationPos;
    this.bay = sys.stationPos.clone().add(new THREE.Vector3(0, 0, 230));
    for (const p of this.pirates) this.group.parent.remove(p.model);
    this.pirates = [];
    this.bolts = [];
  }

  // Park on the ground at a planet-local point.
  parkAt(pl, local, fwd) {
    const n = local.clone().normalize();
    const r = pl.planet.groundRadius(n.x, n.y, n.z) + 1.42;
    this.pos.copy(pl.pos).addScaledVector(n, r);
    const f = (fwd || new THREE.Vector3(1, 0, 0)).clone().addScaledVector(n, -(fwd || AX).dot(n)).normalize();
    // Ship model looks down -Z.
    basisQuat(n, f.negate(), this.quat);
    this.vel.set(0, 0, 0);
    this.state = 'landed';
    this.throttle = 0;
    this.landedOn = pl;
  }

  axes() {
    this.fwd.set(0, 0, -1).applyQuaternion(this.quat);
    this.upv.set(0, 1, 0).applyQuaternion(this.quat);
  }

  damage(d) {
    if (this.state === 'docked' || this.game.god) return;
    this.hull -= d;
    this.repairT = 8;
    this.game.onHurt(d, false);
    if (this.hull <= 0) this.game.onShipDestroyed();
  }

  update(dt, input, env, time) {
    const g = this.game;
    const st = derived(g.save);
    this.hullMax = st.shipHull;
    this.axes();
    const pl = env.near;
    const local = tmp.copy(this.pos).sub(pl.pos);
    const n = local.clone().normalize();
    const ground = pl.planet.groundRadius(n.x, n.y, n.z);
    this.alt = local.length() - ground;
    this.speed = this.vel.length();
    if (this.repairT > 0) this.repairT -= dt;
    else this.hull = Math.min(this.hullMax, this.hull + dt * 6);

    if (this.state === 'landing') {
      this.landT += dt;
      const k = Math.min(1, this.landT / 2.6);
      const e = k * k * (3 - 2 * k);
      this.pos.lerpVectors(this.landFrom, this.landTo, e);
      this.quat.slerpQuaternions(this.landQ0, this.landQ1, e);
      if (k >= 1) {
        this.state = 'landed';
        this.vel.set(0, 0, 0);
        this.landedOn = pl;
        g.onLanded(pl);
      }
    } else if (this.state === 'flying' && this.piloted) {
      const m = input.look();
      const sens = 0.0016;
      const inv = g.save.settings.invertY ? -1 : 1;
      this.quat.multiply(q.setFromAxisAngle(AY, -m.x * sens));
      this.quat.multiply(q.setFromAxisAngle(AX, -m.y * sens * inv));
      this.quat.multiply(q.setFromAxisAngle(AZ, -input.axis('KeyD', 'KeyA') * 1.6 * dt * -1));
      // Keep the horizon level inside an atmosphere.
      if (env.inAtmo > 0.05 || this.alt < 600) {
        const level = basisQuat(n, tmp2.copy(this.fwd).negate(), q);
        const rollOnly = this.quat.clone().slerp(level, 0);
        void rollOnly;
        const upErr = this.upv.clone().cross(n);
        const along = upErr.dot(this.fwd);
        this.quat.premultiply(q.setFromAxisAngle(this.fwd.clone(), along * dt * 1.5));
      }
      this.quat.normalize();
      this.axes();
      this.throttle = Math.max(0, Math.min(1, this.throttle + input.axis('KeyS', 'KeyW') * dt * 0.7));
      if (input.hit('KeyX')) this.throttle = 0;
      const space = this.alt > 2500 && env.inAtmo <= 0;
      const boost = input.down('ShiftLeft') || input.down('ShiftRight');
      let max = 170 + (1 - env.inAtmo) * 430;
      if (this.alt < 800) max = Math.min(max, 90 + this.alt * 0.5);
      let rate = 1.8;
      this.pulsing = false;
      if (boost && this.throttle > 0.05) {
        if (space) {
          max = 14000;
          rate = 0.6;
          this.pulsing = true;
        } else max *= 1.9;
      }
      const target = tmp2.copy(this.fwd).multiplyScalar(this.throttle * max);
      this.vel.lerp(target, Math.min(1, dt * rate));
      // Slow automatically when a planet looms while pulsing.
      if (this.vel.length() > 700 && this.alt < this.vel.length() * 1.6) this.vel.multiplyScalar(Math.max(0, 1 - dt * 2.5));
      this.pos.addScaledVector(this.vel, dt);
      // Terrain.
      const l2 = tmp.copy(this.pos).sub(pl.pos);
      const n2 = l2.clone().normalize();
      const gr = pl.planet.groundRadius(n2.x, n2.y, n2.z) + 2.4;
      const water = pl.planet.hasWater ? pl.planet.radius + 2.4 : 0;
      const floor = Math.max(gr, water);
      if (l2.length() < floor) {
        const vn = this.vel.dot(n2);
        if (this.speed > 55) this.damage(this.speed * 0.35);
        this.pos.copy(pl.pos).addScaledVector(n2, floor);
        if (vn < 0) this.vel.addScaledVector(n2, -vn * 1.3);
        this.vel.multiplyScalar(0.7);
      }
      if (input.hit('KeyG')) this.tryLand(pl, env);
      this.fireCd -= dt;
      if (input.lmb && input.locked && this.fireCd <= 0) {
        this.fireCd = 0.14;
        this.gun = -(this.gun || 1);
        const from = this.pos.clone().addScaledVector(this.fwd, 5).addScaledVector(tmp.set(1, 0, 0).applyQuaternion(this.quat), 3.2 * this.gun);
        this.bolts.push({ pos: from, vel: this.fwd.clone().multiplyScalar(1500).add(this.vel), life: 1.6, dmg: st.shipDamage, team: 'player', color: [0.5, 3, 4] });
        g.audio?.play('shipBolt');
      }
      this.updatePirateSpawns(dt, env);
    } else if (this.state === 'landed' && this.piloted) {
      input.look();
      if (input.down('KeyW') || input.hit('Space')) {
        this.state = 'flying';
        this.pos.addScaledVector(n, 4);
        this.vel.copy(n).multiplyScalar(26).addScaledVector(this.fwd, 12);
        this.throttle = 0.35;
        g.onTakeoff();
      }
    }
    this.updateCombat(dt, st);
  }

  tryLand(pl, env) {
    const g = this.game;
    if (this.alt > 260) return g.hud.toast('Too high to land. Descend below 250m.', 'warn');
    if (this.speed > 280) return g.hud.toast('Too fast to land.', 'warn');
    // Aim for a spot a little ahead, on dry and reasonably flat ground.
    const local = this.pos.clone().sub(pl.pos).addScaledVector(this.vel, 0.8);
    let n = local.normalize();
    let h = pl.planet.height(n.x, n.y, n.z);
    if (pl.planet.hasWater && h < 1.5) {
      // Search nearby for land.
      let found = null;
      for (let r = 40; r < 600 && !found; r += 40) {
        for (let a = 0; a < 8; a++) {
          const t = new THREE.Vector3(Math.cos(a), Math.sin(a * 1.7), Math.sin(a)).cross(n).normalize();
          const c = n.clone().addScaledVector(t, r / pl.planet.radius).normalize();
          if (pl.planet.height(c.x, c.y, c.z) > 2.5) {
            found = c;
            break;
          }
        }
      }
      if (!found) return g.hud.toast('No dry land below.', 'warn');
      n = found;
      h = pl.planet.height(n.x, n.y, n.z);
    }
    this.landFrom = this.pos.clone();
    this.landTo = pl.pos.clone().addScaledVector(n, pl.planet.radius + h + 1.42);
    this.landQ0 = this.quat.clone();
    const f = this.fwd.clone().addScaledVector(n, -this.fwd.dot(n)).normalize();
    this.landQ1 = basisQuat(n, f.negate(), new THREE.Quaternion());
    this.landT = 0;
    this.state = 'landing';
    this.vel.set(0, 0, 0);
    this.throttle = 0;
    g.audio?.play('land');
    return true;
  }

  updatePirateSpawns(dt, env) {
    const g = this.game;
    if (env.altitude < 4000 || this.pos.distanceTo(this.stationPos) < 2500 || this.pulsing) return;
    this.pirateT -= dt;
    if (this.pirateT > 0 || this.pirates.length) return;
    this.pirateT = 110 + Math.random() * 90;
    const n = 1 + Math.floor(Math.random() * 2 + (g.sys.sys.danger || 1) * 0.4);
    for (let i = 0; i < n; i++) {
      const model = shipModel('#5a1f1f', '#ff3b2e');
      const off = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(1700 + i * 200);
      const p = { pos: this.pos.clone().add(off), vel: new THREE.Vector3(), quat: new THREE.Quaternion(), hp: 140 * (g.sys.sys.danger || 1), cool: 2, model };
      g.engine.scene.add(model);
      this.pirates.push(p);
    }
    g.hud.banner('PIRATES', 'Hostile ships inbound', '#ff4d4d');
    g.audio?.play('alarm');
  }

  updateCombat(dt, st) {
    const g = this.game;
    for (let i = this.pirates.length - 1; i >= 0; i--) {
      const p = this.pirates[i];
      const to = tmp.copy(this.pos).sub(p.pos);
      const d = to.length();
      if (d > 30000 || this.state === 'docked') {
        g.engine.scene.remove(p.model);
        this.pirates.splice(i, 1);
        continue;
      }
      const f = tmp2.set(0, 0, -1).applyQuaternion(p.quat);
      const want = to.clone().normalize();
      if (d < 260) want.negate().add(new THREE.Vector3(0.4, 0.6, 0.2)).normalize();
      q.setFromUnitVectors(f, want);
      p.quat.premultiply(new THREE.Quaternion().slerp(q, Math.min(1, dt * 1.4))).normalize();
      const sp = Math.min(420, Math.max(160, this.speed * 1.05 + 60));
      p.vel.lerp(tmp2.set(0, 0, -1).applyQuaternion(p.quat).multiplyScalar(sp), Math.min(1, dt * 1.5));
      p.pos.addScaledVector(p.vel, dt);
      p.cool -= dt;
      if (p.cool <= 0 && d < 1400 && f.dot(to.normalize()) > 0.96 && this.piloted) {
        p.cool = 0.7 + Math.random() * 0.6;
        this.bolts.push({ pos: p.pos.clone(), vel: f.clone().multiplyScalar(1100).add(p.vel), life: 1.8, dmg: 14 * (g.sys.sys.danger || 1), team: 'enemy', color: [4, 0.5, 0.2] });
      }
    }
    let nb = 0;
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.life -= dt;
      b.pos.addScaledVector(b.vel, dt);
      let dead = b.life <= 0;
      if (!dead && b.team === 'enemy' && this.piloted && b.pos.distanceToSquared(this.pos) < 64) {
        this.damage(b.dmg);
        dead = true;
      } else if (!dead && b.team === 'player') {
        for (const p of this.pirates) {
          // Generous hit volume: these are fast targets.
          if (b.pos.distanceToSquared(p.pos) < 22 * 22) {
            p.hp -= b.dmg;
            dead = true;
            g.audio?.play('hit');
            if (p.hp <= 0) {
              g.engine.scene.remove(p.model);
              this.pirates.splice(this.pirates.indexOf(p), 1);
              g.onPirateKill();
            }
            break;
          }
        }
      }
      if (dead) this.bolts.splice(i, 1);
    }
    const cam = g.cam;
    for (const b of this.bolts) {
      if (nb >= 160) break;
      q.setFromUnitVectors(AZ, tmp.copy(b.vel).normalize());
      m4.compose(tmp2.copy(b.pos).sub(cam), q, one);
      this.boltMesh.setMatrixAt(nb, m4);
      this.boltMesh.setColorAt(nb, col.setRGB(b.color[0], b.color[1], b.color[2]));
      nb++;
    }
    this.boltMesh.count = nb;
    this.boltMesh.instanceMatrix.needsUpdate = true;
    this.boltMesh.instanceColor.needsUpdate = true;
    for (const p of this.pirates) {
      p.model.position.copy(p.pos).sub(cam);
      p.model.quaternion.copy(p.quat);
    }
  }

  present(cam, time) {
    this.group.visible = this.state !== 'docked';
    this.group.position.copy(this.pos).sub(cam);
    this.group.quaternion.copy(this.quat);
    const burn = this.state === 'flying' ? 0.3 + this.throttle * (this.pulsing ? 3 : 1) : 0;
    this.engineLight.intensity = burn * 400;
    if (this.station) {
      this.station.position.copy(this.stationPos).sub(cam);
      this.station.rotation.z = time * 0.03;
    }
  }

  // Camera position in system space + orientation.
  camera(cam, out) {
    this.axes();
    if (this.game.view === 'first') {
      out.copy(this.pos).addScaledVector(this.upv, 0.95).addScaledVector(this.fwd, 1.6);
      cam.quaternion.copy(this.quat);
    } else {
      const back = 24 + Math.min(14, this.speed * 0.01);
      out.copy(this.pos).addScaledVector(this.fwd, -back).addScaledVector(this.upv, 6.5);
      cam.up.copy(this.upv);
      cam.lookAt(tmp.copy(this.pos).addScaledVector(this.fwd, 40).sub(out));
    }
  }

  canDock() {
    return this.state === 'flying' && this.pos.distanceTo(this.bay) < 260;
  }

  dock() {
    this.state = 'docked';
    this.vel.set(0, 0, 0);
    this.throttle = 0;
    this.hull = this.hullMax;
    for (const p of this.pirates) this.game.engine.scene.remove(p.model);
    this.pirates = [];
  }

  undock() {
    this.pos.copy(this.bay).add(new THREE.Vector3(0, 0, 420));
    this.quat.setFromAxisAngle(AY, Math.PI);
    this.vel.set(0, 0, 120);
    this.throttle = 0.3;
    this.state = 'flying';
  }
}
