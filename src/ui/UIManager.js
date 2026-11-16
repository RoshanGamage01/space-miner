// UIManager: the DOM layer. HUD bars, collapsible side panels, bottom
// navigation, management screens (Hangar, Research, Market, Galaxy),
// toasts, banners and modals. It reads state and calls engine.act(); it
// never mutates game state directly.
import {
  ACHIEVEMENTS,
  ACHIEVEMENT_IDS,
  DRONE_UPGRADES,
  DRONE_UPGRADE_IDS,
  EVENTS,
  RESEARCH,
  RESEARCH_IDS,
  RESOURCES,
  RESOURCE_IDS,
  SECTORS,
  SECTOR_IDS,
  SHIPS,
  SHIP_IDS,
  UPGRADES,
  UPGRADE_GROUPS,
  UPGRADE_IDS,
  WARP_FUEL,
  xpToNext,
} from '../core/config.js';
import { cargoUsed, getStats, researchAvailable } from '../core/state.js';
import { fmt, fmtTime } from '../core/math.js';
import { icon } from './icons.js';
import { drawMap, drawRadar } from './radar.js';
import { price, refuelCost, repairCost } from '../systems/EconomyManager.js';
import { missionProgress } from '../systems/MissionManager.js';
import { achievementValue } from '../systems/AchievementManager.js';
import { droneStatus, droneRate } from '../systems/DroneManager.js';
import { droneBuyInfo, droneUpgradeInfo, sectorInfo, upgradeInfo } from '../systems/UpgradeManager.js';
import { exploredFraction } from '../systems/ExplorationSystem.js';
import { mapSprite } from '../render/sprites.js';

const shipArt = new Map();
function shipImage(id) {
  if (!shipArt.has(id)) {
    const spr = mapSprite(id, 'player');
    shipArt.set(id, spr.img.toDataURL());
  }
  return shipArt.get(id);
}

const SCREENS = [
  { id: 'mining', name: 'Mining', icon: 'pick', key: '1' },
  { id: 'hangar', name: 'Hangar', icon: 'wrench', key: 'H' },
  { id: 'research', name: 'Research', icon: 'rp', key: 'R' },
  { id: 'market', name: 'Market', icon: 'chart', key: 'M' },
  { id: 'galaxy', name: 'Galaxy', icon: 'planet', key: 'G' },
];

const GROUP_COLORS = { laser: '#5ef1ff', engine: '#ff8c42', cargo: '#ffd23e', scanner: '#7dffb0', shield: '#7aa8ff', fuel: '#ff6a9a' };

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const bar = (pct, cls = '') => `<div class="bar ${cls}"><i style="width:${Math.max(0, Math.min(100, pct * 100)).toFixed(1)}%"></i></div>`;
const pips = (n, max) => `<span class="pips">${Array.from({ length: max }, (_, i) => `<b class="${i < n ? 'on' : ''}"></b>`).join('')}</span>`;
const cr = (n) => `<span class="cr">${icon('credits', '#ffd23e', 12)}${fmt(n)}</span>`;

// What each upgrade line does, read from the real stats at a given level.
const PREVIEW = {
  laserDamage: (s) => `${s.laserDps.toFixed(0)} dps`,
  laserSpeed: (s) => `${Math.round((1 - s.resistMult) * 100)}% pierce`,
  laserRange: (s) => `${s.laserRange} range`,
  laserEfficiency: (s) => `${s.energyDrain.toFixed(1)}/s drain`,
  engineSpeed: (s) => `${Math.round(s.maxSpeed)} top speed`,
  engineAccel: (s) => `${Math.round(s.thrust)} thrust`,
  engineBoost: (s) => `${s.boostMax.toFixed(1)}s boost`,
  cargoCapacity: (s) => `${s.cargoCap} units`,
  cargoCollection: (s) => `${s.magnetRadius} tractor · ${Math.round(s.bonusChance * 100)}% bonus`,
  scannerRange: (s) => `${s.radarRange} radar`,
  scannerRare: (s) => `x${s.rareMult.toFixed(2)} crystals`,
  scannerIdent: (s) => ['No ID', 'Ore type', '+ Yield', '+ Value'][s.ident],
  shieldCapacity: (s) => `${s.shieldMax} shield`,
  shieldRegen: (s) => `${s.shieldRegen.toFixed(1)}/s regen`,
  shieldProtection: (s) => `-${Math.round((1 - s.collisionMult) * 100)}% impact`,
  fuelTank: (s) => `${s.fuelMax} fuel`,
  fuelEfficiency: (s) => `-${Math.round((1 - s.fuelUse) * 100)}% burn`,
  droneSpeed: (s) => `${s.droneDps.toFixed(1)} dps`,
  droneRange: (s) => `${s.droneRange} range`,
  droneCargo: (s) => `${s.droneCargo} pods`,
  droneMove: (s) => `${Math.round(s.droneSpeed)} speed`,
  droneEfficiency: (s) => `+${Math.round(s.droneBonus * 100)}% bonus`,
};

export class UIManager {
  constructor({ engine, audio, root, onReset, onSave }) {
    this.engine = engine;
    this.audio = audio;
    this.root = root;
    this.onReset = onReset;
    this.onSave = onSave;
    this.screen = null;
    this.tabs = { hangar: 'systems', market: 'market', left: 'missions' };
    this.cache = new Map();
    this.timer = 0;
    this.slow = 0;
    this.time = 0;
    this.build();
    this.bind();
  }

  get state() {
    return this.engine.state;
  }

