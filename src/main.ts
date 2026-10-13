import "./style.css";
import { Fish } from "./fish";
import { Sound } from "./sound";
import { SAND_HEIGHT, Scenery } from "./scenery";

type State = "playing" | "dead" | "won";

// ---- tuning ----
const START_RADIUS = 14;
// Past this share of the win size nothing outgrows you and sharks stop coming, so the end of the
// game is a feeding frenzy.
const TOP_FISH_SHARE = 0.55;
const GROWTH = 0.15; // fraction of eaten fish's area added to the player
const MAX_FISH = 18;
const SPAWN_INTERVAL = 0.45; // seconds between spawn attempts
const GIANT_CHANCE = 0.08; // share of spawns that are giants, always much bigger than you
const SHARK_CHANCE = 0.07; // sharks can't be eaten, whatever their size
const PLAYER_MAX_SPEED = 280;
const PLAYER_ACCEL = 500; // px/s², so about half a second from standstill to full speed
const PLAYER_DRAG = 3; // how quickly you coast to a stop with no keys held
const JOY_RADIUS = 60; // touch: drag this far from where your finger landed for full speed
const JOY_DEADZONE = 8;
const BUTTON_R = 22;
const HIT_FACTOR = 0.9; // bodies have to overlap slightly, so a graze doesn't count
const RESTART_DELAY = 0.6;

