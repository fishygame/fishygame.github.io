import "./style.css";
import { Fish } from "./fish";
import { type EatSound, Sound } from "./sound";
import { SAND_HEIGHT, Scenery } from "./scenery";
import { HOOK_TIMING, Hook } from "./hook";
import { CRAB_TIMING, Crab } from "./crab";
import { SinkingCoin } from "./sinking-coin";
import { Trail } from "./trail";
import { drawChestBack, drawChestFront } from "./chest";
import {
  COIN_RATE,
  COIN_VALUE,
  type Equipped,
  GAME_COINS,
  type Hat,
  ITEMS,
  type Look,
  PROGRESS_COINS,
  SLOT_LABEL,
  type Slot,
  type TrailKind,
  WIN_COINS,
  Wallet,
  isGuestName,
  levelCoins,
  survivalCoins,
} from "./shop";
import {
  BOARD_TITLE,
  type Boards,
  END_LABEL,
  type End,
  type Entry,
  LOCAL,
  NAME_MAX,
  PERIODS,
  PERIOD_LABEL,
  type Period,
  type Saved,
  fetchScores,
  qualifies,
  submitScore,
} from "./highscores";
import { TRACKS } from "./music";
import {
  BLURB,
  DIFFICULTIES,
  DIFFICULTY,
  type Difficulty,
  LABEL,
  MODES,
  type Mode,
  type Ramp,
  SURVIVAL_BOARD,
  SURVIVAL_LEVEL,
  survivalRamp,
} from "./settings";

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
// Speed mode instead scores every fish the same, times a combo that grows with each bite taken
// within COMBO_WINDOW seconds of the last one. Winning before SPEED_PAR earns a time bonus too.
const SPEED_POINTS = 100;
const COMBO_WINDOW = 2;
const COMBO_MAX = 10;
const SPEED_PAR = 300; // seconds
const TIME_BONUS = 100; // points per second under par
// Survival: you start a bit bigger and never grow, and score for every second you last. Holding
// still (no keys or finger, and nearly stopped) is riskier, so it builds a multiplier, one step per
// STILL_STEP seconds up to STILL_MAX; moving drops it back to x1. The levels are in settings.ts.
const SURVIVAL_RADIUS = 20;
const SURVIVAL_POINTS = 10; // per second
const STILL_STEP = 1;
const STILL_MAX = 5;
const STILL_SPEED = 15; // px/s; slower than this counts as still
const NERVOUS_AFTER = 0.8; // s held still, in any mode, before the hero's eyes start darting about
const LEVEL_BANNER = 2.5; // seconds the "Level 4" banner shows
const MAX_HOOKS = 4; // at once, on Survival's last levels; the other modes use one
const MAX_CRABS = 3;
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
// getting going takes a while and there's plenty to dodge. These, and the early settings for each
// difficulty in settings.ts, ease into the normal values above by the time you're EARLY_UNTIL of
// the way to winning (the food share more slowly; see foodShare()).
const EARLY_MAX_FISH = 22;
const EARLY_SPAWN_INTERVAL = 0.35;
const EARLY_UNTIL = 0.3;
// In the feeding frenzy everything is food, so pack in lots of smaller fish to gobble up.
const FRENZY_MAX_FISH = 28;
const FRENZY_MAX_COVER = 0.8;
const FRENZY_SPAWN_INTERVAL = 0.2;
const GIANT_CHANCE = 0.08; // share of spawns that are giants, always much bigger than you
const CRAB_POINTS = 50; // for eating the crab in the frenzy
// sinking coins (not in Survival): a single gold coin fluttering down from the surface now and then.
// They replaced a clump of fish food worth 300 points that came every 40-60 s; a coin comes three
// times as often for a third of the points, so a game pays about the same (Thomas, 2026-11-06).
const COIN_POINTS = 100; // in Speed it also keeps the combo going
const COIN_FIRST = [5, 8]; // seconds into a game before the first one
const COIN_EVERY = [13, 20]; // seconds between the rest
const POPUP_TIME = 1.2; // how long the "+100" floats up
// Fish colors run from green through blue to pink, well clear of the player's orange (hue 26).
const FISH_HUES = [90, 330];
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
// The first of each is the one hook and crab of Classic and Speed (and behind the menu); the rest
// only come out in Survival.
const hooks = Array.from({ length: MAX_HOOKS }, (_, i) => {
  const h = new Hook();
  if (i) h.reset(null);
  return h;
});
const crabs = Array.from({ length: MAX_CRABS }, (_, i) => {
  const c = new Crab();
  if (i) c.reset(null);
  return c;
});

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
  for (const h of hooks) h.resize(W, H);
  for (const c of crabs) c.resize(W, H);
}
window.addEventListener("resize", resize);
// The browser can drop the canvas now and then (a graphics driver reset, say). It comes back blank
// with its scaling gone, so set it all up again.
canvas.addEventListener("contextrestored", resize);
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

type Button = "pause" | "next" | "mute";
const BUTTONS: Button[] = ["pause", "next", "mute"];

/** In a row in the top-right corner: pause (only while playing), next song, mute. */
function buttonPos(b: Button): { x: number; y: number } {
  const y = 16 + BUTTON_R;
  const muteX = W - 16 - BUTTON_R;
  const step = BUTTON_R * 2 + 12;
  return { x: muteX - step * (b === "mute" ? 0 : b === "next" ? 1 : 2), y };
}

