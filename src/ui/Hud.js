// Hud: all DOM interface. In-flight readouts and world markers, plus the
// panels: dialogue, trade, upgrades, appearance, inventory, journal, galaxy
// map, pause and title.
import * as THREE from 'three';
import { COSMETICS, FACTIONS, FACTION_IDS, HAZARDS, ITEMS, RECIPES, UPGRADES, upgradeCost } from '../universe/data.js';
import { starAt } from '../universe/galaxy.js';
import { buy, buyPrice, buyUpgrade, canAfford, count, craft, level, sell, sellPrice, setCosmetic, stockFor } from '../game/state.js';
import { NPCS, QUESTS, dialogueFor } from '../game/story.js';

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const fmt = (n) => Math.floor(n).toLocaleString('en-US');
const fmtDist = (d) => (d > 1e6 ? `${(d / 1e6).toFixed(1)} Mm` : d > 2000 ? `${(d / 1000).toFixed(1)} km` : `${Math.round(d)} m`);
const v = new THREE.Vector3();
const q = new THREE.Quaternion();

export class Hud {
  constructor(root) {
    this.root = root;
    root.innerHTML = `
      <div id="hud">
        <div class="mission" data-k="mission"></div>
        <div class="loc" data-k="loc"></div>
        <div class="cross" data-k="cross"><i></i><i></i><i></i><i></i></div>
        <div class="target" data-k="target"></div>
        <div class="prompt" data-k="prompt"></div>
        <div class="vitals" data-k="vitals"></div>
        <div class="right" data-k="right"></div>
        <div class="gains" data-k="gains"></div>
        <div class="markers" data-k="markers"></div>
        <div class="bossbar" data-k="boss" hidden></div>
      </div>
      <div id="vignette" data-k="vignette"></div>
      <div id="letterbox"><i></i><i></i></div>
      <div id="banner" data-k="banner"></div>
      <div id="toasts" data-k="toasts"></div>
      <div id="fade" data-k="fade"></div>
      <div id="panel" data-k="panel"></div>
      <div id="title" data-k="title"></div>`;
    this.el = {};
    root.querySelectorAll('[data-k]').forEach((e) => (this.el[e.dataset.k] = e));
    this.cache = {};
    this.gains = [];
    this.open = null;
    addEventListener('keydown', (e) => {
      if (!this.open) return;
      const k = e.code;
      // Keys handled here must not also reach the game (or E would close a
      // conversation and instantly start it again).
      e.stopImmediatePropagation();
      if (this.open === 'dialogue' && (k === 'KeyE' || k === 'Enter' || k === 'Space')) {
        e.preventDefault();
        this.dlg.next();
      } else if (k === 'Escape' || (k === 'Tab' && this.open === 'inventory') || (k === 'KeyJ' && this.open === 'journal') || (k === 'KeyM' && this.open === 'galaxy')) {
        e.preventDefault();
        if (this.open !== 'ending') this.close();
      }
    });
    root.addEventListener('click', (e) => {
      const t = e.target.closest('[data-act]');
      if (!t || t.disabled) return;
      this.action(t.dataset.act, t.dataset.arg, t.dataset.arg2, t);
    });
  }

  bind(game) {
    this.game = game;
  }

  set(k, html) {
    if (this.cache[k] === html) return;
    this.cache[k] = html;
    this.el[k].innerHTML = html;
  }

  // ------------------------------------------------------------ feedback
  toast(text, kind = 'info', ms = 4200) {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = text;
    this.el.toasts.prepend(el);
    while (this.el.toasts.children.length > 4) this.el.toasts.lastChild.remove();
    requestAnimationFrame(() => el.classList.add('in'));
    setTimeout(() => {
      el.classList.remove('in');
      setTimeout(() => el.remove(), 400);
    }, ms);
  }

  banner(title, sub, color = '#9fe8ff') {
    const b = this.el.banner;
    b.style.setProperty('--c', color);
    b.innerHTML = `<b>${esc(title)}</b><small>${esc(sub || '')}</small>`;
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
    clearTimeout(this.bannerT);
    this.bannerT = setTimeout(() => b.classList.remove('show'), 3600);
  }

