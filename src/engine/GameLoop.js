// GameLoop: requestAnimationFrame driver with a fixed-step simulation
// accumulator, so gameplay is identical at 30, 60 or 144 Hz.
import { SIM_STEP } from '../core/config.js';

const MAX_STEPS = 6; // never spiral after a long frame

export class GameLoop {
  constructor({ update, render }) {
    this.update = update;
    this.render = render;
    this.acc = 0;
    this.last = 0;
    this.running = false;
    this.frame = this.frame.bind(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this.frame);
  }

  stop() {
    this.running = false;
  }

  frame(now) {
    if (!this.running) return;
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.acc += dt;
    let steps = 0;
    while (this.acc >= SIM_STEP && steps < MAX_STEPS) {
      this.update(SIM_STEP);
      this.acc -= SIM_STEP;
      steps++;
    }
    if (steps === MAX_STEPS) this.acc = 0;
    this.render(dt);
    requestAnimationFrame(this.frame);
  }
}