function buttonAt(x: number, y: number): Button | null {
  for (const b of BUTTONS) {
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
  if (button === "next") return sound.nextSong();
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
  if (e.code === "KeyN" && !e.repeat) sound.nextSong();
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
let catcher = hooks[0]; // which hook or crab got you
let pincher = crabs[0];
let time = 0;
// what's picked on the title menu, remembered for next visit
let mode: Mode = loadChoice("fishy-mode", MODES, "classic");
let difficulty: Difficulty = loadChoice("fishy-difficulty", DIFFICULTIES, "medium");
// which high score board the menu shows: this week's, all time or player best
let period: Period = loadChoice("fishy-score-period", PERIODS, "week");
let tuning = DIFFICULTY[difficulty];
let startedAt = 0;
// Speed mode
let combo = 0; // bites in the current chain; 0 once it's lapsed
let lastBite = 0;
let timeBonus = 0;
// Survival
let level = 1;
let ramp: Ramp = survivalRamp(1);
let levelNews = ""; // what the new level brings, for the banner
let levelUpAt = -Infinity;
let stillFor = 0; // seconds held still
let points = 0; // the score, with the fractions of a point that build up every frame
let sinking: SinkingCoin[] = [];
let coinTimer = 0;
let popups: { x: number; y: number; text: string; coins: number; at: number }[] = [];
let coinsCaught = 0;
let coinsEarned = 0; // what the game that just ended paid, for the end screen
const wallet = new Wallet();
const trail = new Trail();
let trailKind: TrailKind | null = null; // the hero's, for this game

function loadChoice<T extends string>(key: string, options: T[], fallback: T): T {
  try {
    const saved = localStorage.getItem(key) as T | null;
    return saved && options.includes(saved) ? saved : fallback;
  } catch {
    return fallback; // storage blocked
  }
}

function makePlayer(r = START_RADIUS): Fish {
  return new Fish(W / 2, H / 2, 0, 0, r, 26); // orange; much redder clashes with the danger outlines
}

function reset(): void {
  state = "playing";
  const survival = mode === "survival";
  player = makePlayer(survival ? SURVIVAL_RADIUS : START_RADIUS);
  player.look = (wallet.wearing("look") as Look | null) ?? "plain";
  player.hat = wallet.wearing("hat") as Hat | null;
  trailKind = wallet.wearing("trail") as TrailKind | null;
  trail.clear();
  coinsCaught = 0;
  coinsEarned = 0;
  fish = [];
  score = 0;
  spawnTimer = 0;
  killer = null;
  hooked = false;
  pinched = false;
  tuning = DIFFICULTY[difficulty];
  // Survival starts with no hooks or crabs; they switch on as the levels go up (see survive())
  hooks.forEach((h, i) => h.reset(survival || i ? null : tuning.hook));
  crabs.forEach((c, i) => c.reset(survival || i ? null : tuning.crab));
  level = 1;
  ramp = survivalRamp(1);
  levelNews = "Stay alive!";
  levelUpAt = survival ? time : -Infinity;
  stillFor = 0;
  points = 0;
  if (survival) fillSea();
  startedAt = time;
  combo = 0;
  timeBonus = 0;
  sinking = [];
  popups = [];
  coinTimer = between(COIN_FIRST);
  myRanks = { week: -1, all: -1, players: -1 };
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
  if (next === "won" && mode === "speed") {
    timeBonus = Math.max(0, Math.round(SPEED_PAR - elapsed())) * TIME_BONUS;
    score += timeBonus;
  }
  coinsEarned = gameCoins();
  wallet.award(coinsEarned);
  syncUI();
  // get the latest board, and ask for a name if this score makes it
  const ended = endedAt;
  loadBoard()
    .then((scores) => {
      if (scores && gameOver() && endedAt === ended && qualifies(scores, score, wallet.name || savedName())) openForm();
    })
    .catch((err) => console.warn(err));
}

/** What the game that just ended pays: a coin for playing (Easy's half rounds up), for how far you grew,
 * winning and the sinking coins caught, times the difficulty's rate; in Survival, for each level got through. */
function gameCoins(): number {
  if (mode === "survival") return survivalCoins(level);
  const raw = GAME_COINS + Math.floor(progress() * PROGRESS_COINS) + (state === "won" ? WIN_COINS : 0) + coinsCaught * COIN_VALUE;
  return Math.round(raw * COIN_RATE[difficulty]);
}

/** "+1 coin", "+6 coins". */
function coinWord(n: number): string {
  return `+${n} coin${n === 1 ? "" : "s"}`;
}

/** What a sinking coin pays on this difficulty. */
function caughtCoinValue(): number {
  return Math.round(COIN_VALUE * COIN_RATE[difficulty]);
}

/** Seconds of play so far, not counting pauses; it stops when the game ends. */
function elapsed(): number {
  return (state === "playing" ? time : endedAt) - startedAt;
}

/** Points for a bite: Classic goes by its size next to yours, Speed by how quickly it followed the last. */
function bitePoints(classic: number): number {
  if (mode === "classic") return classic;
  combo = Math.min(COMBO_MAX, combo + 1);
  lastBite = time;
  return SPEED_POINTS * combo;
}

// ---- title menu ----
const menu = document.getElementById("menu") as HTMLDivElement;
const menuScores = document.getElementById("menu-scores") as HTMLOListElement;
const toMenu = document.getElementById("to-menu") as HTMLButtonElement;
document.getElementById("scores-title")!.textContent = BOARD_TITLE;
// a copy pointed at a local Lambda (for trying things out) says so, so nobody takes its scores for real
if (import.meta.env.VITE_SCORE_API) {
  const tag = document.createElement("div");
  tag.id = "test-copy";
  tag.textContent = "Test copy: scores and coins here aren't real";
  document.body.append(tag);
}
document.getElementById("controls-help")!.textContent = touchUI
  ? "Drag anywhere on the screen to swim. The buttons in the top-right corner pause, skip to the next song and mute."
  : "Swim with the arrow keys or WASD. Space pauses, N skips to the next song, M mutes.";

/** Show the right HTML on top of the game for the current state. */
function syncUI(): void {
  menu.hidden = state !== "menu";
  toMenu.hidden = !gameOver() || entering;
}

function showMenu(): void {
  state = "menu";
  player = makePlayer();
  // back to one hook and one crab coming by behind the menu (after Easy's no crab, or Survival's
  // crowd); any extras still about finish their visit and stay away
  hooks.forEach((h, i) => h.setTiming(i ? null : HOOK_TIMING));
  crabs.forEach((c, i) => c.setTiming(i ? null : CRAB_TIMING));
  showScreen("main");
  syncUI();
}

function showScreen(name: string): void {
  for (const s of menu.querySelectorAll<HTMLElement>(".screen")) s.hidden = s.dataset.screen !== name;
  menu.classList.toggle("wide", name === "shop"); // a wider window for the shop on a big screen
  hideFishZoom();
  if (name === "scores") loadMenuScores();
  if (name === "players") {
    addError.textContent = "";
    renderPlayers();
    void wallet.sync();
  }
  if (name === "shop") {
    picked = null;
    shopOpenedAt = time; // the chest swings open
    renderShop();
    void wallet.sync();
  }
  // Focus the screen's first menu button without jumping to it: on the Sound screen that's Back,
  // below the song list, and the menu should still open at the top.
  // (on the main menu that's Start Game, not the Playing as button above it)
  if (!touchUI) menu.querySelector<HTMLButtonElement>(`[data-screen="${name}"] button[data-go]:not(#player-button)`)?.focus({ preventScroll: true });
  menu.scrollTop = 0;
}

/** Pick a mode or difficulty on the menu. The high scores shown switch to its board. */
function pick(kind: string, value: string): void {
  if (kind === "mode" && MODES.includes(value as Mode)) mode = value as Mode;
  else if (kind === "difficulty" && DIFFICULTIES.includes(value as Difficulty)) difficulty = value as Difficulty;
  else return;
  try {
    localStorage.setItem(`fishy-${kind}`, value);
  } catch {
    // not remembering it is fine
  }
  boards = null;
  syncPicks();
  if (!menu.querySelector<HTMLElement>('[data-screen="scores"]')!.hidden) loadMenuScores();
}

/** Light up what's picked (there's a set of choices on the main and high score screens). */
function syncPicks(): void {
  for (const b of menu.querySelectorAll<HTMLButtonElement>(".pick button")) {
    const kind = b.parentElement!.dataset.pick;
    const picked =
      kind === "mode"
        ? mode
        : kind === "difficulty"
          ? difficulty
          : kind === "period"
            ? period
            : kind === "eat"
              ? sound.eatSound
              : shuffle
                ? "on"
                : "off";
    b.setAttribute("aria-pressed", String(b.dataset.value === picked));
  }
  // Survival has no difficulty, so its picker goes away (the choice is kept for the other modes)
  const survival = mode === "survival";
  for (const p of menu.querySelectorAll<HTMLElement>('.pick[data-pick="difficulty"]')) p.style.display = survival ? "none" : "";
  menu.querySelector(".pick-help")!.textContent = survival ? BLURB.survival : `${BLURB[mode]} ${BLURB[difficulty]}`;
  menu.querySelector(".board-help")!.textContent =
    period === "week" ? "Starts fresh every Monday." : period === "players" ? "Each player's best score." : "";
}

/** Switch the menu's high scores between this week, all time and player best. */
function pickPeriod(value: string): void {
  if (!PERIODS.includes(value as Period)) return;
  period = value as Period;
  try {
    localStorage.setItem("fishy-score-period", value);
  } catch {
    // not remembering it is fine
  }
  syncPicks();
  loadMenuScores();
}

// ---- sound choices ----
sound.eatSound = loadChoice<EatSound>("fishy-eat-sound", ["gulp", "burp"], "gulp");

/** Pick the eating sound, and play it so you hear what you picked. */
function pickEatSound(value: string): void {
  if (value !== "gulp" && value !== "burp") return;
  sound.eatSound = value;
  try {
    localStorage.setItem("fishy-eat-sound", value);
  } catch {
    // not remembering it is fine
  }
  syncPicks();
  sound.eat(0.4);
}

// Remembered as the songs switched off, so any songs added later start out on.
const MUSIC_KEY = "fishy-music";
let songsOff: string[] = [];
let shuffle = true;
try {
  const saved = JSON.parse(localStorage.getItem(MUSIC_KEY) ?? "{}");
  if (Array.isArray(saved.off)) songsOff = saved.off;
  if (typeof saved.shuffle === "boolean") shuffle = saved.shuffle;
} catch {
  // storage blocked or garbled: all songs, shuffled
}
const songList = document.getElementById("songs") as HTMLUListElement;
let playingSong: string | null = null;

function applyMusic(): void {
  try {
    localStorage.setItem(MUSIC_KEY, JSON.stringify({ off: songsOff, shuffle }));
  } catch {
    // not remembering it is fine
  }
  sound.setPlaylist(TRACKS.filter((t) => !songsOff.includes(t.id)).map((t) => t.id), shuffle);
  syncPicks();
  renderSongs();
}

/** One row per song: a tick box to have it play or not, and a button to hear it now. */
function renderSongs(): void {
  // rebuilding the rows loses keyboard focus, so put it back where it was
  const was = (document.activeElement as HTMLElement | null)?.dataset;
  const refocus = was?.song ? `[data-song="${was.song}"]` : was?.play ? `[data-play="${was.play}"]` : "";
  songList.innerHTML = "";
  for (const t of TRACKS) {
    const on = !songsOff.includes(t.id);
    const li = document.createElement("li");
    li.classList.toggle("playing", t.id === playingSong);
    const toggle = document.createElement("button");
    toggle.className = "song-on";
    toggle.dataset.song = t.id;
    toggle.setAttribute("aria-pressed", String(on));
    const box = document.createElement("span");
    box.className = "box";
    box.textContent = on ? "\u2713" : "";
    const name = document.createElement("span");
    name.textContent = t.name;
    toggle.append(box, name);
    const play = document.createElement("button");
    play.className = "song-play";
    play.dataset.play = t.id;
    play.textContent = t.id === playingSong ? "\u266A" : "\u25B6";
    play.setAttribute("aria-label", `Play ${t.name}`);
    li.append(toggle, play);
    songList.append(li);
  }
  if (refocus) songList.querySelector<HTMLButtonElement>(refocus)?.focus();
}

sound.onSongChange = (id) => {
  playingSong = id;
  renderSongs();
};

/** "Speed · Hard", say, or just "Survival". */
function boardName(): string {
  return mode === "survival" ? LABEL[mode] : `${LABEL[mode]} · ${LABEL[difficulty]}`;
}

/** The difficulty the current mode's boards are kept under: Survival has just the one. */
function boardDifficulty(): Difficulty {
  return mode === "survival" ? SURVIVAL_BOARD : difficulty;
}

/** The boards for the current mode and difficulty, freshly fetched. Resolves to null if the
 * choice changes while they load. */
async function loadBoard(): Promise<Boards | null> {
  const [m, d] = [mode, boardDifficulty()];
  const fetched = await fetchScores({ mode: m, difficulty: d });
  if (m !== mode || d !== boardDifficulty()) return null;
  boards = fetched;
  return fetched;
}

function moveMenuFocus(step: number): void {
  const buttons = [...menu.querySelectorAll<HTMLButtonElement>(".screen:not([hidden]) button")];
  const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
  buttons[(i + step + buttons.length) % buttons.length]?.focus();
}

function loadMenuScores(): void {
  const show = (text: string) => {
    menuScores.classList.remove("stale");
    menuScores.innerHTML = "";
    const li = document.createElement("li");
    li.style.justifyContent = "center";
    li.textContent = text;
    menuScores.append(li);
  };
  const none = () => {
    const thisWeek = period === "week" ? " this week" : "";
    show(LOCAL ? `None yet${thisWeek}. Go set one!` : `None yet${thisWeek}. Be the first!`);
  };
  if (boards?.[period].length) renderMenuScores(boards[period]);
  else if (boards) none();
  // switching boards: keep the last one up, dimmed, until the new one's in, rather than shrinking
  // to a "Loading…" line and growing again a moment later (Thomas, 2026-11-05: an annoying flash)
  else if (menuScores.children.length) menuScores.classList.add("stale");
  else show("Loading…");
  loadBoard()
    .then((fetched) => {
      if (!fetched) return; // picked another board meanwhile; that one's loading now
      if (fetched[period].length) renderMenuScores(fetched[period]);
      else none();
    })
    .catch(() => {
      if (!boards) show("Couldn't load the high scores");
    });
}

/** A little picture of a player's fish in their outfit, for their row on the boards (Thomas,
 * 2026-11-06: kids want their fish shown off). A plain orange fish for anyone without one. */
function boardFish(entry: Entry): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.className = "fish-icon";
  const dpr = window.devicePixelRatio || 1;
  const [w, h] = [52, 34];
  c.width = w * dpr;
  c.height = h * dpr;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const outfit = entry.outfit ?? wallet.outfitOf(entry.name) ?? {};
  const f = new Fish(29, 21, 0, 0, 12.5, 26);
  const known = (slot: Slot) => {
    const id = outfit[slot];
    return id && ITEMS.some((i) => i.id === id && i.slot === slot) ? id : null;
  };
  f.look = (known("look") as Look | null) ?? "plain";
  f.hat = known("hat") as Hat | null;
  f.draw(g, 0);
  c.addEventListener("pointerenter", (e) => {
    if (e.pointerType === "mouse") showFishZoom(c, entry, outfit);
  });
  c.addEventListener("pointerleave", (e) => {
    if (e.pointerType === "mouse") hideFishZoom();
  });
  c.addEventListener("click", () => (zoomOn?.icon === c ? hideFishZoom() : showFishZoom(c, entry, outfit)));
  return c;
}

// ---- a board fish, big ----
// Point at (or tap) a fish on the boards and it shows big, outfit, trail and all.
const fishZoom = document.createElement("canvas");
fishZoom.id = "fish-zoom";
fishZoom.hidden = true;
document.body.append(fishZoom);
const zoomFish = new Fish(0, 0, 0, 0, 30, 26);
const zoomTrail = new Trail();
let zoomOn: { icon: HTMLElement; name: string; trail: TrailKind | null } | null = null;

function showFishZoom(icon: HTMLElement, entry: Entry, outfit: Equipped): void {
  const known = (slot: Slot) => {
    const id = outfit[slot];
    return id && ITEMS.some((i) => i.id === id && i.slot === slot) ? id : null;
  };
  zoomFish.look = (known("look") as Look | null) ?? "plain";
  zoomFish.hat = known("hat") as Hat | null;
  zoomTrail.clear();
  zoomOn = { icon, name: entry.name, trail: known("trail") as TrailKind | null };
  // out to the left of the board where there's room (so the row stays readable), else to the right,
  // kept on the screen
  const r = icon.getBoundingClientRect();
  const [w, h] = [194, 134];
  const board = menu.getBoundingClientRect();
  const left = board.left - 12 - w >= 8 ? board.left - 12 - w : Math.min(window.innerWidth - 8 - w, r.right + 8);
  fishZoom.style.left = `${left}px`;
  fishZoom.style.top = `${Math.min(window.innerHeight - h - 8, Math.max(8, r.top + r.height / 2 - h / 2))}px`;
  fishZoom.hidden = false;
}

function hideFishZoom(): void {
  zoomOn = null;
  fishZoom.hidden = true;
}

// a tap anywhere else puts it away (on a touch screen there's no pointing away)
document.addEventListener("pointerdown", (e) => {
  if (zoomOn && !(e.target as HTMLElement).classList?.contains("fish-icon")) hideFishZoom();
});

function drawFishZoom(dt: number): void {
  if (!zoomOn) return;
  if (!zoomOn.icon.isConnected) return hideFishZoom(); // the board changed under it
  const dpr = window.devicePixelRatio || 1;
  const [w, h] = [190, 130];
  if (fishZoom.width !== w * dpr) {
    fishZoom.width = w * dpr;
    fishZoom.height = h * dpr;
  }
  const g = fishZoom.getContext("2d") as CanvasRenderingContext2D;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  zoomFish.x = w / 2 + 14;
  zoomFish.y = 58 + Math.sin(time * 2) * 3;
  zoomTrail.update(dt, zoomOn.trail, zoomFish.x, zoomFish.y, 1, zoomFish.r, 200, -70);
  zoomTrail.draw(g, zoomOn.trail, time);
  zoomFish.draw(g, time);
  g.font = "bold 16px system-ui, sans-serif";
  g.textAlign = "center";
  g.fillStyle = "#fff";
  g.shadowColor = "rgba(0, 0, 0, 0.6)";
  g.shadowBlur = 4;
  g.fillText(zoomOn.name, w / 2, h - 12);
}

function renderMenuScores(scores: Entry[]): void {
  hideFishZoom();
  menuScores.classList.remove("stale");
  menuScores.innerHTML = "";
  scores.forEach((entry, i) => {
    const li = document.createElement("li");
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = `${i + 1}. ${entry.name}`; // textContent, so names can't inject markup
    li.append(boardFish(entry));
    const end = document.createElement("span");
    end.className = entry.end === "won" ? "end won" : "end";
    end.textContent = entry.end ? END_LABEL[entry.end] : "";
    const points = document.createElement("span");
    points.className = "points";
    points.textContent = entry.score.toLocaleString();
    li.append(name, end);
    if (timed()) {
      const took = document.createElement("span");
      took.className = "time";
      took.textContent = boardTime(entry);
      li.append(took);
    }
    li.append(points);
    menuScores.append(li);
  });
}

menu.addEventListener("click", (e) => {
  const button = (e.target as HTMLElement).closest("button");
  if (!button) return;
  sound.start(); // a click is the gesture browsers want before they'll play audio
  const go = button.dataset.go;
  const kind = button.parentElement!.dataset.pick;
  if (button.dataset.song) {
    const id = button.dataset.song;
    songsOff = songsOff.includes(id) ? songsOff.filter((x) => x !== id) : [...songsOff, id];
    applyMusic();
  } else if (button.dataset.play) sound.playSong(button.dataset.play);
  else if (button.dataset.item) pickItem(button.dataset.item);
  else if (button.dataset.player) {
    wallet.switchTo(button.dataset.player);
    showScreen("main"); // picked; on to the game
  } else if (button.dataset.guest) {
    wallet.playAsGuest();
    showScreen("main");
  } else if (button.dataset.remove) void removePlayer(button.dataset.remove);
  else if (button.dataset.shop) shopAction(button.dataset.shop);
  else if (kind === "eat") pickEatSound(button.dataset.value!);
  else if (kind === "period") pickPeriod(button.dataset.value!);
  else if (kind === "shuffle") {
    shuffle = button.dataset.value === "on";
    applyMusic();
  } else if (button.dataset.value) pick(kind!, button.dataset.value);
  else if (go === "start") {
    (document.activeElement as HTMLElement | null)?.blur();
    reset();
  } else if (go) showScreen(go);
});

toMenu.addEventListener("click", () => {
  toMenu.blur();
  showMenu();
});

applyMusic();
showScreen("main");

// ---- coin shop ----
const shopItems = document.getElementById("shop-items") as HTMLDivElement;
const shopActionButton = document.getElementById("shop-action") as HTMLButtonElement;
const shopPreview = document.getElementById("shop-preview") as HTMLCanvasElement;
const shopScreen = menu.querySelector<HTMLElement>('[data-screen="shop"]')!;
const playerList = document.getElementById("player-list") as HTMLUListElement;
const addForm = document.getElementById("add-player") as HTMLFormElement;
const addName = document.getElementById("add-name") as HTMLInputElement;
const addError = document.getElementById("add-error") as HTMLParagraphElement;
const syncNote = document.getElementById("sync-note") as HTMLParagraphElement;
let picked: string | null = null; // the item being tried on in the preview
let shopOpenedAt = -Infinity;
const previewFish = new Fish(0, 0, 0, 0, 46, 26);
const previewTrail = new Trail();

// what each difficulty pays, under its name on the main menu, so the kids can see Hard pays more
for (const b of menu.querySelectorAll<HTMLButtonElement>('[data-screen="main"] .pick[data-pick="difficulty"] button')) {
  const rate = COIN_RATE[b.dataset.value as Difficulty];
  const span = document.createElement("span");
  span.className = "rate";
  span.textContent = `coins x${rate === 0.5 ? "\u00BD" : rate}`;
  b.append(span);
}
addName.maxLength = NAME_MAX;
if (LOCAL) {
  // itch: players go by their initials, like its high scores
  addName.placeholder = "Initials (ABC)";
  addName.setAttribute("aria-label", "New player's initials");
  addName.autocapitalize = "characters";
  addName.addEventListener("input", () => {
    addName.value = addName.value.toUpperCase().replace(/[^A-Z]/g, "");
  });
}
document.getElementById("players-help")!.textContent = LOCAL
  ? "Pick who's playing before each game, so the coins go to them."
  : "Pick who's playing before each game, so the coins go to them. There are no passwords: add the same name on another device and your coins come along.";

/** The outfit in the preview: what you're wearing, with the item being tried on swapped in. */
function previewOutfit(): Record<Slot, string | null> {
  const outfit: Record<Slot, string | null> = { look: wallet.wearing("look"), hat: wallet.wearing("hat"), trail: wallet.wearing("trail") };
  const item = ITEMS.find((i) => i.id === picked);
  if (item) outfit[item.slot] = item.id;
  return outfit;
}

function renderShop(): void {
  const balance = wallet.balance();
  for (const n of menu.querySelectorAll(".shop-coins .n")) n.textContent = balance.toLocaleString();
  document.getElementById("shop-balance")!.textContent = balance.toLocaleString();
  document.getElementById("shop-who")!.textContent = wallet.name ? `${wallet.name}: ` : "";
  document.getElementById("shop-nobody")!.hidden = !!wallet.name;
  renderPlayerButton();
  renderPlayers();
  if (shopScreen.hidden) return;
  // keep keyboard focus on the same item across the rebuild
  const focused = (document.activeElement as HTMLElement | null)?.dataset?.item;
  shopItems.innerHTML = "";
  for (const slot of Object.keys(SLOT_LABEL) as Slot[]) {
    const h = document.createElement("h3");
    h.textContent = SLOT_LABEL[slot];
    const grid = document.createElement("div");
    grid.className = "shop-grid";
    for (const item of ITEMS.filter((i) => i.slot === slot)) {
      const b = document.createElement("button");
      b.dataset.item = item.id;
      const wearing = wallet.wearing(slot) === item.id;
      const owned = wallet.owns(item.id);
      b.classList.toggle("picked", picked === item.id);
      b.classList.toggle("wearing", wearing);
      b.classList.toggle("locked", !owned && balance < item.price);
      const tag = document.createElement("span");
      tag.className = "tag";
      if (wearing) tag.textContent = "Wearing";
      else if (owned) tag.textContent = "Yours";
      else {
        const coin = document.createElement("span");
        coin.className = "coin";
        tag.append(coin, item.price.toLocaleString());
      }
      b.append(item.name, tag);
      grid.append(b);
    }
    shopItems.append(h, grid);
  }
  if (focused) shopItems.querySelector<HTMLButtonElement>(`[data-item="${focused}"]`)?.focus();

  const item = ITEMS.find((i) => i.id === picked);
  const pickedLine = document.getElementById("shop-picked")!;
  shopActionButton.disabled = false;
  if (!item) {
    pickedLine.textContent = "";
    shopActionButton.textContent = "Tap something to try it on";
    shopActionButton.disabled = true;
  } else if (wallet.wearing(item.slot) === item.id) {
    pickedLine.textContent = `${item.name}: you're wearing it`;
    shopActionButton.textContent = "Take it off";
  } else if (wallet.owns(item.id)) {
    pickedLine.textContent = `${item.name}: it's yours`;
    shopActionButton.textContent = "Wear it";
  } else if (!wallet.name) {
    pickedLine.textContent = item.name;
    shopActionButton.textContent = "Add your name to buy things";
    shopActionButton.disabled = true;
  } else if (balance >= item.price) {
    pickedLine.textContent = item.name;
    shopActionButton.textContent = `Buy it for ${item.price.toLocaleString()} coins`;
  } else {
    pickedLine.textContent = item.name;
    shopActionButton.textContent = `${(item.price - balance).toLocaleString()} more coins to go!`;
    shopActionButton.disabled = true;
  }
}

/** The main menu's "Playing as Hunter · Switch", or a nudge to pick someone. */
function renderPlayerButton(): void {
  const b = document.getElementById("player-button")!;
  b.innerHTML = "";
  if (!wallet.name) {
    const who = document.createElement("b");
    who.textContent = "Guest";
    b.append("Playing as ", who, wallet.players().length ? " · Switch" : " · Add your name for coins");
  } else {
    const who = document.createElement("b");
    who.textContent = wallet.name; // textContent, so names can't inject markup
    b.append("Playing as ", who, " \u00B7 Switch");
  }
}

/** Who's playing: a row per player on this device (tap to play as them, \u00D7 to take them off). */
function renderPlayers(): void {
  if (menu.querySelector<HTMLElement>('[data-screen="players"]')!.hidden) return;
  playerList.innerHTML = "";
  for (const p of wallet.players()) {
    const li = document.createElement("li");
    const pick = document.createElement("button");
    pick.className = "pick-player";
    pick.dataset.player = p.key;
    pick.setAttribute("aria-pressed", String(p.key === wallet.current));
    const name = document.createElement("span");
    name.textContent = p.name;
    const tag = document.createElement("span");
    tag.className = "tag";
    const coin = document.createElement("span");
    coin.className = "coin";
    tag.append(coin, p.balance.toLocaleString());
    pick.append(name, tag);
    const remove = document.createElement("button");
    remove.className = "remove-player";
    remove.dataset.remove = p.key;
    remove.textContent = "\u00D7";
    remove.setAttribute("aria-label", `Take ${p.name} off this device`);
    li.append(pick, remove);
    playerList.append(li);
  }
  // anyone whose coins haven't reached the server lately (they're safe here, and it keeps trying)
  const stuck = wallet.players().filter((p) => p.syncError);
  syncNote.hidden = !stuck.length;
  syncNote.textContent = stuck.length
    ? `Couldn't save ${stuck.map((p) => p.name).join(" and ")}'s coins to the server yet (${stuck[0].syncError}). They're safe on this device, and it keeps trying.`
    : "";
  // and Guest, always there, so nobody has to add a name just to play
  const li = document.createElement("li");
  const guest = document.createElement("button");
  guest.className = "pick-player";
  guest.dataset.guest = "1";
  guest.setAttribute("aria-pressed", String(!wallet.current));
  const name = document.createElement("span");
  name.textContent = "Guest";
  const tag = document.createElement("span");
  tag.className = "tag";
  tag.textContent = "no coins";
  guest.append(name, tag);
  li.append(guest);
  playerList.append(li);
}

async function removePlayer(key: string): Promise<void> {
  const p = wallet.players().find((x) => x.key === key);
  if (!p) return;
  const sure = LOCAL
    ? `Take ${p.name} off this device? Their coins and stuff here will be gone.`
    : `Take ${p.name} off this device? Their coins and stuff are saved, and come back if ${p.name} is added again.`;
  if (!confirm(sure)) return;
  addError.textContent = "";
  try {
    await wallet.removePlayer(key);
  } catch (err) {
    addError.textContent = (err as Error).message;
  }
}

function pickItem(id: string): void {
  picked = picked === id ? null : id;
  renderShop();
}

function shopAction(what: string): void {
  if (what !== "action") return;
  const item = ITEMS.find((i) => i.id === picked);
  if (!item) return;
  if (wallet.wearing(item.slot) === item.id) wallet.wear(item.slot, null);
  else if (wallet.owns(item.id)) wallet.wear(item.slot, item.id);
  else if (wallet.buy(item.id)) sound.bonus();
  shopActionButton.focus();
}

wallet.onChange = renderShop;
renderShop();
void wallet.sync();
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") void wallet.sync();
});

addForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  addError.textContent = "";
  const button = addForm.querySelector("button")!;
  button.disabled = true;
  try {
    await wallet.addPlayer(addName.value);
    addName.value = "";
    showScreen("main"); // they're picked; on to the game
  } catch (err) {
    addError.textContent = (err as Error).message;
  } finally {
    button.disabled = false;
  }
});

/** The shop's preview: your fish in its outfit, swimming on the spot, trail streaming behind. */
function drawShopPreview(dt: number): void {
  if (state !== "menu" || menu.hidden || shopScreen.hidden) return;
  const dpr = window.devicePixelRatio || 1;
  const w = shopPreview.clientWidth;
  const h = shopPreview.clientHeight;
  if (shopPreview.width !== Math.round(w * dpr) || shopPreview.height !== Math.round(h * dpr)) {
    shopPreview.width = Math.round(w * dpr);
    shopPreview.height = Math.round(h * dpr);
  }
  const p = shopPreview.getContext("2d") as CanvasRenderingContext2D;
  p.setTransform(dpr, 0, 0, dpr, 0, 0);
  p.clearRect(0, 0, w, h);
  const outfit = previewOutfit();
  previewFish.look = (outfit.look as Look | null) ?? "plain";
  previewFish.hat = outfit.hat as Hat | null;
  // the chest: its lid swings open, then your fish rises out of it and bobs above the coins
  const t = time - shopOpenedAt;
  const ease = (x: number) => 1 - (1 - Math.min(1, Math.max(0, x))) ** 3;
  const open = ease(t / 0.45);
  const rise = ease((t - 0.2) / 0.5);
  const cx = w / 2;
  const rimY = h - 64;
  drawChestBack(p, cx, rimY, open, time);
  previewFish.x = cx + 14;
  previewFish.y = rimY + 26 + (-100 + Math.sin(time * 2) * 4) * rise;
  const kind = outfit.trail as TrailKind | null;
  previewTrail.update(dt, rise > 0.9 ? kind : null, previewFish.x, previewFish.y, 1, previewFish.r, 200, -90);
  previewTrail.draw(p, kind, time);
  previewFish.draw(p, time);
  drawChestFront(p, cx, rimY, open);
}

