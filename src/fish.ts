export type Kind = "fish" | "shark";

const SHARK_FIN = "#56687a";

export class Fish {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  hue: number;
  kind: Kind;
  facing: 1 | -1 = 1;
  skeleton = false; // what's left of the player after getting eaten
  flip = 0; // 0 upright .. 1 belly-up; in between it's mid-roll
  angle = 0; // tilt in radians, for hanging off a hook or leaning into a turn
  darter = false; // now and then cuts back in a quick Z before carrying on (sharks)
  private dart: "cruise" | "back" = "cruise";
  private dartTimer = 2 + Math.random() * 3; // cruise: until the next dart; back: until turning forward again
  private cruiseVx = 0;
  private cruiseVy = 0;
  private surge = 0; // extra forward speed coming out of a dart, fading out
  private phase = Math.random() * Math.PI * 2;
  // The parts that don't animate, painted once and reused every frame (see cached())
  private sprite: HTMLCanvasElement | null = null;
  private spriteKey = "";

  constructor(x: number, y: number, vx: number, vy: number, r: number, hue: number, kind: Kind = "fish") {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.r = r;
    this.hue = hue;
    this.kind = kind;
    this.facing = vx >= 0 ? 1 : -1;
  }

  /**
   * The body as a horizontal capsule (a line segment with a radius) for collisions, fitted to
   * the drawn body. Fins and tail don't count.
   */
  hitbox(): { x0: number; x1: number; y: number; radius: number } {
    const [back, front, radius] = this.kind === "shark" ? [0.84, 1.14, 0.36] : [0.55, 0.7, 0.5];
    const a = this.x - back * this.r * this.facing;
    const b = this.x + front * this.r * this.facing;
    return { x0: Math.min(a, b), x1: Math.max(a, b), y: this.y, radius: radius * this.r };
  }

  update(dt: number): void {
    if (this.darter) this.darting(dt);
    this.x += this.vx * (1 + this.surge) * dt;
    this.y += this.vy * dt;
  }

  /**
   * A dart is a Z: turn around and cut back diagonally up or down, then turn around again and
   * shoot off the original way with a burst of speed. In between, it cruises as normal.
   */
  private darting(dt: number): void {
    this.dartTimer -= dt;
    if (this.dart === "cruise" && this.dartTimer <= 0) {
      this.cruiseVx = this.vx;
      this.cruiseVy = this.vy;
      this.dart = "back";
      this.dartTimer = 0.45 + Math.random() * 0.25;
      this.vx = -this.cruiseVx * 0.9;
      this.vy = (Math.random() < 0.5 ? -1 : 1) * (150 + Math.random() * 60);
      this.facing = this.vx > 0 ? 1 : -1;
    } else if (this.dart === "back" && this.dartTimer <= 0) {
      this.dart = "cruise";
      this.dartTimer = 3 + Math.random() * 3;
      this.vx = this.cruiseVx;
      this.vy = this.cruiseVy;
      this.facing = this.vx > 0 ? 1 : -1;
      this.surge = 0.8;
    }
    this.surge *= Math.exp(-2.5 * dt);
    // lean along the diagonal; kept small, since the hitbox stays level
    const lean = this.dart === "back" ? Math.max(-0.3, Math.min(0.3, Math.atan2(this.vy, Math.abs(this.vx)))) : 0;
    this.angle += (this.facing * lean - this.angle) * Math.min(1, dt * 10);
  }

  /** Draw the fish. `danger` swaps the outline for a red one (fish that can eat the player). */
  draw(ctx: CanvasRenderingContext2D, time: number, danger = false): void {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    ctx.scale(this.facing, Math.cos(Math.PI * this.flip));
    if (this.skeleton) this.drawSkeleton(ctx);
    else if (this.kind === "shark") this.drawShark(ctx, time, danger);
    else this.drawFish(ctx, time, danger);
    ctx.restore();
  }