  // ------------------------------------------------------------ skeleton
  build() {
    const navBtns = SCREENS.map(
      (s) => `<button class="nav-btn" data-nav="${s.id}" title="${s.name} (${s.key})">${icon(s.icon, '#9fe8ff', 18)}<span>${s.name}</span><kbd>${s.key}</kbd></button>`,
    ).join('');
    this.root.innerHTML = `
      <header id="topbar">
        <div class="brand"><span class="logo">${icon('ship', '#5ef1ff', 20)}</span><b>SPACE&nbsp;MINER</b></div>
        <div class="stat credits" title="Credits">${icon('credits', '#ffd23e', 16)}<b data-k="credits">0</b></div>
        <div class="stat level" title="Pilot level and XP"><span class="lvl" data-k="level">1</span><div class="xp"><div class="bar xp-bar"><i data-k="xpbar"></i></div><small data-k="xptext"></small></div></div>
        <div class="stat rp" title="Research points">${icon('rp', '#7dffb0', 16)}<b data-k="rp">0</b></div>
        <div class="stat fuel" title="Fuel">${icon('fuel', '#ff6a9a', 16)}<div class="bar fuel-bar"><i data-k="fuelbar"></i></div><small data-k="fueltext"></small></div>
        <div class="stat loc" title="Current location">${icon('planet', '#b99bff', 16)}<span data-k="loc"></span></div>
        <div class="event-chip" data-k="event" hidden></div>
        <div class="spacer"></div>
        <button class="icon-btn" data-ui="sound" title="Mute / unmute">${icon('sound', '#9fe8ff', 18)}</button>
        <button class="icon-btn" data-ui="settings" title="Settings">${icon('gear', '#9fe8ff', 18)}</button>
      </header>

      <aside id="left" class="panel side left">
        <button class="collapse" data-ui="toggle-left" title="Collapse (Tab)">‹</button>
        <div class="tabs" role="tablist">
          <button data-ltab="missions">${icon('flag', '#ffd23e', 14)}Missions</button>
          <button data-ltab="map">${icon('map', '#5ef1ff', 14)}Map</button>
          <button data-ltab="awards">${icon('trophy', '#ffd23e', 14)}Awards</button>
        </div>
        <div class="panel-body" data-k="leftbody"></div>
        <div class="map-wrap" data-k="mapwrap"><canvas id="mapcanvas"></canvas><div class="map-info" data-k="mapinfo"></div></div>
      </aside>
      <button class="panel-tab left" data-ui="toggle-left" title="Missions (Tab)">${icon('flag', '#ffd23e', 16)}</button>

      <aside id="right" class="panel side right">
        <button class="collapse" data-ui="toggle-right" title="Collapse (Tab)">›</button>
        <div class="panel-body" data-k="rightbody"></div>
      </aside>
      <button class="panel-tab right" data-ui="toggle-right" title="Ship status (Tab)">${icon('ship', '#5ef1ff', 16)}</button>

      <div id="radar-wrap" title="Radar"><canvas id="radar"></canvas><span class="radar-label">RADAR</span></div>
      <button id="ability" data-ui="pulse" title="Pulse Blast (Space)">${icon('pulse', '#b99bff', 26)}<i class="cd" data-k="pulsecd"></i><kbd>SPACE</kbd></button>

      <nav id="bottomnav">${navBtns}</nav>

      <section id="screen" class="screen" aria-hidden="true">
        <div class="screen-inner">
          <header class="screen-head"><h2 data-k="screentitle"></h2><div class="screen-sub" data-k="screensub"></div><button class="close" data-nav="mining" title="Back to mining (Esc)">✕</button></header>
          <div class="screen-body" data-k="screenbody"></div>
        </div>
      </section>

      <div id="banner" data-k="banner"></div>
      <div id="toasts"></div>
      <div id="help" data-k="help">
        <h3>${icon('ship', '#5ef1ff', 16)} Flight school</h3>
        <ul>
          <li><kbd>W A S D</kbd> fly · <kbd>Shift</kbd> boost</li>
          <li><b>Mouse</b> aim · <b>Hold left click</b> mine</li>
          <li>Fly over fragments to <b>collect</b> them</li>
          <li><kbd>E</kbd> dock at the station to <b>sell</b></li>
          <li><kbd>Space</kbd> pulse blast · <kbd>Tab</kbd> hide panels</li>
        </ul>
        <button class="btn small" data-ui="help-close">Got it</button>
      </div>
      <div id="modal" data-k="modal"></div>`;
    this.el = {};
    this.root.querySelectorAll('[data-k]').forEach((e) => (this.el[e.dataset.k] = e));
    this.toastBox = this.root.querySelector('#toasts');
    this.radar = this.root.querySelector('#radar');
    this.mapCanvas = this.root.querySelector('#mapcanvas');
    this.screenEl = this.root.querySelector('#screen');
    this.applyPanels();
  }

  bind() {
    this.root.addEventListener('click', (e) => {
      this.audio.unlock();
      const t = e.target.closest('[data-act],[data-nav],[data-ui],[data-ltab],[data-tab]');
      if (!t) return;
      if (t.dataset.nav) return this.openScreen(t.dataset.nav);
      if (t.dataset.ltab) {
        this.tabs.left = t.dataset.ltab;
        this.audio.play('click');
        return this.refreshLeft(true);
      }
      if (t.dataset.tab) {
        this.tabs[this.screen] = t.dataset.tab;
        this.audio.play('click');
        return this.refreshScreen(true);
      }
      if (t.dataset.ui) return this.uiAction(t.dataset.ui, t);
      if (t.dataset.act) {
        if (t.disabled) return;
        const r = this.engine.act(t.dataset.act, t.dataset.arg, t.dataset.arg2);
        if (!r.ok) {
          if (r.reason) this.toast(r.reason, 'warn');
          this.audio.play('deny');
        } else {
          this.audio.play('click');
          this.onSave?.();
        }
        this.refreshScreen(true);
        this.refreshLeft(true);
      }
    });
    this.root.addEventListener('input', (e) => {
      if (e.target.dataset.setting === 'volume') {
        this.state.settings.volume = Number(e.target.value) / 100;
        this.state.settings.muted = false;
        this.audio.applySettings();
      }
    });
    this.root.addEventListener('change', (e) => {
      const k = e.target.dataset.setting;
      if (!k || k === 'volume') return;
      this.state.settings[k] = e.target.checked;
      if (k === 'help') this.el.help.classList.toggle('show', e.target.checked);
      this.audio.applySettings();
      this.onSave?.();
    });
  }

