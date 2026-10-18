import "./style.css";
import { Fish } from "./fish";
import { Sound } from "./sound";
import { SAND_HEIGHT, Scenery } from "./scenery";
import { Hook } from "./hook";
import { Crab } from "./crab";
import { BOARD_TITLE, type Entry, LOCAL, NAME_MAX, fetchScores, qualifies, submitScore } from "./highscores";

type State = "menu" | "playing" | "dead" | "won";

// ---- tuning ----
const START_RADIUS = 14;
// Past this share of the win size nothing outgrows you and sharks stop coming, so the end of the
// game is a feeding frenzy (see FRENZY_* below).
const TOP_FISH_SHARE = 0.55;
const GROWTH = 0.15; // fraction of eaten fish's area added to the player
const FRENZY_GROWTH = 0.09; // less in the frenzy, so the eat-everything part lasts longer
// A fish is worth POINTS × (its size / yours)³. Growth goes by area, so big meals end the game in
// fewer bites; cubing makes them worth it anyway, so going after big fish beats grazing on small
// ones. Being relative to you also keeps scores about the same whatever the screen size.
const POINTS = 500;
const WIN_GLIDE = 3; // how quickly you glide to the middle and swell up after winning; higher is faster
const MIN_FOOD = 6; // always at least this many fish you can eat around (outside the frenzy)
const MAX_FISH = 18;
// Once fish get big, 18 of them would pack the screen. Instead cap how much of the screen their
// bodies cover, and how much of that can be fish that eat you, so there's always room to dodge.
const MAX_COVER = 0.4;
const MAX_DANGER_COVER = 0.22;
const SPAWN_INTERVAL = 0.45; // seconds between spawn attempts
const FOOD_SHARE = 0.65; // share of regular fish that are smaller than you
const BIGGER = [1.05, 1.85]; // size range of the rest, relative to you
// While you're small the water is crowded, and most fish are bigger than you (some by a lot), so
// getting going takes a while and there's plenty to dodge. These ease into the normal values
// above by the time you're EARLY_UNTIL of the way to winning.
const EARLY_MAX_FISH = 22;
const EARLY_SPAWN_INTERVAL = 0.35;
const EARLY_FOOD_SHARE = 0.3; // eases up more slowly than the rest; see foodShare()
const EARLY_BIGGER = [1.5, 6];
const EARLY_GIANT_CHANCE = 0.2;
const EARLY_MAX_DANGER_COVER = 0.3;
const EARLY_UNTIL = 0.3;
const FAST_CHANCE = 0.3; // share of bigger fish that dart along faster than the rest
// In the feeding frenzy everything is food, so pack in lots of smaller fish to gobble up.
const FRENZY_MAX_FISH = 28;
const FRENZY_MAX_COVER = 0.8;
const FRENZY_SPAWN_INTERVAL = 0.2;
const GIANT_CHANCE = 0.08; // share of spawns that are giants, always much bigger than you
const CRAB_POINTS = 50; // for eating the crab in the frenzy
const SHARK_CHANCE = 0.07; // sharks can't be eaten, whatever their size
const DARTER_CHANCE = 0.6; // share of sharks that now and then cut back in a quick Z
const PLAYER_SPEED_SMALL = 320; // top speed when you start out tiny...
const PLAYER_SPEED_BIG = 200; // ...slowing down to this by the win size
const PLAYER_ACCEL = 500; // px/s², so about half a second from standstill to full speed
const PLAYER_DRAG = 1.6; // how quickly you coast to a stop with no keys held; lower drifts further
const JOY_RADIUS = 60; // touch: drag this far from where your finger landed for full speed
const JOY_DEADZONE = 8;
const BUTTON_R = 22;
const HIT_FACTOR = 0.9; // bodies have to overlap slightly, so a graze doesn't count
const RESTART_DELAY = 0.6;
const SKELETON_FLIP_TIME = 0.5; // seconds for your bones to roll belly-up after getting eaten
const SKELETON_FLOAT_SPEED = 25; // px/s they drift up afterwards

