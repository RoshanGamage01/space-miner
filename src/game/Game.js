// Game: glues the universe, the player, the ship, the story and the UI
// together and runs one frame at a time.
import * as THREE from 'three';
import { genSystem, parseSystemId, starAt } from '../universe/galaxy.js';
import { FACTIONS, ITEMS } from '../universe/data.js';
import { mulberry } from '../core/rng.js';
import { StarSystem } from '../world/StarSystem.js';
import { Props } from '../world/Props.js';
import { Sites } from '../world/Sites.js';
import { Actors } from './Actors.js';
import { Player } from './Player.js';
import { Ship } from './Ship.js';
import { addItem, count, removeItem, serialize, SAVE_KEY } from './state.js';
import { ENDINGS, LORE, NPCS, QUESTS, bountyReady, claimBounty, currentQuest, currentStep, dialogueFor, randomBounty, storyEvent } from './story.js';

const tmp = new THREE.Vector3();

export class Game {
  constructor(engine, save, hud, audio, input) {
    this.engine = engine;
    this.save = save;
    this.hud = hud;
    this.audio = audio;
    this.input = input;
    this.cam = new THREE.Vector3();
    this.time = 0;
    this.mode = 'foot'; // foot | ship
    this.view = save.settings.view;
    this.paused = false;
    this.tick = 0;
    this.saveT = 10;
    this.faunaT = 3;
    this.scanT = 0;
    this.player = new Player(this);
    this.ship = new Ship(this);
    this.surface = null; // { pl, props, actors, sites }
    hud.bind(this);
    this.loadSystem(save.systemId, true);
  }

  // ------------------------------------------------------------ world
  loadSystem(id, initial = false) {
    const [gx, gy] = parseSystemId(id);
    this.dropSurface();
    if (this.sys) this.sys.dispose();
    this.sys = new StarSystem(this.engine, genSystem(gx, gy));
    this.sys.story = this.sys.sys.story;
    this.sys.id = id;
    this.sys.danger = this.sys.sys.danger;
    this.save.systemId = id;
    this.save.stats.systems[id] = 1;
    this.ship.buildStation(this.sys);
    const s = this.save;
    if (initial) {
      const pl = this.sys.planets[Math.min(s.planet, this.sys.planets.length - 1)];
      if (s.flags.docked) {
        this.ship.pos.copy(this.ship.bay);
        this.ship.dock();
        this.mode = 'ship';
        this.ship.piloted = true;
        this.cam.copy(this.ship.pos);
      } else {
        let dir;
        if (s.ship && this.sys.planets[s.ship.planet]) dir = new THREE.Vector3(...s.ship.dir);
        else {
          const site = pl.planet.sites.find((q) => q.type === 'crash') || pl.planet.sites[0];
          dir = new THREE.Vector3(...site.dir);
        }
        const spl = this.sys.planets[s.ship?.planet ?? s.planet] || pl;
        const fwd = new THREE.Vector3(0, 1, 0).cross(dir).normalize();
        this.ship.parkAt(spl, dir.clone().multiplyScalar(spl.planet.radius), fwd);
        const start = s.where ? new THREE.Vector3(...s.where.dir) : dir.clone().addScaledVector(fwd, 9 / spl.planet.radius).normalize();
        const r = spl.planet.groundRadius(start.x, start.y, start.z);
        this.player.spawn(start.multiplyScalar(r + 0.1), fwd.clone().negate());
        this.mode = 'foot';
        this.ship.piloted = false;
        this.cam.copy(spl.pos).add(this.player.local);
      }
    } else {
      // Arrive from warp near the first planet, facing it.
      const p0 = this.sys.planets[0];
      const out = p0.pos.clone().normalize();
      this.ship.pos.copy(p0.pos).addScaledVector(out, -(p0.planet.radius + 5200)).add(new THREE.Vector3(0, 900, 0));
      this.ship.quat.setFromUnitVectors(new THREE.Vector3(0, 0, -1), p0.pos.clone().sub(this.ship.pos).normalize());
      this.ship.vel.set(0, 0, 0);
      this.ship.state = 'flying';
      this.ship.throttle = 0.2;
      this.cam.copy(this.ship.pos);
    }
    this.env = this.sys.update(this.cam, 0);
    this.story('system', { system: id });
  }

