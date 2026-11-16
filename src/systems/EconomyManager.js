// EconomyManager: credits, XP and levels, the fluctuating mineral market,
// and selling.
import { MARKET, RESOURCES, RESOURCE_IDS, xpToNext } from '../core/config.js';
import { cargoUsed, emit } from '../core/state.js';
import { clamp, rand } from '../core/math.js';

export function addXp(state, amount, x, y) {
  amount = Math.round(amount);
  if (amount <= 0) return;
  state.xp += amount;
  if (x !== undefined) emit(state, 'xp', { x, y, amount });
  while (state.xp >= xpToNext(state.level)) {
    state.xp -= xpToNext(state.level);
    state.level++;
    const bonus = 100 * state.level;
    state.credits += bonus;
    state.pendingPerks = (state.pendingPerks || 0) + 1;
    emit(state, 'levelUp', { level: state.level, credits: bonus });
  }
}

export function addCredits(state, amount) {
  amount = Math.round(amount);
  state.credits += amount;
  if (amount > 0) state.stats.earned += amount;
}

export function price(state, res) {
  const m = state.market[res]?.mult ?? 1;
  return Math.max(1, Math.round(RESOURCES[res].value * m));
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
    total += q * price(state, r);
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
  addXp(state, Math.max(1, total / 25));
  emit(state, 'sold', { credits: total, units });
  return { ok: true, credits: total, units };
}