const canvas = document.getElementById("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;

let W = 0;
let H = 0;
const scenery = new Scenery();
const hook = new Hook();
const crab = new Crab();

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
  hook.resize(W, H);
  crab.resize(W, H);
}
window.addEventListener("resize", resize);
resize();

/** You win once you nearly fill the screen. A fish is drawn about 3r long and 2r tall. */
function winRadius(): number {
  return Math.max(START_RADIUS * 4, Math.min(W * 0.3, H * 0.55));
}

/** After winning you swell up to this, filling the sea edge to edge (fins can spill off). */
function fillRadius(): number {
  return Math.max(winRadius(), Math.min(W * 0.32, H * 0.6));
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
  if (gameOver()) return tryRestart();
  if (state === "menu") return;
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
  // typing a name for the high score board
  if (e.target instanceof HTMLInputElement) {
    if (e.code === "Escape") skipForm();
    return;
  }
  if (e.code === "KeyM" && !e.repeat) sound.toggleMute();
  // the menu's buttons handle Enter and Space themselves; arrows move between them
  if (state === "menu") {
    if (e.code === "ArrowDown" || e.code === "ArrowUp") {
      e.preventDefault();
      moveMenuFocus(e.code === "ArrowDown" ? 1 : -1);
    }
    return;
  }
  if (e.code === "Escape" && gameOver() && !entering) return showMenu();
  keys.add(e.code);
  if (e.code.startsWith("Arrow") || e.code === "Space") e.preventDefault();
  if (e.code === "Space" && !e.repeat && state === "playing") setPaused(!paused);
  else if (e.code === "Space" || e.code === "Enter") tryRestart();
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

let state: State = "menu";
let paused = false;
let player = makePlayer();
let fish: Fish[] = [];
let score = 0;
let spawnTimer = 0;
let endedAt = 0;
let killer: Fish | null = null;
let hooked = false; // caught on the fishing line, rather than eaten
let pinched = false; // got by the crab
let time = 0;

function makePlayer(): Fish {
  return new Fish(W / 2, H / 2, 0, 0, START_RADIUS, 26); // orange; much redder clashes with the danger outlines
}

function reset(): void {
  state = "playing";
  player = makePlayer();
  fish = [];
  score = 0;
  spawnTimer = 0;
  killer = null;
  hooked = false;
  pinched = false;
  hook.reset();
  crab.reset();
  myRank = -1;
  syncUI();
}

function gameOver(): boolean {
  return state === "dead" || state === "won";
}

function tryRestart(): void {
  if (gameOver() && !entering && time - endedAt > RESTART_DELAY) reset();
}

function setPaused(p: boolean): void {
  paused = p;
  sound.setPaused(p);
}

function endGame(next: State): void {
  state = next;
  endedAt = time;
  syncUI();
  // get the latest board, and ask for a name if this score makes it
  const ended = endedAt;
  fetchScores()
    .then((scores) => {
      board = scores;
      if (gameOver() && endedAt === ended && qualifies(scores, score)) openForm();
    })
    .catch((err) => console.warn(err));
}

// ---- title menu ----
const menu = document.getElementById("menu") as HTMLDivElement;
const menuScores = document.getElementById("menu-scores") as HTMLOListElement;
const toMenu = document.getElementById("to-menu") as HTMLButtonElement;
document.getElementById("scores-title")!.textContent = BOARD_TITLE;
document.getElementById("controls-help")!.textContent = touchUI
  ? "Drag anywhere on the screen to swim. The buttons in the top-right corner pause and mute."
  : "Swim with the arrow keys or WASD. Space pauses, M mutes.";

/** Show the right HTML on top of the game for the current state. */
function syncUI(): void {
  menu.hidden = state !== "menu";
  toMenu.hidden = !gameOver() || entering;
}

function showMenu(): void {
  state = "menu";
  player = makePlayer();
  showScreen("main");
  syncUI();
}

function showScreen(name: string): void {
  for (const s of menu.querySelectorAll<HTMLElement>(".screen")) s.hidden = s.dataset.screen !== name;
  if (name === "scores") loadMenuScores();
  if (!touchUI) menu.querySelector<HTMLButtonElement>(`[data-screen="${name}"] button`)?.focus();
}

function moveMenuFocus(step: number): void {
  const buttons = [...menu.querySelectorAll<HTMLButtonElement>(".screen:not([hidden]) button")];
  const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
  buttons[(i + step + buttons.length) % buttons.length]?.focus();
}

function loadMenuScores(): void {
  const show = (text: string) => {
    menuScores.innerHTML = "";
    const li = document.createElement("li");
    li.style.justifyContent = "center";
    li.textContent = text;
    menuScores.append(li);
  };
  if (board) renderMenuScores(board);
  else show("Loading…");
  fetchScores()
    .then((scores) => {
      board = scores;
      if (scores.length) renderMenuScores(scores);
      else show(LOCAL ? "None yet. Go set one!" : "None yet. Be the first!");
    })
    .catch(() => {
      if (!board) show("Couldn't load the high scores");
    });
}

function renderMenuScores(scores: Entry[]): void {
  menuScores.innerHTML = "";
  scores.forEach((entry, i) => {
    const li = document.createElement("li");
    const name = document.createElement("span");
    name.textContent = `${i + 1}. ${entry.name}`; // textContent, so names can't inject markup
    const points = document.createElement("span");
    points.textContent = entry.score.toLocaleString();
    li.append(name, points);
    menuScores.append(li);
  });
}

menu.addEventListener("click", (e) => {
  const go = (e.target as HTMLElement).closest("button")?.dataset.go;
  if (!go) return;
  sound.start(); // a click is the gesture browsers want before they'll play audio
  if (go === "start") {
    (document.activeElement as HTMLElement | null)?.blur();
    reset();
  } else showScreen(go);
});

toMenu.addEventListener("click", () => {
  toMenu.blur();
  showMenu();
});

showScreen("main");

// ---- high scores ----
const form = document.getElementById("hs-form") as HTMLFormElement;
const nameInput = document.getElementById("hs-name") as HTMLInputElement;
const formError = document.getElementById("hs-error") as HTMLParagraphElement;
const saveButton = form.querySelector("button[type=submit]") as HTMLButtonElement;
let board: Entry[] | null = null; // null until it loads, or if it can't be reached
let myRank = -1; // where the score you just saved landed, so it can be highlighted
let entering = false;
// the last name (or initials) typed, so next time it's already filled in
const NAME_KEY = LOCAL ? "fishy-initials" : "fishy-name";
const NO_INITIALS = "---"; // a local score saved without any

nameInput.maxLength = NAME_MAX;
if (LOCAL) {
  // arcade-style initials: up to three capital letters
  nameInput.placeholder = "ABC";
  nameInput.setAttribute("aria-label", "Your initials");
  nameInput.autocapitalize = "characters";
  nameInput.addEventListener("input", () => {
    nameInput.value = nameInput.value.toUpperCase().replace(/[^A-Z]/g, "");
  });
}

fetchScores()
  .then((scores) => (board = scores))
  .catch((err) => console.warn(err));

function openForm(): void {
  entering = true;
  syncUI();
  form.hidden = false;
  formError.textContent = "";
  try {
    nameInput.value = localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    // storage blocked; just start blank
  }
  if (!touchUI) nameInput.focus(); // on a tablet, let them tap it so the keyboard doesn't cover the board
}

function closeForm(): void {
  entering = false;
  form.hidden = true;
  nameInput.blur();
  syncUI();
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  saveButton.disabled = true;
  formError.textContent = "";
  try {
    const name = nameInput.value.trim();
    if (LOCAL && !name) throw new Error("Type your initials, or Skip");
    const saved = await submitScore(name, score);
    board = saved.scores;
    myRank = saved.rank;
    try {
      localStorage.setItem(NAME_KEY, name);
    } catch {
      // not remembering the name is fine
    }
    closeForm();
  } catch (err) {
    formError.textContent = (err as Error).message;
  } finally {
    saveButton.disabled = false;
  }
});
document.getElementById("hs-skip")!.addEventListener("click", skipForm);

