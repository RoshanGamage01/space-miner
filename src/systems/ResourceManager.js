// ResourceManager: mineral fragments floating in space, tractor beams,
// cargo accounting and the station storage silo.
import { RESOURCES, RESOURCE_IDS } from '../core/config.js';
import { cargoUsed, emit } from '../core/state.js';
import { TAU, dist2, rand } from '../core/math.js';
import { applyPowerup } from './CombatSystem.js';

const PICKUP_LIFE = 75;
const MAX_PICKUPS = 260;

export function spawnDrops(state, x, y, type, qty, spread = 10) {
  qty = Math.max(1, Math.round(qty));
  const n = Math.min(10, Math.max(1, Math.ceil(qty / 2)));
  let left = qty;
  for (let i = 0; i < n; i++) {
    const q = i === n - 1 ? left : Math.max(1, Math.round(qty / n));
    if (q <= 0) break;
    left -= q;
    spawnPickup(state, x, y, type, q, spread);
  }
}

export function spawnPickup(state, x, y, type, qty, spread = 10) {
  if (state.pickups.length >= MAX_PICKUPS) {
    // Merge into the oldest instead of dropping value.
    const old = state.pickups[0];
    if (old.type === type) {
      old.qty += qty;
      return old;
    }
    state.pickups.shift();
  }
  const a = Math.random() * TAU;
  const sp = rand(20, 55);
  const p = {
    id: state.nextId++,
    type,
    qty,
    x: x + Math.cos(a) * spread * 0.4,
    y: y + Math.sin(a) * spread * 0.4,
    vx: Math.cos(a) * sp,
    vy: Math.sin(a) * sp,
    life: PICKUP_LIFE,
    phase: Math.random() * TAU,
    claimed: 0,
  };
  state.pickups.push(p);
  return p;
}

// Adds up to qty into bag without exceeding cap. Returns amount added.
export function addToBag(bag, type, qty, cap) {
  const space = Math.max(0, cap - cargoUsed(bag));
  const add = Math.min(space, qty);
  if (add > 0) bag[type] += add;
  return add;
}

export function recordCollected(state, type, qty) {
  if (!RESOURCES[type] || qty <= 0) return;
  const first = type === 'crystal' && state.stats.crystals === 0;
  state.stats.collected += qty;
  state.stats.byRes[type] += qty;
  if (type === 'crystal') state.stats.crystals += qty;
  if (first) emit(state, 'discover', { res: type });
}

export function updatePickups(state, dt, stats) {
  const ship = state.ship;
  const used = cargoUsed(state.cargo);
  let space = stats.cargoCap - used;
  const mag = stats.magnetRadius;
  const grab = stats.shipRadius + 7;
  const list = state.pickups;
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    p.life -= dt;
    if (p.life <= 0) {
      list.splice(i, 1);
      continue;
    }
    const drag = Math.exp(-1.6 * dt);
    p.vx *= drag;
    p.vy *= drag;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (ship.docked || ship.deadT > 0) continue;
    const d2 = dist2(p.x, p.y, ship.x, ship.y);
    const isPow = p.type.startsWith('pow_');
    const isCredits = p.type === 'credits' || isPow;
    if (d2 < mag * mag && (space > 0 || isCredits)) {
      const d = Math.sqrt(d2) || 1;
      const pull = 420 * (1 - d / mag) + 60;
      p.vx += ((ship.x - p.x) / d) * pull * dt;
      p.vy += ((ship.y - p.y) / d) * pull * dt;
      if (d < grab) {
        if (isPow) {
          applyPowerup(state, p.type.slice(4));
          list.splice(i, 1);
          continue;
        }
        if (isCredits) {
          state.credits += p.qty;
          state.stats.earned += p.qty;
          emit(state, 'collect', { x: p.x, y: p.y, res: 'credits', qty: p.qty });
          list.splice(i, 1);
          continue;
        }
        const want = p.qty;
        const add = addToBag(state.cargo, p.type, want, stats.cargoCap);
        recordCollected(state, p.type, add);
        space -= add;
        emit(state, 'collect', { x: p.x, y: p.y, res: p.type, qty: add, bonus: add > p.qty });
        if (add < p.qty) p.qty -= add;
        else {
          list.splice(i, 1);
          continue;
        }
      }
    } else if (space <= 0 && !isCredits && d2 < (grab + 10) * (grab + 10)) {
      if (ship.cargoFullWarn <= 0) {
        ship.cargoFullWarn = 3;
        emit(state, 'cargoFull', {});
      }
    }
  }
  if (ship.cargoFullWarn > 0) ship.cargoFullWarn -= dt;
}

export function bagValue(bag, priceFn) {
  let v = 0;
  for (const r of RESOURCE_IDS) v += (bag[r] || 0) * priceFn(r);
  return v;
}
