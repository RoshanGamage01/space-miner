// MissionManager: one short objective at a time. A scripted run teaches
// the loop, then missions are generated to scale with the pilot.
import { RESOURCES, SCRIPTED_MISSIONS } from '../core/config.js';
import { emit, sectorDef } from '../core/state.js';
import { pickWeighted } from '../core/math.js';
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
    case 'upgrade':
      return s.byUpgrade[m.id] || 0;
    case 'upgrades':
      return s.upgrades;
    case 'aliens':
      return s.aliens;
    case 'elites':
      return s.elites;
    case 'drones':
      return state.drones.length;
    case 'weapons':
      return Object.keys(state.weapons).length;
    case 'combo':
      return s.bestCombo;
    default:
      return 0;
  }
}

const ABSOLUTE = new Set(['drones', 'weapons', 'combo']);

export function missionProgress(state, m) {
  if (!m) return 0;
  const v = statValue(state, m);
  return Math.max(0, Math.min(m.goal, ABSOLUTE.has(m.kind) ? v : v - m.base));
}

function startMission(state, def) {
  const m = { id: ++state.missions.seq, ...def };
  m.base = ABSOLUTE.has(m.kind) ? 0 : statValue(state, m);
  state.missions.active = m;
  return m;
}

function generateMission(state) {
  const L = state.level;
  const sec = sectorDef(state);
  const kinds = { aliens: 4, collect: 3, asteroids: 1.5, earned: 1.5, upgrades: 1 };
  if (L >= 4) kinds.elites = 1;
  if (L >= 3 && state.stats.bestCombo < 10) kinds.combo = 0.8;
  const last = state.missions.lastKind;
  if (kinds[last]) kinds[last] *= 0.2;
  const kind = pickWeighted(kinds);
  const r = (n, step) => Math.max(step, Math.round(n / step) * step);
  switch (kind) {
    case 'aliens': {
      const goal = r(5 + L * 1.5, 1);
      return { kind, goal, title: `Destroy ${goal} aliens`, credits: r(goal * 40 * sec.danger, 10), xp: 40 + L * 15 };
    }
    case 'collect': {
      const res = pickWeighted({ ...sec.bands[1].w });
      const goal = r((25 + L * 6) * sec.yield * (res === 'crystal' ? 0.15 : res === 'nickel' ? 0.5 : 1), 5);
      return { kind, res, goal, title: `Mine ${goal} ${RESOURCES[res].name.toLowerCase()}`, credits: r(goal * RESOURCES[res].value * 1.3, 10), xp: 30 + L * 12 };
    }
    case 'asteroids': {
      const goal = r(10 + L * 2.5, 1);
      return { kind, goal, title: `Break ${goal} asteroids`, credits: r(goal * 25 * sec.yield, 10), xp: 30 + L * 10 };
    }
    case 'earned': {
      const goal = r(400 * Math.pow(L, 1.35) * sec.yield, 50);
      return { kind, goal, title: `Earn ${goal.toLocaleString('en-US')} cr`, credits: r(goal * 0.25, 10), xp: 40 + L * 12 };
    }
    case 'upgrades':
      return { kind, goal: 2, title: 'Buy 2 upgrades', credits: r(150 * L, 10), xp: 40 + L * 10 };
    case 'combo': {
      const goal = Math.min(10, Math.max(state.stats.bestCombo + 1, 3));
      return { kind, goal, title: `Get a x${goal} kill combo`, credits: r(200 * L, 10), xp: 60 + L * 12 };
    }
    default: {
      const goal = 2 + Math.floor(L / 6);
      return { kind: 'elites', goal, title: `Destroy ${goal} elite aliens`, credits: r(goal * 300 * sec.danger, 10), xp: 80 + L * 15 };
    }
  }
}

export function ensureMissions(state) {
  const ms = state.missions;
  if (ms.active) return;
  if (ms.script < SCRIPTED_MISSIONS.length) startMission(state, SCRIPTED_MISSIONS[ms.script++]);
  else startMission(state, generateMission(state));
}

export function updateMissions(state) {
  const ms = state.missions;
  const m = ms.active;
  if (m && missionProgress(state, m) >= m.goal) {
    ms.active = null;
    ms.completed++;
    ms.lastKind = m.kind;
    addCredits(state, m.credits || 0);
    emit(state, 'mission', { title: m.title, credits: m.credits, xp: m.xp });
    addXp(state, m.xp || 0);
  }
  ensureMissions(state);
}
