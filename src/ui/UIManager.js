// UIManager: a deliberately small DOM layer. A thin top bar, one mission
// line, a compact status block with weapon slots, a radar, and three
// screens (Hangar, Market, Galaxy) made of big visual cards.
import {
  ACHIEVEMENTS,
  ACHIEVEMENT_IDS,
  EVENTS,
  RESOURCES,
  RESOURCE_IDS,
  SECTORS,
  SECTOR_IDS,
  SHIPS,
  SHIP_IDS,
  UPGRADES,
  UPGRADE_IDS,
  WEAPONS,
  WEAPON_IDS,
  WEAPON_MAX,
  xpToNext,
} from '../core/config.js';
import { cargoUsed, getStats } from '../core/state.js';
import { fmt, fmtTime } from '../core/math.js';
import { icon } from './icons.js';
import { drawRadar } from './radar.js';
import { price } from '../systems/EconomyManager.js';
import { missionProgress } from '../systems/MissionManager.js';
import { droneBuyInfo, sectorInfo, upgradeInfo, weaponInfo } from '../systems/UpgradeManager.js';
import { eventProgress } from '../systems/EventManager.js';
import { mapSprite } from '../render/sprites.js';

const SCREENS = [
  { id: 'hangar', name: 'Hangar', icon: 'wrench', key: 'H' },
  { id: 'market', name: 'Market', icon: 'credits', key: 'M' },
  { id: 'galaxy', name: 'Galaxy', icon: 'planet', key: 'G' },
];

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const pips = (n, max, color) => `<span class="pips" style="--c:${color}">${Array.from({ length: max }, (_, i) => `<b class="${i < n ? 'on' : ''}"></b>`).join('')}</span>`;

const art = new Map();
function shipImage(id) {
  if (!art.has(id)) art.set(id, mapSprite(id, 'player').img.toDataURL());
  return art.get(id);
}