/** Skipping leaves a shared board alone, but your own board still keeps the score. */
function skipForm(): void {
  closeForm();
  if (!LOCAL) return;
  submitScore(NO_INITIALS, score)
    .then((saved) => {
      board = saved.scores;
      myRank = saved.rank;
    })
    .catch((err) => console.warn(err));
}

// ---- spawning ----
function spawnFish(): void {
  const topSize = winRadius() * TOP_FISH_SHARE;
  const frenzy = inFrenzy();
  const e = earlyDone();
  const ease = (early: number, normal: number) => early + (normal - early) * e;
  const roll = Math.random();
  const shark = !frenzy && roll < SHARK_CHANCE;
  const giant = !frenzy && !shark && roll < SHARK_CHANCE + ease(EARLY_GIANT_CHANCE, GIANT_CHANCE);
  let r: number;
  if (frenzy) {
    r = player.r * (0.15 + Math.random() * 0.4);
  } else if (shark) {
    r = Math.max(20, player.r * (0.7 + Math.random() * 0.9));
  } else if (giant) {
    r = Math.max(90 + Math.random() * 90, player.r * (2.2 + Math.random() * 1.5));
  } else {
    const [lo, hi] = [ease(EARLY_BIGGER[0], BIGGER[0]), ease(EARLY_BIGGER[1], BIGGER[1])];
    // keep the fish on screen at the right mix of food and danger, rather than leaving it to chance
    const food = fish.filter((f) => !dangerous(f)).length;
    let ratio = lo + Math.random() * (hi - lo);
    if (food + 1 <= foodShare() * (fish.length + 1)) ratio = 0.3 + Math.random() * 0.65;
    // when there's only room for a few big fish, top up with small snacks so it's never empty
    else if (food < MIN_FOOD) ratio = 0.2 + Math.random() * 0.3;
    r = Math.max(6, player.r * ratio);
  }
  r = Math.min(topSize, r);

  // already enough fish around that can eat you, so leave room to dodge
  const dangerLimit = ease(EARLY_MAX_DANGER_COVER, MAX_DANGER_COVER);
  if ((shark || r >= player.r) && cover(fish.filter(dangerous)) + bodyCover(r) > dangerLimit) return;
  if (cover(fish) + bodyCover(r) > (frenzy ? FRENZY_MAX_COVER : MAX_COVER)) return;

  const fromLeft = Math.random() < 0.5;
  // giants cruise slowly so there's time to get out of the way
  let speed = 40 + Math.random() * 100 + 300 / (r + 10);
  if (!giant && r > player.r && Math.random() < FAST_CHANCE) speed *= 1.4 + Math.random() * 0.4;
  if (giant) speed = 30 + Math.random() * 40;
  if (shark) speed = 110 + Math.random() * 80;
  const margin = r * 1.5; // just out of sight, so big ones don't take ages to arrive
  const x = fromLeft ? -margin : W + margin;
  const y = r * 0.6 + Math.random() * Math.max(1, H - SAND_HEIGHT - r * 0.6);
  const vy = (Math.random() - 0.5) * 30;
  const hue = 170 + Math.random() * 160; // blues/greens/purples, so the player (orange) stands out

  const f = new Fish(x, y, fromLeft ? speed : -speed, vy, r, hue, shark ? "shark" : "fish");
  f.darter = shark && Math.random() < DARTER_CHANCE;
  fish.push(f);
}