  cinematic(title, sub, color) {
    this.root.classList.add('cinema');
    this.banner(title, sub, color);
    setTimeout(() => this.root.classList.remove('cinema'), 3600);
  }

  gain(res, n) {
    if (n <= 0) return;
    const g = this.gains.find((x) => x.res === res);
    if (g) {
      g.n += n;
      g.t = 2.6;
    } else this.gains.unshift({ res, n, t: 2.6 });
  }

  hitMarker() {
    this.el.cross.classList.remove('hit');
    void this.el.cross.offsetWidth;
    this.el.cross.classList.add('hit');
  }

  hurt(shieldOnly) {
    const vg = this.el.vignette;
    vg.className = shieldOnly ? 'shield' : 'hurt';
    clearTimeout(this.hurtT);
    this.hurtT = setTimeout(() => (vg.className = ''), 350);
  }

  bossBar(actor) {
    this.boss = actor;
    this.el.boss.hidden = !actor;
  }

  warpFx(cb) {
    const f = this.el.fade;
    f.classList.add('on');
    setTimeout(() => {
      cb();
      setTimeout(() => f.classList.remove('on'), 500);
    }, 900);
  }

  // ------------------------------------------------------------ per frame
  frame(game, dt) {
    const s = game.save;
    const p = game.player;
    const ship = game.ship;
    const env = game.env;
    const planet = env.near.planet;
    const foot = game.mode === 'foot';
    this.root.classList.toggle('hide-hud', !!this.open || this.titleOn);

    const qi = game.questInfo();
    this.set('mission', `<small>${esc(qi.title)}</small><b>${esc(qi.text)}</b>${qi.hint ? `<i>${esc(qi.hint)}</i>` : ''}${s.bounty ? `<em>Contract: ${esc(s.bounty.text)}${s.bounty.kind === 'hunt' ? ` (${s.bounty.done}/${s.bounty.n})` : ` (${Math.min(count(s, s.bounty.item), s.bounty.n)}/${s.bounty.n})`}</em>` : ''}`);

    const hz = planet.biome.hazard && env.altitude < 4000 ? HAZARDS[planet.biome.hazard] : null;
    const where = env.altitude < 6000 ? `<b>${esc(planet.name)}</b><span>${planet.biome.name} world${hz ? ` · <i style="color:${hz.color}">${hz.name}</i>` : ''}</span>` : `<b>${esc(game.sys.sys.name)}</b><span>${game.sys.sys.faction ? FACTIONS[game.sys.sys.faction].name : 'Unclaimed space'}</span>`;
    this.set('loc', where);

    const bar = (label, val, color, extra = '') => `<div class="bar ${extra}"><label>${label}</label><div><i style="width:${Math.max(0, Math.min(100, val * 100)).toFixed(0)}%;background:${color}"></i></div></div>`;
    if (foot) {
      let h = bar('HEALTH', p.health / 100, '#ff5a6a', p.health < 30 ? 'low' : '') + bar('SHIELD', p.shield / (p.shieldMax || 60), '#6fb8ff');
      h += bar('JETPACK', p.fuel / (p.fuelMax || 3), '#ffb347');
      if (planet.desc.hazardLevel > 0) h += bar('HAZARD', p.hazard, hz?.color || '#d9a6ff', p.hazard < 0.25 ? 'low' : '');
      this.set('vitals', h);
      this.set('right', `<div class="units">${fmt(s.units)} <small>units</small></div><div class="tool ${p.tool}"><b>${p.tool === 'mine' ? 'MINING BEAM' : 'BOLT CASTER'}</b><small>Q switch · F scan · V view · Tab inventory</small></div>`);
    } else {
      const h = bar('HULL', ship.hull / ship.hullMax, '#ff5a6a', ship.hull / ship.hullMax < 0.3 ? 'low' : '') + bar('THRUST', ship.throttle, ship.pulsing ? '#b98bff' : '#6fe0ff');
      this.set('vitals', h);
      const alt = ship.alt < 20000 ? `ALT ${fmtDist(Math.max(0, ship.alt))}` : 'DEEP SPACE';
      this.set('right', `<div class="units">${fmt(s.units)} <small>units</small></div><div class="tool"><b>${Math.round(ship.speed || 0)} m/s${ship.pulsing ? ' · PULSE' : ''}</b><small>${alt} · W/S thrust · Shift boost · G land · M map</small></div>`);
    }

    // Crosshair + target.
    const tg = foot ? p.target : null;
    this.el.cross.classList.toggle('on', !!tg && tg.dist < (p.tool === 'mine' ? 16 : 120));
    this.el.cross.classList.toggle('ship', !foot);
    if (tg?.prop) this.set('target', `<b>${ITEMS[tg.prop.res].name}</b><div><i style="width:${((tg.prop.hp / tg.prop.hp0) * 100).toFixed(0)}%;background:${ITEMS[tg.prop.res].color}"></i></div>`);
    else if (tg?.actor) this.set('target', `<b class="${tg.actor.hostile ? 'bad' : ''}">${tg.actor.kind === 'creature' ? (tg.actor.hostile ? 'Predator' : 'Creature') : tg.actor.kind[0].toUpperCase() + tg.actor.kind.slice(1)}</b><div><i style="width:${((tg.actor.hp / tg.actor.maxHp) * 100).toFixed(0)}%;background:#ff5a6a"></i></div>`);
    else this.set('target', '');

    const pr = game.prompt();
    this.set('prompt', !game.input.locked ? 'Click to look around' : pr ? `<kbd>${pr.key}</kbd> ${esc(pr.text)}` : '');

    for (const g of this.gains) g.t -= dt;
    this.gains = this.gains.filter((g) => g.t > 0);
    this.set('gains', this.gains.map((g) => `<div style="--c:${ITEMS[g.res].color}">+${g.n} ${ITEMS[g.res].name}</div>`).join(''));

    if (this.boss) {
      if (this.boss.dead) this.bossBar(null);
      else this.set('boss', `<b>THE WARDEN</b><div><i style="width:${((this.boss.hp / this.boss.maxHp) * 100).toFixed(1)}%"></i></div>`);
    }
    this.markers(game);
  }