  dropSurface() {
    if (!this.surface) return;
    this.surface.props.dispose();
    this.surface.sites.dispose();
    this.surface.actors.dispose();
    this.surface = null;
    this.props = this.actors = this.sites = null;
  }

  // Build props, sites and actors for the planet we are close to.
  ensureSurface(env) {
    const pl = env.near;
    if (this.surface && this.surface.pl !== pl) this.dropSurface();
    if (env.altitude > 3500) {
      if (this.surface && this.mode !== 'foot') this.dropSurface();
      return;
    }
    if (this.surface) return;
    const g = pl.body.group;
    const actors = new Actors(this, pl, g);
    const sites = new Sites(this, pl, g, actors);
    const props = new Props(pl.planet, g, this.engine.q.props);
    this.surface = { pl, props, actors, sites };
    this.props = props;
    this.actors = actors;
    this.sites = sites;
    this.player.attach(g);
    if (!this.save.stats.planets[pl.planet.id]) {
      this.save.stats.planets[pl.planet.id] = 1;
      this.hud.banner(pl.planet.name.toUpperCase(), `${pl.planet.biome.name} world · discovered`, '#9fe8ff');
    }
  }

  // ------------------------------------------------------------ frame
  update(dt) {
    if (this.paused) {
      this.present(0);
      return;
    }
    this.time += dt;
    this.save.stats.playTime += dt;
    const env = this.env;
    const input = this.input;
    this.ensureSurface(env);
    if (input.hit('KeyV')) {
      this.view = this.view === 'first' ? 'third' : 'first';
      this.save.settings.view = this.view;
    }
    if (this.mode === 'foot') {
      if (this.surface) {
        const p = this.player;
        if (p.health > 0) p.update(dt, input, env);
        this.props.update(p.local);
        this.sites.update(p.local, this.time, dt);
        this.actors.update(dt, p, this.time);
        this.fauna(dt);
        if (input.hit('KeyF')) this.scan();
        if (input.hit('KeyE')) this.interact();
      }
      this.ship.update(dt, input, env, this.time);
    } else {
      this.ship.update(dt, input, env, this.time);
      this.player.hazard = Math.min(1, this.player.hazard + dt * 0.25);
      this.player.shield = Math.min(this.player.shieldMax || 60, this.player.shield + dt * 20);
      if (this.surface) {
        const local = tmp.copy(this.ship.pos).sub(this.surface.pl.pos);
        this.props.update(local);
        this.sites.update(local, this.time, dt);
        this.player.local.copy(local);
        this.player.up.copy(local).normalize();
        this.actors.update(dt, this.player, this.time);
      }
      if (input.hit('KeyE')) this.interact();
      if (input.hit('KeyM')) this.hud.openGalaxy();
      if (this.ship.state === 'flying' && env.inAtmo <= 0 && env.altitude > 400) this.story('space');
    }
    if (input.hit('Tab') || input.hit('KeyI')) this.hud.openInventory();
    if (input.hit('KeyJ')) this.hud.openJournal();
    if (input.hit('Escape') || input.hit('KeyP')) this.hud.openPause();
    if (this.scanT > 0) this.scanT -= dt;
    this.tick -= dt;
    if (this.tick <= 0) {
      this.tick = 0.5;
      this.story('tick');
      this.checkBounty();
    }
    this.saveT -= dt;
    if (this.saveT <= 0) this.persist();
    this.present(dt);
    input.endFrame();
  }

  // Camera, floating origin, lighting, HUD.
  present(dt) {
    const cam = this.engine.camera;
    if (this.mode === 'foot') {
      const pl = this.surface?.pl || this.env.near;
      this.player.camera(cam, tmp, pl.planet);
      this.cam.copy(pl.pos).add(tmp);
    } else this.ship.camera(cam, this.cam);
    this.env = this.sys.update(this.cam, dt);
    this.player.active = this.mode === 'foot';
    if (this.surface) this.player.present(dt, this.time, this.env);
    this.ship.present(this.cam, this.time);
    this.hud.frame(this, dt);
    this.audio?.frame(this);
  }

