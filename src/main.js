// Entry point: boot the engine, show the title, run the loop.
import { Engine } from './engine/Engine.js';
import { Game } from './game/Game.js';
import { Input } from './game/Input.js';
import { Hud } from './ui/Hud.js';
import { Audio } from './ui/Audio.js';
import { SAVE_KEY, deserialize, newGame } from './game/state.js';

const q = new URLSearchParams(location.search);
let loaded = null;
try {
  loaded = deserialize(localStorage.getItem(SAVE_KEY));
} catch {
  /* no storage */
}
const hadSave = !!loaded;
let wiping = false;
const save = loaded || newGame();
const canvas = document.getElementById('view');
const engine = new Engine(canvas, q.get('q') || save.settings.quality);
if (q.get('lod')) engine.q = { ...engine.q, lod: Number(q.get('lod')) };
const hud = new Hud(document.getElementById('ui'));
const audio = new Audio(save.settings);
const input = new Input(canvas);
const game = new Game(engine, save, hud, audio, input);
game.paused = true;
input.enabled = false;

const begin = () => {
  game.paused = false;
  input.enabled = true;
  audio.unlock();
  if (!hadSave || game.save.quest.q === 0) hud.toast('IRIS: "Pilot, you are alive. The ship is not. Mine Ferrite from rocks: hold left mouse."', 'info', 9000);
};
hud.showTitle(
  hadSave,
  begin,
  () => {
    wiping = true;
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      /* ignore */
    }
    location.reload();
  },
);
if (q.has('play')) {
  hud.titleOn = false;
  hud.el.title.className = '';
  begin();
}

// ?turbo=N runs N simulation steps per rendered frame (used by the tests,
// where software rendering is slow).
const TURBO = Number(q.get('turbo')) || 0;
let last = performance.now();
let fpsT = 0;
let frames = 0;
function frame(now) {
  const real = (now - last) / 1000;
  const dt = Math.min(0.05, real);
  last = now;
  if (TURBO) for (let i = 0; i < TURBO; i++) game.update(1 / 30);
  else game.update(dt);
  engine.render();
  frames++;
  fpsT += real;
  if (fpsT > 1) {
    game.fps = frames / fpsT;
    frames = 0;
    fpsT = 0;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
addEventListener('beforeunload', () => !wiping && game.persist());
document.addEventListener('visibilitychange', () => document.hidden && !wiping && game.persist());

// For tests and debugging.
window.game = game;
