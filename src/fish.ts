import { drawHat } from "./hats";
import type { Hat, Look } from "./shop";

export type Kind = "fish" | "shark";

/** A line segment with a radius: what collisions are checked with. A circle when both ends meet. */
export interface Capsule {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  radius: number;
}

// How each shop look shifts the hero's colors: a fixed hue (or the fish's own), and saturation and
// lightness scaled and nudged. Clownfish, Spotted and Rainbow keep the orange and add a pattern.
const LOOK_TONE: Record<Look, { h?: number; s: number; l: number; dl: number }> = {
  plain: { s: 1, l: 1, dl: 0 },
  clown: { s: 1, l: 1, dl: 0 },
  spots: { s: 1, l: 1, dl: 0 },
  tiger: { s: 1.05, l: 1, dl: 2 },
  pizza: { h: 36, s: 1, l: 1, dl: 6 }, // melted cheese
  camo: { s: 1.1, l: 1, dl: 4 }, // blaze orange
  silver: { h: 210, s: 0.12, l: 1, dl: 6 },
  gold: { h: 44, s: 1.15, l: 1, dl: 4 },
  midnight: { h: 238, s: 0.6, l: 0.42, dl: 0 },
  rainbow: { s: 1, l: 1, dl: 0 },
};
const RAINBOW = ["#ff4d4d", "#ff9f1c", "#ffe14d", "#4cd964", "#2fa8ff", "#8f5bff"];
// Pizza: pepperoni slices, in body lengths and heights, and their size in body heights
const PEPPERONI = [
  [0.32, -0.42, 0.24], [-0.02, -0.5, 0.22], [-0.4, -0.25, 0.2], [0.18, 0.1, 0.23], [-0.25, 0.32, 0.21],
  [-0.62, 0.05, 0.15], [0.48, 0.32, 0.15],
];
// Camo: blotches (x, y, half width, half height, turn, shade) in body lengths and heights
const CAMO = [
  [0.4, -0.55, 0.16, 0.22, 0.4, 0], [0.05, -0.65, 0.2, 0.18, -0.3, 1], [-0.35, -0.5, 0.18, 0.26, 0.8, 2],
  [-0.7, -0.1, 0.12, 0.24, 0.2, 0], [0.25, -0.1, 0.14, 0.2, -0.6, 2], [-0.1, 0.0, 0.2, 0.16, 0.3, 0],
  [-0.45, 0.25, 0.2, 0.2, -0.4, 1], [0.1, 0.45, 0.22, 0.16, 0.1, 2], [0.55, 0.2, 0.1, 0.18, 0.7, 1],
  [-0.15, 0.62, 0.18, 0.14, -0.2, 0],
];
const CAMO_SHADES = ["rgba(120, 45, 5, 0.75)", "rgba(40, 22, 10, 0.75)", "rgba(255, 170, 60, 0.7)"];
// Spotted: where the spots go, in body lengths and heights, and their size in body heights
const SPOTS = [
  [0.35, -0.5, 0.13], [0.05, -0.62, 0.11], [-0.3, -0.45, 0.12], [-0.6, -0.15, 0.09],
  [0.2, -0.05, 0.1], [-0.12, 0.05, 0.12], [-0.42, 0.3, 0.1], [0.12, 0.45, 0.09], [0.45, 0.35, 0.07],
];