  // Project a system-space point to the screen.
  project(game, pos) {
    const cam = game.engine.camera;
    v.copy(pos).sub(game.cam).applyQuaternion(q.copy(cam.quaternion).invert());
    const dist = v.length();
    const f = 1 / Math.tan((cam.fov * Math.PI) / 360);
    const behind = v.z > 0;
    let x = (v.x / Math.abs(v.z || 1e-6)) * f / cam.aspect;
    let y = (v.y / Math.abs(v.z || 1e-6)) * f;
    if (behind) {
      x = -x;
      y = -y;
    }
    const off = behind || Math.abs(x) > 0.94 || Math.abs(y) > 0.9;
    if (off) {
      const k = Math.max(Math.abs(x) / 0.94, Math.abs(y) / 0.9, 1e-6);
      x /= k;
      y /= k;
      if (behind && Math.abs(x) < 0.9 && Math.abs(y) < 0.86) y = -0.9;
    }
    return { x: (x * 0.5 + 0.5) * 100, y: (-y * 0.5 + 0.5) * 100, dist, off };
  }

  markers(game) {
    const out = [];
    const add = (pos, label, cls, minDist = 0) => {
      const p = this.project(game, pos);
      if (p.dist < minDist) return;
      out.push(`<div class="mk ${cls} ${p.off ? 'off' : ''}" style="left:${p.x.toFixed(2)}%;top:${p.y.toFixed(2)}%"><i></i><span>${esc(label)}<small>${fmtDist(p.dist)}</small></span></div>`);
    };
    const m = game.marker();
    if (m?.pos) add(m.pos, m.label, 'quest', 12);
    if (game.mode === 'foot' && game.surface) add(game.ship.pos, 'Ship', 'ship', 25);
    if (game.mode === 'ship' && game.env.altitude > 2500) {
      for (const pl of game.sys.planets) add(pl.pos, pl.planet.name, 'planet', pl.planet.radius * 2.2);
      add(game.ship.bay, 'Station', 'station', 600);
      for (const p of game.ship.pirates) add(p.pos, 'Pirate', 'enemy');
    }
    if (game.surface && (game.scanT > 0 || game.mode === 'ship')) {
      const pl = game.surface.pl;
      for (const st of game.sites.sites) if (st.type !== 'crash') add(v.clone().copy(pl.pos).add(st.center), st.label, st.type === 'outpost' ? 'enemy' : 'site', 40);
    }
    if (game.scanT > 0 && game.props) {
      let n = 0;
      for (const p of game.props.active) {
        if (['tree', 'bush', 'rock'].includes(p.type) || n > 24) continue;
        n++;
        const pr = this.project(game, v.clone().copy(game.surface.pl.pos).add(p.v));
        if (!pr.off) out.push(`<div class="mk res" style="left:${pr.x.toFixed(2)}%;top:${pr.y.toFixed(2)}%;--c:${ITEMS[p.res].color}"><i></i><span>${ITEMS[p.res].name}</span></div>`);
      }
    }
    if (m?.warp) out.push(`<div class="mk-note">Next: warp to <b>${esc(m.warp)}</b> — galaxy map <kbd>M</kbd> from space</div>`);
    this.el.markers.innerHTML = out.join('');
  }

