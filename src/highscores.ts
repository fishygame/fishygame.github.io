// Global top-5 board, kept by a small AWS Lambda (see server/high-scores.mjs).

const API = "https://kmyhjk6d7e2hk4rbotynrnxdt40ocefq.lambda-url.us-east-1.on.aws/";
export const NAME_MAX = 8;
const TOP = 5;

export interface Entry {
  name: string;
  score: number;
}

export async function fetchScores(): Promise<Entry[]> {
  const res = await fetch(API);
  if (!res.ok) throw new Error(`couldn't load high scores (${res.status})`);
  return (await res.json()).scores;
}

/** Save a score. Resolves to the new board and where it landed; rejects with a message to show. */
export async function submitScore(name: string, score: number): Promise<{ scores: Entry[]; rank: number }> {
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
