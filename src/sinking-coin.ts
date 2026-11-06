// Sinking coins (Thomas, 2026-11-06): as you grow, a single gold coin now and then drops in from the
// surface and flutters down to the sand like a real coin in water, tumbling end over end and drifting
// side to side, worth bonus points and coins if you eat it on the way. The treasure chest on the sand
// also bursts open now and then, flinging a few up that then sink the same way. (They replaced a
// clump of golden fish food.) A coin never hangs from a line, so it can't be mistaken for the hook's
// worm: shiny and loose is treasure, a worm on a line is death.

const SINK_SPEED = 48; // px/s on average; faster edge-on, slower face-on, like a coin in water
const DRIFT = 16; // px of side-to-side drift as it sinks
const REST = 5; // seconds it sits on the sand, then it's gone
const BLINK = 1.6; // the last of those it flashes, faster and faster, to warn it's about to go (Thomas)
const FLASHES = 5;
const RADIUS = 13; // for eating it; a little generous, so a near miss still counts
const R = 10; // the coin as drawn
const THICK = 2.6; // its edge, seen when it's side-on
const SETTLE = 0.9; // seconds it rocks on the sand before lying still
const WATER_PULL = 520; // px/s² slowing a coin flung up out of the chest, then pulling it back down

export class SinkingCoin {
  x: number;
  y: number;
  eaten = false;
  private x0: number;
  private born: number;
  private landedAt: number | null = null;
  private seed = Math.random() * 10;
  private flip = Math.random() * Math.PI * 2; // turn about its upright axis; face-on at 0 and PI
  private spin = (4.5 + Math.random() * 2.5) * (Math.random() < 0.5 ? -1 : 1); // radians/s
  private landFlip = 0;
  private fling: { vx: number; vy: number } | null = null;

  /** Dropped in from the surface at x; or, given a starting point and a fling, thrown from there. */
  constructor(x: number, born: number, from?: { y: number; vx: number; vy: number }) {
    this.x0 = this.x = x;
    this.y = from ? from.y : -15;
    this.born = born;
    if (from) this.fling = { vx: from.vx, vy: from.vy };
  }

  /** Flutter down, settle on the sand, flash, then vanish. Returns false once it's gone. */
  update(dt: number, time: number, sandTop: number): boolean {
    if (this.eaten) return false;
    const f = this.fling;
    if (f) {
      // flung out of the chest: it rises, the water slows it, and once it's sinking it flutters
      f.vy += WATER_PULL * dt;
      f.vx *= Math.exp(-1.5 * dt);
      this.x += f.vx * dt;
      this.y = Math.max(20, this.y + f.vy * dt);
      this.flip += this.spin * 1.8 * dt;
      if (f.vy >= SINK_SPEED * 0.7) {
        this.fling = null;
        // carry on drifting from right here, without a jump
        const t = time - this.born;
        this.x0 = this.x - (Math.sin(t * 1.3 + this.seed) * DRIFT + Math.sin(t * 3.1 + this.seed * 2) * 3);
      }
      return true;
    }
    if (this.landedAt === null) {
      // face-on it catches the water and slows; edge-on it slips down faster
      const edgeOn = Math.abs(Math.sin(this.flip));
      this.y += SINK_SPEED * (0.7 + 0.6 * edgeOn) * dt;
      this.flip += this.spin * dt;
      const t = time - this.born;
      this.x = this.x0 + Math.sin(t * 1.3 + this.seed) * DRIFT + Math.sin(t * 3.1 + this.seed * 2) * 3;
      if (this.y >= sandTop - R + 2) {
        this.y = sandTop - R + 2;
        this.landedAt = time;
        this.landFlip = this.flip;
      }
      return true;
    }
    return time - this.landedAt < REST;
  }

  /** A circle you can bite, flashing or not, until it's gone. */
  hitbox(time: number): { x0: number; x1: number; y: number; radius: number } | null {
    if (this.landedAt !== null && time - this.landedAt >= REST) return null;
    return { x0: this.x, x1: this.x, y: this.y, radius: RADIUS };
  }

  /** Its turn right now: tumbling while it sinks, then rocking to a stop face-on on the sand. */
  private angle(time: number): number {
    if (this.landedAt === null) return this.flip;
    const t = time - this.landedAt;
    const rest = Math.round(this.landFlip / Math.PI) * Math.PI;
    if (t >= SETTLE) return rest;
    return rest + (this.landFlip - rest) * Math.exp(-5 * t) * Math.cos(t * 16);
  }