  uiAction(name, el) {
    const s = this.state.settings;
    switch (name) {
      case 'toggle-left':
        s.leftOpen = !s.leftOpen;
        this.applyPanels();
        break;
      case 'toggle-right':
        s.rightOpen = !s.rightOpen;
        this.applyPanels();
        break;
      case 'sound':
        s.muted = !s.muted;
        this.audio.applySettings();
        this.toast(s.muted ? 'Sound muted' : 'Sound on', 'info');
        break;
      case 'settings':
        this.openSettings();
        break;
      case 'pulse': {
        const r = this.engine.act('pulse');
        if (!r.ok && r.reason) this.toast(r.reason, 'warn');
        break;
      }
      case 'help-close':
        s.help = false;
        this.el.help.classList.remove('show');
        break;
      case 'modal-close':
        this.closeModal();
        break;
      case 'save':
        this.onSave?.(true);
        this.toast('Game saved', 'good');
        break;
      case 'reset':
        if (el.dataset.confirm) {
          this.onReset?.();
        } else {
          el.dataset.confirm = '1';
          el.textContent = 'Click again to erase everything';
          el.classList.add('danger');
        }
        return;
    }
    this.audio.play('click');
    this.onSave?.();
  }

  applyPanels() {
    const s = this.state.settings;
    this.root.classList.toggle('left-closed', !s.leftOpen);
    this.root.classList.toggle('right-closed', !s.rightOpen);
  }

  togglePanels() {
    const s = this.state.settings;
    const open = !(s.leftOpen || s.rightOpen);
    s.leftOpen = s.rightOpen = open;
    this.applyPanels();
  }

  // ------------------------------------------------------------ hotkeys
  hotkey(e) {
    if (this.modalOpen) {
      if (e.code === 'Escape') {
        this.closeModal();
        return true;
      }
      return false;
    }
    const map = { KeyH: 'hangar', KeyR: 'research', KeyM: 'market', KeyG: 'galaxy', Digit1: 'mining', Digit2: 'hangar', Digit3: 'research', Digit4: 'market', Digit5: 'galaxy' };
    if (map[e.code]) {
      this.openScreen(this.screen === map[e.code] ? 'mining' : map[e.code]);
      return true;
    }
    if (e.code === 'Escape') {
      if (this.screen) this.openScreen('mining');
      else if (this.state.ship.docked) this.engine.act('undock');
      return true;
    }
    if (e.code === 'Tab') {
      this.togglePanels();
      return true;
    }
    // While a screen is open, E undocks and closes it.
    if (this.screen && e.code === 'KeyE') {
      this.openScreen('mining');
      return true;
    }
    return false;
  }

  // ------------------------------------------------------------ screens
  openScreen(id) {
    this.audio.unlock();
    if (id === 'mining' || !id) {
      this.screen = null;
      this.screenEl.classList.remove('open');
      this.screenEl.setAttribute('aria-hidden', 'true');
      if (this.state.ship.docked) this.engine.act('undock');
    } else {
      this.screen = id;
      this.screenEl.classList.add('open');
      this.screenEl.setAttribute('aria-hidden', 'false');
      this.screenEl.dataset.screen = id;
      this.refreshScreen(true);
    }
    this.root.querySelectorAll('[data-nav]').forEach((b) => b.classList.toggle('active', (this.screen || 'mining') === b.dataset.nav));
    this.audio.play('click');
  }

  get menuOpen() {
    return !!this.screen || this.modalOpen;
  }

  setHTML(key, el, html, force) {
    if (!force && this.cache.get(key) === html) return;
    this.cache.set(key, html);
    el.innerHTML = html;
  }

  refreshScreen(force) {
    if (!this.screen) return;
    const s = this.state;
    const stats = getStats({ ...s, event: null });
    const titles = {
      hangar: ['Hangar', 'Upgrade your ship, drones and hull'],
      research: ['Research Lab', `${s.rp} research points available`],
      market: ['Station Market', s.ship.docked ? 'Docked · services available' : 'Remote link · dock to unload your hold'],
      galaxy: ['Galaxy Map', `Current field: ${SECTORS[s.sector].name}`],
    }[this.screen];
    this.el.screentitle.textContent = titles[0];
    this.el.screensub.textContent = titles[1];
    const html = this[`render_${this.screen}`](s, stats);
    this.setHTML('screen', this.el.screenbody, html, force);
    this.el.screenbody.querySelectorAll('[data-ship]:empty').forEach((el) => {
      const img = new Image();
      img.src = shipImage(el.dataset.ship);
      img.alt = '';
      el.appendChild(img);
    });
  }

  tabBar(id, tabs) {
    return `<div class="tabs screen-tabs">${tabs.map(([k, label, ic]) => `<button data-tab="${k}" class="${this.tabs[id] === k ? 'active' : ''}">${ic ? icon(ic, '#9fe8ff', 14) : ''}${label}</button>`).join('')}</div>`;
  }

  buyBtn(info, act, arg) {
    if (info.maxed) return `<button class="btn buy maxed" disabled>MAX</button>`;
    if (info.locked) return `<button class="btn buy locked" data-act="${act}" data-arg="${arg}">${icon('lock', '#8b95ad', 12)} Lv ${info.reqLevel}</button>`;
    return `<button class="btn buy ${info.affordable ? 'ok' : 'poor'}" data-act="${act}" data-arg="${arg}">${cr(info.cost)}</button>`;
  }

