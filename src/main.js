// SPACE MINER entry point: wires engine, renderer, input, audio and UI into
// one fixed-step game loop, plus autosave and offline progress.
import { GameEngine } from './engine/GameEngine.js';
import { GameLoop } from './engine/GameLoop.js';
import { InputController } from './engine/InputController.js';
import { CameraController } from './engine/CameraController.js';
import { Renderer } from './render/Renderer.js';
import { AudioManager } from './ui/AudioManager.js';
import { UIManager } from './ui/UIManager.js';
import { applyOffline, clearSave, loadGame, saveGame } from './systems/SaveManager.js';
import { nearbyDerelict } from './systems/EventManager.js';
import { WEAPON_IDS } from './core/config.js';
import { cargoUsed } from './core/state.js';
import { dist } from './core/math.js';

const AUTOSAVE = 8; // seconds
const IMPORTANT = new Set(['sold', 'upgrade', 'mission', 'levelUp', 'achievement', 'warp', 'weaponBought', 'droneDeployed', 'shipBought', 'salvage', 'dock', 'undock', 'shipDestroyed', 'victory']);

const canvas = document.getElementById('view');
const root = document.getElementById('ui');

const loaded = loadGame();
const engine = new GameEngine(loaded?.state);
const state = () => engine.state;
const camera = new CameraController();
const renderer = new Renderer(canvas, camera);
camera.snap(engine.state.ship.x, engine.state.ship.y);
const audio = new AudioManager(engine.state.settings);

let resetting = false;
const save = () => {
  if (!resetting) saveGame(engine.state);
};
let input;
const toggleView = () => {
  const st = engine.state.settings;
  st.view = st.view === 'cockpit' ? 'top' : 'cockpit';
  input?.setCockpit(st.view === 'cockpit');
  save();
};
const ui = new UIManager({
  engine,
  audio,
  root,
  onView: toggleView,
  onSave: save,
  onReset: () => {
    resetting = true;
    clearSave();
    location.reload();
  },
});
input = new InputController(canvas, { onHotkey: (e) => ui.hotkey(e) });
input.setCockpit(engine.state.settings.view === 'cockpit');

for (const ev of ['pointerdown', 'keydown', 'touchstart']) addEventListener(ev, () => audio.unlock(), { passive: true });
addEventListener('resize', () => renderer.resize());

// Offline progress since the last save.
if (loaded) {
  const off = applyOffline(engine.state, (Date.now() - loaded.savedAt) / 1000);
  if (off && off.units > 0) ui.welcomeBack(off);
}

// While the tab is hidden the loop stops; on return we credit the drones
// with an elapsed-time estimate instead of running background timers.
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    hiddenAt = Date.now();
    save();
  } else if (hiddenAt) {
    const off = applyOffline(engine.state, (Date.now() - hiddenAt) / 1000);
    hiddenAt = 0;
    if (off && off.units > 0) ui.welcomeBack(off);
  }
});
addEventListener('pagehide', save);
addEventListener('beforeunload', save);

const toWorld = (x, y) => renderer.toWorld(x, y);
let saveTimer = AUTOSAVE;
let wantSave = false;

function touchAim(inp) {
  // Touch: shoot the nearest enemy in reach, otherwise mine the nearest rock.
  const s = engine.state;
  const st = engine.stats;
  let enemy = null;
  let ed = 300;
  for (const e of s.enemies) {
    const d = dist(e.x, e.y, s.ship.x, s.ship.y);
    if (d < ed) {
      ed = d;
      enemy = e;
    }
  }
  if (enemy) {
    inp.aimX = enemy.x;
    inp.aimY = enemy.y;
    inp.shoot = true;
    return;
  }
  let rock = null;
  let rd = st.laserRange + 10;
  for (const a of s.asteroids) {
    const d = dist(a.x, a.y, s.ship.x, s.ship.y) - a.r;
    if (d < rd) {
      rd = d;
      rock = a;
    }
  }
  if (rock) {
    inp.aimX = rock.x;
    inp.aimY = rock.y;
    inp.fire = true;
  }
}

const loop = new GameLoop({
  update(dt) {
    const s = state();
    const cockpit = s.settings.view === 'cockpit';
    input.currentWeapon = s.weapon;
    const inp = input.snapshot(toWorld, s.ship, ui.menuOpen, cockpit, WEAPON_IDS);
    if (inp.touchAim) touchAim(inp);
    engine.step(dt, inp);
    const fx = engine.drainFx();
    if (fx.length) {
      renderer.handleFx(fx, s);
      ui.handleFx(fx);
      audio.handleFx(fx);
      if (fx.some((e) => IMPORTANT.has(e.type))) wantSave = true;
    }
  },
  render(dt) {
    const s = state();
    camera.update(dt, s.ship);
    const aim = input.mouse.inside ? renderer.toWorld(input.mouse.x, input.mouse.y) : null;
    renderer.render(s, engine.stats, dt, {
      aim,
      canDock: engine.canDock(),
      canSalvage: !!nearbyDerelict(s),
      cargoPct: cargoUsed(s.cargo) / engine.stats.cargoCap,
      mode: s.settings.view,
    });
    ui.frame(dt);
    audio.update(s.ship);
    saveTimer -= dt;
    if (wantSave || saveTimer <= 0) {
      save();
      wantSave = false;
      saveTimer = AUTOSAVE;
    }
  },
});
loop.start();

// Handy for debugging from the console.
globalThis.spaceMiner = { engine, renderer, ui, save };
