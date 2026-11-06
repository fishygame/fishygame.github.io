// Trails from the coin shop: bubbles, sparkles or hearts streaming off the hero's tail as it swims.

import type { TrailKind } from "./shop";

interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  spin: number;
}

const RATE = 14; // bits per second at full speed
const MAX_BITS = 80;

export class Trail {
  private bits: Bit[] = [];
  private owed = 0;

  /** Age the bits, and add new ones at the tail if `kind` is set and the fish is moving. `drift`
   * moves the bits sideways too, for the shop's preview fish that swims on the spot. */
  update(dt: number, kind: TrailKind | null, x: number, y: number, facing: number, r: number, speed: number, drift = 0): void {
    for (const b of this.bits) {
      b.age += dt;
      b.x += (b.vx + drift) * dt;
      b.y += b.vy * dt;
    }
    this.bits = this.bits.filter((b) => b.age < b.life);
    if (!kind || speed < 30) {
      this.owed = 0;
      return;
    }
    this.owed += dt * RATE * Math.min(1, speed / 200);
    const size = Math.min(40, Math.max(9, r * 0.3)); // big enough to see on a newly hatched fish
    while (this.owed >= 1 && this.bits.length < MAX_BITS) {
      this.owed -= 1;
      this.bits.push({
        x: x - facing * r * 1.55 + (Math.random() - 0.5) * r * 0.2,
        y: y + (Math.random() - 0.5) * r * 0.5,
        vx: -facing * 10 + (Math.random() - 0.5) * 20,
        vy: kind === "sparkles" ? (Math.random() - 0.5) * 20 : -25 - Math.random() * 25,
        age: 0,
        life: 0.8 + Math.random() * 0.6,
        size: size * (0.6 + Math.random() * 0.5),
        spin: Math.random() * Math.PI,
      });
    }
    this.owed = Math.min(this.owed, 1);
  }

  clear(): void {
    this.bits = [];
    this.owed = 0;
  }

  draw(ctx: CanvasRenderingContext2D, kind: TrailKind | null, time: number): void {
    if (!kind || !this.bits.length) return;
    ctx.save();
    for (const b of this.bits) {
      const t = b.age / b.life;
      ctx.globalAlpha = Math.min(1, (1 - t) * 1.6);
      if (kind === "bubbles") bubble(ctx, b);
      else if (kind === "sparkles") sparkle(ctx, b, t, time);
      else heart(ctx, b, t);
    }
    ctx.restore();
  }
}

function bubble(ctx: CanvasRenderingContext2D, b: Bit): void {
  const r = b.size * 0.4;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
  ctx.lineWidth = Math.max(1, r * 0.18);
  ctx.fillStyle = "rgba(200, 240, 255, 0.2)";
  ctx.beginPath();
  ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
  ctx.beginPath();
  ctx.arc(b.x - r * 0.35, b.y - r * 0.35, r * 0.22, 0, Math.PI * 2);
  ctx.fill();
}

function sparkle(ctx: CanvasRenderingContext2D, b: Bit, t: number, time: number): void {
  const s = b.size * 0.55 * Math.sin(Math.PI * Math.min(1, t * 1.3)) * (0.8 + 0.2 * Math.sin(time * 20 + b.spin));
  ctx.fillStyle = t < 0.5 ? "#fffbe6" : "#ffd166";
  ctx.beginPath();
  ctx.moveTo(b.x, b.y - s);
  ctx.lineTo(b.x + s * 0.25, b.y - s * 0.25);
  ctx.lineTo(b.x + s, b.y);
  ctx.lineTo(b.x + s * 0.25, b.y + s * 0.25);
  ctx.lineTo(b.x, b.y + s);
  ctx.lineTo(b.x - s * 0.25, b.y + s * 0.25);
  ctx.lineTo(b.x - s, b.y);
  ctx.lineTo(b.x - s * 0.25, b.y - s * 0.25);
  ctx.closePath();
  ctx.fill();
}

function heart(ctx: CanvasRenderingContext2D, b: Bit, t: number): void {
  const s = b.size * 0.85 * (0.7 + 0.3 * t);
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(Math.sin(b.spin + t * 4) * 0.3);
  ctx.fillStyle = "#ff5f8f";
  ctx.beginPath();
  ctx.moveTo(0, s * 0.35);
  ctx.bezierCurveTo(-s * 1.1, -s * 0.35, -s * 0.45, -s * 1.05, 0, -s * 0.45);
  ctx.bezierCurveTo(s * 0.45, -s * 1.05, s * 1.1, -s * 0.35, 0, s * 0.35);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