  render_hangar(s, stats) {
    const tab = this.tabs.hangar;
    let body = '';
    if (tab === 'systems') {
      body = `<div class="grid systems">${UPGRADE_GROUPS.map((g) => {
        const lines = UPGRADE_IDS.filter((id) => UPGRADES[id].group === g.id)
          .map((id) => {
            const info = upgradeInfo(s, id);
            const now = PREVIEW[id](stats);
            const next = info.maxed ? '' : PREVIEW[id](getStats({ ...s, event: null, upgrades: { ...s.upgrades, [id]: info.level + 1 } }));
            return `<div class="upg ${info.affordable && !info.locked ? 'can' : ''}">
              <div class="upg-main"><b>${info.def.name}</b>${pips(info.level, info.def.max)}<small>${esc(info.def.desc)}</small>
              <div class="delta">${esc(now)}${next ? ` <em>→ ${esc(next)}</em>` : ''}</div></div>
              ${this.buyBtn(info, 'buyUpgrade', id)}</div>`;
          })
          .join('');
        return `<div class="card group" style="--accent:${GROUP_COLORS[g.id]}"><h3>${icon(g.icon, GROUP_COLORS[g.id], 18)}${g.name}</h3>${lines}</div>`;
      }).join('')}</div>`;
    } else if (tab === 'drones') {
      const info = droneBuyInfo(s);
      const rate = droneRate(s, stats).perSecond * 60;
      const drones = s.drones
        .map((d, i) => {
          const escortBtn = s.research.escort
            ? `<button class="btn tiny ${d.mode === 'escort' ? 'on' : ''}" data-act="droneMode" data-arg="${d.id}" data-arg2="${d.mode === 'escort' ? 'station' : 'escort'}">${d.mode === 'escort' ? 'Escort' : 'Station'}</button>`
            : `<span class="muted tiny">Station</span>`;
          return `<div class="drone-row">${icon('drone', '#ffd23e', 16)}<b>Drone ${i + 1}</b><span class="muted">${droneStatus(d)}</span><span class="load">${Math.floor(d.load)}/${stats.droneCargo}</span>${escortBtn}</div>`;
        })
        .join('');
      const upg = DRONE_UPGRADE_IDS.map((id) => {
        const inf = droneUpgradeInfo(s, id);
        const now = PREVIEW[id](stats);
        const next = inf.maxed ? '' : PREVIEW[id](getStats({ ...s, event: null, droneUpgrades: { ...s.droneUpgrades, [id]: inf.level + 1 } }));
        return `<div class="upg ${inf.affordable && !inf.locked ? 'can' : ''}"><div class="upg-main"><b>${inf.def.name}</b>${pips(inf.level, inf.def.max)}<small>${esc(inf.def.desc)}</small><div class="delta">${esc(now)}${next ? ` <em>→ ${esc(next)}</em>` : ''}</div></div>${this.buyBtn(inf, 'buyDroneUpgrade', id)}</div>`;
      }).join('');
      const buy = info.full
        ? `<button class="btn big" disabled>${icon('lock', '#8b95ad', 14)} All ${info.max} slots used</button><small class="muted">More slots: level up (every 2 levels) or research Drone Bay.</small>`
        : `<button class="btn big ${info.affordable ? 'ok' : 'poor'}" data-act="buyDrone">${icon('drone', '#05060f', 16)} Deploy drone #${info.owned + 1} · ${fmt(info.cost)} cr</button>`;
      body = `<div class="grid two">
        <div class="card" style="--accent:#ffd23e"><h3>${icon('drone', '#ffd23e', 18)}Drone Fleet <span class="pill">${info.owned}/${info.max}</span></h3>
          <p class="muted">Drones mine on their own and haul ore to the station silo (sell it from the Market). They keep working while you are away.</p>
          <div class="kv"><span>Fleet output</span><b>~${rate.toFixed(1)} units/min</b></div>
          <div class="kv"><span>Station silo</span><b>${fmt(cargoUsed(s.storage))} / ${fmt(stats.storageCap)}</b></div>
          ${buy}
          <div class="drone-list">${drones}</div>
          ${s.research.escort ? '<small class="muted">Escort drones follow you and unload straight into your hold.</small>' : '<small class="muted">Research Escort Protocol to let drones fly with you.</small>'}
        </div>
        <div class="card" style="--accent:#ffd23e"><h3>${icon('wrench', '#ffd23e', 18)}Drone Upgrades <small class="muted">(whole fleet)</small></h3>${upg}</div>
      </div>`;
    } else {
      body = `<div class="grid ships">${SHIP_IDS.map((id) => {
        const d = SHIPS[id];
        const owned = s.ownedShips.includes(id);
        const current = s.shipId === id;
        let btn;
        if (current) btn = `<button class="btn" disabled>Flying</button>`;
        else if (owned) btn = `<button class="btn ok" data-act="switchShip" data-arg="${id}">Fly this ship</button>`;
        else if (s.level < d.level) btn = `<button class="btn locked" data-act="buyShip" data-arg="${id}">${icon('lock', '#8b95ad', 12)} Pilot level ${d.level}</button>`;
        else btn = `<button class="btn ${s.credits >= d.cost ? 'ok' : 'poor'}" data-act="buyShip" data-arg="${id}">Buy · ${fmt(d.cost)} cr</button>`;
        return `<div class="card ship-card ${current ? 'current' : ''}" style="--accent:#5ef1ff">
          <div class="ship-art" data-ship="${id}"></div>
          <h3>${esc(d.name)}</h3><p class="muted">${esc(d.blurb)}</p>
          <div class="kv"><span>Hull</span><b>${d.hull}</b></div>
          <div class="kv"><span>Cargo</span><b>x${d.cargo}</b></div>
          <div class="kv"><span>Laser</span><b>x${d.laser}</b></div>
          <div class="kv"><span>Speed</span><b>x${d.speed}</b></div>
          <div class="kv"><span>Bonus shield</span><b>+${d.shield}</b></div>
          ${btn}</div>`;
      }).join('')}</div>`;
    }
    return this.tabBar('hangar', [
      ['systems', 'Ship Systems', 'ship'],
      ['drones', 'Drones', 'drone'],
      ['ships', 'Ships', 'star'],
    ]) + body;
  }

  render_research(s) {
    const cards = RESEARCH_IDS.map((id) => {
      const d = RESEARCH[id];
      const done = !!s.research[id];
      const avail = researchAvailable(s, id);
      const req = d.req.length ? `<small class="muted">Needs: ${d.req.map((q) => RESEARCH[q].name).join(', ')}</small>` : '';
      const btn = done
        ? `<span class="done">${icon('star', '#7dffb0', 12)} Researched</span>`
        : avail
          ? `<button class="btn ${s.rp >= d.cost ? 'ok' : 'poor'}" data-act="research" data-arg="${id}">${icon('rp', s.rp >= d.cost ? '#05060f' : '#7dffb0', 12)} ${d.cost} RP</button>`
          : `<button class="btn locked" disabled>${icon('lock', '#8b95ad', 12)} ${d.cost} RP</button>`;
      return `<div class="card tech ${done ? 'done' : avail ? 'avail' : 'locked'}" style="--accent:#7dffb0"><h3>${esc(d.name)}</h3><p>${esc(d.desc)}</p>${req}${btn}</div>`;
    }).join('');
    return `<div class="rp-banner">${icon('rp', '#7dffb0', 22)}<b>${s.rp}</b> research points <small class="muted">Earn RP by levelling up, charting new space, completing missions, salvaging derelicts and unlocking achievements.</small></div><div class="grid tech-grid">${cards}</div>`;
  }

