// A simple autopilot that plays SPACE MINER headless through the same
// input snapshot the keyboard and mouse produce. Used to check pacing.
import { SIM_STEP, UPGRADE_IDS } from '../src/core/config.js';
import { cargoUsed } from '../src/core/state.js';
import { droneBuyInfo, upgradeInfo } from '../src/systems/UpgradeManager.js';

const PRIORITY = ['laserDamage', 'cargoCapacity', 'laserEfficiency', 'laserSpeed', 'engineSpeed', 'cargoCollection', 'fuelTank', 'laserRange'];

function shop(engine, log) {
  const s = engine.state;
  engine.act('sell', 'all');
  engine.act('refuel');
  engine.act('repair');
  const d = droneBuyInfo(s);
  if (!d.full && d.affordable) {
    engine.act('buyDrone');
    log.push(`t=${s.time.toFixed(0)} drone #${s.drones.length}`);
  }
  for (let k = 0; k < 6; k++) {
    const pick = PRIORITY.concat(UPGRADE_IDS).find((id) => {
      const i = upgradeInfo(s, id);
      return i.affordable && !i.locked && !i.maxed;
    });
    if (!pick) break;
    engine.act('buyUpgrade', pick);
    log.push(`t=${s.time.toFixed(0)} ${pick} -> ${s.upgrades[pick]}`);
  }
}

export function playBot(engine, seconds) {
  const s = engine.state;
  const log = [];
  let mode = 'mine';
  let dockTimer = 0;
  const steps = Math.round(seconds / SIM_STEP);
  for (let i = 0; i < steps; i++) {
    const st = engine.stats;
    const ship = s.ship;
    const input = { mx: 0, my: 0, fire: false, boost: false, interact: false, ability: false, menuOpen: false };
    const full = cargoUsed(s.cargo) >= st.cargoCap * 0.9;
    if (mode === 'mine' && (full || ship.fuel < st.fuelMax * 0.25)) mode = 'home';
    if (mode === 'home') {
      const d = Math.hypot(ship.x, ship.y);
      if (engine.canDock()) {
        input.interact = true;
        mode = 'docked';
        dockTimer = 1;
      } else {
        input.mx = -ship.x / d;
        input.my = -ship.y / d;
        input.boost = d > 400;
      }
    } else if (mode === 'docked') {
      if (dockTimer === 1) shop(engine, log);
      dockTimer -= SIM_STEP;
      if (dockTimer <= 0) {
        engine.undock();
        mode = 'mine';
      }
    } else {
      // Grab loose fragments first, otherwise mine the nearest rock.
      let pick = null;
      let pd = 140;
      for (const p of s.pickups) {
        const d = Math.hypot(p.x - ship.x, p.y - ship.y);
        if (d < pd) {
          pd = d;
          pick = p;
        }
      }
      let rock = null;
      let rd = Infinity;
      for (const a of s.asteroids) {
        const d = Math.hypot(a.x - ship.x, a.y - ship.y) - a.r;
        if (d < rd) {
          rd = d;
          rock = a;
        }
      }
      if (pick) {
        input.mx = (pick.x - ship.x) / pd;
        input.my = (pick.y - ship.y) / pd;
      } else if (rock) {
        input.aimX = rock.x;
        input.aimY = rock.y;
        const dd = Math.hypot(rock.x - ship.x, rock.y - ship.y);
        if (rd > st.laserRange * 0.6) {
          input.mx = (rock.x - ship.x) / dd;
          input.my = (rock.y - ship.y) / dd;
        }
        input.fire = rd < st.laserRange && !ship.overheat;
      }
    }
    engine.step(SIM_STEP, input);
    engine.drainFx();
  }
  return log;
}
