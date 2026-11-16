// CampaignSystem: the arc of the game. Every sector has alien hives; destroy
// them all and the sector boss comes for you. Beat the boss to open the next
// sector. The last boss is the Hive Queen.
import { BOSSES, HIVES_PER_SECTOR, SECTORS, SECTOR_IDS } from '../core/config.js';
import { emit, sectorDef } from '../core/state.js';
import { TAU, dist2 } from '../core/math.js';
import { pointAround, spawnEnemy } from './CombatSystem.js';

export function sectorProgress(state, id = state.sector) {
  return (state.progress[id] ||= { hives: 0, boss: false });
}

// Hive positions are fixed per sector so they survive save/load.
function hiveSpot(state, i) {
  const sec = sectorDef(state);
  const base = SECTOR_IDS.indexOf(state.sector) * 0.9 + 0.5;
  const a = base + (i / HIVES_PER_SECTOR) * TAU;
  const d = sec.radius * (0.42 + 0.12 * i);
  return { x: Math.cos(a) * d, y: Math.sin(a) * d };
}

// Called after the asteroid field is generated.
export function setupSector(state) {
  const p = sectorProgress(state);
  state.bossId = 0;
  for (let i = p.hives; i < HIVES_PER_SECTOR; i++) {
    const s = hiveSpot(state, i);
    spawnEnemy(state, 'hive', s.x, s.y);
    state.asteroids = state.asteroids.filter((a) => dist2(a.x, a.y, s.x, s.y) > 90 * 90);
  }
  if (p.hives >= HIVES_PER_SECTOR && !p.boss) state.bossTimer = 6;
}

export function updateCampaign(state, dt) {
  const p = sectorProgress(state);
  if (p.boss || p.hives < HIVES_PER_SECTOR) return;
  if (state.bossId) {
    if (!state.enemies.some((e) => e.id === state.bossId)) state.bossId = 0;
    return;
  }
  if (state.ship.docked || state.ship.deadT > 0) return;
  state.bossTimer -= dt;
  if (state.bossTimer > 0) return;
  const b = BOSSES[state.sector];
  const at = pointAround(state, 380, 440);
  const e = spawnEnemy(state, 'boss', at.x, at.y, { boss: state.sector });
  state.bossId = e.id;
  // The arena is cleared of small fry for the entrance.
  for (const o of state.enemies) if (o !== e && o.kind !== 'hive') o.flee = true;
  emit(state, 'bossIntro', { name: b.name, title: b.title, color: b.color });
}

export function onEnemyKilled(state, e) {
  if (e.kind === 'hive') {
    const p = sectorProgress(state);
    p.hives = Math.min(HIVES_PER_SECTOR, p.hives + 1);
    state.stats.hives++;
    const left = HIVES_PER_SECTOR - p.hives;
    emit(state, 'hiveDown', { left });
    if (left === 0) state.bossTimer = 6;
  } else if (e.kind === 'boss') {
    const p = sectorProgress(state);
    p.boss = true;
    state.bossId = 0;
    state.stats.bosses++;
    const b = BOSSES[state.sector];
    const next = SECTOR_IDS[SECTOR_IDS.indexOf(state.sector) + 1];
    if (next && !state.unlockedSectors.includes(next)) state.unlockedSectors.push(next);
    for (const o of state.enemies) o.flee = true;
    state.shots = state.shots.filter((s) => s.team !== 'enemy');
    if (b.final) {
      state.won = true;
      state.stats.queen = 1;
      emit(state, 'gameWon', { name: b.name });
    } else emit(state, 'sectorCleared', { name: SECTORS[state.sector].name, boss: b.name, next: next ? SECTORS[next].name : null });
  }
}

// One line for the HUD: what to do next in this sector.
export function objective(state) {
  const p = sectorProgress(state);
  if (p.hives < HIVES_PER_SECTOR) return { text: 'Destroy the alien hives', value: `${p.hives}/${HIVES_PER_SECTOR}`, kind: 'hive' };
  if (!p.boss) return { text: `Defeat the ${BOSSES[state.sector].name}`, value: '', kind: 'boss' };
  const next = SECTOR_IDS[SECTOR_IDS.indexOf(state.sector) + 1];
  if (next) return { text: `Sector clear. Warp to ${SECTORS[next].name}`, value: 'G', kind: 'warp' };
  return { text: 'Galaxy saved. Hunt at will', value: '', kind: 'done' };
}
