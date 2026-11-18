// Sites: the places on a planet. Villages, kingdom capitals, raider
// outposts, ancient ruins, the Gate and the crash site. Each is laid out on
// its flattened plateau and populated with characters to talk to or fight.
import * as THREE from 'three';
import { mulberry } from '../core/rng.js';
import { FACTIONS } from '../universe/data.js';
import { basisQuat } from '../game/Actors.js';
import { building } from './models.js';

const RULER = { thalori: 'arbiter', grumm: 'warchief', vesh: 'choir' };
const SITE_LABEL = { village: 'Village', capital: 'Capital', outpost: 'Raider Outpost', ruins: 'Ancient Ruins', gate: 'The Ancient Gate', crash: 'Crash Site' };

export class Sites {
  constructor(game, pl, group, actors) {
    this.game = game;
    this.pl = pl;
    this.planet = pl.planet;
    this.group = new THREE.Group();
    group.add(this.group);
    this.actors = actors;
    this.built = new Map();
    this.interact = [];
    this.colliders = [];
    this.spinners = [];
    this.sites = this.planet.sites.map((s) => {
      const dir = new THREE.Vector3(...s.dir);
      const up0 = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      const t = new THREE.Vector3().crossVectors(up0, dir).normalize();
      const bt = new THREE.Vector3().crossVectors(dir, t);
      const center = dir.clone().multiplyScalar(this.planet.radius + s.h);
      return { ...s, def: s, dirV: dir, t, bt, center, label: s.name || SITE_LABEL[s.type] };
    });
  }

  // Site-plane coordinates (metres east / north of the centre) to a point on
  // the ground, with its local up and a facing direction.
  at(site, x, z) {
    const R = this.planet.radius;
    const n = site.dirV.clone().addScaledVector(site.t, x / R).addScaledVector(site.bt, z / R).normalize();
    return { pos: n.clone().multiplyScalar(this.planet.groundRadius(n.x, n.y, n.z)), up: n };
  }

  place(site, obj, x, z, yaw = 0, radius = 0, lift = 0) {
    const { pos, up } = this.at(site, x, z);
    const fwd = site.t.clone().multiplyScalar(Math.sin(yaw)).addScaledVector(site.bt, Math.cos(yaw));
    obj.position.copy(pos).addScaledVector(up, lift);
    basisQuat(up, fwd, obj.quaternion);
    site.group.add(obj);
    if (radius) this.colliders.push({ pos: pos.clone(), r: radius });
    return pos;
  }

  update(local, time, dt) {
    for (const s of this.sites) {
      const d = local.distanceTo(s.center);
      s.dist = d;
      if (d < 1300 && !this.built.has(s.id)) this.build(s);
      if (s.group) s.group.visible = d < 2600;
      if (d < s.radius * 1.1 && !s.arrived) {
        s.arrived = true;
        this.game.onArrive(s);
      }
      if (d > s.radius * 2) s.arrived = false;
      if (s.type === 'gate') this.gateLogic(s, d);
    }
    for (const sp of this.spinners) {
      sp.rotation.y += dt * 0.8;
      sp.position.addScaledVector(sp.userData.up, Math.sin(time * 1.5) * 0.004);
    }
  }

