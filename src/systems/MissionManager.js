// MissionManager: three short objectives at a time. A scripted run teaches
// the loop, then missions are generated to scale with the pilot.
import { ACTIVE_MISSIONS, RESOURCES, SCRIPTED_MISSIONS, SECTORS } from '../core/config.js';
import { emit, sectorDef } from '../core/state.js';
import { pickWeighted, randInt } from '../core/math.js';
import { addCredits, addXp } from './EconomyManager.js';

function statValue(state, m) {
  const s = state.stats;
  switch (m.kind) {
    case 'collect':
      return s.byRes[m.res] || 0;
    case 'asteroids':
      return s.asteroids;
    case 'sales':
      return s.sales;
    case 'earned':
      return s.earned;
    case 'upgradeGroup':
      return s.byGroup[m.group] || 0;
    case 'upgrades':
      return s.upgrades;
    case 'drones':
      return state.drones.length;
    case 'crystals':
      return s.crystals;
    case 'explored':
      return s.explored;
    case 'pirates':
      return s.pirates;
    case 'bigSale':
      return m.best || 0;
    default:
      return 0;
  }
}

const ABSOLUTE = new Set(['drones', 'bigSale']);

export function missionProgress(state, m) {
  const v = statValue(state, m);
  return Math.max(0, Math.min(m.goal, ABSOLUTE.has(m.kind) ? v : v - m.base));
}

function startMission(state, def) {
  const m = { id: ++state.missions.seq, rp: 0, ...def };
  m.base = ABSOLUTE.has(m.kind) ? 0 : statValue(state, m);
  if (m.kind === 'bigSale') m.best = 0;
  state.missions.active.push(m);
  return m;
}

function generateMission(state) {
  const L = state.level;
  const sec = sectorDef(state);
  const scale = sec.yield;
  const kinds = { collect: 4, asteroids: 2, earned: 2, explored: 1.2, bigSale: 1.5, upgrades: 1 };
  if (state.stats.pirates > 0 || L >= 4) kinds.pirates = 0.6;
  // Avoid duplicates of what is already active.
  for (const m of state.missions.active) if (kinds[m.kind]) kinds[m.kind] *= 0.2;
  const kind = pickWeighted(kinds);
  const round = (n, step) => Math.max(step, Math.round(n / step) * step);
  switch (kind) {
    case 'collect': {
      const w = { ...sec.bands[1].w };
      const res = pickWeighted(w);
      const goal = round((25 + L * 6) * scale * (res === 'crystal' ? 0.15 : res === 'nickel' ? 0.5 : 1), 5);
      return { kind, res, goal, title: `Collect ${goal} ${RESOURCES[res].name}`, hint: `Find ${RESOURCES[res].name.toLowerCase()} asteroids.`, credits: round(goal * RESOURCES[res].value * 1.3, 10), xp: 30 + L * 12 };
    }
    case 'asteroids': {
      const goal = round(8 + L * 2.5, 1);
      return { kind, goal, title: `Destroy ${goal} asteroids`, hint: 'Drone kills count too.', credits: round(goal * 25 * scale, 10), xp: 30 + L * 10 };
    }
    case 'earned': {
      const goal = round(400 * Math.pow(L, 1.35) * scale, 50);
      return { kind, goal, title: `Earn ${goal.toLocaleString('en-US')} credits`, hint: 'Sell minerals at the market.', credits: round(goal * 0.25, 10), xp: 40 + L * 12 };
    }
    case 'explored': {
      const goal = randInt(4, 6) + Math.floor(L / 3);
      return { kind, goal, title: `Chart ${goal} new regions`, hint: 'Fly into unexplored space (see the map).', credits: round(150 * L * scale, 10), xp: 50 + L * 12, rp: 1 };
    }
    case 'bigSale': {
      const goal = round(300 * Math.pow(L, 1.25) * scale, 50);
      return { kind, goal, title: 'Complete a mining expedition', hint: `Sell a single load worth ${goal.toLocaleString('en-US')}+ credits.`, credits: round(goal * 0.35, 10), xp: 60 + L * 15, rp: 1 };
    }
    case 'upgrades': {
      const goal = 2;
      return { kind, goal, title: 'Buy 2 upgrades', hint: 'Hangar (H): any ship or drone upgrade.', credits: round(120 * L, 10), xp: 40 + L * 10 };
    }
    case 'pirates':
    default: {
      return { kind: 'pirates', goal: 1, title: 'Destroy a pirate ship', hint: 'Pirates show up during raids. Laser them!', credits: round(400 * L * scale, 10), xp: 80 + L * 15, rp: 1 };
    }
  }
}

export function ensureMissions(state) {
  const ms = state.missions;
  while (ms.active.length < ACTIVE_MISSIONS) {
    if (ms.script < SCRIPTED_MISSIONS.length) {
      startMission(state, SCRIPTED_MISSIONS[ms.script++]);
    } else {
      startMission(state, generateMission(state));
    }
  }
}

export function onSale(state, credits) {
  for (const m of state.missions.active) if (m.kind === 'bigSale') m.best = Math.max(m.best || 0, credits);
}

export function updateMissions(state) {
  const ms = state.missions;
  for (let i = ms.active.length - 1; i >= 0; i--) {
    const m = ms.active[i];
    if (missionProgress(state, m) >= m.goal) {
      ms.active.splice(i, 1);
      ms.completed++;
      addCredits(state, m.credits || 0);
      if (m.rp) state.rp += m.rp;
      emit(state, 'mission', { title: m.title, credits: m.credits, xp: m.xp, rp: m.rp || 0 });
      addXp(state, m.xp || 0);
    }
  }
  ensureMissions(state);
}

export const sectorName = (id) => SECTORS[id]?.name || id;
