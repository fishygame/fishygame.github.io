// Top-10 high score boards, one for each mode and difficulty, each kept for all time, for this week
// (starting fresh every Monday), and by player (each name's best score only). Two flavors, picked
// at build time with VITE_SCORE_BOARD:
//   "global" (the default): shared boards kept by a small AWS Lambda (see server/high-scores.mjs);
//            a score that makes either board asks for a name.
//   "local":  each player's own best scores, kept in their browser under their initials.
// Either way the week and all-time boards allow repeats: a player with the ten best scores gets all
// ten places.

import type { Difficulty, Mode } from "./settings";
import type { Equipped } from "./shop";

export const LOCAL = import.meta.env.VITE_SCORE_BOARD === "local";
export const BOARD_TITLE = LOCAL ? "Your best scores" : "High scores";

// VITE_SCORE_API points a dev server at a local copy of the Lambda, so testing never touches the real boards
export const API = import.meta.env.VITE_SCORE_API || "https://kmyhjk6d7e2hk4rbotynrnxdt40ocefq.lambda-url.us-east-1.on.aws/";
const STORAGE_KEY = "fishy-best-scores";
export const NAME_MAX = LOCAL ? 3 : 8;
const TOP = 10;

/** Which board: Classic on Medium is the original one, so it keeps its old storage key. */
export interface Board {
  mode: Mode;
  difficulty: Difficulty;
}

export type Period = "week" | "all" | "players";
export const PERIODS: Period[] = ["week", "all", "players"];

/** What each board is called. */
export const PERIOD_LABEL: Record<Period, string> = { week: "This week", all: "All time", players: "Player best" };

/** How a game ended: you won, or what got you. */
export type End = "won" | "shark" | "fish" | "hook" | "crab";

/** What the boards say for each ending. */
export const END_LABEL: Record<End, string> = {
  won: "BIG FISH",
  shark: "Shark bait",
  fish: "Fish food",
  hook: "Hooked",
  crab: "Crab snack",
};

export interface Entry {
  name: string; // the player's name, or initials on a local board
  score: number;
  time?: number; // Speed and Survival boards: how long the game took, in whole seconds
  end?: End; // scores saved before 2026-11-02 have none
  outfit?: Equipped; // what the player's fish wears, from their wallet (family site; none if plain)
}

/** A mode and difficulty's two boards. */
export type Boards = Record<Period, Entry[]>;

/** What saving a score did: the boards now, and where it landed on each (-1 if it missed out). */
export interface Saved {
  boards: Boards;
  ranks: Record<Period, number>;
}

export async function fetchScores(board: Board): Promise<Boards> {
  if (LOCAL) return { week: loadLocal(board, "week"), all: loadLocal(board, "all"), players: loadLocal(board, "players") };
  const res = await fetch(`${API}?mode=${board.mode}&difficulty=${board.difficulty}`);
  if (!res.ok) throw new Error(`couldn't load high scores (${res.status})`);
  const body = await res.json();
  return { week: body.weekly ?? [], all: body.scores, players: body.players ?? [] };
}

/** Save a score to both boards. Rejects with a message to show. */
export async function submitScore(
  board: Board,
  name: string,
  score: number,
  end: End,
  time?: number,
): Promise<Saved> {
  if (LOCAL) return saveLocal(board, name, score, end, time);
  let res: Response;
  try {
    res = await fetch(API, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, score, time, end, mode: board.mode, difficulty: board.difficulty }),
    });
  } catch {
    throw new Error("Couldn't reach the high score board");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Something went wrong, try again");
  return {
    boards: { week: body.weekly ?? [], all: body.scores, players: body.players ?? [] },
    ranks: { week: body.weeklyRank ?? -1, all: body.rank, players: body.playerRank ?? -1 },
  };
}

/** Whether a score would make any board. `name` is the name this device last saved under, if any:
 * Player best only counts it if it beats that player's own best (a ten-name board is hardly ever
 * full, so without this every score would ask). An unknown name is treated as a new player. */
export function qualifies(boards: Boards, score: number, name = ""): boolean {
  if (score <= 0) return false;
  const makes = (list: Entry[]) => list.length < TOP || score > list[TOP - 1].score;
  const key = name.trim().toLowerCase();
  const mine = key ? boards.players.find((e) => e.name.toLowerCase() === key) : undefined;
  return makes(boards.week) || makes(boards.all) || (mine ? score > mine.score : makes(boards.players));
}

/** Each player's best score only, top 10, highest first. Names match whatever the capitals; ties
 * go to whoever got there first. */
function topPlayers(scores: Entry[]): Entry[] {
  const seen = new Set<string>();
  return [...scores]
    .sort((a, b) => b.score - a.score)
    .filter((e) => {
      const key = e.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, TOP);
}

/** The Monday that starts this week, as YYYY-MM-DD, by this device's clock. */
function weekStart(): string {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ---- local board ----
// All time is saved as a list of entries (as before weekly boards); this week as { week, scores },
// so last week's scores are simply dropped when a new week comes around. Player best is a list
// too; before it's first saved, it's made from the other two.

function storageKey({ mode, difficulty }: Board, period: Period): string {
  const key = mode === "classic" && difficulty === "medium" ? STORAGE_KEY : `${STORAGE_KEY}-${mode}-${difficulty}`;
  return period === "all" ? key : `${key}-${period}`;
}

function loadLocal(board: Board, period: Period): Entry[] {
  try {
    const raw = localStorage.getItem(storageKey(board, period));
    if (period === "players" && raw === null) {
      return topPlayers([...loadLocal(board, "all"), ...loadLocal(board, "week")]);
    }
    let saved = JSON.parse(raw ?? "[]");
    if (period === "week") saved = saved?.week === weekStart() ? saved.scores : [];
    return Array.isArray(saved) ? saved.filter((e) => typeof e?.score === "number" && named(e)).slice(0, TOP) : [];
  } catch {
    return []; // storage blocked or garbled: start fresh
  }
}

/** Skip used to save a local score as "---"; those (and any blank names) are dropped on load. */
function named(e: Entry): boolean {
  const name = typeof e.name === "string" ? e.name.trim() : "";
  return name !== "" && name !== "---";
}

function saveLocal(board: Board, name: string, score: number, end: End, time?: number): Saved {
  if (!name.trim()) throw new Error("Type your initials, or Skip");
  const entry: Entry = time === undefined ? { name, score, end } : { name, score, time, end };
  const result: Saved = { boards: { week: [], all: [], players: [] }, ranks: { week: -1, all: -1, players: -1 } };
  // all loaded before any are saved, as a first player best is made from the other two
  const before = PERIODS.map((period) => loadLocal(board, period));
  PERIODS.forEach((period, p) => {
    // ties go to whoever got there first
    const merged = [...before[p], entry];
    const scores = period === "players" ? topPlayers(merged) : merged.sort((a, b) => b.score - a.score).slice(0, TOP);
    try {
      const saved = period === "week" ? { week: weekStart(), scores } : scores;
      localStorage.setItem(storageKey(board, period), JSON.stringify(saved));
    } catch {
      // can't save (private window, say); it still shows for this visit
    }
    result.boards[period] = scores;
    result.ranks[period] = scores.indexOf(entry);
  });
  return result;
}
