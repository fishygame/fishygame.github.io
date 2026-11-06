// Bonus bait (Thomas, 2026-11-06): a little clump of golden fish food that now and then sinks from
// the surface to the sand, worth bonus points if you eat it on the way. It's drawn to look nothing like
// the hook's pink worm, and it never hangs from a line: shiny and loose is food, a worm on a line is death.

const SINK_SPEED = 38; // px/s
const WOBBLE = 14; // px of side-to-side drift as it sinks
const REST = 5; // seconds it sits on the sand before fading
const FADE = 1;
const RADIUS = 13; // for eating it; a little generous, so a near miss still counts
const SCALE = 1.4; // the pellets below are drawn at 1:1

// pellet positions and sizes in the clump, at 1:1
const PELLETS = [
  [-4, -2, 4.2],
  [4, -3, 3.6],
  [0, 4, 4],
  [6, 4, 3],
];

export class Bait {
  x: number;
  y: number;
  eaten = false;
  private x0: number;
  private born: number;
  private landedAt: number | null = null;
  private seed = Math.random() * 10;

  constructor(x: number, born: number) {
    this.x0 = this.x = x;
    this.y = -15;
    this.born = born;
  }

  /** Sink, settle on the sand, then fade. Returns false once it's gone. */
  update(dt: number, time: number, sandTop: number): boolean {
    if (this.eaten) return false;
    if (this.landedAt === null) {
      this.y += SINK_SPEED * dt;
      this.x = this.x0 + Math.sin((time - this.born) * 1.6 + this.seed) * WOBBLE;
      if (this.y >= sandTop - 4) {
        this.y = sandTop - 4;
        this.landedAt = time;
      }
      return true;
    }
    return time - this.landedAt < REST + FADE;
  }

  /** A circle you can bite, or null once it's fading away. */
  hitbox(time: number): { x0: number; x1: number; y: number; radius: number } | null {
    if (this.landedAt !== null && time - this.landedAt > REST) return null;
    return { x0: this.x, x1: this.x, y: this.y, radius: RADIUS };
  }

  draw(ctx: CanvasRenderingContext2D, time: number): void {
    const fading = this.landedAt === null ? 0 : Math.max(0, time - this.landedAt - REST) / FADE;
    ctx.save();
    ctx.globalAlpha = 1 - Math.min(1, fading);
    ctx.translate(this.x, this.y);

    // soft golden glow, gently pulsing
    const pulse = 0.75 + 0.25 * Math.sin(time * 4 + this.seed);
    const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 26 * pulse);
    glow.addColorStop(0, "rgba(255, 220, 90, 0.55)");
    glow.addColorStop(1, "rgba(255, 220, 90, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, 26 * pulse, 0, Math.PI * 2);
    ctx.fill();

    // the pellets, each with a dark rim and a shine
    ctx.scale(SCALE, SCALE);
    ctx.rotate(Math.sin(time * 1.3 + this.seed) * 0.25);
    for (const [px, py, r] of PELLETS) {
      ctx.fillStyle = "#b9770e";
      ctx.beginPath();
      ctx.arc(px, py, r + 0.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffc93c";
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255, 255, 230, 0.9)";
      ctx.beginPath();
      ctx.arc(px - r * 0.35, py - r * 0.35, r * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // a twinkle now and then, at a spot that moves around the clump
    const cycle = (time * 0.9 + this.seed) % 1;
    if (cycle < 0.25) {
      const s = Math.sin((cycle / 0.25) * Math.PI) * 6;
      const k = Math.floor(time * 0.9 + this.seed);
      const sx = this.x + Math.sin(k * 2.3) * 10;
      const sy = this.y + Math.cos(k * 1.7) * 8;
      ctx.save();
      ctx.globalAlpha = 1 - Math.min(1, fading);
      ctx.fillStyle = "#fffbe6";
      ctx.beginPath();
      ctx.moveTo(sx, sy - s);
      ctx.lineTo(sx + s * 0.25, sy - s * 0.25);
      ctx.lineTo(sx + s, sy);
      ctx.lineTo(sx + s * 0.25, sy + s * 0.25);
      ctx.lineTo(sx, sy + s);
      ctx.lineTo(sx - s * 0.25, sy + s * 0.25);
      ctx.lineTo(sx - s, sy);
      ctx.lineTo(sx - s * 0.25, sy - s * 0.25);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
}
