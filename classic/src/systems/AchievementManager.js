// AchievementManager: long-term milestones that pay credits.
import { ACHIEVEMENTS, ACHIEVEMENT_IDS } from '../core/config.js';
import { emit } from '../core/state.js';
import { addCredits } from './EconomyManager.js';

export function achievementValue(state, a) {
  if (a.stat === 'drones') return state.drones.length;
  if (a.stat === 'weapons') return Object.keys(state.weapons).length;
  return state.stats[a.stat] || 0;
}

export function updateAchievements(state) {
  for (const id of ACHIEVEMENT_IDS) {
    if (state.achievements[id]) continue;
    const a = ACHIEVEMENTS[id];
    if (achievementValue(state, a) >= a.goal) {
      state.achievements[id] = Date.now();
      addCredits(state, a.credits);
      emit(state, 'achievement', { id, name: a.name, credits: a.credits });
    }
  }
}