  /** 1 normally; in its last moments on the sand, on and off, the flashes coming quicker each time. */
  private blink(time: number): number {
    if (this.landedAt === null) return 1;
    const u = (time - this.landedAt - (REST - BLINK)) / BLINK; // 0 to 1 over the blinking
    if (u <= 0) return 1;
    const phase = Math.pow(Math.min(1, u), 1.5) * FLASHES; // speeds up toward the end
    return phase % 1 < 0.5 ? 0.15 : 1;
  }

  draw(ctx: CanvasRenderingContext2D, time: number): void {
    const alpha = this.blink(time);
    const a = this.angle(time);
    const c = Math.cos(a);
    const s = Math.sin(a);
    const w = Math.max(0.06, Math.abs(c)); // how wide the face looks, 1 face-on, ~0 edge-on
    const tilt = this.landedAt === null ? Math.sin((time - this.born) * 2.2 + this.seed) * 0.35 : 0.12;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(this.x, this.y);

    // soft golden glow, gently pulsing, so it stands out against busy water
    const pulse = 0.75 + 0.25 * Math.sin(time * 4 + this.seed);
    const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 24 * pulse);
    glow.addColorStop(0, "rgba(255, 220, 90, 0.5)");
    glow.addColorStop(1, "rgba(255, 220, 90, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, 24 * pulse, 0, Math.PI * 2);
    ctx.fill();

    ctx.rotate(tilt);

    // the edge: a darker copy of the face, pushed out to the side it's turning toward
    const edge = THICK * Math.abs(s) * Math.sign(c * s || 1);
    ctx.fillStyle = "#8a5a00";
    ctx.beginPath();
    ctx.ellipse(edge, 0, R * w, R, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(Math.min(0, edge), -R, Math.abs(edge), R * 2);

    // the face: brighter when it's square to the light, duller as it turns away
    const lit = 0.55 + 0.45 * w;
    const face = ctx.createLinearGradient(-R * w, -R, R * w, R);
    face.addColorStop(0, shade("#fff1a8", lit));
    face.addColorStop(0.45, shade("#ffc93c", lit));
    face.addColorStop(1, shade("#c98a00", lit));
    ctx.fillStyle = face;
    ctx.beginPath();
    ctx.ellipse(0, 0, R * w, R, 0, 0, Math.PI * 2);
    ctx.fill();

    // rim and the raised fish stamped on it, squashed with the face
    ctx.save();
    ctx.scale(w * (c < 0 ? -1 : 1), 1); // the back shows the fish swimming the other way
    ctx.strokeStyle = shade("#b9770e", lit);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(0, 0, R - 2.2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = shade("#d99a12", lit);
    ctx.beginPath();
    ctx.ellipse(-0.8, 0, 4, 2.6, 0, 0, Math.PI * 2);
    ctx.moveTo(2.6, 0);
    ctx.lineTo(5.6, -2.6);
    ctx.lineTo(5.6, 2.6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = shade("#7a4d00", lit);
    ctx.beginPath();
    ctx.arc(-3, -0.5, 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // a flash of light sweeping across as it turns through face-on
    const flash = Math.pow(Math.max(0, w - 0.75) / 0.25, 2);
    if (flash > 0.01) {
      ctx.fillStyle = `rgba(255, 255, 235, ${0.55 * flash})`;
      ctx.beginPath();
      ctx.ellipse(-R * w * 0.3, -R * 0.35, R * w * 0.35, R * 0.22, -0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // a twinkle now and then at the coin's edge
    const cycle = (time * 0.9 + this.seed) % 1;
    if (cycle < 0.25) {
      const k = Math.floor(time * 0.9 + this.seed);
      const sz = Math.sin((cycle / 0.25) * Math.PI) * 6;
      const sx = this.x + Math.sin(k * 2.3) * R * 0.8 * w;
      const sy = this.y + Math.cos(k * 1.7) * R * 0.8;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#fffbe6";
      ctx.beginPath();
      ctx.moveTo(sx, sy - sz);
      ctx.lineTo(sx + sz * 0.25, sy - sz * 0.25);
      ctx.lineTo(sx + sz, sy);
      ctx.lineTo(sx + sz * 0.25, sy + sz * 0.25);
      ctx.lineTo(sx, sy + sz);
      ctx.lineTo(sx - sz * 0.25, sy + sz * 0.25);
      ctx.lineTo(sx - sz, sy);
      ctx.lineTo(sx - sz * 0.25, sy - sz * 0.25);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
}

/** A hex color darkened toward brown-black by `k` (1 = as is). */
function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * k);
  const g = Math.round(((n >> 8) & 255) * k);
  const b = Math.round((n & 255) * k);
  return `rgb(${r}, ${g}, ${b})`;
}