  render_market(s, stats) {
    const tab = this.tabs.market;
    const docked = s.ship.docked;
    if (tab === 'stats') {
      const st = s.stats;
      const rows = [
        ['Pilot level', s.level],
        ['Play time', fmtTime(st.playTime)],
        ['Credits earned', fmt(st.earned)],
        ['Biggest single sale', fmt(st.bigSale)],
        ['Asteroids destroyed', fmt(st.asteroids)],
        ['Minerals collected', fmt(st.collected)],
        ...RESOURCE_IDS.map((r) => [`· ${RESOURCES[r].name}`, fmt(st.byRes[r])]),
        ['Regions charted', fmt(st.explored)],
        ['Distance flown', `${fmt(st.distance / 10)} km`],
        ['Pirates destroyed', st.pirates],
        ['Events survived', st.events],
        ['Missions completed', s.missions.completed],
        ['Upgrades bought', st.upgrades],
        ['Drones', s.drones.length],
        ['Achievements', `${Object.keys(s.achievements).length}/${ACHIEVEMENT_IDS.length}`],
      ];
      return this.tabBar('market', [['market', 'Market', 'chart'], ['stats', 'Statistics', 'star']]) + `<div class="card stats-card"><div class="stats-grid">${rows.map(([k, v]) => `<div class="kv"><span>${k}</span><b>${v}</b></div>`).join('')}</div></div>`;
    }
    let total = 0;
    const rows = RESOURCE_IDS.map((r) => {
      const p = price(s, r, stats);
      const m = s.market[r];
      const h = m.history;
      const trend = h.length > 1 ? h[h.length - 1] - h[h.length - 2] : 0;
      const arrow = trend > 0.01 ? '<span class="up">▲</span>' : trend < -0.01 ? '<span class="down">▼</span>' : '<span class="flat">■</span>';
      const pts = h.map((v, i) => `${((i / (h.length - 1)) * 60).toFixed(1)},${(18 - ((v - 0.6) / 0.95) * 16).toFixed(1)}`).join(' ');
      const spark = `<svg class="spark" viewBox="0 0 60 20" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="${RESOURCES[r].color}" stroke-width="1.5"/></svg>`;
      const inCargo = s.cargo[r];
      const inSilo = s.storage[r];
      const sellable = (docked ? inCargo : 0) + inSilo;
      total += sellable * p;
      return `<tr>
        <td class="res">${icon('ore', RESOURCES[r].color, 18)}<b>${RESOURCES[r].name}</b></td>
        <td class="price">${p}<small>cr</small> ${arrow}</td>
        <td>${spark}</td>
        <td class="${!docked && inCargo ? 'muted' : ''}">${fmt(inCargo)}</td>
        <td>${fmt(inSilo)}</td>
        <td><button class="btn small ${sellable ? 'ok' : ''}" data-act="sell" data-arg="${r}" ${sellable ? '' : 'disabled'}>Sell ${sellable ? fmt(sellable * p) : ''}</button></td>
      </tr>`;
    }).join('');
    const holdNote = docked
      ? ''
      : cargoUsed(s.cargo) > 0
        ? `<div class="note warn">${icon('ship', '#ffd23e', 14)} Your hold (${cargoUsed(s.cargo)} units) can only be unloaded while docked. Fly to the station and press <kbd>E</kbd>.</div>`
        : '';
    const services = docked
      ? `<div class="card services" style="--accent:#5ef1ff"><h3>${icon('wrench', '#5ef1ff', 18)}Station Services</h3>
          <div class="kv"><span>Fuel</span><b>${Math.floor(s.ship.fuel)} / ${stats.fuelMax}</b></div>
          <button class="btn ${refuelCost(s, stats) ? 'ok' : ''}" data-act="refuel" ${refuelCost(s, stats) ? '' : 'disabled'}>${icon('fuel', '#05060f', 14)} Refuel · ${fmt(refuelCost(s, stats))} cr</button>
          <div class="kv"><span>Hull</span><b>${Math.floor(s.ship.hull)} / ${stats.hullMax}</b></div>
          <button class="btn ${repairCost(s, stats) ? 'ok' : ''}" data-act="repair" ${repairCost(s, stats) ? '' : 'disabled'}>${icon('hull', '#05060f', 14)} Repair · ${fmt(repairCost(s, stats))} cr</button>
          <button class="btn ghost" data-nav="mining">Undock &amp; launch <kbd>E</kbd></button>
        </div>`
      : `<div class="card services" style="--accent:#5ef1ff"><h3>${icon('wrench', '#5ef1ff', 18)}Station Services</h3><p class="muted">Refuel and repair are available when docked. The station is marked on your radar and by an arrow on screen.</p></div>`;
    return (
      this.tabBar('market', [['market', 'Market', 'chart'], ['stats', 'Statistics', 'star']]) +
      `<div class="market-layout"><div class="card" style="--accent:#ffd23e">
        ${holdNote}
        <table class="market"><thead><tr><th>Mineral</th><th>Price</th><th>Trend</th><th>Hold</th><th>Silo</th><th></th></tr></thead><tbody>${rows}</tbody></table>
        <button class="btn big sell-all ${total ? 'ok' : ''}" data-act="sell" data-arg="all" ${total ? '' : 'disabled'}>${icon('credits', '#05060f', 18)} Sell everything · ${fmt(total)} cr</button>
        <small class="muted">Prices drift every ${15}s. Dumping a lot at once lowers the price a little. Silo: ${fmt(cargoUsed(s.storage))}/${fmt(stats.storageCap)} (filled by drones).</small>
      </div>${services}</div>`
    );
  }

