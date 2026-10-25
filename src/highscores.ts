// Top-5 high score boards, one for each mode and difficulty. Two flavors, picked at build time
// with VITE_SCORE_BOARD:
//   "global" (the default): shared boards kept by a small AWS Lambda (see server/high-scores.mjs);
//            a top-5 score asks for a name.
//   "local":  each player's own best scores, kept in their browser under their initials.

import type { Difficulty, Mode } from "./settings";

export const LOCAL = import.meta.env.VITE_SCORE_BOARD === "local";
export const BOARD_TITLE = LOCAL ? "Your best scores" : "High scores";

const API = "https://kmyhjk6d7e2hk4rbotynrnxdt40ocefq.lambda-url.us-east-1.on.aws/";
const STORAGE_KEY = "fishy-best-scores";
export const NAME_MAX = LOCAL ? 3 : 8;
const TOP = 5;

/** Which board: Classic on Medium is the original one, so it keeps its old storage key. */
export interface Board {
  mode: Mode;
  difficulty: Difficulty;
}

export interface Entry {
  name: string; // the player's name, or initials on a local board
  score: number;
}

export async function fetchScores(board: Board): Promise<Entry[]> {
  if (LOCAL) return loadLocal(board);
  const res = await fetch(`${API}?mode=${board.mode}&difficulty=${board.difficulty}`);
  if (!res.ok) throw new Error(`couldn't load high scores (${res.status})`);
  return (await res.json()).scores;
}

/** Save a score. Resolves to the new board and where it landed; rejects with a message to show. */
export async function submitScore(
  board: Board,
  name: string,
  score: number,
): Promise<{ scores: Entry[]; rank: number }> {
  if (LOCAL) return saveLocal(board, name, score);
  let res: Response;
  try {
    res = await fetch(API, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, score, mode: board.mode, difficulty: board.difficulty }),
    });
  } catch {
    throw new Error("Couldn't reach the high score board");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Something went wrong, try again");
  return body;
}

/** Whether a score would make the board. */
export function qualifies(scores: Entry[], score: number): boolean {
  return score > 0 && (scores.length < TOP || score > scores[TOP - 1].score);
}

// ---- local board ----

function storageKey({ mode, difficulty }: Board): string {
  return mode === "classic" && difficulty === "medium" ? STORAGE_KEY : `${STORAGE_KEY}-${mode}-${difficulty}`;
}

function loadLocal(board: Board): Entry[] {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey(board)) ?? "[]");
    return Array.isArray(saved) ? saved.filter((e) => typeof e?.score === "number").slice(0, TOP) : [];
  } catch {
    return []; // storage blocked or garbled: start fresh
  }
}

function saveLocal(board: Board, name: string, score: number): { scores: Entry[]; rank: number } {
  const entry = { name, score };
  // ties go to whoever got there first
  const scores = [...loadLocal(board), entry].sort((a, b) => b.score - a.score).slice(0, TOP);
  try {
    localStorage.setItem(storageKey(board), JSON.stringify(scores));
  } catch {
    // can't save (private window, say); it still shows for this visit
  }
  return { scores, rank: scores.indexOf(entry) };
}
