// Top-5 high score board. Two flavors, picked at build time with VITE_SCORE_BOARD:
//   "global" (the default): one shared board kept by a small AWS Lambda (see server/high-scores.mjs);
//            a top-5 score asks for a name.
//   "local":  each player's own best scores, kept in their browser under their initials.

export const LOCAL = import.meta.env.VITE_SCORE_BOARD === "local";
export const BOARD_TITLE = LOCAL ? "Your best scores" : "High scores";

const API = "https://kmyhjk6d7e2hk4rbotynrnxdt40ocefq.lambda-url.us-east-1.on.aws/";
const STORAGE_KEY = "fishy-best-scores";
export const NAME_MAX = LOCAL ? 3 : 8;
const TOP = 5;

export interface Entry {
  name: string; // the player's name, or initials on a local board
  score: number;
}

export async function fetchScores(): Promise<Entry[]> {
  if (LOCAL) return loadLocal();
  const res = await fetch(API);
  if (!res.ok) throw new Error(`couldn't load high scores (${res.status})`);
  return (await res.json()).scores;
}

/** Save a score. Resolves to the new board and where it landed; rejects with a message to show. */
export async function submitScore(name: string, score: number): Promise<{ scores: Entry[]; rank: number }> {
  if (LOCAL) return saveLocal(name, score);
  let res: Response;
  try {
    res = await fetch(API, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, score }),
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

function loadLocal(): Entry[] {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(saved) ? saved.filter((e) => typeof e?.score === "number").slice(0, TOP) : [];
  } catch {
    return []; // storage blocked or garbled: start fresh
  }
}

function saveLocal(name: string, score: number): { scores: Entry[]; rank: number } {
  const entry = { name, score };
  // ties go to whoever got there first
  const scores = [...loadLocal(), entry].sort((a, b) => b.score - a.score).slice(0, TOP);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scores));
  } catch {
    // can't save (private window, say); it still shows for this visit
  }
  return { scores, rank: scores.indexOf(entry) };
}