  // ------------------------------------------------------------ interaction
  prompt() {
    const s = this.ship;
    if (this.mode === 'foot') {
      const pl = this.surface?.pl;
      if (!pl) return null;
      const shipLocal = tmp.copy(s.pos).sub(pl.pos);
      if (shipLocal.distanceTo(this.player.local) < 9) return { key: 'E', text: this.save.flags.shipRepaired ? 'Board ship' : 'Repair ship (30 Ferrite, 20 Carbon)', act: 'ship' };
      const it = this.sites.nearest(this.player.local);
      if (it) return { key: 'E', text: it.actor?.name && it.kind !== 'lore' ? `${it.label}: ${NPCS[it.actor.role]?.name || it.actor.name}` : it.label, act: 'site', it };
      return null;
    }
    if (s.state === 'landed') return { key: 'E', text: 'Exit ship   ·   W  Take off', act: 'exit' };
    if (s.canDock()) return { key: 'E', text: `Dock at ${this.sys.sys.station.name}`, act: 'dock' };
    if (s.state === 'flying' && s.alt < 260) return { key: 'G', text: 'Land', act: 'land' };
    return null;
  }

  interact() {
    const p = this.prompt();
    if (!p) return;
    if (p.act === 'ship') {
      if (!this.save.flags.shipRepaired) {
        const ev = this.story('interact', { what: 'repair' });
        if (!this.save.flags.shipRepaired && !ev.length) this.hud.toast('The hull is breached. Follow the mission steps first.', 'warn');
        else if (this.save.flags.shipRepaired) this.audio?.play('repair');
        return;
      }
      this.mode = 'ship';
      this.ship.piloted = true;
      this.player.active = false;
      this.audio?.play('board');
      this.hud.toast('W take off · mouse steer · Shift boost · G land · V view', 'info');
    } else if (p.act === 'exit') {
      const s = this.ship;
      const pl = s.landedOn || this.env.near;
      const local = s.pos.clone().sub(pl.pos).addScaledVector(tmp.set(1, 0, 0).applyQuaternion(s.quat), 5.5);
      const n = local.clone().normalize();
      this.ensureSurface(this.env);
      this.player.spawn(n.multiplyScalar(pl.planet.groundRadius(n.x, n.y, n.z) + 0.1), s.fwd.clone());
      this.mode = 'foot';
      s.piloted = false;
      this.save.ship = { planet: pl.planet.desc.index, dir: s.pos.clone().sub(pl.pos).normalize().toArray() };
      this.persist();
    } else if (p.act === 'dock') {
      this.ship.dock();
      this.save.flags.docked = true;
      this.audio?.play('dock');
      this.story('dock');
      this.hud.openStation();
      this.persist();
    } else if (p.act === 'site') this.useSite(p.it);
  }

  undock() {
    this.ship.undock();
    this.save.flags.docked = false;
  }

  useSite(it) {
    const s = this.save;
    const f = it.site.faction;
    if (it.kind === 'talk') {
      const role = it.actor.role;
      if (NPCS[role]) {
        const d = dialogueFor(s, role);
        this.hud.dialogue(d.npc.name, d.npc.title, FACTIONS[d.npc.faction].color, d.lines, () => {
          if (d.story) this.story('talk', { role });
        });
      } else this.hud.dialogue(it.actor.name, it.site.label, FACTIONS[f].color, [role === 'noble' ? '"The court welcomes honest traders. Our markets are open to you."' : '"Move along."']);
    } else if (it.kind === 'lore') {
      const lines = LORE[f];
      const line = lines[Math.floor(Math.random() * lines.length)];
      if (!s.lore.includes(line)) {
        s.lore.push(line);
        s.rep[f] = Math.min(100, s.rep[f] + 0.5);
      }
      this.hud.dialogue(FACTIONS[f].species, it.site.label, FACTIONS[f].color, [line]);
    } else if (it.kind === 'trade') this.hud.openTrade(it.site.label);
    else if (it.kind === 'bounty') this.bountyTalk(it);
    else if (it.kind === 'crate') {
      it.done = true;
      it.obj.visible = false;
      const units = 80 + Math.floor(Math.random() * 220);
      s.units += units;
      const item = ['copper', 'gold', 'medkit', 'sodium'][Math.floor(Math.random() * 4)];
      const n = item === 'medkit' ? 1 : 4 + Math.floor(Math.random() * 8);
      addItem(s, item, n);
      this.hud.toast(`Looted ${units} units and ${n} ${ITEMS[item].name}`, 'good');
      this.audio?.play('pickup');
    } else if (it.kind === 'relic') {
      it.done = true;
      it.obj.visible = false;
      s.flags[it.key] = true;
      addItem(s, 'relic', 1);
      this.hud.banner(it.story ? 'ECHO CORE RECOVERED' : 'ANCIENT RELIC', it.story ? 'Return to the Choir-Mother' : 'Worth a fortune to collectors', '#ffe9a8');
      this.audio?.play('quest');
      if (it.story) this.story('interact', { what: 'relic' });
    } else if (it.kind === 'gate') {
      this.hud.endingChoice((choice) => {
        s.flags.ending = choice;
        this.story('interact', { what: 'gate' });
        this.hud.ending(ENDINGS[choice], s);
        this.persist();
      });
    }
  }