export class UIManager {
  constructor({ engine, audio, root, onReset, onSave, onView }) {
    this.engine = engine;
    this.audio = audio;
    this.root = root;
    this.onReset = onReset;
    this.onSave = onSave;
    this.onView = onView;
    this.screen = null;
    this.hangarTab = 'ship';
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

  build() {
    const slots = WEAPON_IDS.map((id, i) => `<button class="slot" data-act="equip" data-arg="${id}" title="${WEAPONS[id].name} (${i + 1})">${icon(id, WEAPONS[id].color, 20)}<kbd>${i + 1}</kbd><i class="lv"></i></button>`).join('');
    this.root.innerHTML = `
      <header id="top">
        <div class="pill credits">${icon('credits', '#ffd23e', 16)}<b data-k="credits"></b></div>
        <div class="pill level"><b data-k="level"></b><div class="xp"><i data-k="xp"></i></div></div>
        <div class="center">
          <div class="mission" data-k="mission"></div>
          <div class="event" data-k="event" hidden></div>
        </div>
        <button class="icon-btn view-btn" data-ui="view" title="Cockpit view (V)">${icon('eye', '#9fe8ff', 18)}<span data-k="viewlabel">Cockpit</span></button>
        <button class="icon-btn" data-ui="sound" title="Sound">${icon('sound', '#9fe8ff', 18)}</button>
        <button class="icon-btn" data-ui="settings" title="Settings">${icon('gear', '#9fe8ff', 18)}</button>
      </header>
      <div id="combo" data-k="combo"></div>

      <div id="status">
        <div class="bars">
          <div class="b hull" title="Hull"><i data-k="hull"></i></div>
          <div class="b shield" title="Shield"><i data-k="shield"></i></div>
          <div class="b energy" title="Laser energy"><i data-k="energy"></i></div>
          <div class="cargo-line">${icon('cargo', '#ffd23e', 14)}<div class="b cargo"><i data-k="cargo"></i></div><span data-k="cargotext"></span></div>
        </div>
        <div class="slots">${slots}<button class="slot pulse" data-ui="pulse" title="Shockwave (Space)">${icon('pulse', '#b99bff', 20)}<kbd>␣</kbd><i class="cd" data-k="pulsecd"></i></button></div>
      </div>

      <div id="radar-wrap"><canvas id="radar"></canvas></div>

      <nav id="nav">${SCREENS.map((s) => `<button data-nav="${s.id}">${icon(s.icon, '#9fe8ff', 18)}<span>${s.name}</span><kbd>${s.key}</kbd></button>`).join('')}</nav>

      <section id="screen"><div class="inner">
        <header><h2 data-k="title"></h2><button class="close" data-nav="close" title="Close (Esc)">✕</button></header>
        <div class="body" data-k="body"></div>
      </div></section>

      <div id="hints" data-k="hints">
        <span><kbd>WASD</kbd> fly</span><span><b>Left click</b> mine</span><span><b>Right click</b> shoot</span><span><kbd>E</kbd> dock &amp; sell</span><span><kbd>V</kbd> cockpit</span>
        <button data-ui="hints-close">✕</button>
      </div>
      <div id="banner" data-k="banner"></div>
      <div id="toasts"></div>
      <div id="modal" data-k="modal"></div>`;
    this.el = {};
    this.root.querySelectorAll('[data-k]').forEach((e) => (this.el[e.dataset.k] = e));
    this.toastBox = this.root.querySelector('#toasts');
    this.radar = this.root.querySelector('#radar');
    this.screenEl = this.root.querySelector('#screen');
    this.slotEls = [...this.root.querySelectorAll('.slot[data-arg]')];
  }

  bind() {
    this.root.addEventListener('click', (e) => {
      this.audio.unlock();
      const t = e.target.closest('[data-act],[data-nav],[data-ui],[data-tab]');
      if (!t) return;
      if (t.dataset.nav) return this.openScreen(t.dataset.nav === 'close' ? null : t.dataset.nav);
      if (t.dataset.tab) {
        this.hangarTab = t.dataset.tab;
        this.audio.play('click');
        return this.refreshScreen(true);
      }
      if (t.dataset.ui) return this.uiAction(t.dataset.ui, t);
      if (t.dataset.act && !t.disabled) {
        const r = this.engine.act(t.dataset.act, t.dataset.arg, t.dataset.arg2);
        if (!r.ok) {
          if (r.reason) this.toast(r.reason, 'warn');
          this.audio.play('deny');
        } else {
          this.audio.play('click');
          this.onSave?.();
        }
        this.refreshScreen(true);
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
      this.audio.applySettings();
      this.onSave?.();
    });
  }

  uiAction(name, el) {
    const s = this.state.settings;
    switch (name) {
      case 'view':
        this.onView?.();
        break;
      case 'sound':
        s.muted = !s.muted;
        this.audio.applySettings();
        this.toast(s.muted ? 'Sound off' : 'Sound on');
        break;
      case 'settings':
        this.openSettings();
        break;
      case 'pulse': {
        const r = this.engine.act('pulse');
        if (!r.ok && r.reason) this.toast(r.reason, 'warn');
        break;
      }
      case 'hints-close':
        s.hints = false;
        break;
      case 'modal-close':
        this.closeModal();
        break;
      case 'reset':
        if (el.dataset.confirm) this.onReset?.();
        else {
          el.dataset.confirm = '1';
          el.textContent = 'Click again to erase';
          el.classList.add('danger');
        }
        return;
    }
    this.audio.play('click');
    this.onSave?.();
  }

  hotkey(e) {
    if (this.modalOpen) {
      if (e.code === 'Escape') {
        this.closeModal();
        return true;
      }
      return false;
    }
    const map = { KeyH: 'hangar', KeyM: 'market', KeyG: 'galaxy' };
    if (map[e.code]) {
      this.openScreen(this.screen === map[e.code] ? null : map[e.code]);
      return true;
    }
    if (e.code === 'KeyV') {
      this.onView?.();
      return true;
    }
    if (e.code === 'Escape' && (this.screen || this.state.ship.docked)) {
      this.openScreen(null);
      return true;
    }
    if (this.screen && e.code === 'KeyE') {
      this.openScreen(null);
      return true;
    }
    return false;
  }

  get menuOpen() {
    return !!this.screen || !!this.modalOpen;
  }

  // ------------------------------------------------------------ screens
  openScreen(id) {
    this.audio.unlock();
    this.screen = id || null;
    this.screenEl.classList.toggle('open', !!id);
    if (!id && this.state.ship.docked) this.engine.act('undock');
    if (id) this.refreshScreen(true);
    this.root.querySelectorAll('[data-nav]').forEach((b) => b.classList.toggle('active', b.dataset.nav === id));
    this.audio.play('click');
  }

  setHTML(key, el, html, force) {
    if (!force && this.cache.get(key) === html) return false;
    this.cache.set(key, html);
    el.innerHTML = html;
    return true;
  }

  refreshScreen(force) {
    if (!this.screen) return;
    const s = this.state;
    const docked = s.ship.docked ? ' <span class="tag">Docked</span>' : '';
    this.el.title.innerHTML = { hangar: 'Hangar', market: 'Market', galaxy: 'Galaxy' }[this.screen] + docked;
    const html = this[`render_${this.screen}`](s, getStats({ ...s, event: null }));
    if (this.setHTML('screen', this.el.body, html, force)) {
      this.el.body.querySelectorAll('[data-ship]:empty').forEach((el) => {
        const img = new Image();
        img.src = shipImage(el.dataset.ship);
        img.alt = '';
        el.appendChild(img);
      });
    }
  }

  buy(label, cost, act, arg, ok, extra = '') {
    return `<button class="buy ${ok ? 'ok' : ''}" data-act="${act}" data-arg="${arg}" ${extra}>${label}${cost ? ` <span>${icon('credits', ok ? '#05060f' : '#ffd23e', 12)}${fmt(cost)}</span>` : ''}</button>`;
  }

  render_hangar(s, st) {
    const tabs = [
      ['ship', 'Ship', 'ship'],
      ['weapons', 'Weapons', 'blaster'],
      ['drones', 'Drones', 'drone'],
      ['hulls', 'Hulls', 'star'],
    ];
    let body = '';
    if (this.hangarTab === 'ship') {
      body = UPGRADE_IDS.map((id) => {
        const i = upgradeInfo(s, id);
        const btn = i.maxed ? '<button class="buy" disabled>MAX</button>' : this.buy('Upgrade', i.cost, 'buyUpgrade', id, i.affordable);
        return `<div class="card" style="--c:${i.def.color}">${icon(i.def.icon, i.def.color, 32)}<h3>${i.def.name}</h3><p>${i.def.short}</p>${pips(i.level, i.def.max, i.def.color)}${btn}</div>`;
      }).join('');
    } else if (this.hangarTab === 'weapons') {
      body = WEAPON_IDS.map((id, n) => {
        const i = weaponInfo(s, id);
        let btn;
        if (i.locked) btn = `<button class="buy" disabled>${icon('lock', '#8a95b8', 12)} Level ${i.def.level}</button>`;
        else if (!i.owned) btn = this.buy('Buy', i.cost, 'buyWeapon', id, i.affordable);
        else if (i.maxed) btn = '<button class="buy" disabled>MAX</button>';
        else btn = this.buy('Upgrade', i.cost, 'buyWeapon', id, i.affordable);
        const equip = i.owned ? `<button class="equip ${i.equipped ? 'on' : ''}" data-act="equip" data-arg="${id}">${i.equipped ? 'Equipped' : `Equip (${n + 1})`}</button>` : '';
        return `<div class="card ${i.owned ? '' : 'dim'}" style="--c:${i.def.color}">${icon(id, i.def.color, 32)}<h3>${i.def.name}</h3><p>${i.def.short}</p>${i.owned ? pips(i.level, WEAPON_MAX, i.def.color) : ''}${btn}${equip}</div>`;
      }).join('');
    } else if (this.hangarTab === 'drones') {
      const d = droneBuyInfo(s);
      const u = upgradeInfo(s, 'drones');
      const fleet = s.drones.map(() => icon('drone', '#7dffb0', 22)).join('') + Array.from({ length: Math.max(0, d.max - d.owned) }, () => icon('drone', '#2a3350', 22)).join('');
      body = `<div class="card wide" style="--c:#7dffb0"><h3>Drone fleet ${d.owned}/${d.max}</h3><p>Drones mine on their own and fill the station silo, even while you're away.</p><div class="fleet">${fleet}</div>
        ${d.full ? `<button class="buy" disabled>More slots at level ${s.level + (s.level % 2 ? 1 : 2)}</button>` : this.buy('Add drone', d.cost, 'buyDrone', '', d.affordable)}</div>
        <div class="card" style="--c:#7dffb0">${icon('drone', '#7dffb0', 32)}<h3>Drone Tech</h3><p>Faster, bigger drones</p>${pips(u.level, u.def.max, '#7dffb0')}${u.maxed ? '<button class="buy" disabled>MAX</button>' : this.buy('Upgrade', u.cost, 'buyUpgrade', 'drones', u.affordable)}</div>`;
    } else {
      body = SHIP_IDS.map((id) => {
        const d = SHIPS[id];
        const owned = s.ownedShips.includes(id);
        let btn;
        if (s.shipId === id) btn = '<button class="buy" disabled>Flying</button>';
        else if (owned) btn = `<button class="buy ok" data-act="switchShip" data-arg="${id}">Fly</button>`;
        else if (s.level < d.level) btn = `<button class="buy" disabled>${icon('lock', '#8a95b8', 12)} Level ${d.level}</button>`;
        else btn = this.buy('Buy', d.cost, 'buyShip', id, s.credits >= d.cost);
        const stat = (label, v) => `<div class="mini"><span>${label}</span>${pips(Math.round(v * 2), 8, '#5ef1ff')}</div>`;
        return `<div class="card ship ${s.shipId === id ? 'current' : ''}" style="--c:#5ef1ff"><div class="ship-art" data-ship="${id}"></div><h3>${d.name}</h3>${stat('Hull', d.hull)}${stat('Guns', d.guns)}${stat('Cargo', d.cargo)}${btn}</div>`;
      }).join('');
    }
    return `<div class="tabs">${tabs.map(([k, l, ic]) => `<button data-tab="${k}" class="${this.hangarTab === k ? 'on' : ''}">${icon(ic, '#9fe8ff', 14)}${l}</button>`).join('')}</div><div class="grid">${body}</div>`;
  }

  render_market(s) {
    const docked = s.ship.docked;
    let total = 0;
    const rows = RESOURCE_IDS.map((r) => {
      const p = price(s, r);
      const h = s.market[r].history;
      const trend = h[h.length - 1] - h[h.length - 2];
      const qty = (docked ? s.cargo[r] : 0) + s.storage[r];
      total += qty * p;
      return `<div class="row">${icon('ore', RESOURCES[r].color, 22)}<b>${RESOURCES[r].name}</b><span class="price">${p} cr ${trend > 0.01 ? '<i class="up">▲</i>' : trend < -0.01 ? '<i class="down">▼</i>' : ''}</span><span class="qty">${qty ? `×${fmt(qty)}` : ''}</span><button class="buy ${qty ? 'ok' : ''}" data-act="sell" data-arg="${r}" ${qty ? '' : 'disabled'}>Sell</button></div>`;
    }).join('');
    const note = !docked && cargoUsed(s.cargo) ? `<p class="note">Dock at the station (<kbd>E</kbd>) to sell your hold. Docking also repairs your ship.</p>` : '';
    return `<div class="market">${note}${rows}<button class="buy big ${total ? 'ok' : ''}" data-act="sell" data-arg="all" ${total ? '' : 'disabled'}>Sell all · ${fmt(total)} cr</button>
      <p class="muted">Station silo ${fmt(cargoUsed(s.storage))}/${fmt(getStats(s).storageCap)} (drones)</p></div>`;
  }

  render_galaxy(s) {
    const cards = SECTOR_IDS.map((id) => {
      const i = sectorInfo(s, id);
      const d = i.def;
      let btn;
      if (i.current) btn = '<button class="buy" disabled>You are here</button>';
      else if (i.unlocked) btn = `<button class="buy ok" data-act="travel" data-arg="${id}">Warp</button>`;
      else if (!i.levelOk) btn = `<button class="buy" disabled>${icon('lock', '#8a95b8', 12)} Level ${d.level}</button>`;
      else btn = this.buy('Unlock', d.cost, 'travel', id, i.affordable);
      const danger = Array.from({ length: 4 }, (_, k) => `<i class="${k < Math.round(d.danger) ? 'on' : ''}"></i>`).join('');
      return `<div class="card sector ${i.current ? 'current' : ''}" style="--c:${d.palette.planet[2]};--n:${d.palette.nebula[0]};--p:${d.palette.planet[0]}"><div class="planet"></div><h3>${d.name}</h3><p>${d.blurb}</p><div class="danger">${icon('alien', '#9dff4a', 12)}${danger}</div>${btn}</div>`;
    }).join('');
    const medals = ACHIEVEMENT_IDS.map((id) => `<span class="medal ${s.achievements[id] ? 'got' : ''}" title="${esc(ACHIEVEMENTS[id].name)}: ${esc(ACHIEVEMENTS[id].desc)}">${icon('trophy', s.achievements[id] ? '#ffd23e' : '#2a3350', 22)}</span>`).join('');
    return `<div class="grid">${cards}</div><div class="medals">${medals}</div>`;
  }

  // ------------------------------------------------------------ HUD
  refreshHud() {
    const s = this.state;
    const st = this.engine.stats;
    const ship = s.ship;
    const set = (k, v) => {
      if (this.el[k].textContent !== v) this.el[k].textContent = v;
    };
    const w = (k, v) => (this.el[k].style.width = `${Math.max(0, Math.min(100, v * 100)).toFixed(1)}%`);
    set('credits', fmt(s.credits));
    set('level', `LV ${s.level}`);
    w('xp', s.xp / xpToNext(s.level));
    w('hull', ship.hull / st.hullMax);
    w('shield', ship.shield / st.shieldMax);
    w('energy', ship.energy / st.energyMax);
    const used = cargoUsed(s.cargo);
    w('cargo', used / st.cargoCap);
    set('cargotext', `${used}/${st.cargoCap}`);
    this.el.cargo.parentElement.classList.toggle('full', used >= st.cargoCap);
    this.el.energy.parentElement.classList.toggle('hot', !!ship.overheat);
    this.el.hull.parentElement.classList.toggle('low', ship.hull / st.hullMax < 0.3);
    this.el.pulsecd.style.height = `${(ship.pulseCd / 18) * 100}%`;
    this.slotEls.forEach((b) => {
      const id = b.dataset.arg;
      const lv = s.weapons[id] || 0;
      b.classList.toggle('on', s.weapon === id);
      b.classList.toggle('locked', !lv);
      const t = lv ? `L${lv}` : '';
      const li = b.querySelector('.lv');
      if (li.textContent !== t) li.textContent = t;
    });

    // Mission line.
    const m = s.missions.active;
    if (m) {
      const p = missionProgress(s, m);
      const html = `${icon('flag', '#ffd23e', 14)}<span>${esc(m.title)}</span><b>${fmt(p)}/${fmt(m.goal)}</b><i class="reward">+${fmt(m.credits)}</i><div class="mbar"><i style="width:${((p / m.goal) * 100).toFixed(1)}%"></i></div>`;
      this.setHTML('mission', this.el.mission, html);
    }
    // Event chip.
    const ev = s.event;
    if (ev) {
      const def = EVENTS[ev.id];
      const prog = eventProgress(s);
      let extra = fmtTime(ev.t);
      if (prog?.label) extra = `${prog.label} · ${prog.left} left`;
      let html = `<b style="color:${def.color}">${def.name}</b> <span>${extra}</span>`;
      if (prog?.boss !== undefined) html += `<div class="boss"><i style="width:${(prog.boss * 100).toFixed(1)}%"></i></div>`;
      this.el.event.hidden = false;
      this.setHTML('event', this.el.event, html);
    } else this.el.event.hidden = true;
    // Combo.
    const c = s.combo.count;
    const ctext = c >= 2 && s.combo.t > 0 ? `x${c} COMBO` : '';
    if (this.el.combo.textContent !== ctext) {
      this.el.combo.textContent = ctext;
      this.el.combo.classList.remove('pop');
      void this.el.combo.offsetWidth;
      if (ctext) this.el.combo.classList.add('pop');
    }
    this.el.hints.classList.toggle('show', s.settings.hints && !this.screen);
    const cockpit = s.settings.view === 'cockpit';
    this.root.classList.toggle('cockpit', cockpit);
    set('viewlabel', cockpit ? 'Top view' : 'Cockpit');
  }

  frame(dt) {
    this.time += dt;
    this.timer -= dt;
    this.slow -= dt;
    if (this.timer <= 0) {
      this.timer = 0.08;
      this.refreshHud();
      if (this.state.settings.view !== 'cockpit') drawRadar(this.radar, this.state, this.engine.stats, this.time);
    }
    if (this.slow <= 0) {
      this.slow = 0.3;
      if (this.screen) this.refreshScreen();
      // Hide the hint strip for good once the player has found their feet.
      if (this.state.settings.hints && this.state.stats.sales > 0 && this.state.stats.kills > 0) this.state.settings.hints = false;
    }
  }

  // ------------------------------------------------------------ feedback
  handleFx(events) {
    for (const e of events) {
      switch (e.type) {
        case 'levelUp':
          this.banner(`LEVEL ${e.level}`, `+${fmt(e.credits)} cr`, '#ffd23e');
          break;
        case 'mission':
          this.toast(`${icon('flag', '#7dffb0', 14)} ${esc(e.title)} <b>+${fmt(e.credits)} cr</b>`, 'good');
          break;
        case 'achievement':
          this.toast(`${icon('trophy', '#ffd23e', 14)} <b>${esc(e.name)}</b> +${fmt(e.credits)} cr`, 'gold');
          break;
        case 'eventStart':
          this.banner(e.name.toUpperCase(), e.desc, EVENTS[e.id].color);
          break;
        case 'wave':
          if (e.wave > 1) this.banner(`WAVE ${e.wave}`, '', '#7dff6a');
          break;
        case 'victory':
          this.banner(e.name.toUpperCase(), e.credits ? `+${fmt(e.credits)} cr` : '', '#ffd23e');
          break;
        case 'patrol':
          this.toast(`${icon('alien', '#9dff4a', 14)} Aliens incoming!`, 'warn');
          break;
        case 'sold':
          this.toast(`Sold ${fmt(e.units)} ore · <b>+${fmt(e.credits)} cr</b>`, 'good');
          break;
        case 'cargoFull':
          this.toast('Hold full. Head to the station.', 'warn');
          break;
        case 'storageFull':
          this.toast('Silo full. Sell in the Market.', 'warn');
          break;
        case 'shipDestroyed':
          this.banner('SHIP DESTROYED', 'Half your cargo was lost', '#ff4d6d');
          break;
        case 'stolen':
          this.toast(`Pirates stole ${e.qty} ${RESOURCES[e.res].name}!`, 'warn');
          break;
        case 'salvage':
          this.toast(`Salvaged <b>+${fmt(e.credits)} cr</b>`, 'good');
          break;
        case 'weaponBought':
          this.banner(e.name.toUpperCase(), 'Right click to fire', WEAPONS[e.id].color);
          break;
        case 'shipBought':
          this.banner(e.name.toUpperCase(), 'New ship', '#5ef1ff');
          break;
        case 'droneDeployed':
          this.toast(`${icon('drone', '#7dffb0', 14)} Drone #${e.count} deployed`, 'good');
          break;
        case 'warp':
          this.openScreen(null);
          this.banner(e.name.toUpperCase(), '', '#9fe8ff');
          break;
        case 'dock':
          this.openScreen('hangar');
          break;
        case 'undock':
          if (this.screen) {
            this.screen = null;
            this.screenEl.classList.remove('open');
            this.root.querySelectorAll('[data-nav]').forEach((b) => b.classList.remove('active'));
          }
          break;
        case 'denied':
          this.toast(e.reason, 'warn');
          break;
        case 'overheat':
          this.toast('Laser overheated', 'warn');
          break;
      }
    }
  }

  toast(html, kind = 'info', ms = 3000) {
    const key = `${kind}|${html}`;
    const now = performance.now();
    if (this.lastToast?.key === key && now - this.lastToast.t < 2000) return;
    this.lastToast = { key, t: now };
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.innerHTML = html;
    this.toastBox.prepend(el);
    while (this.toastBox.children.length > 3) this.toastBox.lastChild.remove();
    requestAnimationFrame(() => el.classList.add('in'));
    setTimeout(() => {
      el.classList.remove('in');
      setTimeout(() => el.remove(), 300);
    }, ms);
  }

  banner(title, sub, color) {
    if (this.screen) return this.toast(`<b style="color:${color}">${esc(title)}</b> ${esc(sub || '')}`);
    const b = this.el.banner;
    b.style.setProperty('--c', color);
    b.innerHTML = `<b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}`;
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
    clearTimeout(this.bannerT);
    this.bannerT = setTimeout(() => b.classList.remove('show'), 2400);
  }

  modal(html) {
    this.modalOpen = true;
    this.el.modal.innerHTML = `<div class="card-modal">${html}</div>`;
    this.el.modal.classList.add('open');
  }

  closeModal() {
    this.modalOpen = false;
    this.el.modal.classList.remove('open');
  }

  openSettings() {
    const s = this.state.settings;
    this.modal(`<h2>Settings</h2>
      <label class="row">Volume <input type="range" min="0" max="100" value="${Math.round(s.volume * 100)}" data-setting="volume"></label>
      <label class="row"><input type="checkbox" data-setting="music" ${s.music ? 'checked' : ''}> Music</label>
      <label class="row"><input type="checkbox" data-setting="hints" ${s.hints ? 'checked' : ''}> Control hints</label>
      <div class="controls">
        <span><kbd>WASD</kbd> fly</span><span><kbd>Shift</kbd> boost</span><span><b>Left click</b> mine</span><span><b>Right click</b>/<kbd>F</kbd> shoot</span>
        <span><kbd>1-4</kbd>/<kbd>Q</kbd> weapon</span><span><kbd>Space</kbd> shockwave</span><span><kbd>E</kbd> dock</span><span><kbd>V</kbd> cockpit view</span>
        <span><kbd>H</kbd> hangar</span><span><kbd>M</kbd> market</span><span><kbd>G</kbd> galaxy</span><span><kbd>Esc</kbd> close</span>
      </div>
      <p class="muted">Cockpit view: <kbd>W</kbd>/<kbd>S</kbd> thrust, <kbd>A</kbd>/<kbd>D</kbd> turn, click to capture the mouse and look around.</p>
      <div class="row buttons"><button class="buy" data-ui="reset">Reset progress</button><button class="buy ok" data-ui="modal-close">Close</button></div>`);
  }

  welcomeBack(off) {
    const items = RESOURCE_IDS.filter((r) => off.gained[r])
      .map((r) => `<span class="chip">${icon('ore', RESOURCES[r].color, 14)}${fmt(off.gained[r])}</span>`)
      .join('');
    this.modal(`<h2>${icon('drone', '#7dffb0', 20)} Welcome back</h2>
      <p>Your drones mined for ${fmtTime(off.capped)} while you were away:</p>
      <div class="chips">${items}</div>
      <p class="muted">It's waiting in the station silo. Sell it in the Market.</p>
      <div class="row buttons"><button class="buy ok" data-ui="modal-close">Let's go</button></div>`);
  }
}