  /** Cartoon fish bones: skull with an X for an eye, spine, ribs and a fan of tail bones. */
  private drawSkeleton(ctx: CanvasRenderingContext2D): void {
    const L = this.r * 1.2;
    const B = this.r * 0.62;
    const bone = "#f3efe2";
    const outline = "rgba(70, 60, 50, 0.85)";
    const lw = Math.max(1.5, this.r * 0.09);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // spine, ribs and tail bones: drawn twice, a dark outline and then the bone on top
    const bones = new Path2D();
    bones.moveTo(L * 0.3, 0);
    bones.lineTo(-L * 0.85, 0);
    for (let i = 0; i < 5; i++) {
      const x = L * 0.12 - i * L * 0.19;
      const h = B * (0.78 - i * 0.1);
      for (const s of [-1, 1]) {
        bones.moveTo(x, 0);
        bones.quadraticCurveTo(x + L * 0.04, s * h * 0.6, x - L * 0.07, s * h);
      }
    }
    for (const y of [-0.9, -0.45, 0, 0.45, 0.9]) {
      bones.moveTo(-L * 0.85, 0);
      bones.lineTo(-L * 1.4, B * y);
    }
    ctx.strokeStyle = outline;
    ctx.lineWidth = lw + Math.max(1.5, this.r * 0.05);
    ctx.stroke(bones);
    ctx.strokeStyle = bone;
    ctx.lineWidth = lw;
    ctx.stroke(bones);

    // skull
    ctx.beginPath();
    ctx.moveTo(L, B * 0.1);
    ctx.bezierCurveTo(L * 0.85, -B * 0.85, L * 0.35, -B * 0.85, L * 0.25, -B * 0.1);
    ctx.quadraticCurveTo(L * 0.3, B * 0.6, L * 0.55, B * 0.55);
    ctx.quadraticCurveTo(L * 0.85, B * 0.5, L, B * 0.1);
    ctx.fillStyle = bone;
    ctx.fill();
    ctx.strokeStyle = outline;
    ctx.lineWidth = Math.max(1.5, this.r * 0.05);
    ctx.stroke();

    // X for an eye, and a jaw line
    const ex = L * 0.6;
    const ey = -B * 0.2;
    const es = this.r * 0.13;
    ctx.strokeStyle = "#2b2622";
    ctx.lineWidth = Math.max(1.5, this.r * 0.06);
    ctx.beginPath();
    ctx.moveTo(ex - es, ey - es);
    ctx.lineTo(ex + es, ey + es);
    ctx.moveTo(ex + es, ey - es);
    ctx.lineTo(ex - es, ey + es);
    ctx.moveTo(L * 0.97, B * 0.15);
    ctx.lineTo(L * 0.7, B * 0.25);
    ctx.stroke();
  }

  // Shapes below are in local space: facing right, centered on (0, 0), scaled by r.

  /**
   * Draw the still parts of the fish from a cached image, repainting it only when the size,
   * outline or screen resolution changes. Redrawing the gradients and scale pattern every frame
   * gets slow once the fish are big and there are lots of them. `bounds` is the area `paint`
   * covers, in the fish's local space.
   */
  private cached(
    ctx: CanvasRenderingContext2D,
    danger: boolean,
    [x0, y0, x1, y1]: number[],
    paint: (c: CanvasRenderingContext2D) => void,
  ): void {
    const t = ctx.getTransform();
    const scale = Math.hypot(t.a, t.b); // screen pixels per unit, whichever way the fish faces
    const pad = 8; // room for the outline
    const w = x1 - x0 + pad * 2;
    const h = y1 - y0 + pad * 2;
    const key = `${this.r}|${danger}|${scale}`;
    if (key !== this.spriteKey) {
      const c = this.sprite ?? document.createElement("canvas");
      c.width = Math.ceil(w * scale);
      c.height = Math.ceil(h * scale);
      const g = c.getContext("2d") as CanvasRenderingContext2D;
      g.setTransform(scale, 0, 0, scale, (pad - x0) * scale, (pad - y0) * scale);
      paint(g);
      this.sprite = c;
      this.spriteKey = key;
    }
    ctx.drawImage(this.sprite!, x0 - pad, y0 - pad, w, h);
  }

