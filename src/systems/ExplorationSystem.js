// ExplorationSystem: charts the sector on a coarse grid. New regions grant
// XP, and every few regions a research point.
import { EXPLORE_CELL } from '../core/config.js';
import { emit, sectorDef } from '../core/state.js';
import { addXp } from './EconomyManager.js';

const RP_EVERY = 8;

export const cellKey = (x, y) => `${Math.floor(x / EXPLORE_CELL)},${Math.floor(y / EXPLORE_CELL)}`;

// Number of grid cells whose centre lies inside the sector disk.
export function sectorCells(radius) {
  const n = Math.ceil(radius / EXPLORE_CELL) + 1;
  let count = 0;
  for (let i = -n; i < n; i++)
    for (let j = -n; j < n; j++) {
      const cx = (i + 0.5) * EXPLORE_CELL;
      const cy = (j + 0.5) * EXPLORE_CELL;
      if (cx * cx + cy * cy <= radius * radius) count++;
    }
  return count;
}

export function exploredFraction(state, id = state.sector) {
  const map = state.explored[id] || {};
  const total = sectorCells(sectorDef({ sector: id }).radius);
  return Math.min(1, Object.keys(map).length / total);
}

export function updateExploration(state) {
  const map = (state.explored[state.sector] ||= {});
  const key = cellKey(state.ship.x, state.ship.y);
  if (map[key]) return;
  map[key] = 1;
  state.stats.explored++;
  addXp(state, 6 + 2 * sectorDef(state).danger);
  let rp = 0;
  if (state.stats.explored % RP_EVERY === 0) {
    state.rp += 1;
    rp = 1;
  }
  emit(state, 'explore', { rp, pct: exploredFraction(state) });
}