  render_galaxy(s) {
    const cards = SECTOR_IDS.map((id) => {
      const info = sectorInfo(s, id);
      const d = info.def;
      const pct = Math.round(exploredFraction(s, id) * 100);
      let btn;
      if (info.current) btn = `<button class="btn" disabled>You are here</button>`;
      else if (info.unlocked) btn = `<button class="btn ${s.ship.fuel >= WARP_FUEL ? 'ok' : 'poor'}" data-act="warp" data-arg="${id}">Warp · ${WARP_FUEL} fuel</button>`;
      else if (!info.levelOk) btn = `<button class="btn locked" disabled>${icon('lock', '#8b95ad', 12)} Pilot level ${d.level}</button>`;
      else if (!info.researchOk) btn = `<button class="btn locked" disabled>${icon('lock', '#8b95ad', 12)} Needs ${RESEARCH[d.research].name}</button>`;
      else btn = `<button class="btn ${info.affordable ? 'ok' : 'poor'}" data-act="unlockSector" data-arg="${id}">Buy jump license · ${fmt(d.cost)} cr</button>`;
      const ores = RESOURCE_IDS.filter((r) => d.bands[2].w[r] > 0)
        .map((r) => icon('ore', RESOURCES[r].color, 14))
        .join('');
      return `<div class="card sector ${info.current ? 'current' : ''} ${info.unlocked ? '' : 'locked'}" style="--accent:${d.palette.planet[2]};--neb:${d.palette.nebula[0]};--neb2:${d.palette.nebula[2]};--pl:${d.palette.planet[0]}">
        <div class="sector-art"><i></i></div>
        <h3>${esc(d.name)}</h3><p>${esc(d.blurb)}</p>
        <div class="kv"><span>Ores</span><b class="ores">${ores}</b></div>
        <div class="kv"><span>Rock yield</span><b>x${d.yield}</b></div>
        <div class="kv"><span>Danger</span><b>${'◆'.repeat(Math.round(d.danger * 1.5))}</b></div>
        <div class="kv"><span>Charted</span><b>${info.unlocked ? `${pct}%` : '—'}</b></div>
        ${btn}</div>`;
    }).join('');
    return `<div class="grid sectors">${cards}</div>`;
  }

  // ------------------------------------------------------------ side panels
  refreshLeft(force) {
    const s = this.state;
    const tab = this.tabs.left;
    this.root.querySelectorAll('[data-ltab]').forEach((b) => b.classList.toggle('active', b.dataset.ltab === tab));
    this.el.mapwrap.style.display = tab === 'map' ? '' : 'none';
    let html = '';
    if (tab === 'missions') {
      html = s.missions.active
        .map((m) => {
          const p = missionProgress(s, m);
          const kind = m.kind === 'bigSale' ? `${fmt(p)}/${fmt(m.goal)} cr` : `${fmt(p)}/${fmt(m.goal)}`;
          return `<div class="mission"><div class="m-title">${icon('flag', '#ffd23e', 12)}<b>${esc(m.title)}</b></div>
          <small class="muted">${esc(m.hint || '')}</small>
          ${bar(p / m.goal, 'mission-bar')}<div class="m-foot"><span>${kind}</span><span class="reward">${cr(m.credits || 0)} <span class="xpc">+${m.xp}xp</span>${m.rp ? ` <span class="rpc">+${m.rp}rp</span>` : ''}</span></div></div>`;
        })
        .join('') + `<small class="muted done-count">${s.missions.completed} missions completed</small>`;
    } else if (tab === 'map') {
      const pct = Math.round(exploredFraction(s) * 100);
      this.el.mapinfo.innerHTML = `<b>${SECTORS[s.sector].name}</b><span>${pct}% charted</span>`;
      html = '';
    } else {
      html = ACHIEVEMENT_IDS.map((id) => {
        const a = ACHIEVEMENTS[id];
        const got = s.achievements[id];
        const v = Math.min(a.goal, achievementValue(s, a));
        return `<div class="ach ${got ? 'got' : ''}">${icon('trophy', got ? '#ffd23e' : '#4a5270', 18)}<div><b>${esc(a.name)}</b><small>${esc(a.desc)}</small>${got ? '' : bar(v / a.goal, 'ach-bar')}</div><span class="rpc">+${a.rp}rp</span></div>`;
      }).join('');
    }
    this.setHTML('left', this.el.leftbody, html, force);
  }

  refreshRight() {
    const s = this.state;
    const st = this.engine.stats;
    const ship = s.ship;
    const used = cargoUsed(s.cargo);
    const chips = RESOURCE_IDS.filter((r) => s.cargo[r] > 0)
      .map((r) => `<span class="chip" title="${RESOURCES[r].name}">${icon('ore', RESOURCES[r].color, 12)}${s.cargo[r]}</span>`)
      .join('');
    const silo = cargoUsed(s.storage);
    const drones = s.drones
      .map((d, i) => `<div class="mini-drone"><span class="dot ${d.task}"></span>D${i + 1}<span class="muted">${droneStatus(d)}</span><span>${Math.floor(d.load)}/${st.droneCargo}</span>${d.mode === 'escort' ? '<em>ESC</em>' : ''}</div>`)
      .join('');
    const html = `
      <h4>${icon('ship', '#5ef1ff', 14)}${esc(SHIPS[s.shipId].name)}${ship.docked ? '<span class="pill ok">DOCKED</span>' : ''}</h4>
      <div class="meter"><label>${icon('hull', '#ff6a6a', 12)}Hull</label>${bar(ship.hull / st.hullMax, 'hull')}<span>${Math.ceil(ship.hull)}</span></div>
      <div class="meter"><label>${icon('shield', '#7aa8ff', 12)}Shield</label>${bar(ship.shield / st.shieldMax, 'shield')}<span>${Math.floor(ship.shield)}</span></div>
      <div class="meter"><label>${icon('laser', '#5ef1ff', 12)}Energy</label>${bar(ship.energy / st.energyMax, ship.overheat ? 'energy hot' : 'energy')}<span>${Math.floor(ship.energy)}</span></div>
      <div class="meter"><label>${icon('engine', '#ff8c42', 12)}Boost</label>${bar(ship.boost / st.boostMax, 'boost')}<span>${ship.boost.toFixed(1)}</span></div>
      <h4>${icon('cargo', '#ffd23e', 14)}Cargo <span class="right ${used >= st.cargoCap ? 'full' : ''}">${used}/${st.cargoCap}</span></h4>
      ${bar(used / st.cargoCap, used >= st.cargoCap ? 'cargo full' : 'cargo')}
      <div class="chips">${chips || '<small class="muted">Empty hold</small>'}</div>
      <div class="kv small"><span>Station silo</span><b>${silo}/${st.storageCap}</b></div>
      <h4>${icon('laser', '#5ef1ff', 14)}Equipment</h4>
      <div class="kv small"><span>Mining laser</span><b>${st.laserDps.toFixed(0)} dps · ${st.laserRange}m</b></div>
      <div class="kv small"><span>Tractor beam</span><b>${st.magnetRadius}m</b></div>
      <div class="kv small"><span>Radar</span><b>${st.radarRange}m</b></div>
      <h4>${icon('drone', '#ffd23e', 14)}Drones <span class="right">${s.drones.length}/${st.maxDrones}</span></h4>
      <div class="drones">${drones}</div>`;
    this.setHTML('right', this.el.rightbody, html);
  }

