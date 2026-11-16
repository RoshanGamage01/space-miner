// AchievementManager: long-term milestones that pay research points.
import { ACHIEVEMENTS, ACHIEVEMENT_IDS } from '../core/config.js';
import { emit } from '../core/state.js';

export function achievementValue(state, a) {
  if (a.stat === 'drones') return state.drones.length;
  if (a.stat === 'sectors') return state.unlockedSectors.length;
  return state.stats[a.stat] || 0;
}

export function updateAchievements(state) {
  for (const id of ACHIEVEMENT_IDS) {
    if (state.achievements[id]) continue;
    const a = ACHIEVEMENTS[id];
    if (achievementValue(state, a) >= a.goal) {
      state.achievements[id] = Date.now();
      state.rp += a.rp;
      emit(state, 'achievement', { id, name: a.name, desc: a.desc, rp: a.rp });
    }
  }
}
