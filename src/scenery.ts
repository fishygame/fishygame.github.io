// Aquarium backdrop: water, swaying seaweed, and a sandy floor with a castle, treasure chest,
// rocks and a starfish. Anything that doesn't move is drawn once into an offscreen canvas.

export const SAND_HEIGHT = 70;

interface Weed {
  x: number;
  height: number;
  width: number;
  phase: number;
}

interface Bubble {
  x: number;
  y: number;
  r: number;
  speed: number;
}

/** Small seeded PRNG so the layout stays the same between resizes and restarts. */
function mulberry32(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Scenery {
  private W = 0;
  private H = 0;
  private floor = document.createElement("canvas");
  private backWeeds: Weed[] = [];
  private frontWeeds: Weed[] = [];
  private chest = { x: 0, y: 0, s: 1 };
  private chestBubbles: Bubble[] = [];
  private chestTimer = 0;

  /** Sand surface height at x. */
  sandTop(x: number): number {
    return this.H - SAND_HEIGHT + Math.sin(x * 0.008) * 10 + Math.sin(x * 0.021 + 1.3) * 5;
  }

  resize(W: number, H: number, dpr: number): void {
    this.W = W;
    this.H = H;
    const rand = mulberry32(7);
    const s = Math.min(1, H / 800);

    this.backWeeds = [];
    for (let x = rand() * 60; x < W; x += 50 + rand() * 90) {
      this.backWeeds.push({ x, height: (140 + rand() * 180) * s, width: 10 + rand() * 8, phase: rand() * 6 });
    }
    this.frontWeeds = [0.08, 0.47, 0.9].map((f) => ({
      x: W * f + (rand() - 0.5) * 60,
      height: (120 + rand() * 120) * s,
      width: 14 + rand() * 6,
      phase: rand() * 6,
    }));
    this.chest = { x: W * 0.28, y: 0, s };
    this.chest.y = this.sandTop(this.chest.x) + 8 * s;
    this.chestBubbles = [];

    this.floor.width = Math.floor(W * dpr);
    this.floor.height = Math.floor(H * dpr);
    const ctx = this.floor.getContext("2d") as CanvasRenderingContext2D;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawFloor(ctx, rand, s);
  }

  update(dt: number): void {
    this.chestTimer -= dt;
    if (this.chestTimer <= 0) {
      const { x, y, s } = this.chest;
      this.chestBubbles.push({
        x: x + (Math.random() - 0.5) * 30 * s,
        y: y - 50 * s,
        r: 2 + Math.random() * 4,
        speed: 50 + Math.random() * 50,
      });
      // bubbles come in little bursts
      this.chestTimer = Math.random() < 0.7 ? 0.12 : 1 + Math.random() * 1.5;
    }
    for (let i = this.chestBubbles.length - 1; i >= 0; i--) {
      const b = this.chestBubbles[i];
      b.y -= b.speed * dt;
      b.x += Math.sin(b.y * 0.05) * 15 * dt;
      if (b.y < -10) this.chestBubbles.splice(i, 1);
    }
  }

  drawWater(ctx: CanvasRenderingContext2D): void {
    const g = ctx.createLinearGradient(0, 0, 0, this.H);
    g.addColorStop(0, "#8fd6fb");
    g.addColorStop(0.5, "#3a9fd8");
    g.addColorStop(1, "#13649e");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.W, this.H);
  }

  /** Everything behind the fish. */
  drawBack(ctx: CanvasRenderingContext2D, time: number): void {
    this.drawWater(ctx);
    for (const w of this.backWeeds) {
      this.weed(ctx, w, time, "rgba(40, 140, 120, 0.35)", null);
    }
    ctx.drawImage(this.floor, 0, 0, this.W, this.H);

    ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
    ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
    ctx.lineWidth = 1;
    for (const b of this.chestBubbles) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  /** Seaweed that sits in front of the fish. */
  drawFront(ctx: CanvasRenderingContext2D, time: number): void {
    for (const w of this.frontWeeds) this.weed(ctx, w, time, "#1f9a35", "#0e6420");
  }

  private weed(ctx: CanvasRenderingContext2D, w: Weed, time: number, fill: string, stroke: string | null): void {
    const base = this.sandTop(w.x) + 6;
    const n = 10;
    const left: [number, number][] = [];
    const right: [number, number][] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const sway = Math.sin(time * 1.4 + w.phase + t * 2.5) * 22 * t * t;
      const cx = w.x + sway + Math.sin(t * 3 + w.phase) * 6;
      const cy = base - w.height * t;
      const half = (w.width / 2) * (1 - t * 0.85);
      left.push([cx - half, cy]);
      right.push([cx + half, cy]);
    }
    ctx.beginPath();
    ctx.moveTo(left[0][0], left[0][1]);
    for (const [x, y] of left) ctx.lineTo(x, y);
    for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  // ---- static floor ----

  private drawFloor(ctx: CanvasRenderingContext2D, rand: () => number, s: number): void {
    const { W, H } = this;

    this.castle(ctx, W * 0.72, this.sandTop(W * 0.72) + 10 * s, s);

    // distant rocks half-buried in the sand
    for (let i = 0; i < 6; i++) {
      const x = rand() * W;
      this.rock(ctx, x, this.sandTop(x) + 6, (18 + rand() * 30) * s, rand);
    }

    // sand
    const g = ctx.createLinearGradient(0, H - SAND_HEIGHT - 15, 0, H);
    g.addColorStop(0, "#e2c48a");
    g.addColorStop(1, "#a9824e");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W + 8; x += 8) ctx.lineTo(x, this.sandTop(x));
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(120, 85, 40, 0.5)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x <= W + 8; x += 8) ctx.lineTo(x, this.sandTop(x));
    ctx.stroke();

    // grains
    for (let i = 0; i < W * 0.6; i++) {
      const x = rand() * W;
      const y = this.sandTop(x) + 4 + rand() * (H - this.sandTop(x));
      ctx.fillStyle = rand() < 0.5 ? "rgba(255, 240, 200, 0.5)" : "rgba(120, 85, 40, 0.35)";
      ctx.fillRect(x, y, 1.5, 1.5);
    }

    // pebbles and props sitting on the sand
    for (let i = 0; i < 4; i++) {
      const x = rand() * W;
      this.rock(ctx, x, this.sandTop(x) + 14, (10 + rand() * 14) * s, rand);
    }
    this.treasureChest(ctx, this.chest.x, this.chest.y, s);
    const starX = W * 0.58;
    this.starfish(ctx, starX, this.sandTop(starX) + 30, 16 * s);
    const shellX = W * 0.12;
    this.shell(ctx, shellX, this.sandTop(shellX) + 28, 12 * s);
    this.shell(ctx, W * 0.86, this.sandTop(W * 0.86) + 36, 9 * s);
  }

  private rock(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, rand: () => number): void {
    const g = ctx.createLinearGradient(0, y - size, 0, y);
    g.addColorStop(0, "#9aa3a8");
    g.addColorStop(1, "#5c666c");
    ctx.fillStyle = g;
    ctx.beginPath();
    const pts = 9;
    for (let i = 0; i <= pts; i++) {
      const a = Math.PI + (i / pts) * Math.PI;
      const rr = size * (0.85 + rand() * 0.3);
      ctx.lineTo(x + Math.cos(a) * rr * 1.3, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
  }

  private castle(ctx: CanvasRenderingContext2D, x: number, base: number, s: number): void {
    const stone = (y0: number, y1: number) => {
      const g = ctx.createLinearGradient(0, y0, 0, y1);
      g.addColorStop(0, "#b9b2a6");
      g.addColorStop(1, "#7d766b");
      return g;
    };
    const tower = (cx: number, w: number, h: number) => {
      const top = base - h;
      ctx.fillStyle = stone(top, base);
      ctx.fillRect(cx - w / 2, top, w, h);
      // stone block lines
      ctx.strokeStyle = "rgba(60, 55, 50, 0.25)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let y = base - 10 * s; y > top; y -= 14 * s) {
        ctx.moveTo(cx - w / 2, y);
        ctx.lineTo(cx + w / 2, y);
      }
      ctx.stroke();
      // crenellations
      const n = 4;
      const cw = w / (n * 2 - 1);
      for (let i = 0; i < n; i++) ctx.fillRect(cx - w / 2 + i * cw * 2, top - cw, cw, cw);
      // window
      ctx.fillStyle = "#2b2a33";
      ctx.beginPath();
      ctx.arc(cx, top + h * 0.25, w * 0.12, Math.PI, 0);
      ctx.rect(cx - w * 0.12, top + h * 0.25, w * 0.24, h * 0.14);
      ctx.fill();
    };

    tower(x - 55 * s, 40 * s, 150 * s);
    tower(x + 55 * s, 40 * s, 150 * s);
    tower(x, 90 * s, 105 * s);

    // arched doorway
    ctx.fillStyle = "#24232b";
    ctx.beginPath();
    ctx.moveTo(x - 16 * s, base);
    ctx.lineTo(x - 16 * s, base - 35 * s);
    ctx.arc(x, base - 35 * s, 16 * s, Math.PI, 0);
    ctx.lineTo(x + 16 * s, base);
    ctx.closePath();
    ctx.fill();

    // little flag
    ctx.strokeStyle = "#4a4a4a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 55 * s, base - 160 * s);
    ctx.lineTo(x - 55 * s, base - 195 * s);
    ctx.stroke();
    ctx.fillStyle = "#e0533d";
    ctx.beginPath();
    ctx.moveTo(x - 55 * s, base - 195 * s);
    ctx.lineTo(x - 30 * s, base - 187 * s);
    ctx.lineTo(x - 55 * s, base - 179 * s);
    ctx.fill();
  }

  private treasureChest(ctx: CanvasRenderingContext2D, x: number, base: number, s: number): void {
    const w = 70 * s;
    const h = 34 * s;
    const lidH = 20 * s;
    const left = x - w / 2;
    const top = base - h;

    // box
    ctx.fillStyle = "#7a4a22";
    ctx.fillRect(left, top, w, h);
    // lid, propped slightly open with gold peeking out
    ctx.fillStyle = "#f2c531";
    ctx.beginPath();
    ctx.ellipse(x, top, w * 0.45, 5 * s, 0, Math.PI, 0);
    ctx.fill();
    ctx.save();
    ctx.translate(left, top);
    ctx.rotate(-0.25);
    ctx.fillStyle = "#8c5629";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -lidH * 0.4);
    ctx.quadraticCurveTo(w / 2, -lidH * 1.5, w, -lidH * 0.4);
    ctx.lineTo(w, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#d4a73a";
    ctx.fillRect(w * 0.15, -lidH * 0.95, 6 * s, lidH * 0.95);
    ctx.fillRect(w * 0.85 - 6 * s, -lidH * 0.95, 6 * s, lidH * 0.95);
    ctx.restore();

    // metal bands and lock
    ctx.fillStyle = "#d4a73a";
    ctx.fillRect(left + w * 0.15, top, 6 * s, h);
    ctx.fillRect(left + w * 0.85 - 6 * s, top, 6 * s, h);
    ctx.fillRect(x - 6 * s, top + 4 * s, 12 * s, 12 * s);
    ctx.fillStyle = "#3a2410";
    ctx.fillRect(x - 1.5 * s, top + 8 * s, 3 * s, 5 * s);
    ctx.strokeStyle = "rgba(40, 20, 5, 0.6)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(left, top, w, h);
  }

  private starfish(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
    ctx.fillStyle = "#f06a5a";
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5 + 0.2;
      const rr = i % 2 === 0 ? r : r * 0.42;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.6);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(255, 220, 200, 0.7)";
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5 + 0.2;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.3, r * 0.07, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private shell(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
    ctx.fillStyle = "#f7dccb";
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, r, Math.PI * 1.05, Math.PI * 1.95);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(170, 110, 90, 0.7)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < 6; i++) {
      const a = Math.PI * (1.05 + (i / 6) * 0.9);
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.stroke();
  }
}