const SHARK_FIN = "#56687a";
const SWING_TIME = 0.32; // s for a darter to swing round toward you and face the other way

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
  darter = false; // now and then swings round and cuts back before carrying on (sharks, and fish in Survival)
  // cruise → swing round (turn) → cut back on a slant (back) → swing round again (return) → cruise
  private dart: "cruise" | "turn" | "back" | "return" = "cruise";
  private dartTimer = 2 + Math.random() * 3; // cruise: until the next dart; back: until swinging forward again
  private cruiseVx = 0;
  private cruiseVy = 0;
  private surge = 0; // extra forward speed coming out of a dart, fading out
  // Mid-swing: how far round (0..1), and the speed and tilt it eases between. It turns toward you,
  // like a real fish turning in the water seen side-on: the body narrows to head-on and widens
  // again facing the other way, tilting onto the slant as it goes.
  private swing = 0;
  private swingFrom = { vx: 0, vy: 0, angle: 0 };
  private swingTo = { vx: 0, vy: 0, angle: 0 };
  private yaw = 1; // side-on width: 1 facing `facing`, 0 head-on, -1 facing the other way
  // The hero, holding still, glances about nervously (Thomas, 2026-11-05: "subtly"). Where the pupil
  // sits, in eye widths from the eye's middle; straight ahead is (0.2, 0).
  nervous = false;
  // the hero's shop cosmetics; every other fish stays plain
  look: Look = "plain";
  hat: Hat | null = null;
  private spin = 0; // the propeller cap's turn, faster the faster the fish swims
  private gaze = { x: 0.2, y: 0 };
  private lookTo = { x: 0.2, y: 0 };
  private lookTimer = 0;
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
   * The body as a capsule for collisions, fitted to the drawn body and tilted and turned with it,
   * so a darting shark can't bite with empty water. Fins and tail don't count.
   */
  hitbox(): Capsule {
    const [back, front, radius] = this.kind === "shark" ? [0.84, 1.14, 0.36] : [0.55, 0.7, 0.5];
    // the nose's way, one r long, shorter as it swings round head-on to you
    const ax = Math.cos(this.angle) * this.facing * this.yaw * this.r;
    const ay = Math.sin(this.angle) * this.facing * this.yaw * this.r;
    return {
      x0: this.x - back * ax,
      y0: this.y - back * ay,
      x1: this.x + front * ax,
      y1: this.y + front * ay,
      radius: radius * this.r,
    };
  }

  /** `top`/`bottom`: how high and low it can swim, so a dart slants toward open water. */
  update(dt: number, top = -Infinity, bottom = Infinity): void {
    if (this.darter) this.darting(dt, top, bottom);
    this.glance(dt);
    if (this.hat === "propeller") this.spin += dt * (4 + Math.hypot(this.vx, this.vy) / 18);
    this.x += this.vx * (1 + this.surge) * dt;
    this.y += this.vy * dt;
  }

  /** Nervous: every so often the pupil flicks somewhere new (mostly back the way it came, or up),
   * now and then back ahead. Calm: it settles back to ahead. */
  private glance(dt: number): void {
    if (this.nervous) {
      this.lookTimer -= dt;
      if (this.lookTimer <= 0) {
        const spots = [
          [0.2, 0], // ahead
          [-0.3, 0], // behind
          [-0.22, -0.22], // up and behind
          [0.08, -0.3], // up
          [0.08, 0.28], // down
        ];
        let next;
        do next = spots[Math.floor(Math.random() * spots.length)];
        while (next[0] === this.lookTo.x && next[1] === this.lookTo.y);
        this.lookTo = { x: next[0], y: next[1] };
        this.lookTimer = 0.4 + Math.random() * 1.1;
      }
    } else {
      this.lookTo = { x: 0.2, y: 0 };
      this.lookTimer = 0.3; // the first glance comes soon after holding still
    }
    const k = Math.min(1, dt * 25); // a quick flick, not a slow roll
    this.gaze.x += (this.lookTo.x - this.gaze.x) * k;
    this.gaze.y += (this.lookTo.y - this.gaze.y) * k;
  }

  /**
   * A dart: swing round toward the viewer and cut back on a slant up or down, then swing round
   * again and shoot off the original way with a burst of speed. In between, it cruises as normal.
   * (It was a hard Z, flipping around on the spot; Thomas, 2026-11-06, wanted it to turn smoothly.)
   */
  private darting(dt: number, top: number, bottom: number): void {
    this.surge *= Math.exp(-2.5 * dt);
    if (this.dart === "turn" || this.dart === "return") {
      this.swinging(dt);
      return;
    }
    this.dartTimer -= dt;
    if (this.dart === "cruise" && this.dartTimer <= 0) {
      this.cruiseVx = this.vx;
      this.cruiseVy = this.vy;
      // the slant back goes up or down, toward open water when an edge is near
      const room = 160 + this.r;
      const down = this.y - top < room ? true : bottom - this.y < room ? false : Math.random() < 0.5;
      // a shallow slant, 20-32 degrees whatever its speed (a fixed 150-210 px/s down was 45-80 degrees,
      // fine while the body barely tilted, far too steep once it leaned the whole way; Thomas)
      const backVx = -this.cruiseVx * 1.5; // lunges back faster than it cruises (was 0.9x; Thomas's wife: too easy and slow)
      const slant = (20 + Math.random() * 12) * (Math.PI / 180);
      this.startSwing("turn", backVx, (down ? 1 : -1) * Math.abs(backVx) * Math.tan(slant));
    } else if (this.dart === "back" && this.dartTimer <= 0) {
      this.startSwing("return", this.cruiseVx, this.cruiseVy);
    }
    // lean along the slant on the way back; level when cruising
    const lean = this.dart === "back" ? Math.atan2(this.vy * this.facing, this.vx * this.facing) : 0;
    this.angle += (lean - this.angle) * Math.min(1, dt * 10);
  }

  /** Start swinging round to swim at (vx, vy), tilted along it, or level if it's heading back to cruise. */
  private startSwing(phase: "turn" | "return", vx: number, vy: number): void {
    this.dart = phase;
    this.swing = 0;
    const facing = -this.facing; // where it'll face once round
    this.swingFrom = { vx: this.vx, vy: this.vy, angle: this.angle };
    this.swingTo = { vx, vy, angle: phase === "turn" ? Math.atan2(vy * facing, vx * facing) : 0 };
  }

  /**
   * Turn a bit further round. Speed and tilt ease from start to end; the width goes from side-on,
   * through head-on, to side-on the other way. Once round, a fish drawn at width -1 is exactly one
   * facing the other way at width 1, so it swaps to that and nothing jumps.
   */
  private swinging(dt: number): void {
    this.swing = Math.min(1, this.swing + dt / SWING_TIME);
    const e = (1 - Math.cos(Math.PI * this.swing)) / 2; // ease in and out
    const a = this.swingFrom;
    const b = this.swingTo;
    this.vx = a.vx + (b.vx - a.vx) * e;
    this.vy = a.vy + (b.vy - a.vy) * e;
    this.angle = a.angle + (b.angle - a.angle) * e;
    this.yaw = Math.cos(Math.PI * this.swing);
    if (this.swing < 1) return;

    this.facing = this.facing === 1 ? -1 : 1;
    this.yaw = 1;
    if (this.dart === "turn") {
      this.dart = "back";
      this.dartTimer = 0.4 + Math.random() * 0.2; // the leg back: at 1.5x speed, a bit further than 0.5-0.75 s at 0.9x was
    } else {
      this.dart = "cruise";
      this.dartTimer = 3 + Math.random() * 3;
      this.surge = 0.8;
    }
  }

  /** Stop mid-swing, side-on and facing the way it looks (for a fish that gets hooked). */
  settle(): void {
    if (this.dart !== "turn" && this.dart !== "return") return;
    if (this.yaw < 0) this.facing = this.facing === 1 ? -1 : 1;
    this.yaw = 1;
    this.dart = "cruise";
    this.dartTimer = 3 + Math.random() * 3;
  }

  /** Draw the fish. `danger` swaps the outline for a red one (fish that can eat the player). */
  draw(ctx: CanvasRenderingContext2D, time: number, danger = false): void {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    // Mid-swing it looms a touch larger, turning toward you. It never gets thinner than a sliver,
    // or it would vanish head-on; at that width the swap to the other side doesn't show.
    const loom = 1 + 0.12 * (1 - Math.abs(this.yaw));
    const width = (this.yaw < 0 ? -1 : 1) * Math.max(0.22, Math.abs(this.yaw));
    ctx.scale(this.facing * width * loom, Math.cos(Math.PI * this.flip) * loom);
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
    const key = `${this.r}|${danger}|${scale}|${this.look}`;
    if (key !== this.spriteKey) {
      let c = this.sprite;
      if (!c) {
        c = document.createElement("canvas");
        // the browser can drop it (a graphics driver reset, say), and it comes back blank
        c.addEventListener("contextrestored", () => (this.spriteKey = ""));
      }
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
    const spin = this.look === "rainbow" ? (time * 60) % 360 : undefined; // a rainbow's fins cycle
    const L = this.r * 1.2; // half-length of the body
    const B = this.r * 0.62; // half-height of the body
    const wag = Math.sin(time * 8 + this.phase) * B * 0.25;
    const flap = Math.sin(time * 10 + this.phase);

    // forked tail
    ctx.fillStyle = this.tone(70, 45, 0.9, spin);
    ctx.beginPath();
    ctx.moveTo(-L * 0.75, 0);
    ctx.quadraticCurveTo(-L * 1.15, -B * 0.4 + wag * 0.5, -L * 1.5, -B * 1.0 + wag);
    ctx.quadraticCurveTo(-L * 1.25, wag * 0.6, -L * 1.5, B * 1.0 + wag);
    ctx.quadraticCurveTo(-L * 1.15, B * 0.4 + wag * 0.5, -L * 0.75, 0);
    ctx.fill();
    this.finRays(ctx, -L * 0.8, 0, -L * 1.4, wag, B * 0.8, this.tone(60, 30, 0.35, spin));

    this.cached(ctx, danger, [-L * 0.9, -B * 1.3, L * 1.02, B * 1.15], (c) => this.fishBodyParts(c, danger));
    // the cached eye looks ahead; a glancing one is painted over it (the white covers the old pupil)
    if (!this.darter && (Math.abs(this.gaze.x - 0.2) > 0.01 || Math.abs(this.gaze.y) > 0.01))
      this.eye(ctx, L * 0.58, -B * 0.18, this.r * 0.15, "#1a1a1a", this.gaze);

    // pectoral fin, flapping
    ctx.fillStyle = this.tone(75, 60, 0.75, spin);
    ctx.beginPath();
    ctx.moveTo(L * 0.25, B * 0.25);
    ctx.quadraticCurveTo(-L * 0.05, B * (0.55 + flap * 0.15), -L * 0.15, B * (0.25 + flap * 0.2));
    ctx.quadraticCurveTo(L * 0.05, B * 0.15, L * 0.25, B * 0.25);
    ctx.fill();

    if (this.hat) drawHat(ctx, this.hat, this.r, time, this.spin + time * 4);
  }

  /** A color on this fish, as hsl from the plain fish's saturation and lightness, shifted for its
   * look. `hue` overrides the hue (a rainbow's cycling fins). */
  private tone(s: number, l: number, a = 1, hue?: number): string {
    const t = LOOK_TONE[this.look] ?? LOOK_TONE.plain; // an unknown look draws plain, never crashes
    const h = hue ?? t.h ?? this.hue;
    return `hsl(${h} ${Math.min(100, s * t.s)}% ${Math.min(95, l * t.l + t.dl)}% / ${a})`;
  }

  /** Everything on a fish but the tail and the flapping pectoral fin. */
  private fishBodyParts(ctx: CanvasRenderingContext2D, danger: boolean): void {
    const L = this.r * 1.2;
    const B = this.r * 0.62;
    const edge = danger ? "rgba(235, 50, 50, 0.95)" : this.tone(60, 25, 0.8);
    const lw = Math.max(1, this.r * 0.05);

    // dorsal and anal fins
    ctx.fillStyle = this.tone(70, 45, 0.9);
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
    if (this.look === "rainbow") RAINBOW.forEach((c, i) => g.addColorStop(i / (RAINBOW.length - 1), c));
    else {
      g.addColorStop(0, this.tone(65, 35));
      g.addColorStop(0.45, this.tone(75, 55));
      g.addColorStop(1, this.tone(80, 85));
    }
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = edge;
    ctx.lineWidth = danger ? this.dangerWidth() : lw;
    ctx.stroke();

    // scale pattern, clipped to the body
    ctx.save();
    this.fishBody(ctx, L, B);
    ctx.clip();
    ctx.strokeStyle = this.tone(60, 30, 0.18);
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
    ctx.strokeStyle = this.tone(60, 30, 0.3);
    ctx.beginPath();
    ctx.moveTo(L * 0.4, -B * 0.2);
    ctx.quadraticCurveTo(0, -B * 0.35, -L * 0.75, 0);
    ctx.stroke();
    this.pattern(ctx, L, B, lw);
    ctx.restore();

    // gill
    ctx.strokeStyle = this.tone(60, 28, 0.6);
    ctx.lineWidth = lw * 1.3;
    ctx.beginPath();
    ctx.arc(L * 0.15, 0, B * 0.75, -Math.PI / 3.2, Math.PI / 3.2);
    ctx.stroke();

    // mouth
    ctx.strokeStyle = this.tone(50, 20, 0.8);
    ctx.beginPath();
    ctx.moveTo(L * 0.98, B * 0.12);
    ctx.lineTo(L * 0.82, B * 0.18);
    ctx.stroke();

    // fish that dart (Survival's later levels) get the same wild red eyes as darting sharks
    if (this.darter) this.crazyEye(ctx, L * 0.58, -B * 0.18, this.r * 0.15);
    else this.eye(ctx, L * 0.58, -B * 0.18, this.r * 0.15, "#1a1a1a");
  }

  /** The look's markings, painted over the body (already clipped to it). */
  private pattern(ctx: CanvasRenderingContext2D, L: number, B: number, lw: number): void {
    if (this.look === "clown") {
      // three white bands edged in black: behind the eye, mid-body, and at the tail
      for (const [x, w] of [[0.38, 0.17], [-0.05, 0.2], [-0.62, 0.13]]) {
        const band = new Path2D();
        band.moveTo(L * (x + 0.06), -B * 1.2);
        band.quadraticCurveTo(L * (x - 0.1), 0, L * (x + 0.06), B * 1.2);
        ctx.strokeStyle = "#16120f";
        ctx.lineWidth = L * w + lw * 3;
        ctx.stroke(band);
        ctx.strokeStyle = "#fbfbf6";
        ctx.lineWidth = L * w;
        ctx.stroke(band);
      }
    } else if (this.look === "spots") {
      ctx.fillStyle = "rgba(70, 30, 10, 0.55)";
      for (const [x, y, size] of SPOTS) {
        ctx.beginPath();
        ctx.ellipse(L * x, B * y, B * size * 1.2, B * size, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (this.look === "tiger") {
      // tapered black stripes down from the back, and shorter ones up from the belly
      ctx.strokeStyle = "rgba(25, 15, 10, 0.8)";
      ctx.lineCap = "round";
      for (let i = 0; i < 7; i++) {
        const x = L * (0.42 - i * 0.19);
        ctx.lineWidth = L * (0.075 - i * 0.004);
        ctx.beginPath();
        ctx.moveTo(x + L * 0.04, -B * 1.1);
        ctx.quadraticCurveTo(x - L * 0.07, -B * 0.5, x + L * 0.01, -B * (0.05 + (i % 2) * 0.15));
        ctx.stroke();
        if (i % 2 === 0 && i < 6) {
          ctx.lineWidth *= 0.7;
          ctx.beginPath();
          ctx.moveTo(x - L * 0.05, B * 1.1);
          ctx.quadraticCurveTo(x, B * 0.75, x - L * 0.02, B * 0.45);
          ctx.stroke();
        }
      }
    } else if (this.look === "pizza") {
      for (const [x, y, size] of PEPPERONI) {
        const r = B * size;
        ctx.fillStyle = "#b8322a";
        ctx.beginPath();
        ctx.arc(L * x, B * y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(90, 15, 10, 0.55)";
        for (const [dx, dy] of [[-0.35, -0.2], [0.3, 0.1], [-0.05, 0.4]]) {
          ctx.beginPath();
          ctx.arc(L * x + r * dx, B * y + r * dy, r * 0.13, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // a few flecks of basil
      ctx.fillStyle = "rgba(40, 120, 40, 0.8)";
      for (const [x, y] of [[0.5, -0.1], [-0.2, -0.75], [-0.55, 0.4], [0.05, 0.75]]) {
        ctx.beginPath();
        ctx.ellipse(L * x, B * y, B * 0.06, B * 0.03, x * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (this.look === "camo") {
      for (const [x, y, w, h, turn, shade] of CAMO) {
        ctx.fillStyle = CAMO_SHADES[shade];
        ctx.beginPath();
        ctx.ellipse(L * x, B * y, L * w, B * h, turn, 0, Math.PI * 2);
        ctx.ellipse(L * (x + w * 0.6), B * (y + h * 0.5), L * w * 0.6, B * h * 0.6, -turn, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (this.look === "gold" || this.look === "silver") {
      // a bright metallic streak across the shoulder
      const shine = ctx.createLinearGradient(L * 0.1, -B, -L * 0.3, B);
      shine.addColorStop(0.25, "rgba(255, 255, 255, 0)");
      shine.addColorStop(0.42, "rgba(255, 255, 255, 0.75)");
      shine.addColorStop(0.5, "rgba(255, 255, 255, 0.15)");
      shine.addColorStop(0.58, "rgba(255, 255, 255, 0.5)");
      shine.addColorStop(0.7, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = shine;
      ctx.fillRect(-L, -B * 1.2, L * 2, B * 2.4);
    } else if (this.look === "midnight") {
      // glowing dots along the side, like a deep-sea fish
      ctx.shadowColor = "#7df9ff";
      ctx.shadowBlur = B * 0.25;
      ctx.fillStyle = "#b8fcff";
      for (let i = 0; i < 7; i++) {
        const x = L * (0.45 - i * 0.18);
        ctx.beginPath();
        ctx.arc(x, B * (0.42 - Math.abs(i - 3) * 0.04), B * 0.07, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
    }
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
    color: string,
  ): void {
    ctx.strokeStyle = color;
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

    // small, mean eye; darters get wild red ones, so you can tell which might double back
    if (this.darter) this.crazyEye(ctx, L * 0.66, -B * 0.25, Math.max(3, this.r * 0.15));
    else this.eye(ctx, L * 0.68, -B * 0.22, this.r * 0.08, "#000");
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

  private eye(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    pupil: string,
    look = { x: 0.2, y: 0 },
  ): void {
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = pupil;
    ctx.beginPath();
    ctx.arc(x + size * look.x, y + size * look.y, size * 0.65, 0, Math.PI * 2);
    ctx.fill();
    // the glint rides with the pupil, always at its upper front (light from above), so it never
    // ends up stranded on the white when the hero glances about (Thomas, 2026-11-06)
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.beginPath();
    ctx.arc(x + size * (look.x + 0.2), y + size * (look.y - 0.3), size * 0.22, 0, Math.PI * 2);
    ctx.fill();
  }

  /** A bright red eye with a pinprick pupil and a few bloodshot veins. */
  private crazyEye(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
    ctx.fillStyle = "#fff6e8";
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(220, 20, 20, 0.7)";
    ctx.lineWidth = Math.max(0.5, size * 0.08);
    ctx.beginPath();
    for (const a of [0.6, 2.4, 3.6, 5.2]) {
      ctx.moveTo(x + Math.cos(a) * size * 0.95, y + Math.sin(a) * size * 0.95);
      ctx.lineTo(x + Math.cos(a + 0.2) * size * 0.6, y + Math.sin(a + 0.2) * size * 0.6);
    }
    ctx.stroke();
    ctx.fillStyle = "#ff1a1a";
    ctx.beginPath();
    ctx.arc(x + size * 0.15, y, size * 0.68, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.arc(x + size * 0.15, y, size * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.beginPath();
    ctx.arc(x + size * 0.35, y - size * 0.25, size * 0.15, 0, Math.PI * 2);
    ctx.fill();
  }
}