  bountyTalk(it) {
    const s = this.save;
    const f = it.site.faction;
    const name = 'Quartermaster';
    if (s.bounty) {
      if (bountyReady(s)) {
        const b = claimBounty(s);
        this.audio?.play('quest');
        this.hud.dialogue(name, it.site.label, FACTIONS[f].color, [`"Good work. ${b.units} units, as agreed."`]);
      } else this.hud.dialogue(name, it.site.label, FACTIONS[f].color, [`"Still waiting: ${s.bounty.text}."`]);
      return;
    }
    const b = randomBounty(mulberry((Math.random() * 1e9) | 0), f);
    this.hud.dialogue(name, it.site.label, FACTIONS[f].color, [`"Looking for work? ${b.text}. Pays ${b.units} units."`], null, [
      ['Accept', () => {
        s.bounty = b;
        this.hud.toast(`Contract: ${b.text}`, 'info');
      }],
      ['Not now', null],
    ]);
  }

  checkBounty() {
    const b = this.save.bounty;
    if (b && !b.told && bountyReady(this.save)) {
      b.told = true;
      this.hud.toast('Contract complete. Return to a Quartermaster.', 'good');
    }
  }

  scan() {
    this.scanT = 14;
    this.audio?.play('scan');
    this.hud.toast('Scanner pulse: resources and places marked', 'info');
  }

  // Keep some wildlife around the player.
  fauna(dt) {
    this.faunaT -= dt;
    if (this.faunaT > 0) return;
    this.faunaT = 2.5;
    const pl = this.surface.pl.planet;
    const b = pl.biome;
    const A = this.actors;
    const wild = A.list.filter((a) => a.kind === 'creature').length;
    const p = this.player;
    const spot = () => {
      const a = Math.random() * Math.PI * 2;
      const d = 55 + Math.random() * 60;
      const q = p.local.clone().addScaledVector(p.fwd, Math.cos(a) * d).addScaledVector(p.right, Math.sin(a) * d).normalize();
      const h = pl.height(q.x, q.y, q.z);
      if ((pl.hasWater && h < 1) || pl.siteAt(q.x, q.y, q.z, 1.3)) return null;
      return q.multiplyScalar(pl.radius + h);
    };
    if (b.fauna > 0 && wild < Math.round(5 * b.fauna)) {
      const at = spot();
      if (at) A.spawnCreature(at, Math.random, Math.random() < (pl.desc.hazardLevel > 0 ? 0.3 : 0.14));
    }
    const sent = A.list.filter((a) => a.kind === 'sentinel' && !a.site).length;
    if (pl.desc.type === 'exotic' && sent < 2 && Math.random() < 0.3) {
      const at = spot();
      if (at) A.spawnSentinel(at.multiplyScalar(1.003), this.sys.danger);
    }
  }