  private drawFish(ctx: CanvasRenderingContext2D, time: number, danger: boolean): void {
    const h = this.hue;
    const L = this.r * 1.2; // half-length of the body
    const B = this.r * 0.62; // half-height of the body
    const wag = Math.sin(time * 8 + this.phase) * B * 0.25;
    const flap = Math.sin(time * 10 + this.phase);

    // forked tail
    ctx.fillStyle = `hsl(${h} 70% 45% / 0.9)`;
    ctx.beginPath();
    ctx.moveTo(-L * 0.75, 0);
    ctx.quadraticCurveTo(-L * 1.15, -B * 0.4 + wag * 0.5, -L * 1.5, -B * 1.0 + wag);
    ctx.quadraticCurveTo(-L * 1.25, wag * 0.6, -L * 1.5, B * 1.0 + wag);
    ctx.quadraticCurveTo(-L * 1.15, B * 0.4 + wag * 0.5, -L * 0.75, 0);
    ctx.fill();
    this.finRays(ctx, -L * 0.8, 0, -L * 1.4, wag, B * 0.8, h);

    this.cached(ctx, danger, [-L * 0.9, -B * 1.3, L * 1.02, B * 1.15], (c) => this.fishBodyParts(c, danger));

    // pectoral fin, flapping
    ctx.fillStyle = `hsl(${h} 75% 60% / 0.75)`;
    ctx.beginPath();
    ctx.moveTo(L * 0.25, B * 0.25);
    ctx.quadraticCurveTo(-L * 0.05, B * (0.55 + flap * 0.15), -L * 0.15, B * (0.25 + flap * 0.2));
    ctx.quadraticCurveTo(L * 0.05, B * 0.15, L * 0.25, B * 0.25);
    ctx.fill();
  }

  /** Everything on a fish but the tail and the flapping pectoral fin. */
  private fishBodyParts(ctx: CanvasRenderingContext2D, danger: boolean): void {
    const h = this.hue;
    const L = this.r * 1.2;
    const B = this.r * 0.62;
    const edge = danger ? "rgba(235, 50, 50, 0.95)" : `hsl(${h} 60% 25% / 0.8)`;
    const lw = Math.max(1, this.r * 0.05);

    // dorsal and anal fins
    ctx.fillStyle = `hsl(${h} 70% 45% / 0.9)`;
    ctx.beginPath();
    ctx.moveTo(L * 0.3, -B * 0.8);
    ctx.quadraticCurveTo(-L * 0.05, -B * 1.6, -L * 0.5, -B * 0.65);
    ctx.closePath();
    ctx.moveTo(-L * 0.15, B * 0.8);
    ctx.quadraticCurveTo(-L * 0.35, B * 1.35, -L * 0.6, B * 0.55);
    ctx.closePath();
    ctx.fill();

    // body with countershading: dark back, light belly
    this.fishBody(ctx, L, B);
    const g = ctx.createLinearGradient(0, -B, 0, B);
    g.addColorStop(0, `hsl(${h} 65% 35%)`);
    g.addColorStop(0.45, `hsl(${h} 75% 55%)`);
    g.addColorStop(1, `hsl(${h} 80% 85%)`);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = edge;
    ctx.lineWidth = danger ? this.dangerWidth() : lw;
    ctx.stroke();

    // scale pattern, clipped to the body
    ctx.save();
    this.fishBody(ctx, L, B);
    ctx.clip();
    ctx.strokeStyle = `hsl(${h} 60% 30% / 0.18)`;
    ctx.lineWidth = lw;
    const step = B * 0.32;
    const a0 = -Math.PI / 2.5;
    ctx.beginPath();
    for (let sx = -L * 0.6; sx < L * 0.3; sx += step) {
      for (let sy = -B; sy < B; sy += step) {
        const off = (Math.round((sx + L) / step) % 2) * step * 0.5;
        const [cx, cy, rr] = [sx, sy + off, step * 0.55];
        ctx.moveTo(cx + rr * Math.cos(a0), cy + rr * Math.sin(a0));
        ctx.arc(cx, cy, rr, a0, -a0);
      }
    }
    ctx.stroke();
    // lateral line
    ctx.strokeStyle = `hsl(${h} 60% 30% / 0.3)`;
    ctx.beginPath();
    ctx.moveTo(L * 0.4, -B * 0.2);
    ctx.quadraticCurveTo(0, -B * 0.35, -L * 0.75, 0);
    ctx.stroke();
    ctx.restore();

    // gill
    ctx.strokeStyle = `hsl(${h} 60% 28% / 0.6)`;
    ctx.lineWidth = lw * 1.3;
    ctx.beginPath();
    ctx.arc(L * 0.15, 0, B * 0.75, -Math.PI / 3.2, Math.PI / 3.2);
    ctx.stroke();

    // mouth
    ctx.strokeStyle = `hsl(${h} 50% 20% / 0.8)`;
    ctx.beginPath();
    ctx.moveTo(L * 0.98, B * 0.12);
    ctx.lineTo(L * 0.82, B * 0.18);
    ctx.stroke();

    this.eye(ctx, L * 0.58, -B * 0.18, this.r * 0.15, "#1a1a1a");
  }