const canvas = document.getElementById("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;

let W = 0;
let H = 0;
const scenery = new Scenery();

function resize(): void {
  const dpr = window.devicePixelRatio || 1;
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.floor(W * dpr);
  canvas.height = Math.floor(H * dpr);
  // size in CSS pixels to match exactly; 100vh is taller than the visible area in iPad Safari
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  scenery.resize(W, H, dpr);
}
window.addEventListener("resize", resize);
resize();

/** You win once you nearly fill the screen. A fish is drawn about 3r long and 2r tall. */
function winRadius(): number {
  return Math.max(START_RADIUS * 4, Math.min(W * 0.3, H * 0.55));
}

// ---- input ----
const sound = new Sound();
const keys = new Set<string>();
const touchUI = window.matchMedia("(pointer: coarse)").matches;

// Touch (or mouse-drag) joystick: wherever a finger lands becomes the stick's center.
const joy = { id: null as number | null, ox: 0, oy: 0, x: 0, y: 0 };

type Button = "pause" | "mute";

function buttonPos(b: Button): { x: number; y: number } {
  const y = 16 + BUTTON_R;
  const muteX = W - 16 - BUTTON_R;
  return b === "mute" ? { x: muteX, y } : { x: muteX - BUTTON_R * 2 - 12, y };
}

function buttonAt(x: number, y: number): Button | null {
  for (const b of ["pause", "mute"] as const) {
    if (b === "pause" && state !== "playing") continue;
    const p = buttonPos(b);
    if (Math.hypot(x - p.x, y - p.y) < BUTTON_R + 8) return b;
  }
  return null;
}

canvas.addEventListener("pointerdown", (e) => {
  sound.start();
  const button = buttonAt(e.clientX, e.clientY);
  if (button === "pause") return setPaused(!paused);
  if (button === "mute") return sound.toggleMute();
  if (paused) return setPaused(false);
  if (state !== "playing") return tryRestart();
  if (joy.id === null) {
    Object.assign(joy, { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY });
    canvas.setPointerCapture(e.pointerId);
  }
});

canvas.addEventListener("pointermove", (e) => {
  if (e.pointerId !== joy.id) return;
  joy.x = e.clientX;
  joy.y = e.clientY;
  // past the edge of the stick, drag its center along so reversing direction is quick
  const dx = joy.x - joy.ox;
  const dy = joy.y - joy.oy;
  const d = Math.hypot(dx, dy);
  if (d > JOY_RADIUS) {
    joy.ox = joy.x - (dx / d) * JOY_RADIUS;
    joy.oy = joy.y - (dy / d) * JOY_RADIUS;
  }
});

function releaseJoy(e: PointerEvent): void {
  if (e.pointerId === joy.id) joy.id = null;
}

canvas.addEventListener("pointerup", (e) => {
  sound.start(); // iOS only unlocks audio at the end of a touch, so try again here
  releaseJoy(e);
});
canvas.addEventListener("pointercancel", releaseJoy);

window.addEventListener("keydown", (e) => {
  sound.start();
  keys.add(e.code);
  if (e.code.startsWith("Arrow") || e.code === "Space") e.preventDefault();
  if (e.code === "Space" && !e.repeat && state === "playing") setPaused(!paused);
  else if (e.code === "Space" || e.code === "Enter") tryRestart();
  if (e.code === "KeyM" && !e.repeat) sound.toggleMute();
});

window.addEventListener("keyup", (e) => keys.delete(e.code));
window.addEventListener("blur", () => {
  keys.clear();
  joy.id = null;
  if (state === "playing") setPaused(true);
});

function held(...codes: string[]): boolean {
  return codes.some((c) => keys.has(c));
}

/** Desired direction from the joystick or keys, with length 0..1 (the joystick is analog). */
function steering(): { x: number; y: number } {
  if (joy.id !== null) {
    const dx = joy.x - joy.ox;
    const dy = joy.y - joy.oy;
    const d = Math.hypot(dx, dy);
    if (d < JOY_DEADZONE) return { x: 0, y: 0 };
    const m = Math.min(1, d / JOY_RADIUS);
    return { x: (dx / d) * m, y: (dy / d) * m };
  }
  const x = Number(held("ArrowRight", "KeyD")) - Number(held("ArrowLeft", "KeyA"));
  const y = Number(held("ArrowDown", "KeyS")) - Number(held("ArrowUp", "KeyW"));
  const len = Math.hypot(x, y) || 1;
  return { x: x / len, y: y / len };
}

// ---- state ----
interface Bubble {
  x: number;
  y: number;
  r: number;
  speed: number;
}

const bubbles: Bubble[] = Array.from({ length: 40 }, () => ({
  x: Math.random() * W,
  y: Math.random() * H,
  r: 1 + Math.random() * 4,
  speed: 15 + Math.random() * 40,
}));

let state: State = "playing";
let paused = false;
let player = makePlayer();
let fish: Fish[] = [];
let score = 0;
let spawnTimer = 0;
let endedAt = 0;
let killer: Fish | null = null;
let time = 0;

function makePlayer(): Fish {
  return new Fish(W / 2, H / 2, 0, 0, START_RADIUS, 40);
}

function reset(): void {
  state = "playing";
  player = makePlayer();
  fish = [];
  score = 0;
  spawnTimer = 0;
  killer = null;
}

function tryRestart(): void {
  if (state !== "playing" && time - endedAt > RESTART_DELAY) reset();
}

function setPaused(p: boolean): void {
  paused = p;
  sound.setPaused(p);
}

function endGame(next: State): void {
  state = next;
  endedAt = time;
}

// ---- spawning ----
function spawnFish(): void {
  const topSize = winRadius() * TOP_FISH_SHARE;
  const roll = Math.random();
  const shark = player.r < topSize && roll < SHARK_CHANCE;
  const giant = !shark && roll < SHARK_CHANCE + GIANT_CHANCE;
  let r: number;
  if (shark) {
    r = Math.max(20, player.r * (0.7 + Math.random() * 0.9));
  } else if (giant) {
    r = Math.max(110, player.r * (2.2 + Math.random() * 1.5));
  } else {
    // ~65% of regular fish are smaller than you, the rest are bigger
    const ratio =
      Math.random() < 0.65 ? 0.3 + Math.random() * 0.65 : 1.05 + Math.random() * 0.8;
    r = Math.max(6, player.r * ratio);
  }
  r = Math.min(topSize, r);

  const fromLeft = Math.random() < 0.5;
  // giants cruise slowly so there's time to get out of the way
  let speed = 40 + Math.random() * 100 + 300 / (r + 10);
  if (giant) speed = 30 + Math.random() * 40;
  if (shark) speed = 110 + Math.random() * 80;
  const margin = r * 1.5; // just out of sight, so big ones don't take ages to arrive
  const x = fromLeft ? -margin : W + margin;
  const y = r * 0.6 + Math.random() * Math.max(1, H - SAND_HEIGHT - r * 0.6);
  const vy = (Math.random() - 0.5) * 30;
  const hue = 170 + Math.random() * 160; // blues/greens/purples, so the player (orange) stands out

  fish.push(new Fish(x, y, fromLeft ? speed : -speed, vy, r, hue, shark ? "shark" : "fish"));
}

// ---- update ----
function update(dt: number): void {
  if (paused) return;
  time += dt;
  scenery.update(dt);

  for (const b of bubbles) {
    b.y -= b.speed * dt;
    if (b.y < -10) {
      b.y = H + 10;
      b.x = Math.random() * W;
    }
  }

  if (state !== "playing") {
    for (const f of fish) f.update(dt);
    return;
  }

  // player speeds up gradually toward the steered velocity, and coasts to a stop with no input
  const steer = steering();
  if (steer.x || steer.y) {
    const dvx = steer.x * PLAYER_MAX_SPEED - player.vx;
    const dvy = steer.y * PLAYER_MAX_SPEED - player.vy;
    const dv = Math.hypot(dvx, dvy);
    const step = PLAYER_ACCEL * dt;
    player.vx += dv <= step ? dvx : (dvx / dv) * step;
    player.vy += dv <= step ? dvy : (dvy / dv) * step;
  } else {
    const drag = Math.exp(-PLAYER_DRAG * dt);
    player.vx *= drag;
    player.vy *= drag;
  }
  if (Math.abs(player.vx) > 5) player.facing = player.vx > 0 ? 1 : -1;
  player.update(dt);
  // stop dead at the walls so you don't have to "un-push" out of them
  if (player.x < 0 || player.x > W) player.vx = 0;
  const floor = H - SAND_HEIGHT * 0.5;
  if (player.y < 0 || player.y > floor) player.vy = 0;
  player.x = Math.min(W, Math.max(0, player.x));
  player.y = Math.min(floor, Math.max(0, player.y));

  // spawn
  spawnTimer -= dt;
  if (spawnTimer <= 0 && fish.length < MAX_FISH) {
    spawnFish();
    spawnTimer = SPAWN_INTERVAL;
  }

  // move fish, collide, cull
  for (let i = fish.length - 1; i >= 0; i--) {
    const f = fish[i];
    f.update(dt);

    const offscreen = f.x < -f.r * 5 || f.x > W + f.r * 5;
    if (offscreen) {
      fish.splice(i, 1);
      continue;
    }

    if (touching(f)) {
      if (f.kind !== "shark" && player.r > f.r) {
        // bigger meals and a bigger you both make for a deeper burp
        sound.burp(Math.min(1, 0.5 * (f.r / player.r) + 0.5 * progress()));
        player.r = Math.sqrt(player.r ** 2 + f.r ** 2 * GROWTH);
        score += Math.round(f.r);
        fish.splice(i, 1);
        if (player.r >= winRadius()) {
          endGame("won");
          return;
        }
      } else {
        sound.eaten();
        killer = f;
        endGame("dead");
        return;
      }
    }
  }
}

/** How far you are from starting size (0) to winning size (1). */
function progress(): number {
  return Math.min(1, (player.r - START_RADIUS) / (winRadius() - START_RADIUS));
}

function touching(f: Fish): boolean {
  // both hitboxes are horizontal capsules, so the distance between them is easy to get
  const a = f.hitbox();
  const b = player.hitbox();
  const gapX = Math.max(0, a.x0 - b.x1, b.x0 - a.x1);
  return Math.hypot(gapX, a.y - b.y) < (a.radius + b.radius) * HIT_FACTOR;
}

// ---- drawing ----
function drawBackground(): void {
  scenery.drawBack(ctx, time);

  ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
  for (const b of bubbles) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawHud(): void {
  ctx.save();
  ctx.shadowColor = "rgba(0, 40, 80, 0.6)";
  ctx.shadowBlur = 4;
  ctx.fillStyle = "#fff";
  ctx.font = "bold 20px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(`Score: ${score}`, 16, 14);

  // growth bar toward the win size
  const barW = 200;
  ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
  ctx.fillRect(16, 46, barW, 10);
  ctx.fillStyle = "#ffd166";
  ctx.fillRect(16, 46, barW * progress(), 10);

  ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
  ctx.font = "14px system-ui, sans-serif";
  const mute = sound.muted ? "unmute" : "mute";
  const hint = touchUI
    ? "Drag anywhere to swim"
    : `Arrows / WASD to swim · Space to pause · M to ${mute}`;
  ctx.fillText(hint, 16, 66);
  ctx.restore();
}

function drawJoystick(): void {
  if (joy.id === null || state !== "playing" || paused) return;
  const dx = joy.x - joy.ox;
  const dy = joy.y - joy.oy;
  ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
  ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(joy.ox, joy.oy, JOY_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
  ctx.beginPath();
  ctx.arc(joy.ox + dx, joy.oy + dy, 22, 0, Math.PI * 2);
  ctx.fill();
}

function drawButtons(): void {
  for (const b of ["pause", "mute"] as const) {
    if (b === "pause" && state !== "playing") continue;
    const { x, y } = buttonPos(b);
    ctx.fillStyle = "rgba(0, 30, 60, 0.35)";
    ctx.beginPath();
    ctx.arc(x, y, BUTTON_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    if (b === "pause" && paused) {
      // play triangle
      ctx.beginPath();
      ctx.moveTo(x - 6, y - 9);
      ctx.lineTo(x + 9, y);
      ctx.lineTo(x - 6, y + 9);
      ctx.closePath();
      ctx.fill();
    } else if (b === "pause") {
      ctx.fillRect(x - 7, y - 9, 5, 18);
      ctx.fillRect(x + 2, y - 9, 5, 18);
    } else {
      // speaker, with sound waves or a cross
      ctx.beginPath();
      ctx.moveTo(x - 11, y - 4);
      ctx.lineTo(x - 6, y - 4);
      ctx.lineTo(x, y - 10);
      ctx.lineTo(x, y + 10);
      ctx.lineTo(x - 6, y + 4);
      ctx.lineTo(x - 11, y + 4);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      if (sound.muted) {
        ctx.moveTo(x + 4, y - 5);
        ctx.lineTo(x + 12, y + 5);
        ctx.moveTo(x + 12, y - 5);
        ctx.lineTo(x + 4, y + 5);
      } else {
        ctx.arc(x + 2, y, 6, -Math.PI / 3, Math.PI / 3);
        ctx.moveTo(x + 2 + 11 * Math.cos(-Math.PI / 3), y + 11 * Math.sin(-Math.PI / 3));
        ctx.arc(x + 2, y, 11, -Math.PI / 3, Math.PI / 3);
      }
      ctx.stroke();
    }
  }
}

function drawOverlay(title: string, subtitle: string): void {
  ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
  ctx.fillRect(0, 0, W, H);
  // keep the fish that got you lit up, so it's clear what happened
  if (state === "dead" && killer) {
    killer.draw(ctx, time, true);
    player.draw(ctx, time);
  }
  // and show off how enormous you got
  if (state === "won") player.draw(ctx, time);
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.7)";
  ctx.shadowBlur = 8;
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 56px system-ui, sans-serif";
  ctx.fillText(title, W / 2, H / 2 - 30);
  ctx.font = "24px system-ui, sans-serif";
  ctx.fillText(`Score: ${score}`, W / 2, H / 2 + 20);
  ctx.font = "18px system-ui, sans-serif";
  ctx.fillText(subtitle, W / 2, H / 2 + 60);
  ctx.restore();
}

function draw(): void {
  drawBackground();

  for (const f of fish) f.draw(ctx, time, f.kind === "shark" || f.r >= player.r);
  player.draw(ctx, time);
  scenery.drawFront(ctx, time);

  drawHud();

  drawJoystick();

  const again = touchUI ? "Tap" : "Click or press Space";
  if (state === "dead") drawOverlay("You got eaten!", `${again} to try again`);
  if (paused) drawOverlay("Paused", `${touchUI ? "Tap" : "Press Space"} to keep swimming`);
  if (state === "won") drawOverlay("You're the biggest fish!", `${again} to play again`);

  drawButtons();
}

// ---- loop ----
let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000); // clamp so tab-switching doesn't teleport fish
  last = now;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
