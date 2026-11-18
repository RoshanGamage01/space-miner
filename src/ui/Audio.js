// Audio: everything is synthesized with Web Audio. Sound effects, engine and
// wind loops that follow what you are doing, and a slow generative score.
export class Audio {
  constructor(settings) {
    this.s = settings;
    this.ctx = null;
    this.last = {};
    const unlock = () => this.unlock();
    addEventListener('pointerdown', unlock);
    addEventListener('keydown', unlock);
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
    this.mus = c.createGain();
    this.mus.connect(this.master);
    this.buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = this.buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const loop = (freq, type, q = 0.7) => {
      const n = c.createBufferSource();
      n.buffer = this.buf;
      n.loop = true;
      const f = c.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = c.createGain();
      g.gain.value = 0;
      n.connect(f).connect(g).connect(this.sfx);
      n.start();
      return { f, g };
    };
    this.wind = loop(500, 'bandpass', 0.5);
    this.engine = loop(140, 'lowpass', 1);
    this.beam = c.createOscillator();
    this.beam.type = 'sawtooth';
    this.beam.frequency.value = 180;
    this.beamG = c.createGain();
    this.beamG.gain.value = 0;
    const bf = c.createBiquadFilter();
    bf.type = 'lowpass';
    bf.frequency.value = 1500;
    this.beam.connect(bf).connect(this.beamG).connect(this.sfx);
    this.beam.start();
    this.apply(this.s);
    this.score();
  }

  apply(s) {
    this.s = s;
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(s.volume, this.ctx.currentTime, 0.05);
    this.mus.gain.setTargetAtTime(s.music ? 0.55 : 0, this.ctx.currentTime, 0.3);
  }