  // ------------------------------------------------------------ panels
  show(name, html, wide = false) {
    this.open = name;
    this.game.paused = true;
    this.game.input.enabled = false;
    this.game.input.release();
    this.el.panel.className = `open ${wide ? 'wide' : ''}`;
    this.el.panel.innerHTML = `<div class="sheet ${name}">${html}</div>`;
    this.game.audio?.play('click');
  }

  close() {
    if (!this.open) return;
    const was = this.open;
    this.open = null;
    this.el.panel.className = '';
    this.el.panel.innerHTML = '';
    this.game.paused = false;
    this.game.input.enabled = true;
    this.game.input.pressed.clear();
    try {
      this.game.input.canvas.requestPointerLock?.()?.catch?.(() => {});
    } catch {
      /* needs a user gesture */
    }
    if (was === 'galaxy' && this.game.ship.state === 'docked') return this.openStation();
    if (was === 'station' && this.game.ship.state === 'docked') this.game.undock();
    const cb = this.onClose;
    this.onClose = null;
    cb?.();
  }

  head(title, sub = '') {
    return `<header><h2>${esc(title)}</h2><span>${esc(sub)}</span><b class="units">${fmt(this.game.save.units)} units</b><button data-act="close">✕</button></header>`;
  }

  dialogue(name, title, color, lines, onEnd, options) {
    let i = 0;
    const render = () => {
      const last = i >= lines.length - 1;
      const btns = last && options ? options.map((o, k) => `<button class="btn ${k === 0 ? 'ok' : ''}" data-act="dlg-opt" data-arg="${k}">${esc(o[0])}</button>`).join('') : `<button class="btn ok" data-act="dlg-next">${last ? 'Farewell' : 'Continue'} <kbd>E</kbd></button>`;
      this.show('dialogue', `<div class="who" style="--c:${color}"><b>${esc(name)}</b><small>${esc(title || '')}</small></div><p>${esc(lines[i])}</p><div class="row">${btns}</div>`);
    };
    this.dlg = {
      next: () => {
        if (i < lines.length - 1) {
          i++;
          render();
        } else {
          this.onClose = onEnd;
          this.close();
        }
      },
      opt: (k) => {
        const fn = options[k][1];
        this.close();
        fn?.();
      },
    };
    render();
  }

  tradeHTML(label) {
    const g = this.game;
    const s = g.save;
    const sys = g.sys.sys;
    const row = (id, side) => {
      const have = count(s, id);
      const price = side === 'buy' ? buyPrice(s, id, sys) : sellPrice(s, id, sys);
      const f = sys.faction && FACTIONS[sys.faction];
      const tag = f && f.wants === id ? '<em class="hot">in demand</em>' : f && f.good === id ? '<em class="cool">local</em>' : '';
      const btns = side === 'buy' ? `<button class="btn sm" data-act="buy" data-arg="${id}" data-arg2="1" ${s.units >= price ? '' : 'disabled'}>Buy</button><button class="btn sm" data-act="buy" data-arg="${id}" data-arg2="10" ${s.units >= price * 10 ? '' : 'disabled'}>×10</button>` : `<button class="btn sm" data-act="sell" data-arg="${id}" data-arg2="1">Sell</button><button class="btn sm ok" data-act="sell" data-arg="${id}" data-arg2="99999">All</button>`;
      return `<div class="item"><i style="background:${ITEMS[id].color}"></i><b>${ITEMS[id].name}${tag}</b><span>${have}</span><span class="price">${fmt(price)}</span>${btns}</div>`;
    };
    const sellable = Object.keys(s.inv).filter((k) => !ITEMS[k].key);
    return `<div class="cols"><div><h3>Buy</h3>${stockFor(sys).map((id) => row(id, 'buy')).join('')}</div><div><h3>Sell</h3>${sellable.length ? sellable.map((id) => row(id, 'sell')).join('') : '<p class="muted">Your pack is empty.</p>'}</div></div>`;
  }