// ---- high scores ----
const form = document.getElementById("hs-form") as HTMLFormElement;
const nameInput = document.getElementById("hs-name") as HTMLInputElement;
const formError = document.getElementById("hs-error") as HTMLParagraphElement;
const saveButton = form.querySelector("button[type=submit]") as HTMLButtonElement;
let boards: Boards | null = null; // null until they load, or if they can't be reached
// where the score you just saved landed on each board, so it can be highlighted
let myRanks: Record<Period, number> = { week: -1, all: -1, players: -1 };
let entering = false;
// the last name (or initials) typed, so next time it's already filled in
const NAME_KEY = LOCAL ? "fishy-initials" : "fishy-name";

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

loadBoard().catch((err) => console.warn(err));

// Someone who's been playing on this device before players existed (Hunter on his own computer)
// shouldn't start over as a Guest: the name they last saved a high score under becomes their
// player, once, the first time the game loads with players. If the server can't be reached, it
// tries again next time.
const SEEDED_KEY = "fishy-player-seeded";
function seedPlayer(): void {
  try {
    if (localStorage.getItem(SEEDED_KEY) || wallet.players().length) return;
    const name = savedName();
    const done = () => localStorage.setItem(SEEDED_KEY, "1");
    if (!name || isGuestName(name)) return done();
    wallet.addPlayer(name, "ifGuest").then(done, (err) => console.warn(err));
  } catch {
    // storage blocked: Guest it is
  }
}
seedPlayer();

