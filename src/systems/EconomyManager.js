// EconomyManager: credits, XP and levels, the fluctuating mineral market,
// selling, refuelling and repairs.
import { MARKET, RESOURCES, RESOURCE_IDS, xpToNext } from '../core/config.js';
import { cargoUsed, emit, getStats } from '../core/state.js';
import { clamp, rand } from '../core/math.js';

export const FUEL_PRICE = 1.5;
export const REPAIR_PRICE = 2;

export function addXp(state, amount, x, y) {
  amount = Math.round(amount);
  if (amount <= 0) return;
  state.xp += amount;
  if (x !== undefined) emit(state, 'xp', { x, y, amount });
  while (state.xp >= xpToNext(state.level)) {
    state.xp -= xpToNext(state.level);
    state.level++;
    const bonus = 75 * state.level;
    state.credits += bonus;
    state.rp += 1;
    emit(state, 'levelUp', { level: state.level, credits: bonus });
  }
}

export function addCredits(state, amount) {
  amount = Math.round(amount);
  state.credits += amount;
  if (amount > 0) state.stats.earned += amount;
}

export function price(state, res, stats = getStats(state)) {
  const m = state.market[res]?.mult ?? 1;
  return Math.max(1, Math.round(RESOURCES[res].value * m * stats.sellMult));
}

export function updateMarket(state, dt) {
  state.marketTimer -= dt;
  if (state.marketTimer > 0) return;
  state.marketTimer = MARKET.interval;
  for (const r of RESOURCE_IDS) {
    const m = state.market[r];
    // Random walk with mean reversion, so prices wobble but stay sane.
    const vol = r === 'crystal' ? 0.12 : 0.08;
    m.mult = clamp(m.mult + rand(-vol, vol) + (1 - m.mult) * 0.18, MARKET.min, MARKET.max);
    m.history.push(m.mult);
    while (m.history.length > MARKET.history) m.history.shift();
  }
  emit(state, 'market', {});
}

// Sell one resource (or all) from the ship hold and/or station storage.
// The ship's hold can only be unloaded while docked.
export function sell(state, res = 'all', from = 'both') {
  const stats = getStats(state);
  const list = res === 'all' ? RESOURCE_IDS : [res];
  if (!list.every((r) => RESOURCES[r])) return { ok: false, reason: 'Unknown mineral' };
  const useCargo = (from === 'both' || from === 'cargo') && state.ship.docked;
  const useStorage = from === 'both' || from === 'storage';
  let total = 0;
  let units = 0;
  for (const r of list) {
    let q = 0;
    if (useCargo) {
      q += state.cargo[r];
      state.cargo[r] = 0;
    }
    if (useStorage) {
      q += state.storage[r];
      state.storage[r] = 0;
    }
    if (q <= 0) continue;
    total += q * price(state, r, stats);
    units += q;
    // Big dumps nudge the price down a little; it recovers over time.
    const m = state.market[r];
    m.mult = clamp(m.mult * (1 - Math.min(0.12, q * 0.0006)), MARKET.min, MARKET.max);
  }
  if (units === 0) {
    if (!state.ship.docked && cargoUsed(state.cargo) > 0 && from !== 'storage')
      return { ok: false, reason: 'Dock at the station to unload your hold' };
    return { ok: false, reason: 'Nothing to sell' };
  }
  addCredits(state, total);
  state.stats.sales++;
  state.stats.bigSale = Math.max(state.stats.bigSale, total);
  addXp(state, Math.max(1, total / 25));
  emit(state, 'sold', { credits: total, units });
  return { ok: true, credits: total, units };
}

export function refuel(state) {
  if (!state.ship.docked) return { ok: false, reason: 'Dock at the station to refuel' };
  const stats = getStats(state);
  const need = stats.fuelMax - state.ship.fuel;
  if (need < 0.5) return { ok: false, reason: 'Tank already full' };
  // Broke and empty? The station tops you up for free so you never get stuck.
  if (state.credits < need * FUEL_PRICE && state.credits < 30) {
    state.ship.fuel = stats.fuelMax;
    emit(state, 'refuel', { free: true });
    return { ok: true, cost: 0 };
  }
  const units = Math.min(need, state.credits / FUEL_PRICE);
  const cost = Math.ceil(units * FUEL_PRICE);
  state.credits -= cost;
  state.ship.fuel = Math.min(stats.fuelMax, state.ship.fuel + units);
  emit(state, 'refuel', { cost });
  return { ok: true, cost };
}

export function repair(state) {
  if (!state.ship.docked) return { ok: false, reason: 'Dock at the station to repair' };
  const stats = getStats(state);
  const need = stats.hullMax - state.ship.hull;
  if (need < 0.5) return { ok: false, reason: 'Hull is in perfect shape' };
  if (state.credits < need * REPAIR_PRICE && state.credits < 30) {
    state.ship.hull = stats.hullMax;
    emit(state, 'repair', { free: true });
    return { ok: true, cost: 0 };
  }
  const units = Math.min(need, state.credits / REPAIR_PRICE);
  const cost = Math.ceil(units * REPAIR_PRICE);
  state.credits -= cost;
  state.ship.hull = Math.min(stats.hullMax, state.ship.hull + units);
  emit(state, 'repair', { cost });
  return { ok: true, cost };
}

export const refuelCost = (state, stats = getStats(state)) => Math.ceil(Math.max(0, stats.fuelMax - state.ship.fuel) * FUEL_PRICE);
export const repairCost = (state, stats = getStats(state)) => Math.ceil(Math.max(0, stats.hullMax - state.ship.hull) * REPAIR_PRICE);