  // ------------------------------------------------------------ story glue
  story(type, data = {}) {
    const ev = storyEvent(this.save, type, data);
    for (const e of ev) {
      if (e.type === 'stepDone') {
        const bits = [];
        if (e.reward?.units) bits.push(`+${e.reward.units} units`);
        if (e.give) for (const k in e.give) bits.push(`${e.give[k]} ${ITEMS[k].name}`);
        this.hud.toast(`✓ ${e.text}${bits.length ? ` · ${bits.join(', ')}` : ''}`, 'good');
        this.audio?.play('quest');
      } else if (e.type === 'questDone') this.hud.banner('MISSION COMPLETE', e.title, '#7dffb0');
      else if (e.type === 'questStart') {
        setTimeout(() => this.hud.banner(e.title.toUpperCase(), 'New mission', '#ffd23e'), 2800);
        if (e.intro) this.hud.toast(e.intro, 'info', 9000);
      } else if (e.type === 'progress') this.hud.toast(`${e.n} / ${e.need}`, 'info');
      else if (e.type === 'lack' && type === 'interact') this.hud.toast('You need 30 Ferrite and 20 Carbon to repair the ship.', 'warn');
    }
    if (ev.length) this.persist();
    return ev;
  }

  // Where the current mission step wants you to go, in system space.
  marker() {
    const step = currentStep(this.save);
    const m = step?.mark;
    if (!m) return null;
    if (m.system && m.system !== this.sys.id) {
      const [gx, gy] = parseSystemId(m.system);
      return { warp: starAt(gx, gy).name };
    }
    if (m.station) return { pos: this.ship.bay, label: this.sys.sys.station.name };
    if (m.site) {
      const pl = this.sys.planets[m.planet];
      const site = pl?.planet.sites.find((s) => s.type === m.site);
      if (!site) return null;
      const d = tmp.set(site.dir[0], site.dir[1], site.dir[2]);
      return { pos: pl.pos.clone().addScaledVector(d, pl.planet.radius + site.h + 6), label: site.name || pl.planet.name, planet: pl.planet.name };
    }
    return null;
  }

  // ------------------------------------------------------------ callbacks
  onMined(res, n, full) {
    this.hud.gain(res, n);
    if (full) this.hud.toast(`${ITEMS[res].name} stack is full`, 'warn');
    this.audio?.play('mine');
  }

  onHit(actor, dmg) {
    this.hud.hitMarker(actor, dmg);
    if (dmg) this.audio?.play('hit');
  }

  onKill(a) {
    const s = this.save;
    s.stats.kills++;
    this.audio?.play(a.boss ? 'bossDown' : 'kill');
    if (a.kind === 'creature') {
      addItem(s, 'carbon', 6);
      this.hud.gain('carbon', 6);
    } else {
      const u = a.boss ? 5000 : a.kind === 'raider' ? 140 : 110;
      s.units += u;
      this.hud.toast(`+${u} units`, 'good');
    }
    if (s.bounty?.kind === 'hunt' && (a.kind === 'sentinel' || (a.kind === 'creature' && a.hostile))) s.bounty.done++;
    if (a.kind === 'raider') this.story('kill', { kind: 'raider' });
    if (a.kind === 'warden') {
      s.flags.wardenDown = true;
      this.hud.banner('THE WARDEN FALLS', 'The Gate is unguarded', '#7df9ff');
      this.hud.bossBar(null);
      this.story('kill', { kind: 'warden' });
    }
  }

  onBoss(a) {
    this.boss = a;
    this.hud.cinematic('THE WARDEN', 'Last guardian of the Ancient Gate', '#ff5a3c');
    this.hud.bossBar(a);
    this.audio?.play('boss');
  }

  onHurt(d, shieldOnly) {
    this.hud.hurt(shieldOnly);
    this.audio?.play('hurt');
  }

  onDeath() {
    this.hud.banner('YOU DIED', 'Your ship recovers you', '#ff4d4d');
    this.audio?.play('death');
    setTimeout(() => {
      const pl = this.surface?.pl;
      if (!pl) return;
      const s = this.ship;
      const local = s.pos.clone().sub(pl.pos).addScaledVector(tmp.set(1, 0, 0).applyQuaternion(s.quat), 5.5);
      const n = local.normalize();
      this.player.spawn(n.multiplyScalar(pl.planet.groundRadius(n.x, n.y, n.z) + 0.1), s.fwd.clone());
      this.player.health = 100;
      this.player.shield = this.player.shieldMax || 60;
      this.player.hazard = 1;
    }, 2600);
  }

