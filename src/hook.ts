// A fishing line that's lowered from the surface now and then. Bite the hook and you get reeled
// up and out of the water, unless you're big enough to bite straight through the line. Once it's
// dangled a while, it waits for some other fish to take the bait and reels that one in instead.

import type { Fish } from "./fish";

const FIRST = [15, 30]; // seconds before the first one drops (min, max)
const GAP = [25, 45]; // seconds between one leaving and the next dropping
const WAIT = [6, 12]; // how long it dangles before it starts waiting for a bite
const LURK_MAX = 12; // then how long it waits for some other fish before giving up
const CATCH_RADIUS = [15, 90]; // smaller fish wouldn't show on the hook; bigger are too much for it
const TACKLE_SCALE = 1.6; // hook, sinker and worm size; the shapes below are drawn at 1:1
const DROP_SPEED = 150; // px/s, slowing as it nears its depth
const REEL_SPEED = 340; // px/s at full speed

function between([min, max]: number[]): number {
  return min + Math.random() * (max - min);
}

export class Hook {
  private W = 0;
  private H = 0;
  private x = 0;
  private y = 0; // the hook's eye
  private depth = 0; // where it stops on the way down
  private phase: "idle" | "drop" | "wait" | "reel" = "idle";
  private timer = between(FIRST); // idle: until it drops; wait: until reeled; reel: time reeling
  private seed = 0;
  private snapped = false; // bitten off: the line goes up empty
  private lurking = false; // waited long enough; now hoping another fish bites
  private catch: Fish | null = null; // another fish, being reeled in
  caught = false; // reeling up the player

  resize(W: number, H: number): void {
    this.W = W;
    this.H = H;
  }

  /** Start over with nothing in the water. */
  reset(): void {
    this.phase = "idle";
    this.timer = between(FIRST);
    this.caught = false;
    this.catch = null;
  }

  update(dt: number): void {
    if (this.phase === "idle") {
      this.timer -= dt;
      if (this.timer > 0) return;
      this.x = this.W * (0.15 + Math.random() * 0.7);
      this.y = -60;
      this.depth = this.H * (0.3 + Math.random() * 0.3);
      this.phase = "drop";
      this.timer = between(WAIT);
      this.seed = Math.random() * 100;
      this.snapped = false;
      this.caught = false;
      this.lurking = false;
      this.catch = null;
    } else if (this.phase === "drop") {
      this.y += Math.min(DROP_SPEED, Math.max(20, (this.depth - this.y) * 1.5)) * dt;
      if (this.depth - this.y < 1) this.phase = "wait";
    } else if (this.phase === "wait") {
      this.timer -= dt;
      if (this.timer > 0) return;
      if (this.lurking) this.reelIn(); // nothing bit
      else {
        this.lurking = true;
        this.timer = LURK_MAX;
      }
    } else {
      // speeding up as it goes
      this.timer += dt;
      this.y -= Math.min(REEL_SPEED, 40 + this.timer * 300) * dt;
      if (this.y < -this.H) {
        this.phase = "idle";
        this.timer = between(GAP);
        this.catch = null;
      }
    }
  }

  private reelIn(): void {
    this.phase = "reel";
    this.timer = 0;
  }

  /** The hook's eye, including its bobbing and nibbles. */
  private position(time: number): { x: number; y: number } {
    let bob = 0;
    if (this.phase === "wait") {
      bob = Math.sin(time * 2 + this.seed) * 4;
      // now and then something nibbles, and the hook gives a quick tug down
      const nibble = Math.sin(time * 1.3 + this.seed);
      if (nibble > 0.96) bob += ((nibble - 0.96) / 0.04) * 14;
    }
    return { x: this.x + Math.sin(time * 0.8 + this.seed) * 6, y: this.y + bob };
  }