/** The name last saved on this device, or "" if none (or storage is blocked). */
function savedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

function openForm(): void {
  entering = true;
  syncUI();
  form.hidden = false;
  formError.textContent = "";
  nameInput.value = wallet.name || savedName();
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
    showSaved(await submitScore({ mode, difficulty: boardDifficulty() }, name, score, ending(), scoreTime()));
    try {
      localStorage.setItem(NAME_KEY, name);
    } catch {
      // not remembering the name is fine
    }
    // a Guest on a device with no players yet (a kid's own computer) becomes that name from now on;
    // with players already here (a shared iPad), the menu's who's playing is left alone
    if (!wallet.name && !wallet.players().length && !isGuestName(name)) wallet.addPlayer(name, "ifGuest").catch((err) => console.warn(err));
    closeForm();
  } catch (err) {
    formError.textContent = (err as Error).message;
  } finally {
    saveButton.disabled = false;
  }
});
document.getElementById("hs-skip")!.addEventListener("click", skipForm);

/** Speed and Survival boards keep how long the game took; Classic ones don't. */
function timed(): boolean {
  return mode !== "classic";
}

function scoreTime(): number | undefined {
  return timed() ? Math.floor(elapsed()) : undefined;
}

/** How the game that just finished ended. */
function ending(): End {
  if (state === "won") return "won";
  if (hooked) return "hook";
  if (pinched) return "crab";
  return killer?.kind === "shark" ? "shark" : "fish";
}

/** A Speed or Survival board entry's time, or a dash for Speed scores saved before times were kept. */
function boardTime(entry: Entry): string {
  return entry.time === undefined ? "—" : clock(entry.time);
}

/** Skipping saves nothing, on either board: a score only goes up with a name on it. */
function skipForm(): void {
  closeForm();
}

function showSaved(saved: Saved): void {
  boards = saved.boards;
  myRanks = saved.ranks;
}

// ---- spawning ----
/** Survival's game is on (behind the menu, fish swim by as usual whatever's picked). */
function surviving(): boolean {
  return mode === "survival" && state !== "menu";
}

