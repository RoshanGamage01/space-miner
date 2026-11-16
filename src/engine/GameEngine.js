// GameEngine: owns the centralized state and runs one simulation step over
// every system in a fixed order. No DOM dependency, so the whole game can be
// simulated headless (see tests/space.test.js).
import { SIM_STEP, STATION } from '../core/config.js';
import { createState, emit, getStats } from '../core/state.js';
import { dist } from '../core/math.js';
import { generateSector, updateAsteroids } from '../systems/AsteroidManager.js';
import { updatePlayer } from '../systems/PlayerController.js';
import { updateLaser, usePulse } from '../systems/MiningSystem.js';
import { updatePickups } from '../systems/ResourceManager.js';
import { updateDrones } from '../systems/DroneManager.js';
import { sell, updateMarket } from '../systems/EconomyManager.js';
import { updateCombat } from '../systems/CombatSystem.js';
import { buyDrone, buyShip, buyUpgrade, buyWeapon, ensurePerkChoices, equipWeapon, pickPerk, switchShip, travel } from '../systems/UpgradeManager.js';
import { setupSector, updateCampaign } from '../systems/CampaignSystem.js';
import { ensureMissions, updateMissions } from '../systems/MissionManager.js';
import { updateAchievements } from '../systems/AchievementManager.js';
import { nearbyDerelict, salvage, startEvent, updateEvents } from '../systems/EventManager.js';

export const EMPTY_INPUT = Object.freeze({ mx: 0, my: 0, fire: false, shoot: false, boost: false, dash: false, interact: false, ability: false, menuOpen: false });

export class GameEngine {
  constructor(state) {
    this.state = state || createState();
    this.slowTimer = 0;
    if (!this.state.asteroids.length) {
      generateSector(this.state);
      setupSector(this.state);
    }
    ensurePerkChoices(this.state);
    ensureMissions(this.state);
    this.stats = getStats(this.state);
  }

  canDock() {
    const s = this.state.ship;
    return !s.docked && !(s.deadT > 0) && dist(s.x, s.y, 0, 0) < STATION.dockRadius;
  }

  step(dt = SIM_STEP, input = EMPTY_INPUT) {
    const state = this.state;
    state.time += dt;
    state.stats.playTime += dt;
    const stats = (this.stats = getStats(state));

    if (input.interact) this.interact();
    if (input.ability) {
      const r = usePulse(state, stats);
      if (!r.ok) emit(state, 'denied', { reason: r.reason });
    }
    if (input.weapon && state.weapons[input.weapon]) equipWeapon(state, input.weapon);

    updatePlayer(state, dt, input, stats);
    updateLaser(state, dt, input, stats);
    updateCombat(state, dt, input, stats);
    updateAsteroids(state, dt);
    updatePickups(state, dt, stats);
    updateDrones(state, dt, stats);
    updateEvents(state, dt);
    updateCampaign(state, dt);
    updateMarket(state, dt);

    this.slowTimer -= dt;
    if (this.slowTimer <= 0) {
      this.slowTimer = 0.25;
      updateMissions(state);
      updateAchievements(state);
      ensurePerkChoices(state);
    }
  }

  // E: dock, salvage a derelict, or undock.
  interact() {
    const state = this.state;
    if (state.ship.docked) return this.undock();
    if (this.canDock()) return this.dock();
    if (nearbyDerelict(state)) return salvage(state, this.stats);
    return { ok: false };
  }

  dock() {
    if (!this.canDock()) return { ok: false, reason: 'Fly closer to the station' };
    const s = this.state.ship;
    s.docked = true;
    s.laser = null;
    emit(this.state, 'dock', {});
    // Docking sells your whole hold automatically.
    if (Object.values(this.state.cargo).some((q) => q > 0)) sell(this.state, 'all', 'cargo');
    return { ok: true };
  }

  undock() {
    const s = this.state.ship;
    if (!s.docked) return { ok: false };
    s.docked = false;
    s.vy = 60;
    s.invuln = 1;
    emit(this.state, 'undock', {});
    return { ok: true };
  }

  act(name, ...args) {
    const state = this.state;
    const fn = {
      sell: (res, from) => sell(state, res || 'all', from),
      buyUpgrade: (id) => buyUpgrade(state, id),
      buyWeapon: (id) => buyWeapon(state, id),
      equip: (id) => equipWeapon(state, id),
      buyDrone: () => buyDrone(state),
      buyShip: (id) => buyShip(state, id),
      switchShip: (id) => switchShip(state, id),
      travel: (id) => travel(state, id),
      perk: (id) => pickPerk(state, id),
      dock: () => this.dock(),
      undock: () => this.undock(),
      pulse: () => usePulse(state, getStats(state)),
      debugEvent: (id) => startEvent(state, id),
    }[name];
    if (!fn) return { ok: false, reason: `Unknown action ${name}` };
    const r = fn(...args) || { ok: true };
    this.stats = getStats(state);
    updateMissions(state);
    updateAchievements(state);
    return r;
  }

  drainFx() {
    const fx = this.state.fx;
    this.state.fx = [];
    return fx;
  }
}