  refreshTop() {
    const s = this.state;
    const st = this.engine.stats;
    const set = (k, v) => {
      if (this.el[k].textContent !== v) this.el[k].textContent = v;
    };
    set('credits', fmt(s.credits));
    set('level', `LV ${s.level}`);
    const need = xpToNext(s.level);
    this.el.xpbar.style.width = `${Math.min(100, (s.xp / need) * 100)}%`;
    set('xptext', `${fmt(s.xp)}/${fmt(need)} XP`);
    set('rp', String(s.rp));
    this.el.fuelbar.style.width = `${Math.min(100, (s.ship.fuel / st.fuelMax) * 100)}%`;
    this.el.fuelbar.parentElement.classList.toggle('low', s.ship.fuel / st.fuelMax < 0.2);
    set('fueltext', `${Math.floor(s.ship.fuel)}/${st.fuelMax}`);
    set('loc', SECTORS[s.sector].name);
    const ev = s.event;
    if (ev) {
      this.el.event.hidden = false;
      this.el.event.style.setProperty('--c', EVENTS[ev.id].color);
      set('event', `${EVENTS[ev.id].name} · ${fmtTime(ev.t)}`);
    } else this.el.event.hidden = true;
    // Pulse ability cooldown.
    const cd = s.ship.pulseCd / st.pulseCooldown;
    this.el.pulsecd.style.height = `${cd * 100}%`;
    this.root.querySelector('#ability').classList.toggle('ready', cd <= 0);
  }

  // ------------------------------------------------------------ frame
  frame(dt) {
    this.time += dt;
    this.timer -= dt;
    this.slow -= dt;
    if (this.timer <= 0) {
      this.timer = 0.1;
      this.refreshTop();
      if (this.state.settings.rightOpen) this.refreshRight();
      drawRadar(this.radar, this.state, this.engine.stats, this.time);
    }
    if (this.slow <= 0) {
      this.slow = 0.3;
      if (this.state.settings.leftOpen) this.refreshLeft();
      if (this.screen) this.refreshScreen();
      if (this.tabs.left === 'map' && this.state.settings.leftOpen) drawMap(this.mapCanvas, this.state, this.time);
    }
  }

  // ------------------------------------------------------------ feedback
  handleFx(events) {
    for (const e of events) {
      switch (e.type) {
        case 'levelUp':
          this.toast(`Pilot level ${e.level}! +${fmt(e.credits)} cr bonus, +1 research point`, 'level', 'star');
          this.banner(`LEVEL ${e.level}`, 'New upgrades unlocked', '#ffd23e');
          break;
        case 'mission':
          this.toast(`Mission complete: ${e.title} · +${fmt(e.credits)} cr, +${e.xp} XP${e.rp ? `, +${e.rp} RP` : ''}`, 'good', 'flag');
          break;
        case 'achievement':
          this.toast(`<b>Achievement unlocked: ${esc(e.name)}</b><br><small>${esc(e.desc)} · +${e.rp} RP</small>`, 'achievement', 'trophy', 5500);
          break;
        case 'eventStart':
          this.banner(e.name.toUpperCase(), e.desc, EVENTS[e.id].color);
          break;
        case 'eventEnd':
          this.toast(`${e.name} is over`, 'info');
          break;
        case 'sold':
          this.toast(`Sold ${fmt(e.units)} units for <b>${fmt(e.credits)} cr</b>`, 'good', 'credits');
          break;
        case 'discover':
          this.banner('RARE CRYSTAL FOUND', 'Worth 50 cr each. Look for purple rock far from the station.', '#d66bff');
          break;
        case 'cargoFull':
          this.toast('Cargo hold full! Return to the station (follow the arrow) or upgrade your hold.', 'warn', 'cargo');
          break;
        case 'storageFull':
          this.toast('Station silo is full. Sell from the Market so drones can keep hauling.', 'warn', 'drone');
          break;
        case 'noFuel':
          this.toast('Out of fuel! Emergency thrusters only. Head back to the station to refuel.', 'warn', 'fuel');
          break;
        case 'shipDestroyed':
          this.banner('SHIP DESTROYED', 'Half your cargo was lost. Towed back to the station.', '#ff4d6d');
          break;
        case 'stolen':
          this.toast(`Pirates stole ${e.qty} ${RESOURCES[e.res].name}!`, 'warn');
          break;
        case 'pirateDown':
          this.toast('Pirate destroyed! Grab the loot.', 'good');
          break;
        case 'salvage':
          this.toast(`Salvaged the derelict: +${fmt(e.credits)} cr, +${e.rp} RP, ${e.qty} ${RESOURCES[e.res].name}`, 'good', 'star');
          break;
        case 'research':
          this.toast(`Research complete: ${e.name}`, 'good', 'rp');
          break;
        case 'droneDeployed':
          this.toast(`Drone #${e.count} deployed. It will start mining near the station.`, 'good', 'drone');
          break;
        case 'shipBought':
          this.banner(e.name.toUpperCase(), 'New ship acquired', '#5ef1ff');
          break;
        case 'sectorUnlocked':
          this.toast(`Jump license for ${e.name} acquired. Warp from the Galaxy map.`, 'good', 'planet');
          break;
        case 'warp':
          this.banner(e.name.toUpperCase(), 'Warp complete', '#9fe8ff');
          this.openScreen('mining');
          break;
        case 'dock':
          this.openScreen('market');
          break;
        case 'undock':
          if (this.screen) {
            this.screen = null;
            this.screenEl.classList.remove('open');
            this.root.querySelectorAll('[data-nav]').forEach((b) => b.classList.toggle('active', b.dataset.nav === 'mining'));
          }
          break;
        case 'edge':
          this.toast('Leaving the asteroid field. Turn back!', 'warn');
          break;
        case 'denied':
          this.toast(e.reason, 'warn');
          break;
        case 'refuel':
          this.toast(e.free ? 'Emergency refuel on the house.' : `Refuelled for ${fmt(e.cost)} cr`, 'info', 'fuel');
          break;
        case 'repair':
          this.toast(e.free ? 'Emergency repair on the house.' : `Repaired for ${fmt(e.cost)} cr`, 'info', 'hull');
          break;
        case 'overheat':
          this.toast('Laser overheated, let it cool! (upgrade Energy Efficiency)', 'warn', 'laser');
          break;
      }
    }
  }