  onShipDestroyed() {
    const lost = Math.floor(this.save.units * 0.1);
    this.save.units -= lost;
    this.hud.banner('SHIP DESTROYED', `Towed to the station · ${lost} units in repairs`, '#ff4d4d');
    this.audio?.play('death');
    this.ship.pos.copy(this.ship.bay);
    this.ship.dock();
    this.save.flags.docked = true;
    this.mode = 'ship';
    this.ship.piloted = true;
    setTimeout(() => this.hud.openStation(), 1800);
  }

  onPirateKill() {
    this.save.units += 350;
    this.save.stats.kills++;
    this.hud.toast('Pirate destroyed · +350 units', 'good');
    this.audio?.play('kill');
  }

  onArrive(site) {
    this.hud.banner(site.label.toUpperCase(), site.faction ? FACTIONS[site.faction].name : this.surface.pl.planet.name, site.faction ? FACTIONS[site.faction].color : '#ffb347');
    this.story('arrive', { site: site.type, system: this.sys.id });
  }

  onLanded(pl) {
    this.save.ship = { planet: pl.planet.desc.index, dir: this.ship.pos.clone().sub(pl.pos).normalize().toArray() };
    this.save.planet = pl.planet.desc.index;
    this.persist();
  }

  onTakeoff() {
    this.audio?.play('takeoff');
  }

  // ------------------------------------------------------------ travel
  canWarp() {
    if (this.mode !== 'ship') return 'Board your ship first';
    if (this.ship.state === 'landed' || this.ship.state === 'landing') return 'Leave the planet first';
    if (this.ship.state === 'flying' && this.env.inAtmo > 0) return 'Climb out of the atmosphere first';
    if (count(this.save, 'warpCell') < 1) return 'You need a Warp Cell';
    return null;
  }

  warp(id) {
    const why = this.canWarp();
    if (why) return { ok: false, reason: why };
    if (id === this.sys.id) return { ok: false, reason: 'You are already here' };
    removeItem(this.save, 'warpCell', 1);
    this.save.stats.jumps++;
    this.save.flags.docked = false;
    this.save.planet = 0;
    this.save.ship = null;
    this.audio?.play('warp');
    this.hud.warpFx(() => {
      this.loadSystem(id);
      this.hud.banner(this.sys.sys.name.toUpperCase(), this.sys.sys.faction ? FACTIONS[this.sys.sys.faction].name : 'Unclaimed space', '#b98bff');
      this.persist();
    });
    return { ok: true };
  }

  persist() {
    this.saveT = 10;
    const s = this.save;
    if (this.mode === 'foot' && this.surface) {
      s.where = { dir: this.player.local.clone().normalize().toArray() };
      s.planet = this.surface.pl.planet.desc.index;
    } else s.where = null;
    try {
      localStorage.setItem(SAVE_KEY, serialize(s));
    } catch {
      /* storage unavailable */
    }
  }

  // Point the on-foot view at a planet-local position (tests, cutscenes).
  lookAt(target) {
    const p = this.player;
    const up = p.local.clone().normalize();
    const eye = p.local.clone().addScaledVector(up, 1.66);
    const d = target.clone().sub(eye);
    const flat = d.clone().addScaledVector(up, -d.dot(up));
    p.fwd.copy(flat).normalize();
    p.pitch = Math.atan2(d.dot(up), flat.length() || 1);
  }

  questInfo() {
    const q = currentQuest(this.save);
    const step = currentStep(this.save);
    if (!q || !step) return { title: 'Free flight', text: 'The galaxy is yours. Explore, trade, fight.', hint: '' };
    let text = step.text;
    if (step.show) text += ` (${Math.min(count(this.save, step.show[0]), step.show[1])}/${step.show[1]})`;
    if (step.need) text += ` (${this.save.quest.n}/${step.need})`;
    return { title: q.title, text, hint: step.hint || '', index: this.save.quest.q, total: QUESTS.length };
  }
}
