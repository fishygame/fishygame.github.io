// Game modes and difficulty levels, picked on the title menu. Medium is the original game, so
// its tuning lives here too and the rest of the code reads it from DIFFICULTY.

import { HOOK_TIMING } from "./hook";
import { CRAB_TIMING } from "./crab";

/** Classic scores fish by their size next to yours; Speed scores how quickly you chain bites;
 * Survival scores how long you last when everything's bigger than you. */
export type Mode = "classic" | "speed" | "survival";
export type Difficulty = "easy" | "medium" | "hard";

export const MODES: Mode[] = ["classic", "speed", "survival"];
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

// ---- Survival ----
// You start a bit bigger than usual and never grow; every fish is bigger than you. It gets harder
// every level: a new level every SURVIVAL_LEVEL seconds. There's no Easy/Medium/Hard: the levels
// are the difficulty, and three boards that meant nearly the same thing was too many scores and
// too many options (Thomas, 2026-11-05; it was 25/20/15 s on Easy/Medium/Hard).
export const SURVIVAL_LEVEL = 20;
/** The one difficulty Survival's boards are kept under (the board API keys on mode + difficulty). */
export const SURVIVAL_BOARD: Difficulty = "medium";

export interface Ramp {
  maxFish: number; // on a 1280×800 screen; main.ts scales it (and the spawn rate) to the screen's size
  spawnInterval: number;
  bigger: number[]; // size range of regular fish, relative to you
  giantChance: number;
  fastChance: number;
  sharkChance: number;
  darterChance: number; // share of sharks that dart
  fishDarterChance: number; // share of regular fish that dart (giants never do)
  speedUp: number; // every fish swims this much faster (0.2 = 20%)...
  sharkSpeedUp: number; // ...and sharks this much, less, as they're quick to start with
  dangerCover: number; // share of the screen fish bodies can cover
  hooks: number; // how many hooks can be down at once
  hookTiming: Timing;
  crabs: number; // how many crabs can be about at once
  crabTiming: Timing;
}

/** What a Survival level throws at you. Busy from the start (Thomas, 2026-11-04: the first try was
 * "way too slow and boring", with no need to move by level 3), then piling on. Level 1: a crowd of
 * fish and a few plain sharks, no hooks or crabs. 2: a hook. 3: a crab, and some sharks dart.
 * 4: two hooks. 5: two crabs. 6: three hooks, every shark darts. 7: three crabs. 8: four hooks.
 * 10: a few fish start darting, more each level after. Darting fish came at level 5 at first, and in
 * a crowd that size they made it impossible too soon (Thomas, 2026-11-04); then level 8, and
 * level 10 since 2026-11-05 for a slower burn.
 * The crowd (fish count, spawn rate, how much of the screen they can cover) grows at half pace
 * through level 10 and full pace after: at the old steady pace there were 36 fish (x screen scale)
 * by level 6, just as every shark started darting, and it felt near impossible (Thomas, 2026-11-05).
 * Full pace first came at level 9, which made level 11 (42 fish) a wall; now it starts at level 11
 * and 42 fish come at level 12, so good players can run up a score before it goes wacky
 * (Thomas, 2026-11-05). */
export function survivalRamp(level: number): Ramp {
  const n = level - 1;
  const from = (start: number, per: number, max: number) => Math.min(max, Math.max(0, (level - start + 1) * per));
  const crowd = (early: number, late: number) => (n <= 9 ? early * n : early * 9 + late * (n - 9));
  const visits: Timing = { first: [2, 5], gap: [Math.max(3, 14 - 1.5 * n), Math.max(6, 24 - 2 * n)] };
  return {
    maxFish: Math.min(50, 16 + crowd(2, 4)),
    spawnInterval: Math.max(0.08, 0.35 - crowd(0.015, 0.03)),
    bigger: [1.15, Math.min(3, 2 + 0.12 * n)],
    giantChance: Math.min(0.12, 0.05 + 0.01 * n),
    fastChance: Math.min(0.7, 0.2 + 0.07 * n),
    // fewer, slower sharks than at first: Thomas couldn't get past level 7 (2026-11-04). Then a slower
    // build, topping out at level 14 instead of 10, for "a little slower burn" (Thomas, 2026-11-05)
    sharkChance: Math.min(0.22, 0.05 + 0.014 * n),
    darterChance: from(3, 0.25, 1),
    fishDarterChance: from(10, 0.05, 0.3),
    speedUp: Math.min(0.6, 0.06 * n),
    sharkSpeedUp: Math.min(0.3, 0.03 * n),
    dangerCover: Math.min(0.6, 0.25 + crowd(0.02, 0.04)),
    hooks: level < 2 ? 0 : Math.min(4, Math.floor(level / 2)),
    hookTiming: visits,
    crabs: level < 3 ? 0 : Math.min(3, Math.floor((level - 1) / 2)),
    crabTiming: visits,
  };
}

/** One line for the title menu about what you've picked. */
export const BLURB: Record<Mode | Difficulty, string> = {
  classic: "The closer a fish is to your size, the more it's worth.",
  speed: "Eat fish one after another for a combo, and win fast for a time bonus.",
  survival: `Everything's bigger than you! Last as long as you can, and hold still for bonus points. A new level every ${SURVIVAL_LEVEL} seconds.`,
  easy: "No sharks or crab, and more to eat at the start.",
  medium: "Sharks, a crab and fishing hooks.",
  hard: "More sharks, hooks and crabs, and no red outlines.",
};

export const LABEL: Record<Mode | Difficulty, string> = {
  classic: "Classic",
  speed: "Speed",
  survival: "Survival",
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};
