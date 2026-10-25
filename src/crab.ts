// A crab that scuttles in along the sand now and then, wanders back and forth a few times with
// pauses to snap its claws, then leaves. Touch it and you get pinched, unless you're big enough
// to eat it. It keeps the bottom of the screen from being a safe place to hide, like the hook
// does for the top.

import type { Timing } from "./settings";

/** On Medium; settings.ts has the others. Gap is from one leaving to the next arriving. */
export const CRAB_TIMING: Timing = { first: [20, 40], gap: [25, 50] };
const STOPS = [2, 4]; // how many times it stops before heading off (whole numbers)
const PAUSE = [0.8, 2]; // seconds per stop
const SPEED = 100; // px/s, scuttling
const SCALE = 1.4; // the shapes below are drawn at 1:1
const MARGIN = 60 * SCALE; // starts and ends this far off screen
const FEET = 12; // px up from the bottom of the screen: along the front of the sand, so you can't slip underneath

function between([min, max]: number[]): number {
  return min + Math.random() * (max - min);
}

export class Crab {
  private W = 0;
  private H = 0;
  private x = 0;
  private target = 0;
  private phase: "idle" | "walk" | "pause" = "idle";
  private timing: Timing | null = CRAB_TIMING;
  private timer = between(CRAB_TIMING.first); // idle: until it arrives; pause: until it walks on
  private stops = 0; // left before it heads off
  private stride = 0; // leg animation, advancing as it walks
  private clock = 0;

  resize(W: number, H: number): void {
    this.W = W;
    this.H = H;
  }

  /** Start over with no crab about. With no timing, none comes at all. */
  reset(timing: Timing | null = CRAB_TIMING): void {
    this.timing = timing;
    this.phase = "idle";
    this.timer = timing ? between(timing.first) : Infinity;
  }

  update(dt: number): void {
    this.clock += dt;
    if (this.phase === "idle") {
      this.timer -= dt;
      if (this.timer > 0) return;
      const fromLeft = Math.random() < 0.5;
      this.x = fromLeft ? -MARGIN : this.W + MARGIN;
      this.stops = Math.floor(between([STOPS[0], STOPS[1] + 1]));
      this.target = this.W * (fromLeft ? between([0.2, 0.45]) : between([0.55, 0.8]));
      this.phase = "walk";
    } else if (this.phase === "walk") {
      const step = SPEED * dt;
      this.stride += step;
      if (Math.abs(this.target - this.x) > step) {
        this.x += Math.sign(this.target - this.x) * step;
        return;
      }
      this.x = this.target;
      if (this.x < -MARGIN / 2 || this.x > this.W + MARGIN / 2) {
        this.phase = "idle"; // gone
        this.timer = this.nextVisit();
      } else {
        this.phase = "pause";
        this.timer = between(PAUSE);
      }
    } else {
      this.timer -= dt;
      if (this.timer > 0) return;
      this.phase = "walk";
      const goRight = this.x < this.W / 2; // back and forth across the middle
      if (this.stops-- > 0) this.target = this.W * (goRight ? between([0.6, 0.85]) : between([0.15, 0.4]));
      else this.target = goRight ? this.W + MARGIN : -MARGIN;
    }
  }

  /** Stop and snap its claws over its catch for a moment. */
  pinch(): void {
    this.phase = "pause";
    this.timer = 2;
  }

  /** Eaten: gone until the next one. */
  eaten(): void {
    this.phase = "idle";
    this.timer = this.nextVisit();
  }

  private nextVisit(): number {
    return this.timing ? between(this.timing.gap) : Infinity;
  }

  /** The body and claws as a horizontal capsule, or null when there's no crab about. */
  hitbox(): { x0: number; x1: number; y: number; radius: number } | null {
    if (this.phase === "idle") return null;
    // low and wide enough to reach the bottom of the screen; the claw tips don't count
    const y = this.H - FEET - 14 * SCALE;
    return { x0: this.x - 24 * SCALE, x1: this.x + 24 * SCALE, y, radius: 20 * SCALE };
  }

  /** Side-on cartoon crab: round shell, eyes on stalks, legs, and two big snapping claws. */
  draw(ctx: CanvasRenderingContext2D): void {
    if (this.phase === "idle") return;
    const walking = this.phase === "walk";
    const shell = "#e0482f";
    const dark = "#8a2214";
    ctx.save();
    ctx.translate(this.x, this.H - FEET);
    ctx.scale(SCALE, SCALE);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // legs: three a side, in two segments, stepping in turn while it walks
    ctx.strokeStyle = dark;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const lift = walking ? Math.max(0, Math.sin(this.stride * 0.12 + i * 2.1 + side)) * 6 : 0;
        const hipX = side * (8 + i * 5);
        const footX = side * (20 + i * 7);
        ctx.moveTo(hipX, -14);
        ctx.lineTo(side * (16 + i * 7), -22 - lift);
        ctx.lineTo(footX, -lift);
      }
    }
    ctx.stroke();

    // eyes on stalks
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (const side of [-1, 1]) {
      ctx.moveTo(side * 5, -26);
      ctx.lineTo(side * 7, -37);
    }
    ctx.stroke();
    for (const side of [-1, 1]) {
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(side * 7, -39, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#111";
      ctx.beginPath();
      ctx.arc(side * 7 + Math.sin(this.clock * 1.7) * 1.2, -39, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // shell, lighter on top
    const g = ctx.createLinearGradient(0, -32, 0, -6);
    g.addColorStop(0, "#f2735a");
    g.addColorStop(1, shell);
    ctx.fillStyle = g;
    ctx.strokeStyle = dark;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, -18, 23, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // grumpy little mouth
    ctx.beginPath();
    ctx.moveTo(-5, -11);
    ctx.quadraticCurveTo(0, -14, 5, -11);
    ctx.stroke();

    // claws, raised; they snap whenever it stops
    const snap = walking ? 0.25 : 0.25 + Math.abs(Math.sin(this.clock * 9)) * 0.45;
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.scale(side, 1);
      ctx.strokeStyle = dark;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(18, -22);
      ctx.quadraticCurveTo(28, -24, 30, -34);
      ctx.stroke();
      ctx.translate(31, -38);
      ctx.fillStyle = shell;
      ctx.lineWidth = 2;
      // lower pincer, fixed
      ctx.beginPath();
      ctx.moveTo(-4, 4);
      ctx.quadraticCurveTo(10, 6, 12, -6);
      ctx.quadraticCurveTo(4, -2, -4, -2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // upper pincer, opening and closing
      ctx.rotate(-snap);
      ctx.beginPath();
      ctx.moveTo(-4, -2);
      ctx.quadraticCurveTo(0, -14, 13, -8);
      ctx.quadraticCurveTo(4, -4, -4, 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }
}
