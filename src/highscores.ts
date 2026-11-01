// Top-10 high score boards, one for each mode and difficulty, each kept both for all time and for
// this week (starting fresh every Monday). Two flavors, picked at build time with VITE_SCORE_BOARD:
//   "global" (the default): shared boards kept by a small AWS Lambda (see server/high-scores.mjs);
//            a score that makes either board asks for a name.
//   "local":  each player's own best scores, kept in their browser under their initials.
// Either way repeats are allowed: a player with the ten best scores gets all ten places.

import type { Difficulty, Mode } from "./settings";

export const LOCAL = import.meta.env.VITE_SCORE_BOARD === "local";
export const BOARD_TITLE = LOCAL ? "Your best scores" : "High scores";

const API = "https://kmyhjk6d7e2hk4rbotynrnxdt40ocefq.lambda-url.us-east-1.on.aws/";
const STORAGE_KEY = "fishy-best-scores";
export const NAME_MAX = LOCAL ? 3 : 8;
const TOP = 10;

/** Which board: Classic on Medium is the original one, so it keeps its old storage key. */
export interface Board {
  mode: Mode;
  difficulty: Difficulty;
}

export type Period = "week" | "all";
export const PERIODS: Period[] = ["week", "all"];

export interface Entry {
  name: string; // the player's name, or initials on a local board
  score: number;
  time?: number; // Speed boards: how long the game took, in whole seconds
}

/** A mode and difficulty's two boards. */
export type Boards = Record<Period, Entry[]>;

/** What saving a score did: the boards now, and where it landed on each (-1 if it missed out). */
export interface Saved {
  boards: Boards;
  ranks: Record<Period, number>;
}

export async function fetchScores(board: Board): Promise<Boards> {
  if (LOCAL) return { week: loadLocal(board, "week"), all: loadLocal(board, "all") };
  const res = await fetch(`${API}?mode=${board.mode}&difficulty=${board.difficulty}`);
  if (!res.ok) throw new Error(`couldn't load high scores (${res.status})`);
  const body = await res.json();
  return { week: body.weekly ?? [], all: body.scores };
}

/** Save a score to both boards. Rejects with a message to show. */
export async function submitScore(board: Board, name: string, score: number, time?: number): Promise<Saved> {
  if (LOCAL) return saveLocal(board, name, score, time);
  let res: Response;
  try {
    res = await fetch(API, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, score, time, mode: board.mode, difficulty: board.difficulty }),
    });
  } catch {
    throw new Error("Couldn't reach the high score board");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Something went wrong, try again");
  return {
    boards: { week: body.weekly ?? [], all: body.scores },
    ranks: { week: body.weeklyRank ?? -1, all: body.rank },
  };
}

/** Whether a score would make either board. */
export function qualifies(boards: Boards, score: number): boolean {
  return score > 0 && PERIODS.some((p) => boards[p].length < TOP || score > boards[p][TOP - 1].score);
}

/** The Monday that starts this week, as YYYY-MM-DD, by this device's clock. */
function weekStart(): string {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ---- local board ----
// All time is saved as a list of entries (as before weekly boards); this week as { week, scores },
// so last week's scores are simply dropped when a new week comes around.

function storageKey({ mode, difficulty }: Board, period: Period): string {
  const key = mode === "classic" && difficulty === "medium" ? STORAGE_KEY : `${STORAGE_KEY}-${mode}-${difficulty}`;
  return period === "week" ? `${key}-week` : key;
}

function loadLocal(board: Board, period: Period): Entry[] {
  try {
    let saved = JSON.parse(localStorage.getItem(storageKey(board, period)) ?? "[]");
    if (period === "week") saved = saved?.week === weekStart() ? saved.scores : [];
    return Array.isArray(saved) ? saved.filter((e) => typeof e?.score === "number").slice(0, TOP) : [];
  } catch {
    return []; // storage blocked or garbled: start fresh
  }
}

function saveLocal(board: Board, name: string, score: number, time?: number): Saved {
  const entry: Entry = time === undefined ? { name, score } : { name, score, time };
  const result: Saved = { boards: { week: [], all: [] }, ranks: { week: -1, all: -1 } };
  for (const period of PERIODS) {
    // ties go to whoever got there first
    const scores = [...loadLocal(board, period), entry].sort((a, b) => b.score - a.score).slice(0, TOP);
    try {
      const saved = period === "week" ? { week: weekStart(), scores } : scores;
      localStorage.setItem(storageKey(board, period), JSON.stringify(saved));
    } catch {
      // can't save (private window, say); it still shows for this visit
    }
    result.boards[period] = scores;
    result.ranks[period] = scores.indexOf(entry);
  }
  return result;
}