function spawnFish(): void {
  if (surviving()) return spawnSurvivalFish();
  const topSize = winRadius() * TOP_FISH_SHARE;
  const frenzy = inFrenzy();
  const e = earlyDone();
  const ease = (early: number, normal: number) => early + (normal - early) * e;
  const roll = Math.random();
  const shark = !frenzy && roll < tuning.sharkChance;
  const giant = !frenzy && !shark && roll < tuning.sharkChance + ease(tuning.earlyGiantChance, GIANT_CHANCE);
  let r: number;
  if (frenzy) {
    r = player.r * (0.15 + Math.random() * 0.4);
  } else if (shark) {
    r = Math.max(20, player.r * (0.7 + Math.random() * 0.9));
  } else if (giant) {
    r = Math.max(90 + Math.random() * 90, player.r * (2.2 + Math.random() * 1.5));
  } else {
    const [lo, hi] = [ease(tuning.earlyBigger[0], BIGGER[0]), ease(tuning.earlyBigger[1], BIGGER[1])];
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
  const dangerLimit = ease(tuning.earlyMaxDangerCover, MAX_DANGER_COVER);
  if ((shark || r >= player.r) && cover(fish.filter(dangerous)) + bodyCover(r) > dangerLimit) return;
  if (cover(fish) + bodyCover(r) > (frenzy ? FRENZY_MAX_COVER : MAX_COVER)) return;

  launch(r, shark, giant, tuning.fastChance).darter = shark && Math.random() < tuning.darterChance;
}

/** Survival's fish count is for a 1280×800 screen; a bigger screen gets more (and a phone fewer),
 * so it's just as crowded. */
function screenScale(): number {
  return Math.min(2, Math.max(0.5, (W * H) / (1280 * 800)));
}

/** Survival starts with the sea already half full, rather than waiting for fish to swim in. None
 * start near you, so there's a moment to get your bearings. */
function fillSea(): void {
  const want = Math.round((ramp.maxFish * screenScale()) / 2);
  for (let tries = 0; fish.length < want && tries < want * 4; tries++) {
    const x = Math.random() * W;
    if (Math.abs(x - W / 2) > 220) spawnSurvivalFish(x);
  }
}

/** Survival: everything's bigger than you, in the mix the level calls for. `x` places it mid-screen
 * instead of off to one side. */
function spawnSurvivalFish(x?: number): void {
  const roll = Math.random();
  const shark = roll < ramp.sharkChance;
  const giant = !shark && roll < ramp.sharkChance + ramp.giantChance;
  let r: number;
  if (shark) r = Math.max(20, player.r * (1.1 + Math.random() * 0.8));
  else if (giant) r = Math.max(90 + Math.random() * 90, player.r * (2.2 + Math.random() * 1.5));
  else r = player.r * (ramp.bigger[0] + Math.random() * (ramp.bigger[1] - ramp.bigger[0]));
  if (cover(fish) + bodyCover(r) > ramp.dangerCover) return;
  const f = launch(r, shark, giant, ramp.fastChance, 1 + (shark ? ramp.sharkSpeedUp : ramp.speedUp), x);
  // giants are too slow and big to dart
  f.darter = !giant && Math.random() < (shark ? ramp.darterChance : ramp.fishDarterChance);
}

/** Send a fish of size r in from one side or the other (or start it at `at`, already on screen). */
function launch(r: number, shark: boolean, giant: boolean, fastChance: number, speedUp = 1, at?: number): Fish {
  const fromLeft = Math.random() < 0.5;
  // giants cruise slowly so there's time to get out of the way
  let speed = 40 + Math.random() * 100 + 300 / (r + 10);
  if (!giant && r > player.r && Math.random() < fastChance) speed *= 1.4 + Math.random() * 0.4;
  if (giant) speed = 30 + Math.random() * 40;
  if (shark) speed = 110 + Math.random() * 80;
  speed *= speedUp;
  const margin = r * 1.5; // just out of sight, so big ones don't take ages to arrive
  const x = at ?? (fromLeft ? -margin : W + margin);
  // Survival uses the whole height, sand included: with fish only above the sand, hugging the
  // bottom was a hideout (Thomas's son, 2026-11-05)
  const [top, bottom] = surviving() ? [r * 0.5, H - r * 0.4] : [r * 0.6, H - SAND_HEIGHT];
  const y = top + Math.random() * Math.max(1, bottom - top);
  const vy = (Math.random() - 0.5) * 30;
  const hue = FISH_HUES[0] + Math.random() * (FISH_HUES[1] - FISH_HUES[0]);

  const f = new Fish(x, y, fromLeft ? speed : -speed, vy, r, hue, shark ? "shark" : "fish");
  fish.push(f);
  return f;
}

/** Past the top fish size, nothing can eat you any more. Survival never gets there. */
function inFrenzy(): boolean {
  return !surviving() && player.r >= winRadius() * TOP_FISH_SHARE;
}

function dangerous(f: Fish): boolean {
  // sharks can't be eaten, until the frenzy, when you're too big for anything to hurt you; in
  // Survival nothing can be eaten
  return surviving() || f.r >= player.r || (f.kind === "shark" && !inFrenzy());
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
  for (const h of hooks) {
    h.deep = surviving(); // depth is picked as it drops, so a hook already down stays put
    h.update(dt);
  }
  for (const c of crabs) c.update(dt);
  sinking = sinking.filter((c) => c.update(dt, time, scenery.sandTop(c.x)));
  if (combo && time - lastBite > COMBO_WINDOW) combo = 0;

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
    trail.update(dt, null, 0, 0, 1, 0, 0);
    for (const f of fish) f.update(dt);
    if (hooked) {
      // dangling nose-up from the hook as it's reeled in
      const p = catcher.hangPoint(time, player.r);
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
  // holding still: Survival's multiplier counts it, and in any mode the hero gets nervous
  const still = !steer.x && !steer.y && Math.hypot(player.vx, player.vy) < STILL_SPEED;
  stillFor = still ? stillFor + dt : 0;
  player.nervous = stillFor > NERVOUS_AFTER;
  trail.update(dt, trailKind, player.x, player.y, player.facing, player.r, Math.hypot(player.vx, player.vy));

  if (mode === "survival") survive(dt);

  // spawn
  spawnTimer -= dt;
  const frenzy = inFrenzy();
  const early = earlyDone();
  const maxFish =
    mode === "survival"
      ? Math.round(ramp.maxFish * screenScale())
      : frenzy
        ? FRENZY_MAX_FISH
        : Math.round(EARLY_MAX_FISH + (MAX_FISH - EARLY_MAX_FISH) * early);
  if (spawnTimer <= 0 && fish.length < maxFish) {
    spawnFish();
    spawnTimer =
      mode === "survival"
        ? ramp.spawnInterval / screenScale()
        : frenzy
          ? FRENZY_SPAWN_INTERVAL
          : EARLY_SPAWN_INTERVAL + (SPAWN_INTERVAL - EARLY_SPAWN_INTERVAL) * early;
  }

  // move fish, collide, cull
  hookAFish();
  // fishing hooks: deadly, unless you're big enough to bite right through the line
  for (const h of hooks) {
    const bait = h.bait(time);
    if (!bait || !overlaps({ x0: bait.x, x1: bait.x, y: bait.y, radius: bait.radius })) continue;
    if (inFrenzy()) {
      h.snap();
      sound.eat(0.7);
    } else {
      h.catchPlayer();
      sound.caught();
      hooked = true;
      catcher = h;
      endGame("dead");
      return;
    }
  }
  // crabs on the sand: deadly too, unless you're big enough to eat them
  for (const c of crabs) {
    const claws = c.hitbox();
    if (!claws || !overlaps(claws)) continue;
    if (inFrenzy()) {
      c.eaten();
      sound.eat(0.8);
      score += bitePoints(CRAB_POINTS);
    } else {
      c.pinch();
      sound.eaten();
      pinched = true;
      pincher = c;
      player.skeleton = true;
      endGame("dead");
      return;
    }
  }
  if (mode !== "survival") sinkingCoins(dt);

  for (let i = fish.length - 1; i >= 0; i--) {
    const f = fish[i];
    if (!swim(f, dt)) {
      fish.splice(i, 1);
      continue;
    }

    if (touching(f)) {
      if (!dangerous(f)) {
        // bigger meals and a bigger you both make for a deeper gulp (or burp)
        sound.eat(Math.min(1, 0.5 * (f.r / player.r) + 0.5 * progress()));
        score += bitePoints(Math.max(1, Math.round(POINTS * (f.r / player.r) ** 3)));
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

function between([lo, hi]: number[]): number {
  return lo + Math.random() * (hi - lo);
}

/** Classic and Speed: drop a gold coin now and then, and pay a bonus for eating it. */
function sinkingCoins(dt: number): void {
  coinTimer -= dt;
  if (coinTimer <= 0) {
    sinking.push(new SinkingCoin(W * (0.1 + 0.8 * Math.random()), time));
    coinTimer = between(COIN_EVERY);
  }
  for (const c of sinking) {
    const hb = c.hitbox(time);
    if (!hb || !overlaps(hb)) continue;
    c.eaten = true;
    if (mode === "speed") {
      // counts as a bite for the combo, without its own combo points
      combo = Math.min(COMBO_MAX, combo + 1);
      lastBite = time;
    }
    score += COIN_POINTS;
    coinsCaught++;
    popups.push({ x: c.x, y: c.y, text: `+${COIN_POINTS}`, coins: wallet.name ? caughtCoinValue() : 0, at: time }); // Guests earn no coins
    sound.bonus();
  }
}

/** The gold "+100" that floats up and fades where you ate a sinking coin. */
function drawPopups(): void {
  popups = popups.filter((p) => time - p.at < POPUP_TIME);
  ctx.save();
  ctx.font = "bold 26px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
  ctx.shadowBlur = 6;
  for (const p of popups) {
    const t = (time - p.at) / POPUP_TIME;
    ctx.globalAlpha = Math.min(1, (1 - t) / 0.4);
    const y = p.y - 20 - 50 * t;
    ctx.font = "bold 26px system-ui, sans-serif";
    ctx.fillStyle = "#ffd166";
    ctx.fillText(p.text, p.x, y);
    if (p.coins) {
      // and the coins under it: a little coin, then "+2"
      ctx.font = "bold 18px system-ui, sans-serif";
      const label = `+${p.coins}`;
      const w = ctx.measureText(label).width;
      const cx = p.x - (w + 18) / 2 + 7;
      drawCoin(cx, y + 26, 7);
      ctx.fillStyle = "#fff1a8";
      ctx.fillText(label, cx + 11 + w / 2, y + 26);
    }
  }
  ctx.restore();
}

function drawCoin(x: number, y: number, r: number): void {
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
  g.addColorStop(0, "#fff1a8");
  g.addColorStop(0.5, "#ffc93c");
  g.addColorStop(1, "#c98a00");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** Survival, every frame: level up when it's time, and score the time you've lasted. */
function survive(dt: number): void {
  const now = 1 + Math.floor(elapsed() / SURVIVAL_LEVEL);
  if (now !== level) {
    const before = ramp;
    level = now;
    ramp = survivalRamp(level);
    levelNews = news(before, ramp);
    levelUpAt = time;
  }
  // extra hooks and crabs switch on (and their visits get closer together) as the levels go up
  hooks.forEach((h, i) => h.setTiming(i < ramp.hooks ? ramp.hookTiming : null));
  crabs.forEach((c, i) => c.setTiming(i < ramp.crabs ? ramp.crabTiming : null));

  points += SURVIVAL_POINTS * stillMultiplier() * dt;
  score = Math.floor(points);
}

/** Points multiplier for holding still: x1 while moving, up to STILL_MAX. */
function stillMultiplier(): number {
  return 1 + Math.min(STILL_MAX - 1, Math.floor(stillFor / STILL_STEP));
}

/** What a new Survival level brings, in a few words for the banner. */
function news(before: Ramp, after: Ramp): string {
  const said: string[] = [];
  if (!before.sharkChance && after.sharkChance) said.push("Sharks!");
  if (after.hooks > before.hooks) said.push(after.hooks === 1 ? "Fishing hooks!" : `${after.hooks} hooks at once!`);
  if (after.crabs > before.crabs) said.push(after.crabs === 1 ? "A crab!" : `${after.crabs} crabs!`);
  if (!before.darterChance && after.darterChance) said.push("Sharks start darting!");
  else if (before.darterChance < 1 && after.darterChance === 1) said.push("Every shark darts!");
  if (!before.fishDarterChance && after.fishDarterChance) said.push("Fish start darting!");
  return said.length ? said.join(" ") : "More fish, and faster!";
}

/** How far you are from starting size (0) to winning size (1). */
function progress(): number {
  return Math.min(1, (player.r - START_RADIUS) / (winRadius() - START_RADIUS));
}

function foodShare(): number {
  // Stays near the early value for longer than the other early settings, reaching normal only
  // as the frenzy starts, so big fish outnumber food for most of the way up.
  const t = Math.min(1, progress() / TOP_FISH_SHARE) ** 2;
  return tuning.earlyFoodShare + (FOOD_SHARE - tuning.earlyFoodShare) * t;
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
  for (const h of hooks) {
    const bait = h.bait(time);
    if (!bait) continue;
    const i = fish.findIndex(
      (f) => h.wants(f) && capsulesTouch({ x0: bait.x, x1: bait.x, y: bait.y, radius: bait.radius }, f.hitbox()),
    );
    if (i === -1) continue;
    h.catchFish(fish[i]);
    fish.splice(i, 1);
  }
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
  const speed = mode === "speed";
  ctx.fillText(timed() ? `Score: ${score} · ${clock(elapsed())}` : `Score: ${score}`, 16, 14);

  // growth bar toward the win size; in Survival, toward the next level
  const barW = 200;
  const levelLength = SURVIVAL_LEVEL;
  const fill = mode === "survival" ? (elapsed() % levelLength) / levelLength : progress();
  ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
  ctx.fillRect(16, 46, barW, 10);
  ctx.fillStyle = mode === "survival" ? "#7ee8fa" : "#ffd166";
  ctx.fillRect(16, 46, barW * fill, 10);
  if (mode === "survival") {
    // under the bar, clear of the corner buttons on a phone; the still bonus in gold so it stands out
    ctx.font = "bold 18px system-ui, sans-serif";
    const label = `Level ${level}`;
    ctx.fillText(label, 16, 62);
    const x = stillMultiplier();
    if (x > 1) {
      ctx.fillStyle = "#ffd166";
      ctx.fillText(` · Still x${x}`, 16 + ctx.measureText(label).width, 62);
    }
  }

  // Speed: the combo, with a bar under the growth bar for the time left to keep it going
  if (speed && combo) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
    ctx.fillRect(16, 60, barW, 4);
    ctx.fillStyle = "#7ee8fa";
    ctx.fillRect(16, 60, barW * Math.max(0, 1 - (time - lastBite) / COMBO_WINDOW), 4);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 18px system-ui, sans-serif";
    ctx.fillText(`x${combo}`, 16 + barW + 10, 42);
  }

  ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
  ctx.font = "14px system-ui, sans-serif";
  const mute = sound.muted ? "unmute" : "mute";
  const hint = touchUI
    ? "Drag anywhere to swim"
    : `Arrows / WASD to swim · Space to pause · N for the next song · M to ${mute}`;
  ctx.fillText(hint, 16, mode === "survival" ? 88 : speed ? 72 : 66);
  ctx.restore();
}

/** Survival: "Level 4" and what it brings, big in the middle, fading out. */
function drawLevelBanner(): void {
  const t = time - levelUpAt;
  if (state !== "playing" || t > LEVEL_BANNER) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, (LEVEL_BANNER - t) / 0.6);
  ctx.shadowColor = "rgba(0, 0, 0, 0.7)";
  ctx.shadowBlur = 8;
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 48px system-ui, sans-serif";
  ctx.fillText(`Level ${level}`, W / 2, H * 0.3);
  ctx.font = "22px system-ui, sans-serif";
  ctx.fillStyle = "#ffd166";
  ctx.fillText(levelNews, W / 2, H * 0.3 + 44, W - 32);
  // what getting through the last level paid (a named player only; Guests earn nothing)
  if (level > 1 && wallet.name) {
    ctx.font = "bold 20px system-ui, sans-serif";
    ctx.fillStyle = "#fff1a8";
    ctx.fillText(coinWord(levelCoins(level - 1)), W / 2, H * 0.3 + 78);
  }
  ctx.restore();
}

/** Seconds as m:ss. */
function clock(s: number): string {
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
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
  for (const b of BUTTONS) {
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
    } else if (b === "next") {
      // skip: a play triangle up against a bar
      ctx.beginPath();
      ctx.moveTo(x - 8, y - 9);
      ctx.lineTo(x + 5, y);
      ctx.lineTo(x - 8, y + 9);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(x + 5, y - 9, 3.5, 18);
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
    catcher.draw(ctx, time);
  }
  if (state === "dead" && pinched) {
    pincher.draw(ctx);
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
  const took = timed() ? ` · ${clock(elapsed())}` : "";
  const reached = mode === "survival" ? ` · Level ${level}` : "";
  const bonus = state === "won" && timeBonus ? ` (+${timeBonus.toLocaleString()} time bonus)` : "";
  const scoreLine = `Score: ${score.toLocaleString()}${took}${reached}${bonus}`;
  showBoard &&= boards !== null;

  // typing a name: everything moves up, and the name form (CSS) sits at H / 2 - 10
  if (showBoard && entering) {
    const top = H / 2 - 150;
    drawTitle(title, scoreLine, top);
    ctx.font = "18px system-ui, sans-serif";
    ctx.fillStyle = "#ffd166";
    ctx.fillText(LOCAL ? "High score! Type your initials:" : "New high score! Type your name:", W / 2, top + 90);
    ctx.restore();
    return;
  }
  if (!showBoard) {
    const top = H / 2 - 30;
    drawTitle(title, scoreLine, top);
    ctx.font = "18px system-ui, sans-serif";
    ctx.fillText(subtitle, W / 2, top + 90);
    ctx.restore();
    if (gameOver()) toMenu.style.top = `${top + 120}px`;
    return;
  }

  // This week and all time side by side when there's room (player best in place of all time if
  // that's the only one you made besides this week); otherwise just one: all time if you made it,
  // else this week, else player best.
  const half = boardHalf();
  const panels: Period[] =
    W >= 4 * half + 56
      ? ["week", myRanks.all < 0 && myRanks.players >= 0 ? "players" : "all"]
      : [myRanks.all >= 0 ? "all" : myRanks.week < 0 && myRanks.players >= 0 ? "players" : "week"];
  // Rows shrink to fit a short screen, down to a point; past that, only the top few (and yours) show.
  const n = Math.max(1, ...panels.map((p) => boards![p].length));
  const room = H - 24 - BOARD_EXTRA;
  const rowH = Math.max(MIN_ROW_H, Math.min(ROW_H, room / n));
  const rows = Math.max(1, Math.min(n, Math.floor(room / rowH)));
  const top = Math.max(42, (H - BOARD_EXTRA - rows * rowH) / 2 + 30);
  drawTitle(title, scoreLine, top);
  ctx.font = "18px system-ui, sans-serif";
  ctx.fillText(subtitle, W / 2, top + 90);
  panels.forEach((p, i) => {
    const cx = panels.length === 1 ? W / 2 : W / 2 + (i === 0 ? -1 : 1) * (half + 12);
    drawBoard(p, cx, top + 140, half, rowH, rows);
  });
  ctx.restore();
  toMenu.style.top = `${top + 140 + 24 + rows * rowH + 16}px`;
}

/** Half a board's width on the end screen: room for the rank, name, ending and score, and on
 * Speed and Survival boards the time too. */
function boardHalf(): number {
  return Math.min(timed() ? 230 : 195, W / 2 - 8); // narrower on a phone held upright
}

// The end screen from the title's top to the Main menu button's bottom, besides the board's rows.
const BOARD_EXTRA = 254;
const ROW_H = 28;
const MIN_ROW_H = 20;

function drawTitle(title: string, scoreLine: string, top: number): void {
  ctx.font = "bold 56px system-ui, sans-serif";
  ctx.fillText(title, W / 2, top);
  ctx.font = "24px system-ui, sans-serif";
  ctx.fillText(scoreLine, W / 2, top + 50);
}

/** One board, centered on cx with its heading at y, showing up to `rows` rows. If yours is below
 * those, it takes the last one. */
function drawBoard(period: Period, cx: number, y: number, half: number, rowH: number, rows: number): void {
  const list = boards![period];
  const mine = myRanks[period];
  let shown = list.slice(0, rows).map((entry, i) => ({ entry, i }));
  if (mine >= rows) shown = [...shown.slice(0, rows - 1), { entry: list[mine], i: mine }];
  const speed = timed();
  const left = cx - half;
  // a panel behind it, so fish swimming past don't make it hard to read
  ctx.save();
  ctx.shadowColor = "transparent";
  ctx.fillStyle = "rgba(0, 20, 40, 0.55)";
  ctx.beginPath();
  ctx.roundRect(cx - half, y - 24, half * 2, 48 + Math.max(1, shown.length) * rowH, 12);
  ctx.fill();
  ctx.restore();

  ctx.font = "bold 18px system-ui, sans-serif";
  ctx.fillStyle = "#ffd166";
  let heading = `${PERIOD_LABEL[period]} · ${boardName()}`;
  if (LOCAL && period === "all" && mine === 0) heading = "New best score!";
  else if (LOCAL && period === "all" && mine > 0) heading = "You made your top 10!";
  ctx.fillText(heading, cx, y);
  if (!list.length) {
    ctx.fillStyle = "#fff";
    ctx.font = "18px system-ui, sans-serif";
    ctx.fillText("None yet!", cx, y + 32);
  }
  const size = Math.round(8 + (rowH * 3) / 7); // 20px on full-size rows
  shown.forEach(({ entry, i }, row) => {
    const rowY = y + 32 + row * rowH;
    ctx.font = `${size}px system-ui, sans-serif`;
    ctx.fillStyle = i === mine ? "#ffd166" : "#fff";
    ctx.textAlign = "right";
    ctx.fillText(`${i + 1}.`, left + 46, rowY);
    ctx.textAlign = "left";
    ctx.fillText(entry.name, left + 56, rowY, 98); // squeezed if it would run into the ending
    ctx.textAlign = "right";
    ctx.fillText(entry.score.toLocaleString(), left + half * 2 - 20, rowY);
    ctx.font = `${size - 4}px system-ui, sans-serif`;
    ctx.globalAlpha = 0.8;
    const timeX = left + half * 2 - 108;
    if (speed) ctx.fillText(boardTime(entry), timeX, rowY);
    if (entry.end) {
      ctx.textAlign = "left";
      if (entry.end === "won") ctx.font = `bold ${size - 4}px system-ui, sans-serif`;
      // squeezed if it would run into the time or score (a narrow board)
      const room = (speed ? timeX - 40 : left + half * 2 - 100) - (left + 166);
      ctx.fillText(END_LABEL[entry.end], left + 160, rowY, Math.min(96, room));
    }
    ctx.globalAlpha = 1;
  });
  ctx.textAlign = "center";
}

function draw(): void {
  drawBackground();

  if (state === "menu") {
    for (const f of fish) f.draw(ctx, time);
    for (const h of hooks) h.draw(ctx, time);
    scenery.drawFront(ctx, time);
    for (const c of crabs) c.draw(ctx); // on the front of the sand, so in front of the seaweed too
    drawButtons();
    return;
  }

  // no outlines in Survival: everything can eat you
  const outlines = tuning.outlines && mode !== "survival";
  for (const f of fish) f.draw(ctx, time, outlines && dangerous(f));
  trail.draw(ctx, trailKind, time);
  player.draw(ctx, time);
  for (const h of hooks) h.draw(ctx, time);
  scenery.drawFront(ctx, time);
  for (const c of sinking) c.draw(ctx, time); // in front of the sand, so it doesn't sink out of sight
  for (const c of crabs) c.draw(ctx); // on the front of the sand, so in front of the seaweed too

  drawPopups();
  drawHud();
  if (mode === "survival") drawLevelBanner();

  drawJoystick();

  // a Guest earns nothing, but hears what adding a name would get them
  const coinLine = !coinsEarned ? "" : wallet.name ? `${coinWord(coinsEarned)} · ` : "Add your name to collect coins! · ";
  const again = `${coinLine}${touchUI ? "Tap" : "Click or press Space"}`;
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
  drawShopPreview(dt);
  drawFishZoom(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
