// Player: the astronaut on foot. Spherical gravity, walking, jetpack,
// swimming, first- and third-person cameras, the mining beam and the bolt
// caster. Position is planet-local.
import * as THREE from 'three';
import { GLOW, animateHumanoid, humanoid, toGroup, build } from '../world/models.js';
import { basisQuat } from './Actors.js';
import { PROP_RADIUS } from '../world/Props.js';
import { addItem, cosmetic, count, derived, removeItem } from './state.js';

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const EYE = 1.66;

export class Player {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.local = new THREE.Vector3(0, 1000, 0);
    this.vel = new THREE.Vector3();
    this.up = new THREE.Vector3(0, 1, 0);
    this.fwd = new THREE.Vector3(1, 0, 0);
    this.right = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.pitch = 0;
    this.grounded = false;
    this.tool = 'mine';
    this.health = 100;
    this.shield = 60;
    this.shieldDelay = 0;
    this.hazard = 1;
    this.fuel = 3;
    this.fireCd = 0;
    this.walk = 0;
    this.eye = new THREE.Vector3();
    this.beamOn = false;
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 1, 6, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 3.2, 4), fog: false }));
    this.beam.visible = false;
    this.beam.frustumCulled = false;
    this.flash = new THREE.PointLight(0x66ddff, 0, 12);
    this.torch = new THREE.SpotLight(0xfff2dd, 0, 70, 0.5, 0.7, 1.6);
    this.buildModels();
  }

  buildModels() {
    const s = this.game.save;
    const suit = new THREE.Color(cosmetic('suit', s.cosmetics.sel.suit).color).toArray();
    const visor = new THREE.Color(cosmetic('visor', s.cosmetics.sel.visor).color).toArray();
    if (this.h) this.h.group.parent?.remove(this.h.group);
    this.h = humanoid({ skin: suit, accent: [1, 0.45, 0.1], visor, style: 'astronaut' });
    // First-person multi-tool, parented to the camera.
    if (this.fp) this.fp.parent?.remove(this.fp);
    this.fp = toGroup(build([
      ['box', [0.16, 0.17, 0.2], [0, 0, 0], [0.09, 0.12, 0.5]],
      ['box', suit, [0, 0.04, 0.02], [0.1, 0.05, 0.3]],
      ['cyl', [0.3, 0.3, 0.34], [0, 0.01, -0.32], [0.05, 0.2, 0.05], [Math.PI / 2, 0, 0]],
      ['box', visor, [0, 0.075, 0.05], [0.03, 0.02, 0.2], [0, 0, 0], 3],
      ['sphere', visor, [0, 0.01, -0.43], [0.05, 0.05, 0.05], [0, 0, 0], 3],
      ['box', [0.16, 0.17, 0.2], [0, -0.12, 0.16], [0.07, 0.2, 0.09], [0.3, 0, 0]],
    ]), undefined, false);
    this.fp.scale.setScalar(0.5);
    this.game.engine.camera.add(this.fp, this.torch, this.torch.target);
    this.torch.position.set(0, 0, 0);
    this.torch.target.position.set(0, 0, -10);
  }

  attach(group) {
    group.add(this.h.group, this.beam, this.flash);
  }

  spawn(local, fwd) {
    this.local.copy(local);
    this.up.copy(local).normalize();
    this.vel.set(0, 0, 0);
    if (fwd) this.fwd.copy(fwd);
    this.pitch = 0;
    this.active = true;
  }

  get pl() {
    return this.game.env.near;
  }

  damage(d) {
    if (!this.active || this.health <= 0 || this.game.god) return;
    this.shieldDelay = 5;
    const a = Math.min(this.shield, d);
    this.shield -= a;
    this.health -= d - a;
    this.game.onHurt(d, a >= d);
    if (this.health <= 0) {
      this.health = 0;
      this.game.onDeath();
    }
  }

  update(dt, input, env) {
    const g = this.game;
    const planet = env.near.planet;
    const st = derived(g.save);
    const R = planet.radius;
    this.up.copy(this.local).normalize();
    const up = this.up;

    // Look.
    const m = input.look();
    const sens = 0.0023;
    if (m.x) this.fwd.applyAxisAngle(up, -m.x * sens);
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - m.y * sens * (g.save.settings.invertY ? -1 : 1)));
    this.fwd.addScaledVector(up, -this.fwd.dot(up)).normalize();
    this.right.crossVectors(this.fwd, up).normalize();
    this.look.copy(this.fwd).multiplyScalar(Math.cos(this.pitch)).addScaledVector(up, Math.sin(this.pitch));

    // Move.
    const ix = input.axis('KeyA', 'KeyD');
    const iz = input.axis('KeyS', 'KeyW');
    const run = input.down('ShiftLeft') || input.down('ShiftRight');
    const h = this.local.length() - R;
    const swimming = planet.hasWater && h < -1.1;
    const speed = swimming ? 3.2 : run ? 10.5 : 6.2;
    const wish = tmp.set(0, 0, 0).addScaledVector(this.fwd, iz).addScaledVector(this.right, ix);
    if (wish.lengthSq() > 1) wish.normalize();
    wish.multiplyScalar(speed);
    const radial = this.vel.dot(up);
    const tang = tmp2.copy(this.vel).addScaledVector(up, -radial);
    tang.lerp(wish, Math.min(1, dt * (this.grounded || swimming ? 11 : 2.5)));
    let vr = radial - planet.desc.gravity * dt * (swimming ? 0.12 : 1);
    if (swimming) vr += (-(h + 1.3) * 2.2 - vr * 1.5) * dt;
    const jump = input.down('Space');
    if (input.hit('Space') && this.grounded) {
      vr = 6.4;
      g.audio?.play('jump');
    } else if (jump && !this.grounded && this.fuel > 0 && !swimming) {
      vr = Math.min(9.5, vr + (planet.desc.gravity + 16) * dt);
      this.fuel = Math.max(0, this.fuel - dt);
      this.jetting = true;
    } else this.jetting = false;
    if (jump && swimming) vr = Math.min(3, vr + 9 * dt);
    if (this.grounded) this.fuel = Math.min(st.jetFuel, this.fuel + dt * 1.6);
    this.fuelMax = st.jetFuel;
    this.vel.copy(tang).addScaledVector(up, vr);
    this.local.addScaledVector(this.vel, dt);

    // Ground.
    const n = tmp.copy(this.local).normalize();
    const gr = planet.groundRadius(n.x, n.y, n.z);
    const was = this.grounded;
    if (this.local.length() <= gr + 0.03) {
      const fall = this.vel.dot(n);
      this.local.copy(n).multiplyScalar(gr);
      if (fall < 0) this.vel.addScaledVector(n, -fall);
      if (!was && fall < -17) this.damage((-fall - 17) * 4);
      this.grounded = true;
    } else this.grounded = this.local.length() <= gr + 0.25 && vr <= 0.1;

    // Bump into trees, rocks and buildings.
    for (const p of g.props?.active || []) {
      const r = PROP_RADIUS[p.type] * p.scale;
      if (!r) continue;
      this.pushOut(p.v, r + 0.4, up);
    }
    for (const c of g.sites?.colliders || []) this.pushOut(c.pos, c.r + 0.4, up);

    this.walk += tang.length() * dt;
    this.speed = tang.length();
    this.eye.copy(this.local).addScaledVector(up, EYE + (this.grounded ? Math.sin(this.walk * 1.7) * 0.04 : 0));

    // Suit systems.
    this.shieldMax = st.shieldMax;
    if (this.shieldDelay > 0) this.shieldDelay -= dt;
    else this.shield = Math.min(st.shieldMax, this.shield + dt * 14);
    const hz = planet.desc.hazardLevel;
    if (hz > 0) {
      this.hazard = Math.max(0, this.hazard - (dt / st.hazardTime) * hz);
      if (this.hazard < 0.25 && count(g.save, 'sodium') > 0) {
        removeItem(g.save, 'sodium', 1);
        this.hazard = Math.min(1, this.hazard + 0.25);
      }
      if (this.hazard <= 0) {
        this.hzT = (this.hzT || 0) - dt;
        if (this.hzT <= 0) {
          this.hzT = 1;
          this.damage(5);
        }
      }
    } else this.hazard = Math.min(1, this.hazard + dt * 0.08);
    if (input.hit('KeyH') && this.health < 100 && removeItem(g.save, 'medkit', 1)) {
      this.health = Math.min(100, this.health + 60);
      g.hud.toast('Med Gel applied', 'good');
    }
    if (input.hit('KeyQ')) {
      this.tool = this.tool === 'mine' ? 'bolt' : 'mine';
      g.audio?.play('click');
    }
    this.useTool(dt, input, st);
  }

  pushOut(c, r, up) {
    tmp.copy(this.local).sub(c);
    const along = tmp.dot(up);
    if (Math.abs(along) > 5) return;
    tmp.addScaledVector(up, -along);
    const d = tmp.length();
    if (d < r && d > 0.001) this.local.addScaledVector(tmp, (r - d) / d);
  }

  muzzle(out) {
    if (this.game.view === 'first') return out.copy(this.eye).addScaledVector(this.right, 0.3).addScaledVector(this.up, -0.24).addScaledVector(this.look, 0.9);
    return out.copy(this.local).addScaledVector(this.up, 1.2).addScaledVector(this.right, -0.35).addScaledVector(this.look, 0.7);
  }

  useTool(dt, input, st) {
    const g = this.game;
    this.fireCd -= dt;
    this.beamOn = false;
    this.target = null;
    const origin = this.eye;
    const prop = g.props.raycast(origin, this.look, 16);
    const act = g.actors.raycast(origin, this.look, this.tool === 'mine' ? 16 : 120);
    if (prop && (!act || prop.dist < act.dist)) this.target = { prop: prop.prop, dist: prop.dist };
    else if (act) this.target = { actor: act.actor, dist: act.dist };
    if (!input.lmb || !input.locked) return;
    if (this.tool === 'mine') {
      // A continuous beam: mines props, scorches creatures.
      this.beamOn = true;
      const n = tmp.copy(origin).addScaledVector(this.look, 16).normalize();
      let end = 16;
      const t = this.target;
      if (t && t.dist <= 16) end = t.dist;
      this.beamEnd = tmp2.copy(origin).addScaledVector(this.look, end).clone();
      void n;
      if (t && t.dist <= 16) {
        if (t.prop) {
          const r = g.props.mine(t.prop, st.mineRate * dt);
          if (r.n > 0) {
            const got = addItem(g.save, r.res, r.n);
            g.save.stats.mined += got;
            g.onMined(r.res, got, r.n > got);
          }
          if (Math.random() < 0.5) g.actors.burst(this.beamEnd, [1.2, 2.4, 3], 1, 3, 0.4);
          if (r.done) {
            g.actors.burst(this.beamEnd, [2, 2, 1.4], 18, 6, 0.7);
            g.audio?.play('break');
          }
        } else if (t.actor) {
          g.onHit(t.actor, 0);
          g.actors.damage(t.actor, st.mineRate * 0.5 * dt);
        }
      }
    } else if (this.fireCd <= 0) {
      this.fireCd = 0.17;
      const from = this.muzzle(new THREE.Vector3());
      // Aim where the crosshair points, not where the gun points.
      const aimAt = tmp.copy(origin).addScaledVector(this.look, this.target ? Math.max(4, this.target.dist) : 80);
      const dir = aimAt.sub(from).normalize();
      g.actors.bolt(from, dir, 110, st.boltDamage, 'player', [0.6, 3, 4]);
      this.kick = 0.06;
      g.audio?.play('bolt');
    }
  }

  // Place the avatar, beam and lights; called after update.
  present(dt, time, env) {
    const g = this.game;
    const first = g.view === 'first';
    const m = this.h.group;
    m.visible = this.active && !first;
    this.fp.visible = this.active && first;
    if (this.active) {
      m.position.copy(this.local);
      basisQuat(this.up, this.fwd, m.quaternion);
      animateHumanoid(this.h, time, this.grounded ? this.speed : 0, true);
      this.kick = Math.max(0, (this.kick || 0) - dt * 0.5);
      this.fp.position.set(0.19, -0.17 + Math.sin(this.walk * 1.7) * 0.005, -0.42 + this.kick);
      this.fp.rotation.y = 0.08;
      this.fp.rotation.x = this.kick * 2;
    }
    this.beam.visible = this.active && this.beamOn;
    if (this.beam.visible) {
      const from = this.muzzle(tmp);
      this.beam.position.copy(from);
      this.beam.lookAt(tmp2.copy(this.beamEnd).add(this.beam.parent.getWorldPosition(new THREE.Vector3())));
      this.beam.scale.set(1 + Math.random() * 0.6, 1 + Math.random() * 0.6, from.distanceTo(this.beamEnd));
      this.flash.position.copy(this.beamEnd);
      this.flash.intensity = 6 + Math.random() * 4;
    } else this.flash.intensity = 0;
    this.torch.intensity = this.active && env.day < 0.35 ? 45 * (1 - env.day / 0.35) : 0;
  }

  // Camera position (planet-local) and orientation.
  camera(cam, out, planet) {
    const first = this.game.view === 'first';
    if (first) out.copy(this.eye);
    else {
      out.copy(this.local).addScaledVector(this.up, 1.9).addScaledVector(this.look, -5.2).addScaledVector(this.right, 0.7);
      const n = tmp.copy(out).normalize();
      const gr = planet.groundRadius(n.x, n.y, n.z) + 0.5;
      if (out.length() < gr) out.setLength(gr);
    }
    const target = first ? tmp.copy(this.look) : tmp.copy(this.eye).addScaledVector(this.look, 30).sub(out).normalize();
    cam.up.copy(this.up);
    cam.lookAt(target);
  }
}