  upgradesHTML() {
    const s = this.game.save;
    return `<div class="cards">${Object.keys(UPGRADES).map((id) => {
      const u = UPGRADES[id];
      const lv = level(s, id);
      const max = lv >= u.max;
      const cost = upgradeCost(id, lv);
      return `<div class="card"><span class="ic">${u.icon}</span><b>${u.name}</b><small>${u.desc}</small><div class="pips">${Array.from({ length: u.max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</div><button class="btn ${!max && s.units >= cost ? 'ok' : ''}" data-act="upgrade" data-arg="${id}" ${max || s.units < cost ? 'disabled' : ''}>${max ? 'MAX' : `${fmt(cost)} units`}</button></div>`;
    }).join('')}</div>`;
  }

  looksHTML() {
    const s = this.game.save;
    const names = { suit: 'Suit', visor: 'Visor', ship: 'Ship hull', trail: 'Engine trail' };
    return Object.keys(COSMETICS).map((slot) => `<h3>${names[slot]}</h3><div class="swatches">${COSMETICS[slot].map((c) => {
      const owned = s.cosmetics.owned[slot].includes(c.id);
      const on = s.cosmetics.sel[slot] === c.id;
      return `<button class="sw ${on ? 'on' : ''}" data-act="look" data-arg="${slot}" data-arg2="${c.id}" ${!owned && s.units < c.cost ? 'disabled' : ''}><i style="background:${c.color}"></i><b>${c.name}</b><small>${on ? 'Equipped' : owned ? 'Owned' : `${fmt(c.cost)} units`}</small></button>`;
    }).join('')}</div>`).join('');
  }

  openTrade(label) {
    this.tab = this.tab === 'upgrades' ? 'upgrades' : 'trade';
    this.place = label;
    this.renderShop('shop');
  }

  openStation() {
    this.tab = 'trade';
    this.place = this.game.sys.sys.station.name;
    this.renderShop('station');
  }

  renderShop(kind) {
    const g = this.game;
    const station = kind === 'station';
    const tabs = [['trade', 'Trade'], ['upgrades', 'Upgrades']];
    if (station) tabs.push(['looks', 'Appearance']);
    if (station && g.sys.id === '0,0') tabs.push(['envoy', 'Envoy Seren']);
    let body = this.tab === 'trade' ? this.tradeHTML() : this.tab === 'upgrades' ? this.upgradesHTML() : this.tab === 'looks' ? this.looksHTML() : '';
    if (this.tab === 'envoy') {
      const d = dialogueFor(g.save, 'envoy');
      body = `<div class="envoy"><div class="who" style="--c:${FACTIONS.thalori.color}"><b>${NPCS.envoy.name}</b><small>${NPCS.envoy.title}</small></div>${d.lines.map((l) => `<p>${esc(l)}</p>`).join('')}${d.story ? '<button class="btn ok" data-act="envoy">I will find the shards</button>' : ''}</div>`;
    }
    this.shopKind = kind;
    this.show(kind, `${this.head(this.place, station ? 'Docked' : 'Trade terminal')}<nav>${tabs.map(([k, l]) => `<button data-act="tab" data-arg="${k}" class="${this.tab === k ? 'on' : ''}">${l}</button>`).join('')}${station ? '<button data-act="galaxy">Galaxy map</button><button class="launch" data-act="close">Launch ▸</button>' : ''}</nav><div class="body">${body}</div>`, true);
  }

  openInventory() {
    const s = this.game.save;
    const items = Object.keys(s.inv).map((id) => `<div class="slot" title="${esc(ITEMS[id].desc)}"><i style="background:${ITEMS[id].color}"></i><b>${ITEMS[id].name}</b><span>${s.inv[id]}</span><small>${esc(ITEMS[id].desc)}</small></div>`).join('');
    const rec = Object.keys(RECIPES).map((id) => {
      const r = RECIPES[id];
      const ok = canAfford(s, r.cost);
      return `<div class="item"><i style="background:${ITEMS[id].color}"></i><b>${r.name}</b><span class="cost">${Object.keys(r.cost).map((k) => `<em class="${count(s, k) >= r.cost[k] ? '' : 'lack'}">${r.cost[k]} ${ITEMS[k].name}</em>`).join(' ')}</span><button class="btn sm ${ok ? 'ok' : ''}" data-act="craft" data-arg="${id}" ${ok ? '' : 'disabled'}>Craft</button></div>`;
    }).join('');
    this.show('inventory', `${this.head('Inventory', 'Tab to close')}<div class="body"><div class="slots">${items || '<p class="muted">Nothing yet. Aim at rocks and plants and hold left mouse to mine.</p>'}</div><h3>Crafting</h3>${rec}</div>`, true);
  }

  openJournal() {
    const s = this.game.save;
    const quests = QUESTS.map((qq, i) => {
      if (i > s.quest.q) return '';
      const done = i < s.quest.q;
      return `<div class="quest ${done ? 'done' : ''}"><b>${done ? '✓ ' : ''}${qq.title}</b>${done ? '' : qq.steps.map((st, k) => `<small class="${k < s.quest.s ? 'done' : k === s.quest.s ? 'now' : 'later'}">${k <= s.quest.s ? esc(st.text) : '???'}</small>`).join('')}</div>`;
    }).join('');
    const rep = FACTION_IDS.map((f) => `<div class="rep"><b style="color:${FACTIONS[f].color}">${FACTIONS[f].name}</b><div><i style="width:${s.rep[f]}%;background:${FACTIONS[f].color}"></i></div><small>${esc(FACTIONS[f].blurb)}</small></div>`).join('');
    const st = s.stats;
    this.show('journal', `${this.head('Journal', 'J to close')}<div class="body cols"><div><h3>Missions</h3>${quests}${s.flags.ending ? '<p class="muted">The story is complete. The galaxy goes on forever.</p>' : ''}<h3>Log</h3><p class="muted">Worlds discovered ${Object.keys(st.planets).length} · Systems visited ${Object.keys(st.systems).length} · Warps ${st.jumps} · Mined ${fmt(st.mined)} · Kills ${st.kills}</p></div><div><h3>Kingdoms</h3>${rep}<h3>Things you were told</h3>${s.lore.length ? s.lore.map((l) => `<p class="lore">${esc(l)}</p>`).join('') : '<p class="muted">Talk to villagers to learn about the galaxy.</p>'}</div></div>`, true);
  }

  openGalaxy() {
    const g = this.game;
    const [cx, cy] = g.sys.id.split(',').map(Number);
    this.gsel = this.gsel || null;
    const why = g.canWarp();
    const sel = this.gsel;
    const d = sel ? Math.hypot(sel.x - starAt(cx, cy).x, sel.y - starAt(cx, cy).y) : 0;
    const inRange = sel && d <= 2.3 && sel.id !== g.sys.id;
    const info = sel ? `<h3>${esc(sel.name)}</h3><p>${sel.star.name}<br>${sel.faction ? FACTIONS[sel.faction].name : 'Unclaimed'}<br>Danger ${'◆'.repeat(Math.round(sel.danger))}<br>${d.toFixed(1)} light-leaps away</p><button class="btn ${inRange && !why ? 'ok' : ''}" data-act="warp" ${inRange && !why ? '' : 'disabled'}>${!inRange ? (sel.id === g.sys.id ? 'You are here' : 'Out of range') : why || 'Warp (1 Warp Cell)'}</button>` : '<p class="muted">Click a star. Each jump uses one Warp Cell and reaches about two leaps.</p>';
    this.show('galaxy', `${this.head('Galaxy map', `Warp Cells: ${count(g.save, 'warpCell')}`)}<div class="body gal"><canvas width="640" height="520" data-k2="gal"></canvas><aside>${info}</aside></div>`, true);
    const c = this.el.panel.querySelector('canvas');
    const ctx = c.getContext('2d');
    const S = 52;
    const stars = [];
    const mark = g.marker();
    ctx.fillStyle = '#04060f';
    ctx.fillRect(0, 0, c.width, c.height);
    const here = starAt(cx, cy);
    ctx.strokeStyle = 'rgba(120,180,255,0.25)';
    ctx.beginPath();
    ctx.arc(c.width / 2, c.height / 2, 2.3 * S, 0, 6.3);
    ctx.stroke();
    for (let x = cx - 7; x <= cx + 7; x++)
      for (let y = cy - 6; y <= cy + 6; y++) {
        const st = starAt(x, y);
        const px = c.width / 2 + (st.x - here.x) * S;
        const py = c.height / 2 + (st.y - here.y) * S;
        stars.push({ st, px, py });
        const col = st.star.color.map((k) => Math.round(k * 255));
        ctx.fillStyle = `rgb(${col})`;
        ctx.beginPath();
        ctx.arc(px, py, st.story ? 4 : 2.6, 0, 6.3);
        ctx.fill();
        if (g.save.stats.systems[st.id]) {
          ctx.strokeStyle = '#7dffb0';
          ctx.strokeRect(px - 6, py - 6, 12, 12);
        }
        if (st.faction) {
          ctx.fillStyle = FACTIONS[st.faction].color;
          ctx.fillRect(px + 5, py - 1, 3, 3);
        }
        if (mark?.warp === st.name || st.story) {
          ctx.fillStyle = mark?.warp === st.name ? '#ffd23e' : 'rgba(255,255,255,0.6)';
          ctx.font = '11px sans-serif';
          ctx.fillText(st.name, px + 9, py + 4);
        }
        if (sel?.id === st.id) {
          ctx.strokeStyle = '#ffd23e';
          ctx.beginPath();
          ctx.arc(px, py, 9, 0, 6.3);
          ctx.stroke();
        }
      }
    ctx.strokeStyle = '#fff';
    ctx.beginPath();
    ctx.arc(c.width / 2, c.height / 2, 7, 0, 6.3);
    ctx.stroke();
    c.onclick = (e) => {
      const r = c.getBoundingClientRect();
      const mx = ((e.clientX - r.left) / r.width) * c.width;
      const my = ((e.clientY - r.top) / r.height) * c.height;
      let best = null;
      let bd = 18;
      for (const s2 of stars) {
        const dd = Math.hypot(s2.px - mx, s2.py - my);
        if (dd < bd) {
          bd = dd;
          best = s2.st;
        }
      }
      if (best) {
        this.gsel = best;
        this.openGalaxy();
      }
    };
  }

  openPause() {
    const s = this.game.save.settings;
    this.show('pause', `${this.head('Paused')}<div class="body"><div class="row"><button class="btn ok" data-act="close">Resume</button><button class="btn" data-act="journal">Journal</button><button class="btn" data-act="save">Save game</button><button class="btn" data-act="quit">Quit to title</button></div>
      <h3>Settings</h3>
      <label class="set">Graphics <select data-set="quality">${['low', 'medium', 'high', 'ultra'].map((k) => `<option ${s.quality === k ? 'selected' : ''}>${k}</option>`).join('')}</select><small>applies after reload</small></label>
      <label class="set">Volume <input type="range" min="0" max="100" value="${Math.round(s.volume * 100)}" data-set="volume"></label>
      <label class="set"><input type="checkbox" data-set="music" ${s.music ? 'checked' : ''}> Music</label>
      <label class="set"><input type="checkbox" data-set="invertY" ${s.invertY ? 'checked' : ''}> Invert look Y</label>
      <h3>Controls</h3>
      <div class="keys"><span><kbd>WASD</kbd> move</span><span><kbd>Mouse</kbd> look</span><span><kbd>Space</kbd> jump / jetpack</span><span><kbd>Shift</kbd> run / boost</span><span><kbd>LMB</kbd> mine / fire</span><span><kbd>Q</kbd> switch tool</span><span><kbd>F</kbd> scanner</span><span><kbd>E</kbd> interact</span><span><kbd>V</kbd> first / third person</span><span><kbd>Tab</kbd> inventory</span><span><kbd>J</kbd> journal</span><span><kbd>H</kbd> med gel</span><span><kbd>G</kbd> land ship</span><span><kbd>A D</kbd> roll ship</span><span><kbd>X</kbd> cut throttle</span><span><kbd>M</kbd> galaxy map</span></div></div>`);
    this.el.panel.querySelectorAll('[data-set]').forEach((el) => el.addEventListener('input', () => {
      const k = el.dataset.set;
      s[k] = el.type === 'checkbox' ? el.checked : el.type === 'range' ? Number(el.value) / 100 : el.value;
      this.game.audio?.apply(s);
      this.game.persist();
    }));
  }

  endingChoice(cb) {
    this.show('ending', `<h2>The Gate is listening</h2><p>Three shards hum in your hands. The ring could close forever, or open to whatever waits beyond the Silence.</p><div class="row"><button class="btn ok" data-act="end" data-arg="seal">Seal the Gate</button><button class="btn" data-act="end" data-arg="open">Open the Gate</button></div>`);
    this.endCb = cb;
  }

  ending(e, s) {
    this.show('ending', `<h2>${esc(e.title)}</h2><p>${esc(e.text)}</p><p class="muted">Worlds discovered ${Object.keys(s.stats.planets).length} · Warps ${s.stats.jumps} · Time ${Math.round(s.stats.playTime / 60)} min</p><div class="row"><button class="btn ok" data-act="close">Keep exploring</button></div>`);
  }

  showTitle(hasSave, onPlay, onNew) {
    this.titleOn = true;
    this.el.title.className = 'on';
    this.el.title.innerHTML = `<div class="logo"><b>SPACE MINER</b><span>BEYOND THE SILENCE</span></div><div class="menu">${hasSave ? '<button class="btn ok big" data-act="t-continue">Continue</button><button class="btn big" data-act="t-new">New game</button>' : '<button class="btn ok big" data-act="t-continue">Begin</button>'}</div><p>Click to capture the mouse · Esc to pause</p>`;
    this.titleCb = { onPlay, onNew };
  }

  action(act, arg, arg2, el) {
    const g = this.game;
    const s = g?.save;
    const again = () => (this.shopKind && (this.open === 'shop' || this.open === 'station') ? this.renderShop(this.open) : null);
    const res = (r) => {
      if (!r.ok) this.toast(r.reason, 'warn');
      else g.audio?.play('buy');
      again();
      g.persist();
    };
    switch (act) {
      case 'close': return this.close();
      case 'dlg-next': return this.dlg.next();
      case 'dlg-opt': return this.dlg.opt(Number(arg));
      case 'tab': this.tab = arg; return again();
      case 'buy': return res(buy(s, arg, Number(arg2), g.sys.sys));
      case 'sell': return res(sell(s, arg, Number(arg2), g.sys.sys));
      case 'upgrade': return res(buyUpgrade(s, arg));
      case 'look': {
        const r = setCosmetic(s, arg, arg2);
        if (r.ok) {
          g.player.buildModels();
          if (g.surface) g.player.attach(g.surface.pl.body.group);
          g.ship.rebuild();
        }
        return res(r);
      }
      case 'craft': {
        const r = craft(s, arg);
        if (!r.ok) this.toast(r.reason, 'warn');
        else g.audio?.play('buy');
        return this.openInventory();
      }
      case 'envoy': g.story('talk', { role: 'envoy' }); return again();
      case 'galaxy': this.open = null; return this.openGalaxy();
      case 'journal': return this.openJournal();
      case 'warp': {
        const id = this.gsel.id;
        this.gsel = null;
        const wasDocked = g.ship.state === 'docked';
        if (wasDocked) g.undock();
        const r = g.warp(id);
        if (!r.ok) return this.toast(r.reason, 'warn');
        this.open = 'galaxy';
        return this.close();
      }
      case 'save': g.persist(); return this.toast('Game saved', 'good');
      case 'quit': g.persist(); return location.reload();
      case 'end': {
        const cb = this.endCb;
        this.open = null;
        this.game.paused = false;
        return cb(arg);
      }
      case 't-continue':
      case 't-new': {
        this.titleOn = false;
        this.el.title.className = '';
        return act === 't-new' ? this.titleCb.onNew() : this.titleCb.onPlay();
      }
    }
    void el;
  }
}