  build(s) {
    this.built.set(s.id, s);
    s.group = new THREE.Group();
    this.group.add(s.group);
    const rnd = mulberry(s.seed);
    const accent = s.faction ? new THREE.Color(FACTIONS[s.faction].color).toArray() : [0.8, 0.3, 0.2];
    const A = this.actors;
    const npc = (x, z, opts) => A.spawnNpc(this.at(s, x, z).pos, { faction: s.faction, ...opts });
    const talk = (actor, kind, label) => this.interact.push({ actor, kind, label, radius: 3.4, site: s });

    if (s.type === 'village' || s.type === 'capital') {
      const cap = s.type === 'capital';
      const inner = cap ? 76 : 24;
      const outer = cap ? 114 : 54;
      if (cap) {
        this.place(s, building('palace', accent), 0, 0, 0, 17);
        this.place(s, building('wall', accent), 0, 0, 0, 0);
        for (let i = 0; i < 28; i++) {
          if (i === 7) continue;
          const an = (i / 28) * Math.PI * 2;
          // The wall is solid: a ring of colliders.
          for (const k of [-0.35, 0, 0.35]) {
            const a2 = an + (k * Math.PI * 2) / 28;
            this.colliders.push({ pos: this.at(s, Math.cos(a2) * 62, Math.sin(a2) * 62).pos, r: 2.6 });
          }
        }
        for (const sx of [-1, 1]) this.place(s, building('tower', accent), sx * 9, 70, 0, 2.6);
      } else {
        this.place(s, building('tower', accent), -6, -8, 0, 2.6);
      }
      const n = cap ? 11 : 7;
      for (let i = 0; i < n; i++) {
        const an = (i / n) * Math.PI * 2 + rnd() * 0.3 + (cap ? 0.25 : 0);
        if (cap && Math.abs(Math.sin(an) - 1) < 0.15) continue; // keep the gate road clear
        const r = inner + rnd() * (outer - inner);
        const x = Math.cos(an) * r;
        const z = Math.sin(an) * r;
        const kind = rnd() < 0.5 ? 'hut' : 'house';
        this.place(s, building(kind, accent), x, z, Math.atan2(-x, -z), kind === 'hut' ? 4 : 4.8);
      }
      const padX = cap ? 0 : 40;
      const padZ = cap ? 108 : 6;
      this.place(s, building('pad', accent), padX, padZ, 0, 0, 0.05);
      s.pad = this.at(s, padX, padZ);
      const plazaZ = cap ? 40 : 8;
      this.place(s, building('stall', accent), -9, plazaZ + 4, 0.5, 1.8);
      this.place(s, building('stall', accent), 9, plazaZ + 6, -0.5, 1.8);
      const tp = this.place(s, building('terminal', accent), 0, plazaZ + 14, Math.PI, 0.8);
      this.interact.push({ pos: tp, kind: 'trade', label: 'Trade terminal', radius: 3.2, site: s });
      for (let i = 0; i < (cap ? 10 : 6); i++) {
        const an = rnd() * Math.PI * 2;
        const r = (cap ? 30 : 10) + rnd() * (cap ? 26 : 22);
        this.place(s, building('lamp'), Math.cos(an) * r, Math.sin(an) * r + (cap ? 0 : 4), 0, 0.2);
      }
      talk(npc(-9, plazaZ + 6.4, { role: 'trader', name: 'Merchant', roam: 0.5 }), 'trade', 'Trade');
      talk(npc(9, plazaZ + 8.4, { role: 'bounty', name: 'Quartermaster', roam: 0.5 }), 'bounty', 'Ask about work');
      // Story characters.
      const story = this.game.sys.story;
      if (cap) {
        const role = story && RULER[s.faction];
        talk(npc(0, 21, { role: role || 'noble', name: role ? undefined : 'Regent', roam: 0.8 }), 'talk', 'Speak');
        for (const sx of [-1, 1]) npc(sx * 6, 60, { role: 'guard', name: 'Guard', roam: 0.5 });
      } else if (this.game.sys.id === '0,0' && this.pl.planet.desc.index === 0 && s.index === this.planet.sites.find((q) => q.type === 'village').index) {
        talk(npc(0, 12, { role: 'elder', roam: 0.8 }), 'talk', 'Speak');
      }
      for (let i = 0; i < (cap ? 9 : 5); i++) {
        const an = rnd() * Math.PI * 2;
        const r = (cap ? 28 : 6) + rnd() * (cap ? 24 : 16);
        talk(npc(Math.cos(an) * r, Math.sin(an) * r + (cap ? 0 : 6), { role: 'villager', name: 'Villager', roam: cap ? 10 : 9 }), 'lore', 'Talk');
      }
    } else if (s.type === 'outpost') {
      for (let i = 0; i < 3; i++) {
        const an = (i / 3) * Math.PI * 2 + 0.4;
        this.place(s, building('bunker'), Math.cos(an) * 17, Math.sin(an) * 17, an + Math.PI, 5.4);
      }
      this.place(s, building('watchtower'), 26, -8, 0, 2.4);
      this.place(s, building('watchtower'), -24, 12, 0, 2.4);
      for (let i = 0; i < 4; i++) {
        const x = (rnd() - 0.5) * 22;
        const z = (rnd() - 0.5) * 22;
        const c = building('crate');
        const pos = this.place(s, c, x, z, rnd() * 6, 0.9);
        this.interact.push({ pos, kind: 'crate', label: 'Open crate', radius: 2.6, site: s, obj: c });
      }
      const tough = this.game.sys.danger || 1;
      for (let i = 0; i < 7; i++) {
        const an = rnd() * Math.PI * 2;
        const r = 6 + rnd() * 26;
        const a = A.spawnRaider(this.at(s, Math.cos(an) * r, Math.sin(an) * r).pos, tough);
        a.site = s;
        a.keep = true;
      }
    } else if (s.type === 'ruins') {
      this.place(s, building('ruins'), 0, 0, 0, 0);
      for (let i = 0; i < 8; i++) {
        const an = (i / 8) * Math.PI * 2;
        this.colliders.push({ pos: this.at(s, Math.cos(an) * 14, Math.sin(an) * 14).pos, r: 1.2 });
      }
      const story = s.name === 'Vault of Echoes';
      if (s.relic || story) {
        const key = `relic:${s.id}`;
        if (!this.game.save.flags[key]) {
          const r = building('relic');
          const pos = this.place(s, r, 0, 0, 0, 0, 3);
          r.userData.up = this.at(s, 0, 0).up;
          this.spinners.push(r);
          this.interact.push({ pos, kind: 'relic', label: story ? 'Take the Echo Core' : 'Take the relic', radius: 4.5, site: s, obj: r, key, story });
        }
      }
      for (let i = 0; i < (story ? 5 : 3); i++) {
        const an = (i / 5) * Math.PI * 2;
        const a = A.spawnSentinel(this.at(s, Math.cos(an) * 20, Math.sin(an) * 20).pos.multiplyScalar(1.004), (this.game.sys.danger || 1) * (story ? 1.2 : 1));
        a.site = s;
        a.keep = true;
      }
    } else if (s.type === 'gate') {
      this.place(s, building('gate'), 0, 0, 0, 0);
      const pos = this.at(s, 0, 6).pos;
      this.interact.push({ pos, kind: 'gate', label: 'Approach the Gate', radius: 9, site: s, when: () => this.game.save.flags.wardenDown });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.colliders.push({ pos: this.at(s, sx * 44, sz * 14).pos, r: 3.4 });
    } else if (s.type === 'crash') {
      this.place(s, building('wreck'), 6, -4, 0.6, 0);
    }
  }

  gateLogic(s, d) {
    const f = this.game.save.flags;
    if (f.wardenDown || s.warden || d > 150) return;
    // The Warden wakes once the story has brought you here.
    if (this.game.save.quest.q < 5) return;
    s.warden = this.actors.spawnWarden(this.at(s, 0, -40).pos.multiplyScalar(1.02));
    s.warden.keep = true;
    s.warden.site = s;
    this.game.onBoss(s.warden);
  }

  // The closest thing the player could press E on.
  nearest(local) {
    let best = null;
    let bd = Infinity;
    for (const it of this.interact) {
      if (it.done || (it.when && !it.when())) continue;
      if (it.actor && it.actor.dead) continue;
      const p = it.actor ? it.actor.pos : it.pos;
      const d = local.distanceTo(p);
      if (d < it.radius && d < bd) {
        bd = d;
        best = it;
      }
    }
    return best;
  }

  dispose() {
    this.group.parent?.remove(this.group);
  }
}
