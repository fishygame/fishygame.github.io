// Game modes and difficulty levels, picked on the title menu. Medium is the original game, so
// its tuning lives here too and the rest of the code reads it from DIFFICULTY.

import { HOOK_TIMING } from "./hook";
import { CRAB_TIMING } from "./crab";

/** Classic scores fish by their size next to yours; Speed scores how quickly you chain bites. */
export type Mode = "classic" | "speed";
export type Difficulty = "easy" | "medium" | "hard";

export const MODES: Mode[] = ["classic", "speed"];
export const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

/** When something comes by: seconds before the first visit, and between visits (min, max). */
export interface Timing {
  first: number[];
  gap: number[];
}

export interface Tuning {
  // While you're small the water is crowded, and most fish are bigger than you (some by a lot), so
  // getting going takes a while and there's plenty to dodge. These ease into the normal values in
  // main.ts as you grow.
  earlyFoodShare: number; // share of regular fish smaller than you, at the start
  earlyBigger: number[]; // size range of the rest, relative to you
  earlyGiantChance: number;
  earlyMaxDangerCover: number; // share of the screen fish that eat you can cover
  fastChance: number; // share of bigger fish that dart along faster than the rest
  sharkChance: number; // sharks can't be eaten, whatever their size
  darterChance: number; // share of sharks that now and then cut back in a quick Z
  hook: Timing;
  crab: Timing | null; // null: no crab at all
  outlines: boolean; // red outlines on the fish that can eat you
}

const MEDIUM: Tuning = {
  earlyFoodShare: 0.3,
  earlyBigger: [1.5, 6],
  earlyGiantChance: 0.2,
  earlyMaxDangerCover: 0.3,
  fastChance: 0.3,
  sharkChance: 0.07,
  darterChance: 0.6,
  hook: HOOK_TIMING,
  crab: CRAB_TIMING,
  outlines: true,
};

export const DIFFICULTY: Record<Difficulty, Tuning> = {
  // The hard part of the game is the crowded start, so Easy mostly softens that, and takes the
  // sharks and crab away.
  easy: {
    ...MEDIUM,
    earlyFoodShare: 0.5,
    earlyBigger: [1.2, 3],
    earlyGiantChance: 0.08,
    earlyMaxDangerCover: 0.22,
    fastChance: 0.15,
    sharkChance: 0,
    darterChance: 0,
    hook: { first: [30, 50], gap: [50, 80] },
    crab: null,
  },
  medium: MEDIUM,
  // Hard keeps the start as it is but packs in more of everything, and you judge sizes yourself.
  hard: {
    ...MEDIUM,
    fastChance: 0.45,
    sharkChance: 0.11,
    darterChance: 1,
    hook: { first: [10, 20], gap: [15, 30] },
    crab: { first: [12, 25], gap: [15, 30] },
    outlines: false,
  },
};

/** One line for the title menu about what you've picked. */
export const BLURB: Record<Mode | Difficulty, string> = {
  classic: "The closer a fish is to your size, the more it's worth.",
  speed: "Eat fish one after another for a combo, and win fast for a time bonus.",
  easy: "No sharks or crab, and more to eat at the start.",
  medium: "Sharks, a crab and fishing hooks.",
  hard: "More sharks, hooks and crabs, and no red outlines.",
};

export const LABEL: Record<Mode | Difficulty, string> = {
  classic: "Classic",
  speed: "Speed",
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};
