// AudioManager: every sound is synthesized with Web Audio (no files).
// Continuous loops for the laser and engine, one-shots for events, and a
// slow ambient pad. Starts on the first user gesture (browser policy).
const PENTA = [0, 3, 5, 7, 10, 12, 15];

export class AudioManager {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.last = {};
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return;
    }
    const c = this.ctx;
    this.master = c.createGain();
    this.master.connect(c.destination);
    this.sfx = c.createGain();
    this.sfx.connect(this.master);
    this.music = c.createGain();
    this.music.connect(this.master);
    this.noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.buildLoops();
    this.buildAmbient();
    this.applySettings();
  }

  applySettings() {
    if (!this.ctx) return;
    const s = this.settings;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.muted ? 0 : s.volume * 0.9, t, 0.05);
    this.music.gain.setTargetAtTime(s.music ? 0.5 : 0, t, 0.3);
  }

  noise() {
    const n = this.ctx.createBufferSource();
    n.buffer = this.noiseBuf;
    n.loop = true;
    return n;
  }

  buildLoops() {
    const c = this.ctx;
    // Laser: two detuned saws through a wobbling lowpass.
    this.laserGain = c.createGain();
    this.laserGain.gain.value = 0;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1400;
    f.Q.value = 6;
    const o1 = c.createOscillator();
    o1.type = 'sawtooth';
    o1.frequency.value = 110;
    const o2 = c.createOscillator();
    o2.type = 'square';
    o2.frequency.value = 220.7;
    const g2 = c.createGain();
    g2.gain.value = 0.3;
    const lfo = c.createOscillator();
    lfo.frequency.value = 13;
    const lfoG = c.createGain();
    lfoG.gain.value = 500;
    lfo.connect(lfoG).connect(f.frequency);
    o1.connect(f);
    o2.connect(g2).connect(f);
    f.connect(this.laserGain).connect(this.sfx);
    [o1, o2, lfo].forEach((o) => o.start());
    this.laserFilter = f;
    this.laserOsc = o1;

    // Engine: filtered noise rumble.
    this.engineGain = c.createGain();
    this.engineGain.gain.value = 0;
    const ef = c.createBiquadFilter();
    ef.type = 'lowpass';
    ef.frequency.value = 300;
    const n = this.noise();
    n.connect(ef).connect(this.engineGain).connect(this.sfx);
    n.start();
    this.engineFilter = ef;
  }

  buildAmbient() {
    const c = this.ctx;
    const pad = c.createGain();
    pad.gain.value = 0.05;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 500;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.05;
    const lg = c.createGain();
    lg.gain.value = 300;
    lfo.connect(lg).connect(f.frequency);
    lfo.start();
    for (const [freq, type] of [[55, 'sine'], [82.4, 'triangle'], [110.3, 'sine'], [164.8, 'triangle']]) {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      o.detune.value = (Math.random() - 0.5) * 12;
      o.connect(f);
      o.start();
    }
    const wind = this.noise();
    const wf = c.createBiquadFilter();
    wf.type = 'bandpass';
    wf.frequency.value = 700;
    wf.Q.value = 0.7;
    const wg = c.createGain();
    wg.gain.value = 0.012;
    wind.connect(wf).connect(wg).connect(this.music);
    wind.start();
    f.connect(pad).connect(this.music);
    this.startMusic();
  }

  // ---------------------------------------------------------- music
  // A 16-step sequencer in A minor (Am F C G). Layers come in with the
  // action: 0 = drifting arpeggio, 1 = combat (bass, kick, hats),
  // 2 = boss (faster, snare, lead).
  setIntensity(n) {
    this.intensity = n;
  }

  startMusic() {
    this.step = 0;
    this.intensity = 0;
    this.nextT = this.ctx.currentTime + 0.2;
    const tick = () => {
      if (!this.ctx) return;
      const bpm = this.intensity === 2 ? 132 : this.intensity === 1 ? 112 : 84;
      const dur = 60 / bpm / 4;
      if (this.nextT < this.ctx.currentTime) this.nextT = this.ctx.currentTime + 0.05;
      while (this.nextT < this.ctx.currentTime + 0.25) {
        if (this.settings.music && !this.settings.muted && this.ctx.state === 'running') this.playStep(this.step, this.nextT - this.ctx.currentTime, dur);
        this.nextT += dur;
        this.step++;
      }
      setTimeout(tick, 70);
    };
    tick();
  }

  noiseAt(start, dur, gain, freq, type) {
    const c = this.ctx;
    const t = c.currentTime + start;
    const n = this.noise();
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(f).connect(g).connect(this.music);
    n.start(t);
    n.stop(t + dur + 0.05);
  }

  playStep(i, at, dur) {
    const L = this.intensity;
    const s = i % 16;
    const chord = [[0, 3, 7], [-4, 0, 3], [3, 7, 10], [-2, 2, 5]][Math.floor(i / 16) % 4];
    const hz = (semi, base = 220) => base * Math.pow(2, semi / 12);
    // Arpeggio: always there, busier in combat.
    if (s % (L ? 2 : 4) === 0) {
      const n = chord[(s / (L ? 2 : 4)) % 3] + (s % 8 === 4 ? 12 : 0);
      this.tone(hz(n, L === 2 ? 440 : 220), at, L ? dur * 2.2 : dur * 7, L ? 'triangle' : 'sine', L ? 0.045 : 0.05, this.music);
    }
    if (L === 0) {
      if (s === 0) this.tone(hz(chord[0], 110), at, dur * 15, 'sine', 0.06, this.music);
      return;
    }
    // Bass.
    if ([0, 3, 6, 8, 11, 14].includes(s)) this.tone(hz(chord[0], 55), at, dur * 1.6, 'sawtooth', 0.09, this.music);
    // Kick.
    if (s % (L === 2 ? 4 : 8) === 0) this.tone(130, at, 0.16, 'sine', 0.3, this.music, 38);
    // Hats.
    if (L === 2 || s % 2 === 1) this.noiseAt(at, 0.04, s % 4 === 2 ? 0.05 : 0.025, 7000, 'highpass');
    if (L === 2) {
      // Snare and a lead riff.
      if (s === 4 || s === 12) this.noiseAt(at, 0.16, 0.14, 1800, 'bandpass');
      const riff = [0, null, 7, 5, null, 3, 5, null, 0, null, 10, 7, null, 5, 3, null][s];
      if (riff !== null) this.tone(hz(riff, 440), at, dur * 1.4, 'square', 0.028, this.music);
    }
  }

  tone(freq, start, dur, type = 'square', gain = 0.05, bus = this.sfx, slideTo) {
    const c = this.ctx;
    const t = c.currentTime + start;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  burst(dur, gain, freq, type = 'lowpass', slide) {
    const c = this.ctx;
    const t = c.currentTime;
    const n = this.noise();
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (slide) f.frequency.exponentialRampToValueAtTime(slide, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(f).connect(g).connect(this.sfx);
    n.start(t);
    n.stop(t + dur + 0.05);
  }

  throttle(name, gap) {
    const now = performance.now();
    if (now - (this.last[name] || 0) < gap) return false;
    this.last[name] = now;
    return true;
  }

  play(name, data = {}) {
    if (!this.ctx || this.settings.muted) return;
    switch (name) {
      case 'click':
        this.tone(660, 0, 0.05, 'square', 0.03);
        break;
      case 'deny':
        this.tone(160, 0, 0.15, 'sawtooth', 0.05);
        this.tone(120, 0.06, 0.15, 'sawtooth', 0.04);
        break;
      case 'explode':
        if (!this.throttle('explode', 60)) return;
        this.burst(0.5 + (data.r || 10) / 60, 0.35, 1800, 'lowpass', 80);
        this.tone(90, 0, 0.35, 'sine', 0.25, this.sfx, 40);
        break;
      case 'collect': {
        if (!this.throttle('collect', 45)) return;
        const base = { iron: 660, copper: 740, silicon: 830, nickel: 990, crystal: 1320, credits: 1100 }[data.res] || 700;
        this.tone(base, 0, 0.08, 'square', 0.03);
        this.tone(base * 1.5, 0.05, 0.1, 'square', 0.025);
        break;
      }
      case 'sold':
        [0, 4, 7, 12, 16].forEach((s, i) => this.tone(880 * Math.pow(2, s / 12), i * 0.05, 0.14, 'square', 0.035));
        break;
      case 'upgrade':
        [0, 7, 12, 19].forEach((s, i) => this.tone(330 * Math.pow(2, s / 12), i * 0.06, 0.2, 'triangle', 0.07));
        this.burst(0.3, 0.06, 3000, 'highpass');
        break;
      case 'mission':
        [0, 4, 7].forEach((s) => this.tone(523 * Math.pow(2, s / 12), 0, 0.6, 'triangle', 0.06));
        [12, 16, 19].forEach((s) => this.tone(523 * Math.pow(2, s / 12), 0.15, 0.6, 'triangle', 0.045));
        break;
      case 'levelUp':
        [0, 4, 7, 12, 7, 12, 16, 19].forEach((s, i) => this.tone(392 * Math.pow(2, s / 12), i * 0.08, 0.22, 'square', 0.04));
        break;
      case 'rare':
        [0, 7, 12, 16, 19, 24].forEach((s, i) => this.tone(1046 * Math.pow(2, s / 12), i * 0.06, 0.3, 'sine', 0.05));
        break;
      case 'achievement':
        [0, 4, 7, 11, 12].forEach((s, i) => this.tone(659 * Math.pow(2, s / 12), i * 0.09, 0.4, 'triangle', 0.06));
        break;
      case 'hurt':
        if (!this.throttle('hurt', 120)) return;
        this.burst(0.2, 0.25, 900, 'bandpass');
        this.tone(140, 0, 0.15, 'sawtooth', 0.08, this.sfx, 70);
        break;
      case 'pulse':
        this.tone(900, 0, 0.6, 'sawtooth', 0.08, this.sfx, 60);
        this.burst(0.6, 0.2, 4000, 'lowpass', 200);
        break;
      case 'zap':
        if (!this.throttle('zap', 80)) return;
        this.tone(1400, 0, 0.12, 'square', 0.025, this.sfx, 300);
        break;
      case 'alert':
        this.tone(740, 0, 0.18, 'square', 0.05);
        this.tone(554, 0.2, 0.25, 'square', 0.05);
        break;
      case 'warp':
        this.tone(100, 0, 1.2, 'sawtooth', 0.08, this.sfx, 1600);
        this.burst(1.2, 0.15, 200, 'bandpass', 5000);
        break;
      case 'dock':
        this.tone(440, 0, 0.12, 'triangle', 0.06);
        this.tone(660, 0.1, 0.18, 'triangle', 0.06);
        break;
      case 'undock':
        this.tone(660, 0, 0.12, 'triangle', 0.06);
        this.tone(440, 0.1, 0.18, 'triangle', 0.06);
        break;
      case 'shoot': {
        if (!this.throttle('shoot', 40)) return;
        const w = data.weapon;
        if (w === 'scatter') {
          this.burst(0.12, 0.12, 2500, 'bandpass', 500);
          this.tone(300, 0, 0.1, 'square', 0.05, this.sfx, 120);
        } else if (w === 'missiles') {
          this.burst(0.35, 0.1, 800, 'lowpass', 3000);
          this.tone(200, 0, 0.3, 'sawtooth', 0.04, this.sfx, 500);
        } else if (w === 'rail') {
          this.tone(2400, 0, 0.25, 'sawtooth', 0.07, this.sfx, 200);
          this.burst(0.3, 0.15, 6000, 'highpass');
        } else {
          this.tone(1200 + Math.random() * 100, 0, 0.07, 'square', 0.03, this.sfx, 500);
        }
        break;
      }
      case 'kill':
        if (!this.throttle('kill', 50)) return;
        this.burst(data.boss ? 2 : 0.35, data.boss ? 0.5 : 0.25, data.boss ? 900 : 2200, 'lowpass', 60);
        this.tone(data.boss ? 60 : 140, 0, data.boss ? 1.5 : 0.25, 'sine', 0.25, this.sfx, 30);
        if (data.combo >= 2) this.tone(600 + Math.min(10, data.combo) * 80, 0.05, 0.1, 'square', 0.04);
        break;
      case 'blast':
        this.burst(0.4, 0.25, 1500, 'lowpass', 80);
        break;
      case 'enemyShot':
        if (!this.throttle('eshot', 90)) return;
        this.tone(data.boss ? 300 : 500, 0, 0.15, 'triangle', 0.03, this.sfx, 150);
        break;
      case 'alarm':
        [0, 0.25].forEach((t) => this.tone(880, t, 0.18, 'square', 0.05, this.sfx, 600));
        break;
      case 'victory':
        [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => this.tone(392 * Math.pow(2, s / 12), i * 0.07, 0.3, 'square', 0.04));
        break;
      case 'dash':
        this.burst(0.25, 0.12, 600, 'bandpass', 4000);
        break;
      case 'powerup':
        [0, 5, 12, 17].forEach((n, i) => this.tone(660 * Math.pow(2, n / 12), i * 0.05, 0.25, 'square', 0.05));
        break;
      case 'bossIntro':
        this.tone(55, 0, 2.2, 'sawtooth', 0.22, this.sfx, 41);
        this.tone(82, 0.1, 2, 'square', 0.08, this.sfx, 62);
        this.burst(2, 0.12, 300, 'lowpass', 2000);
        break;
      case 'crit':
        if (!this.throttle('crit', 60)) return;
        this.tone(1800, 0, 0.08, 'square', 0.04, this.sfx, 2600);
        break;
      case 'bump':
        if (!this.throttle('bump', 150)) return;
        this.tone(80, 0, 0.2, 'sine', 0.2, this.sfx, 50);
        break;
    }
  }

  // Called every frame with continuous state.
  update(ship, quiet) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (quiet) {
      this.laserGain.gain.setTargetAtTime(0, t, 0.03);
      this.engineGain.gain.setTargetAtTime(0, t, 0.05);
      return;
    }
    const laser = ship.laser ? (ship.laser.hit ? 0.06 : 0.035) : 0;
    this.laserGain.gain.setTargetAtTime(laser, t, 0.03);
    if (ship.laser) this.laserOsc.frequency.setTargetAtTime(ship.laser.hit ? 98 + Math.random() * 6 : 120, t, 0.05);
    const eng = ship.thrusting ? (ship.boosting ? 0.16 : 0.08) * ship.thrusting : 0;
    this.engineGain.gain.setTargetAtTime(eng, t, 0.08);
    this.engineFilter.frequency.setTargetAtTime(ship.boosting ? 900 : 320, t, 0.1);
  }

  handleFx(events) {
    for (const e of events) {
      const map = {
        explode: 'explode',
        collect: 'collect',
        sold: 'sold',
        upgrade: 'upgrade',
        droneDeployed: 'upgrade',
        shipBought: 'levelUp',
        mission: 'mission',
        levelUp: 'levelUp',
        discover: 'rare',
        achievement: 'achievement',
        hurt: 'hurt',
        pulse: 'pulse',
        shoot: 'shoot',
        dash: 'dash',
        powerup: 'powerup',
        bossIntro: 'bossIntro',
        enrage: 'alarm',
        sectorCleared: 'victory',
        gameWon: 'victory',
        perk: 'upgrade',
        kill: 'kill',
        blast: 'blast',
        enemyShot: 'enemyShot',
        patrol: 'alarm',
        wave: 'alarm',
        victory: 'victory',
        weaponBought: 'levelUp',
        eventStart: 'alert',
        warp: 'warp',
        dock: 'dock',
        undock: 'undock',
        bump: 'bump',
        shipDestroyed: 'explode',
        salvage: 'rare',
        denied: 'deny',
      };
      if (e.type === 'enemyHit' && e.crit) this.play('crit');
      if (e.type === 'hiveDown') this.play('kill', { boss: true });
      if (map[e.type]) this.play(map[e.type], e);
    }
  }
}