  /** The hook and worm as a circle a fish can run into, or null if there's nothing to bite. */
  bait(time: number): { x: number; y: number; radius: number } | null {
    if (this.phase === "idle" || this.phase === "reel" || this.snapped || this.caught) return null;
    const { x, y } = this.position(time);
    const s = TACKLE_SCALE;
    return { x: x - 5 * s, y: y + 12 * s, radius: 14 * s };
  }

  /** Hook the player: the line is reeled straight in. */
  catchPlayer(): void {
    this.caught = true;
    this.reelIn();
  }

  /** Whether the hook is waiting for this (non-player) fish to bite. */
  wants(f: Fish): boolean {
    return (
      this.lurking && !this.catch && f.kind === "fish" && f.r >= CATCH_RADIUS[0] && f.r <= CATCH_RADIUS[1]
    );
  }

  /** Hook some other fish. It belongs to the hook now: the caller should drop it from play. */
  catchFish(f: Fish): void {
    this.catch = f;
    this.reelIn();
  }

  /** Bitten clean through: the line goes up empty. */
  snap(): void {
    this.snapped = true;
    this.reelIn();
  }

  /** Where a hooked fish's center hangs, nose up, `r` being its size. */
  hangPoint(time: number, r: number): { x: number; y: number } {
    const { x, y } = this.position(time);
    return { x: x - 6 * TACKLE_SCALE, y: y + 6 * TACKLE_SCALE + r * 1.05 };
  }

  /** Line from the surface, a sinker, and a hook with a wriggling worm. */
  draw(ctx: CanvasRenderingContext2D, time: number): void {
    if (this.phase === "idle") return;
    const s = TACKLE_SCALE;
    const { x: hx, y: hy } = this.position(time);
    const knot = hy - 30 * s; // where the line meets the sinker

    // a caught fish dangles nose-up, wriggling
    if (this.catch) {
      const f = this.catch;
      const p = this.hangPoint(time, f.r);
      f.x = p.x;
      f.y = p.y;
      f.angle = -f.facing * (Math.PI / 2 + Math.sin(time * 14) * 0.15);
      f.draw(ctx, time);
    }

    ctx.save();
    ctx.lineCap = "round";

    // the line, with a slight belly from the current
    ctx.strokeStyle = "rgba(238, 247, 251, 0.75)";
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(this.x, -5);
    ctx.quadraticCurveTo(this.x + Math.sin(time * 0.5 + this.seed) * 15, knot / 2, hx, knot);
    ctx.stroke();
    if (this.snapped) {
      ctx.restore();
      return;
    }

    ctx.translate(hx, hy);
    ctx.scale(s, s);

    // leader and sinker
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -30);
    ctx.lineTo(0, -12);
    ctx.stroke();
    ctx.fillStyle = "#3a3f44";
    ctx.beginPath();
    ctx.ellipse(0, -30, 3.5, 5.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // hook: shank, bend and barb, with a dark edge so it shows against the water
    const hookPath = new Path2D();
    hookPath.moveTo(0, -12);
    hookPath.lineTo(0, 6);
    hookPath.arc(-6, 6, 6, 0, Math.PI);
    hookPath.lineTo(-12, 0);
    hookPath.lineTo(-9, 3);
    ctx.strokeStyle = "rgba(30, 40, 50, 0.7)";
    ctx.lineWidth = 3.2;
    ctx.stroke(hookPath);
    ctx.strokeStyle = "#d5dce2";
    ctx.lineWidth = 1.8;
    ctx.stroke(hookPath);

    // worm, wriggling (unless it's got a fish on instead)
    if (!this.caught && !this.catch) {
      ctx.strokeStyle = "#ef7a8a";
      ctx.lineWidth = 4;
      ctx.beginPath();
      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        const wx = -6 + Math.sin(time * 6 + t * 5 + this.seed) * 3 * t;
        const wy = 10 + t * 22;
        if (i === 0) ctx.moveTo(wx, wy);
        else ctx.lineTo(wx, wy);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
}