  tone(freq, at, dur, type = 'sine', gain = 0.05, bus = this.sfx, slide) {
    const c = this.ctx;
    const t = c.currentTime + at;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.02, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noise(dur, gain, freq, type = 'lowpass', slide) {
    const c = this.ctx;
    const t = c.currentTime;
    const n = c.createBufferSource();
    n.buffer = this.buf;
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

  play(name) {
    if (!this.ctx) return;
    const now = performance.now();
    const gap = { mine: 140, hit: 60, bolt: 50, shipBolt: 60, enemyShot: 90, hurt: 150 }[name] || 0;
    if (now - (this.last[name] || 0) < gap) return;
    this.last[name] = now;
    const T = (...a) => this.tone(...a);
    switch (name) {
      case 'click': T(700, 0, 0.05, 'square', 0.03); break;
      case 'mine': T(900 + Math.random() * 500, 0, 0.07, 'triangle', 0.035); break;
      case 'break': this.noise(0.35, 0.25, 2200, 'lowpass', 150); T(120, 0, 0.3, 'sine', 0.2, this.sfx, 50); break;
      case 'bolt': T(1300, 0, 0.11, 'square', 0.04, this.sfx, 320); break;
      case 'shipBolt': T(900, 0, 0.16, 'sawtooth', 0.05, this.sfx, 180); break;
      case 'enemyShot': T(500, 0, 0.16, 'square', 0.03, this.sfx, 160); break;
      case 'bossShot': T(220, 0, 0.4, 'sawtooth', 0.08, this.sfx, 70); break;
      case 'hit': T(240, 0, 0.06, 'square', 0.05); break;
      case 'kill': this.noise(0.4, 0.3, 1800, 'lowpass', 90); T(160, 0, 0.3, 'sine', 0.2, this.sfx, 40); break;
      case 'bossDown': this.noise(2.4, 0.5, 900, 'lowpass', 50); T(70, 0, 2, 'sine', 0.3, this.sfx, 30); break;
      case 'hurt': this.noise(0.18, 0.25, 800, 'bandpass'); T(130, 0, 0.16, 'sawtooth', 0.08, this.sfx, 60); break;
      case 'death': T(300, 0, 1.4, 'sawtooth', 0.12, this.sfx, 40); break;
      case 'jump': T(260, 0, 0.12, 'sine', 0.05, this.sfx, 420); break;
      case 'pickup': [0, 7, 12].forEach((s, i) => T(660 * 2 ** (s / 12), i * 0.06, 0.16, 'triangle', 0.05)); break;
      case 'buy': [0, 4, 7].forEach((s, i) => T(520 * 2 ** (s / 12), i * 0.05, 0.14, 'triangle', 0.05)); break;
      case 'quest': [0, 4, 7, 12].forEach((s, i) => T(440 * 2 ** (s / 12), i * 0.09, 0.5, 'triangle', 0.06)); break;
      case 'scan': T(400, 0, 0.7, 'sine', 0.07, this.sfx, 2400); break;
      case 'repair': [0, 5, 9, 12, 17].forEach((s, i) => T(330 * 2 ** (s / 12), i * 0.08, 0.3, 'square', 0.04)); break;
      case 'board': T(220, 0, 0.3, 'sine', 0.08, this.sfx, 440); break;
      case 'takeoff': this.noise(1.6, 0.25, 200, 'lowpass', 2400); break;
      case 'land': this.noise(1.8, 0.2, 2000, 'lowpass', 150); break;
      case 'dock': T(440, 0, 0.2, 'triangle', 0.07); T(660, 0.18, 0.3, 'triangle', 0.07); break;
      case 'warp': T(80, 0, 1.6, 'sawtooth', 0.12, this.sfx, 2400); this.noise(1.6, 0.25, 200, 'bandpass', 6000); break;
      case 'alarm': [0, 0.25, 0.5].forEach((t) => T(880, t, 0.16, 'square', 0.06, this.sfx, 620)); break;
      case 'boss': T(55, 0, 2.6, 'sawtooth', 0.22, this.sfx, 40); T(82, 0.1, 2.2, 'square', 0.08, this.sfx, 60); break;
    }
  }

  // A slow generative score in D minor pentatonic.
  score() {
    const notes = [0, 3, 5, 7, 10, 12, 15, 17];
    const step = () => {
      if (!this.ctx) return;
      if (this.ctx.state === 'running' && this.s.music) {
        const base = this.tension ? 110 : 146.83;
        const n = notes[Math.floor(Math.random() * notes.length)];
        this.tone(base * 2 ** (n / 12), 0, 3.5, 'sine', 0.04, this.mus);
        if (Math.random() < 0.5) this.tone(base * 2 ** ((n + 7) / 12), 0.3, 3, 'sine', 0.025, this.mus);
        if (Math.random() < 0.35) this.tone((base / 2) * 2 ** (notes[Math.floor(Math.random() * 3)] / 12), 0, 6, 'triangle', 0.05, this.mus);
        if (this.tension) this.tone(55, 0, 0.5, 'sawtooth', 0.05, this.mus, 50);
      }
      setTimeout(step, this.tension ? 900 + Math.random() * 600 : 2200 + Math.random() * 2600);
    };
    step();
  }

  frame(game) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const env = game.env;
    const foot = game.mode === 'foot';
    const ship = game.ship;
    const quiet = game.paused ? 0 : 1;
    const speed = foot ? game.player.speed || 0 : ship.speed || 0;
    this.wind.g.gain.setTargetAtTime(quiet * env.inAtmo * (0.03 + Math.min(0.12, speed * 0.0006)), t, 0.3);
    this.wind.f.frequency.setTargetAtTime(350 + Math.min(1500, speed * 4), t, 0.3);
    const eng = !foot && ship.state === 'flying' ? 0.05 + ship.throttle * 0.14 + (ship.pulsing ? 0.12 : 0) : 0;
    this.engine.g.gain.setTargetAtTime(quiet * eng, t, 0.15);
    this.engine.f.frequency.setTargetAtTime(110 + ship.throttle * 260 + (ship.pulsing ? 500 : 0), t, 0.2);
    const beam = foot && game.player.beamOn ? 0.035 : foot && game.player.jetting ? 0.02 : 0;
    this.beamG.gain.setTargetAtTime(quiet * beam, t, 0.03);
    this.beam.frequency.setTargetAtTime(game.player.beamOn ? (game.player.target ? 150 + Math.random() * 20 : 190) : 70, t, 0.05);
    this.tension = !!game.boss && !game.boss.dead ? true : ship.pirates.length > 0 || (game.actors?.list.some((a) => a.hostile && a.alert > 0) ?? false);
  }
}
