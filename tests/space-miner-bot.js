// A simple autopilot that plays SPACE MINER headless through the same
// input snapshot the keyboard and mouse produce. Used to check pacing.
import { SIM_STEP, UPGRADE_IDS, WEAPON_IDS } from '../src/core/config.js';
import { cargoUsed } from '../src/core/state.js';
import { droneBuyInfo, upgradeInfo, weaponInfo } from '../src/systems/UpgradeManager.js';

const PRIORITY = ['laser', 'cargo', 'shield', 'armor', 'engine'];

function shop(engine, log) {
  const s = engine.state;
  engine.act('sell', 'all');
  const d = droneBuyInfo(s);
  if (!d.full && d.affordable) {
    engine.act('buyDrone');
    log.push(`t=${s.time.toFixed(0)} drone #${s.drones.length}`);
  }
  for (const id of WEAPON_IDS) {
    const w = weaponInfo(s, id);
    if (!w.owned && !w.locked && w.affordable) {
      engine.act('buyWeapon', id);
      log.push(`t=${s.time.toFixed(0)} weapon ${id}`);
    }
  }
  for (let k = 0; k < 6; k++) {
    const pick = PRIORITY.concat(UPGRADE_IDS).find((id) => upgradeInfo(s, id).affordable);
    if (!pick) break;
    engine.act('buyUpgrade', pick);
    log.push(`t=${s.time.toFixed(0)} ${pick} -> ${s.upgrades[pick]}`);
  }
}

const nearest = (list, x, y, max = Infinity) => {
  let best = null;
  let bd = max;
  for (const o of list) {
    const d = Math.hypot(o.x - x, o.y - y) - (o.r || 0);
    if (d < bd) {
      bd = d;
      best = o;
    }
  }
  return best ? { o: best, d: bd } : null;
};

export function playBot(engine, seconds) {
  const s = engine.state;
  const log = [];
  let mode = 'mine';
  let dockTimer = 0;
  const steps = Math.round(seconds / SIM_STEP);
  for (let i = 0; i < steps; i++) {
    const st = engine.stats;
    const ship = s.ship;
    const input = { mx: 0, my: 0, fire: false, shoot: false, boost: false, interact: false, ability: false, menuOpen: false };
    const enemy = nearest(s.enemies, ship.x, ship.y, 320);
    if (mode === 'mine' && (cargoUsed(s.cargo) >= st.cargoCap * 0.9 || s.time - (s.botShopAt || 0) > 90)) mode = 'home';
    if (enemy && mode !== 'docked' && !(mode === 'home' && engine.canDock())) {
      // Fight: face the enemy, keep some distance, shoot.
      const e = enemy.o;
      input.aimX = e.x;
      input.aimY = e.y;
      input.shoot = true;
      const d = Math.hypot(e.x - ship.x, e.y - ship.y) || 1;
      const away = d < 110 ? -1 : 0.3;
      input.mx = ((e.x - ship.x) / d) * away;
      input.my = ((e.y - ship.y) / d) * away;
      input.ability = d < 80 && ship.pulseCd <= 0;
    } else if (mode === 'home') {
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
      if (dockTimer === 1) {
        shop(engine, log);
        s.botShopAt = s.time;
      }
      dockTimer -= SIM_STEP;
      if (dockTimer <= 0) {
        engine.undock();
        mode = 'mine';
      }
    } else {
      const pick = nearest(s.pickups, ship.x, ship.y, 140);
      const rock = nearest(s.asteroids, ship.x, ship.y);
      if (pick) {
        const d = Math.hypot(pick.o.x - ship.x, pick.o.y - ship.y) || 1;
        input.mx = (pick.o.x - ship.x) / d;
        input.my = (pick.o.y - ship.y) / d;
      } else if (rock) {
        const a = rock.o;
        input.aimX = a.x;
        input.aimY = a.y;
        const dd = Math.hypot(a.x - ship.x, a.y - ship.y);
        if (rock.d > st.laserRange * 0.6) {
          input.mx = (a.x - ship.x) / dd;
          input.my = (a.y - ship.y) / dd;
        }
        input.fire = rock.d < st.laserRange && !ship.overheat;
      }
    }
    if (s.perkChoices) engine.act('perk', s.perkChoices[0]);
    input.dash = !!enemy && enemy.d < 60 && ship.dashCd <= 0;
    engine.step(SIM_STEP, input);
    engine.drainFx();
  }
  return log;
}
