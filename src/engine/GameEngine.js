// GameEngine: owns the centralized state and runs one simulation step over
// every system in a fixed order. It has no DOM dependency, so the whole game
// can be simulated headless (see tests/space-miner.test.js).
import { SIM_STEP, STATION } from '../core/config.js';
import { createState, emit, getStats } from '../core/state.js';
import { dist } from '../core/math.js';
import { generateSector, updateAsteroids } from '../systems/AsteroidManager.js';
import { updatePlayer } from '../systems/PlayerController.js';
import { updateLaser, usePulse } from '../systems/MiningSystem.js';
import { updatePickups } from '../systems/ResourceManager.js';
import { setDroneMode, updateDrones } from '../systems/DroneManager.js';
import { refuel, repair, sell, updateMarket } from '../systems/EconomyManager.js';
import {
  buyDrone,
  buyDroneUpgrade,
  buyShip,
  buyUpgrade,
  doResearch,
  switchShip,
  unlockSector,
  warp,
} from '../systems/UpgradeManager.js';
import { ensureMissions, onSale, updateMissions } from '../systems/MissionManager.js';
import { updateAchievements } from '../systems/AchievementManager.js';
import { nearbyDerelict, salvage, startEvent, updateEvents } from '../systems/EventManager.js';
import { updateExploration } from '../systems/ExplorationSystem.js';

export const EMPTY_INPUT = Object.freeze({ mx: 0, my: 0, fire: false, boost: false, interact: false, ability: false, menuOpen: false });

export class GameEngine {
  constructor(state) {
    this.state = state || createState();
    this.slowTimer = 0;
    if (!this.state.asteroids.length) generateSector(this.state);
    ensureMissions(this.state);
    this.stats = getStats(this.state);
  }

  canDock() {
    const s = this.state.ship;
    return !s.docked && dist(s.x, s.y, 0, 0) < STATION.dockRadius;
  }

  // One fixed simulation step.
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

    updatePlayer(state, dt, input, stats);
    updateLaser(state, dt, input, stats);
    updateAsteroids(state, dt);
    updatePickups(state, dt, stats);
    updateDrones(state, dt, stats);
    updateEvents(state, dt, stats);
    updateMarket(state, dt);

    // Bookkeeping that does not need 60 Hz.
    this.slowTimer -= dt;
    if (this.slowTimer <= 0) {
      this.slowTimer = 0.25;
      if (!state.ship.docked) updateExploration(state);
      updateMissions(state);
      updateAchievements(state);
    }
  }

  // E key: dock at the station, salvage a derelict, or undock.
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

  // Every player action the UI can trigger. Each returns { ok, reason }.
  act(name, ...args) {
    const state = this.state;
    const fn = {
      sell: (res, from) => {
        const r = sell(state, res, from);
        if (r.ok) onSale(state, r.credits);
        return r;
      },
      refuel: () => refuel(state),
      repair: () => repair(state),
      buyUpgrade: (id) => buyUpgrade(state, id),
      buyDroneUpgrade: (id) => buyDroneUpgrade(state, id),
      buyDrone: () => buyDrone(state),
      droneMode: (id, mode) => setDroneMode(state, Number(id), mode),
      buyShip: (id) => buyShip(state, id),
      switchShip: (id) => switchShip(state, id),
      research: (id) => doResearch(state, id),
      unlockSector: (id) => unlockSector(state, id),
      warp: (id) => warp(state, id),
      dock: () => this.dock(),
      undock: () => this.undock(),
      pulse: () => usePulse(state, getStats(state)),
      debugEvent: (id) => startEvent(state, id),
    }[name];
    if (!fn) return { ok: false, reason: `Unknown action ${name}` };
    const r = fn(...args) || { ok: true };
    this.stats = getStats(state);
    // Missions and achievements react to purchases immediately.
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