/** Past the top fish size, nothing can eat you any more. */
function inFrenzy(): boolean {
  return player.r >= winRadius() * TOP_FISH_SHARE;
}

function dangerous(f: Fish): boolean {
  // sharks can't be eaten, until the frenzy, when you're too big for anything to hurt you
  return f.r >= player.r || (f.kind === "shark" && !inFrenzy());
}

/** Share of the screen a fish's body covers; it's roughly an ellipse 2.4r long and 1.24r tall. */
function bodyCover(r: number): number {
  return (Math.PI * 1.2 * 0.62 * r ** 2) / (W * H);
}

function cover(fs: Fish[]): number {
  return fs.reduce((sum, f) => sum + bodyCover(f.r), 0);
}

// ---- update ----
function update(dt: number): void {
  if (paused) return;
  time += dt;
  scenery.update(dt);
  hook.update(dt);
  crab.update(dt);

  for (const b of bubbles) {
    b.y -= b.speed * dt;
    if (b.y < -10) {
      b.y = H + 10;
      b.x = Math.random() * W;
    }
  }

  // behind the title menu, fish just swim by
  if (state === "menu") {
    spawnTimer -= dt;
    if (spawnTimer <= 0 && fish.length < MAX_FISH) {
      spawnFish();
      spawnTimer = SPAWN_INTERVAL;
    }
    for (let i = fish.length - 1; i >= 0; i--) if (!swim(fish[i], dt)) fish.splice(i, 1);
    hookAFish();
    return;
  }

  if (state !== "playing") {
    for (const f of fish) f.update(dt);
    if (hooked) {
      // dangling nose-up from the hook as it's reeled in
      const p = hook.hangPoint(time, player.r);
      player.x = p.x;
      player.y = p.y;
      player.angle = -player.facing * Math.PI / 2;
    }
    if (state === "won") {
      // glide to the middle and swell up to fill the screen
      const k = 1 - Math.exp(-WIN_GLIDE * dt);
      player.x += (W / 2 - player.x) * k;
      player.y += (H / 2 - player.y) * k;
      // snap the last bit, so the fish's cached image stops being repainted at a new size every frame
      const dr = fillRadius() - player.r;
      player.r = Math.abs(dr) < 0.5 ? fillRadius() : player.r + dr * k;
    }
    if (player.skeleton) {
      // roll belly-up, then float slowly toward the surface
      player.flip = Math.min(1, (time - endedAt) / SKELETON_FLIP_TIME);
      player.y = Math.max(swimRange(player)[0], player.y - SKELETON_FLOAT_SPEED * dt);
    }
    return;
  }

  // player speeds up gradually toward the steered velocity, and coasts to a stop with no input
  const steer = steering();
  if (steer.x || steer.y) {
    const maxSpeed = playerMaxSpeed();
    const dvx = steer.x * maxSpeed - player.vx;
    const dvy = steer.y * maxSpeed - player.vy;
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
  // stop dead at the edges so you don't have to "un-push" away from them
  if (player.x < 0 || player.x > W) player.vx = 0;
  player.x = Math.min(W, Math.max(0, player.x));
  const [top, bottom] = swimRange(player);
  if (player.y < top || player.y > bottom) player.vy = 0;
  player.y = Math.min(bottom, Math.max(top, player.y));

  // spawn
  spawnTimer -= dt;
  const frenzy = inFrenzy();
  const early = earlyDone();
  const maxFish = frenzy ? FRENZY_MAX_FISH : Math.round(EARLY_MAX_FISH + (MAX_FISH - EARLY_MAX_FISH) * early);
  if (spawnTimer <= 0 && fish.length < maxFish) {
    spawnFish();
    spawnTimer = frenzy
      ? FRENZY_SPAWN_INTERVAL
      : EARLY_SPAWN_INTERVAL + (SPAWN_INTERVAL - EARLY_SPAWN_INTERVAL) * early;
  }

  // move fish, collide, cull
  hookAFish();
  // the fishing hook: deadly, unless you're big enough to bite right through the line
  const bait = hook.bait(time);
  if (bait && overlaps({ x0: bait.x, x1: bait.x, y: bait.y, radius: bait.radius })) {
    if (inFrenzy()) {
      hook.snap();
      sound.burp(0.7);
    } else {
      hook.catchPlayer();
      sound.caught();
      hooked = true;
      endGame("dead");
      return;
    }
  }
  // the crab on the sand: deadly too, unless you're big enough to eat it
  const claws = crab.hitbox();
  if (claws && overlaps(claws)) {
    if (inFrenzy()) {
      crab.eaten();
      sound.burp(0.8);
      score += CRAB_POINTS;
    } else {
      crab.pinch();
      sound.eaten();
      pinched = true;
      player.skeleton = true;
      endGame("dead");
      return;
    }
  }

  for (let i = fish.length - 1; i >= 0; i--) {
    const f = fish[i];
    if (!swim(f, dt)) {
      fish.splice(i, 1);
      continue;
    }

    if (touching(f)) {
      if (!dangerous(f)) {
        // bigger meals and a bigger you both make for a deeper burp
        sound.burp(Math.min(1, 0.5 * (f.r / player.r) + 0.5 * progress()));
        score += Math.max(1, Math.round(POINTS * (f.r / player.r) ** 3));
        player.r = Math.sqrt(player.r ** 2 + f.r ** 2 * (inFrenzy() ? FRENZY_GROWTH : GROWTH));
        fish.splice(i, 1);
        if (player.r >= winRadius()) {
          endGame("won");
          return;
        }
      } else {
        sound.eaten();
        killer = f;
        player.skeleton = true;
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

function foodShare(): number {
  // Stays near the early value for longer than the other early settings, reaching normal only
  // as the frenzy starts, so big fish outnumber food for most of the way up.
  const t = Math.min(1, progress() / TOP_FISH_SHARE) ** 2;
  return EARLY_FOOD_SHARE + (FOOD_SHARE - EARLY_FOOD_SHARE) * t;
}

/** 0 at the start, rising to 1 once you're past the slow start. */
function earlyDone(): number {
  return Math.min(1, progress() / EARLY_UNTIL);
}

/** Smaller fish are quicker. Size is on a log scale, so the slowdown is spread over the game. */
function playerMaxSpeed(): number {
  const t = Math.min(1, Math.log(player.r / START_RADIUS) / Math.log(winRadius() / START_RADIUS));
  return PLAYER_SPEED_SMALL + (PLAYER_SPEED_BIG - PLAYER_SPEED_SMALL) * t;
}

/** Move a fish along. Returns false once it has swum off the screen for good. */
function swim(f: Fish, dt: number): boolean {
  f.update(dt);
  // tails reach about 2r behind, so past that it's out of sight (and out of the cover budget)
  if (f.x < -f.r * 2.2 || f.x > W + f.r * 2.2) return false;
  // drifting fish bounce off the top and bottom instead of wandering out of reach
  const [top, bottom] = swimRange(f);
  if ((f.y < top && f.vy < 0) || (f.y > bottom && f.vy > 0)) f.vy = -f.vy;
  return true;
}

/** Highest and lowest a fish's center can go: its body stays (mostly) on screen. */
function swimRange(f: Fish): [number, number] {
  return [f.r * 0.5, H - f.r * 0.4];
}

interface Capsule {
  x0: number;
  x1: number;
  y: number;
  radius: number;
}

function touching(f: Fish): boolean {
  return overlaps(f.hitbox());
}

/** Whether the player's body overlaps a horizontal capsule (a circle, if x0 === x1). */
function overlaps(a: Capsule): boolean {
  return capsulesTouch(a, player.hitbox());
}

function capsulesTouch(a: Capsule, b: Capsule): boolean {
  // both are horizontal capsules, so the distance between them is easy to get
  const gapX = Math.max(0, a.x0 - b.x1, b.x0 - a.x1);
  return Math.hypot(gapX, a.y - b.y) < (a.radius + b.radius) * HIT_FACTOR;
}

/** Once the hook's waited long enough, the first fish to swim into the bait gets reeled in. */
function hookAFish(): void {
  const bait = hook.bait(time);
  if (!bait) return;
  const i = fish.findIndex(
    (f) => hook.wants(f) && capsulesTouch({ x0: bait.x, x1: bait.x, y: bait.y, radius: bait.radius }, f.hitbox()),
  );
  if (i === -1) return;
  hook.catchFish(fish[i]);
  fish.splice(i, 1);
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

function drawOverlay(title: string, subtitle: string, showBoard = false): void {
  ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
  ctx.fillRect(0, 0, W, H);
  // keep the fish that got you lit up, so it's clear what happened
  if (state === "dead" && killer) {
    killer.draw(ctx, time, true);
    player.draw(ctx, time);
  }
  if (state === "dead" && hooked) {
    player.draw(ctx, time);
    hook.draw(ctx, time);
  }
  if (state === "dead" && pinched) {
    crab.draw(ctx);
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
  // with the board, everything moves up to make room; the name form (CSS) sits at H / 2 - 10
  showBoard &&= board !== null;
  const top = showBoard ? H / 2 - 150 : H / 2 - 30;
  ctx.font = "bold 56px system-ui, sans-serif";
  ctx.fillText(title, W / 2, top);
  ctx.font = "24px system-ui, sans-serif";
  ctx.fillText(`Score: ${score.toLocaleString()}`, W / 2, top + 50);
  ctx.font = "18px system-ui, sans-serif";
  if (showBoard && entering) {
    ctx.fillStyle = "#ffd166";
    ctx.fillText(LOCAL ? "Top 5 score! Type your initials:" : "New high score! Type your name:", W / 2, top + 90);
  } else {
    ctx.fillText(subtitle, W / 2, top + 90);
    if (showBoard) drawBoard(top + 140);
  }
  ctx.restore();
}

function drawBoard(y: number): void {
  // a panel behind it, so fish swimming past don't make it hard to read
  ctx.save();
  ctx.shadowColor = "transparent";
  ctx.fillStyle = "rgba(0, 20, 40, 0.55)";
  ctx.beginPath();
  ctx.roundRect(W / 2 - 160, y - 24, 320, 48 + Math.max(1, board!.length) * 28, 12);
  ctx.fill();
  ctx.restore();

  ctx.font = "bold 18px system-ui, sans-serif";
  ctx.fillStyle = "#ffd166";
  let heading = BOARD_TITLE;
  if (LOCAL && myRank === 0) heading = "New best score!";
  else if (LOCAL && myRank > 0) heading = "You made your top 5!";
  ctx.fillText(heading, W / 2, y);
  if (!board!.length) {
    ctx.fillStyle = "#fff";
    ctx.font = "18px system-ui, sans-serif";
    ctx.fillText("None yet!", W / 2, y + 32);
  }
  ctx.font = "20px system-ui, sans-serif";
  board!.forEach((entry, i) => {
    const rowY = y + 32 + i * 28;
    ctx.fillStyle = i === myRank ? "#ffd166" : "#fff";
    ctx.textAlign = "right";
    ctx.fillText(`${i + 1}.`, W / 2 - 100, rowY);
    ctx.textAlign = "left";
    ctx.fillText(entry.name, W / 2 - 88, rowY);
    ctx.textAlign = "right";
    ctx.fillText(entry.score.toLocaleString(), W / 2 + 130, rowY);
  });
  ctx.textAlign = "center";
}

function draw(): void {
  drawBackground();

  if (state === "menu") {
    for (const f of fish) f.draw(ctx, time);
    hook.draw(ctx, time);
    scenery.drawFront(ctx, time);
    crab.draw(ctx); // on the front of the sand, so in front of the seaweed too
    drawButtons();
    return;
  }

  for (const f of fish) f.draw(ctx, time, dangerous(f));
  player.draw(ctx, time);
  hook.draw(ctx, time);
  scenery.drawFront(ctx, time);
  crab.draw(ctx); // on the front of the sand, so in front of the seaweed too

  drawHud();

  drawJoystick();

  const again = touchUI ? "Tap" : "Click or press Space";
  if (state === "dead") drawOverlay(hooked ? "You got caught!" : pinched ? "You got pinched!" : "You got eaten!", `${again} to try again`, true);
  if (paused) drawOverlay("Paused", `${touchUI ? "Tap" : "Press Space"} to keep swimming`);
  if (state === "won") drawOverlay("You're the biggest fish!", `${again} to play again`, true);

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