  toast(html, kind = 'info', ic = null, ms = 3600) {
    const key = `${kind}|${html}`;
    const now = performance.now();
    if (this.lastToast?.key === key && now - this.lastToast.t < 1500) return;
    this.lastToast = { key, t: now };
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    const colors = { good: '#7dffb0', warn: '#ffd23e', achievement: '#ffd23e', level: '#ffd23e', info: '#9fe8ff' };
    el.innerHTML = `${ic ? icon(ic, colors[kind] || '#9fe8ff', 16) : ''}<span>${kind === 'achievement' ? html : html}</span>`;
    this.toastBox.prepend(el);
    while (this.toastBox.children.length > 3) this.toastBox.lastChild.remove();
    requestAnimationFrame(() => el.classList.add('in'));
    setTimeout(() => {
      el.classList.remove('in');
      setTimeout(() => el.remove(), 400);
    }, ms);
  }

  banner(title, sub, color) {
    // Management screens own the middle of the screen: use a toast instead.
    if (this.screen) return this.toast(`<b style="color:${color}">${esc(title)}</b> ${esc(sub || '')}`, 'info');
    const b = this.el.banner;
    b.style.setProperty('--c', color);
    b.innerHTML = `<b>${esc(title)}</b><small>${esc(sub || '')}</small>`;
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
    clearTimeout(this.bannerT);
    this.bannerT = setTimeout(() => b.classList.remove('show'), 3200);
  }

  // ------------------------------------------------------------ modals
  modal(html) {
    this.modalOpen = true;
    this.el.modal.innerHTML = `<div class="modal-card">${html}</div>`;
    this.el.modal.classList.add('open');
  }

  closeModal() {
    this.modalOpen = false;
    this.el.modal.classList.remove('open');
  }

  openSettings() {
    const s = this.state.settings;
    this.modal(`<h2>${icon('gear', '#5ef1ff', 18)} Settings</h2>
      <label class="row">Volume <input type="range" min="0" max="100" value="${Math.round(s.volume * 100)}" data-setting="volume"></label>
      <label class="row"><input type="checkbox" data-setting="muted" ${s.muted ? 'checked' : ''}> Mute all sound</label>
      <label class="row"><input type="checkbox" data-setting="music" ${s.music ? 'checked' : ''}> Ambient space music</label>
      <label class="row"><input type="checkbox" data-setting="help" ${s.help ? 'checked' : ''}> Show controls card</label>
      <h3>Controls</h3>
      <div class="controls"><span><kbd>WASD</kbd>/<kbd>Arrows</kbd> fly</span><span><kbd>Mouse</kbd> aim</span><span><kbd>Left click</kbd> mine</span><span><kbd>Shift</kbd> boost</span><span><kbd>E</kbd> dock / salvage</span><span><kbd>Space</kbd> pulse blast</span><span><kbd>H R M G</kbd> screens</span><span><kbd>Tab</kbd> panels</span><span><kbd>Esc</kbd> back</span></div>
      <p class="muted">Progress saves automatically every few seconds and after every purchase.</p>
      <div class="row buttons"><button class="btn" data-ui="save">Save now</button><button class="btn ghost" data-ui="reset">Reset progress</button><button class="btn ok" data-ui="modal-close">Close</button></div>`);
  }

  welcomeBack(off) {
    const items = RESOURCE_IDS.filter((r) => off.gained[r])
      .map((r) => `<span class="chip">${icon('ore', RESOURCES[r].color, 14)}${fmt(off.gained[r])} ${RESOURCES[r].name}</span>`)
      .join('');
    const capped = off.seconds > off.capped + 1;
    this.modal(`<h2>${icon('drone', '#ffd23e', 20)} Welcome back, pilot</h2>
      <p>You were away for <b>${fmtTime(off.seconds)}</b>. Your drone fleet kept mining${capped ? ` (offline mining is capped at ${fmtTime(off.capped)})` : ''}:</p>
      <div class="chips big">${items || '<span class="muted">Nothing this time.</span>'}</div>
      <p class="muted">${fmt(off.units)} units are waiting in the station silo. Sell them from the Market.${off.siloFull ? ' <b class="warn">The silo filled up: research Station Silo for more room.</b>' : ''}</p>
      <div class="row buttons"><button class="btn" data-ui="modal-close">Keep mining</button><button class="btn ok" data-nav="market" data-ui="modal-close">Open market</button></div>`);
    // data-nav handled first; also close the modal.
    this.el.modal.querySelector('[data-nav]').addEventListener('click', () => this.closeModal());
  }

  showHelp() {
    if (this.state.settings.help) this.el.help.classList.add('show');
  }
}