  private fishBody(ctx: CanvasRenderingContext2D, L: number, B: number): void {
    ctx.beginPath();
    ctx.moveTo(L, B * 0.05);
    ctx.bezierCurveTo(L * 0.75, -B * 1.15, -L * 0.35, -B * 1.05, -L * 0.85, -B * 0.2);
    ctx.lineTo(-L * 0.85, B * 0.2);
    ctx.bezierCurveTo(-L * 0.35, B * 1.0, L * 0.75, B * 1.05, L, B * 0.05);
    ctx.closePath();
  }

  private finRays(
    ctx: CanvasRenderingContext2D,
    x0: number,
    y0: number,
    x1: number,
    wag: number,
    spread: number,
    h: number,
  ): void {
    ctx.strokeStyle = `hsl(${h} 60% 30% / 0.35)`;
    ctx.lineWidth = Math.max(0.5, this.r * 0.03);
    ctx.beginPath();
    for (const t of [-0.8, -0.4, 0.4, 0.8]) {
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, spread * t + wag * 0.9);
    }
    ctx.stroke();
  }

  private drawShark(ctx: CanvasRenderingContext2D, time: number, danger: boolean): void {
    const L = this.r * 1.5;
    const B = this.r * 0.45;
    const wag = Math.sin(time * 5 + this.phase) * B * 0.3;

    // crescent tail, upper lobe longer
    ctx.fillStyle = SHARK_FIN;
    ctx.beginPath();
    ctx.moveTo(-L * 0.75, -B * 0.1);
    ctx.quadraticCurveTo(-L * 1.0, -B * 0.6, -L * 1.35, -B * 1.7 + wag);
    ctx.quadraticCurveTo(-L * 1.15, -B * 0.2 + wag * 0.5, -L * 1.05, wag * 0.4);
    ctx.quadraticCurveTo(-L * 1.12, B * 0.4 + wag * 0.5, -L * 1.25, B * 1.1 + wag);
    ctx.quadraticCurveTo(-L * 0.95, B * 0.4, -L * 0.75, B * 0.1);
    ctx.closePath();
    ctx.fill();

    this.cached(ctx, danger, [-L * 0.82, -B * 2.05, L * 1.02, B * 1.7], (c) => this.sharkBodyParts(c, danger));
  }

  /** Everything on a shark but the tail. */
  private sharkBodyParts(ctx: CanvasRenderingContext2D, danger: boolean): void {
    const L = this.r * 1.5;
    const B = this.r * 0.45;
    const fin = SHARK_FIN;
    const edge = danger ? "rgba(235, 50, 50, 0.95)" : "rgba(35, 45, 55, 0.8)";

    // tall dorsal fin and small second dorsal
    ctx.fillStyle = fin;
    ctx.beginPath();
    ctx.moveTo(L * 0.2, -B * 0.85);
    ctx.quadraticCurveTo(L * 0.05, -B * 1.6, -L * 0.1, -B * 2.0);
    ctx.quadraticCurveTo(-L * 0.12, -B * 1.2, -L * 0.3, -B * 0.75);
    ctx.closePath();
    ctx.moveTo(-L * 0.55, -B * 0.45);
    ctx.lineTo(-L * 0.65, -B * 0.85);
    ctx.lineTo(-L * 0.72, -B * 0.3);
    ctx.closePath();
    ctx.fill();

    // body: slate back, white belly
    this.sharkBody(ctx, L, B);
    const g = ctx.createLinearGradient(0, -B, 0, B);
    g.addColorStop(0, "#4a5b6b");
    g.addColorStop(0.5, "#7f909f");
    g.addColorStop(0.62, "#e6ecf0");
    g.addColorStop(1, "#f4f7f9");
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = edge;
    ctx.lineWidth = danger ? this.dangerWidth() : Math.max(1, this.r * 0.04);
    ctx.stroke();

    // gill slits
    ctx.strokeStyle = "rgba(40, 50, 60, 0.55)";
    ctx.lineWidth = Math.max(1, this.r * 0.03);
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const gx = L * (0.48 - i * 0.06);
      ctx.moveTo(gx, -B * 0.35);
      ctx.quadraticCurveTo(gx - L * 0.03, 0, gx, B * 0.3);
    }
    ctx.stroke();

    // pectoral fin
    ctx.fillStyle = fin;
    ctx.beginPath();
    ctx.moveTo(L * 0.35, B * 0.35);
    ctx.quadraticCurveTo(L * 0.15, B * 1.2, -L * 0.05, B * 1.65);
    ctx.quadraticCurveTo(L * 0.05, B * 0.8, L * 0.1, B * 0.45);
    ctx.closePath();
    ctx.fill();

    // grinning mouth full of teeth
    const mx0 = L * 0.88;
    const mx1 = L * 0.5;
    const my = B * 0.38;
    ctx.fillStyle = "#3a1f24";
    ctx.beginPath();
    ctx.moveTo(mx0, my - B * 0.08);
    ctx.quadraticCurveTo((mx0 + mx1) / 2, my + B * 0.35, mx1, my - B * 0.05);
    ctx.quadraticCurveTo((mx0 + mx1) / 2, my + B * 0.1, mx0, my - B * 0.08);
    ctx.fill();
    ctx.fillStyle = "#fff";
    const teeth = 6;
    for (let i = 0; i < teeth; i++) {
      const t = (i + 0.5) / teeth;
      const tx = mx0 + (mx1 - mx0) * t;
      const ty = my - B * 0.06 + Math.sin(t * Math.PI) * B * 0.12;
      const tw = (mx0 - mx1) / teeth / 2;
      ctx.beginPath();
      ctx.moveTo(tx - tw, ty);
      ctx.lineTo(tx + tw, ty);
      ctx.lineTo(tx, ty + B * 0.14);
      ctx.closePath();
      ctx.fill();
    }

    // small, mean eye
    this.eye(ctx, L * 0.68, -B * 0.22, this.r * 0.08, "#000");
    ctx.strokeStyle = "rgba(30, 40, 50, 0.9)";
    ctx.lineWidth = Math.max(1, this.r * 0.035);
    ctx.beginPath();
    ctx.moveTo(L * 0.6, -B * 0.5);
    ctx.lineTo(L * 0.76, -B * 0.36);
    ctx.stroke();
  }

  private sharkBody(ctx: CanvasRenderingContext2D, L: number, B: number): void {
    ctx.beginPath();
    ctx.moveTo(L, 0);
    ctx.bezierCurveTo(L * 0.7, -B * 1.15, -L * 0.25, -B * 1.0, -L * 0.8, -B * 0.15);
    ctx.lineTo(-L * 0.8, B * 0.15);
    ctx.bezierCurveTo(-L * 0.25, B * 0.85, L * 0.6, B * 1.05, L, 0);
    ctx.closePath();
  }

  private dangerWidth(): number {
    return Math.min(6, Math.max(2, this.r * 0.05));
  }

  private eye(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, pupil: string): void {
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = pupil;
    ctx.beginPath();
    ctx.arc(x + size * 0.2, y, size * 0.65, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.beginPath();
    ctx.arc(x + size * 0.4, y - size * 0.3, size * 0.22, 0, Math.PI * 2);
    ctx.fill();
  }
}
