// The coin shop (Thomas's son's idea, 2026-11-06): coins earned by playing buy looks, hats and
// trails for your fish. Cosmetics only, on purpose: anything that made you better would turn the
// high score boards into a contest of who's played the most, not who plays best.
//
// Coins are kept per username, the same kind of name as on the boards, with no password (it's a
// family game; anyone who knows a name can use it). On the family site the wallet syncs through the
// high scores Lambda, so it follows you to any device you sign in on; signed out, coins stay on the
// device and join the account when you sign in. The itch build keeps them in the browser only.
// The server only ever adds: coins come in per game (each with an id, so a retry can't pay twice),
// owned items are a union, and the balance is coins earned minus the prices of what you own.

import { API, LOCAL, NAME_MAX } from "./highscores";
import type { Difficulty } from "./settings";

export type Slot = "look" | "hat" | "trail";
export type Look = "plain" | "clown" | "spots" | "silver" | "gold" | "midnight" | "rainbow";
export type Hat = "party" | "bow" | "shades" | "pirate" | "tophat" | "crown";
export type TrailKind = "bubbles" | "sparkles" | "hearts";

export interface Item {
  id: Look | Hat | TrailKind;
  slot: Slot;
  name: string;
  price: number;
}

// "Looks" are patterns and finishes on the orange hero, never a plain color swap: the other fish
// use hues from green through pink, and red clashes with the danger outlines, so a blue or green
// hero would vanish into the crowd.
export const ITEMS: Item[] = [
  { id: "clown", slot: "look", name: "Clownfish", price: 100 },
  { id: "spots", slot: "look", name: "Spotted", price: 100 },
  { id: "silver", slot: "look", name: "Silver", price: 200 },
  { id: "gold", slot: "look", name: "Gold", price: 400 },
  { id: "midnight", slot: "look", name: "Midnight", price: 400 },
  { id: "rainbow", slot: "look", name: "Rainbow", price: 1000 },
  { id: "party", slot: "hat", name: "Party hat", price: 75 },
  { id: "bow", slot: "hat", name: "Bow", price: 75 },
  { id: "shades", slot: "hat", name: "Sunglasses", price: 150 },
  { id: "pirate", slot: "hat", name: "Pirate hat", price: 250 },
  { id: "tophat", slot: "hat", name: "Top hat", price: 250 },
  { id: "crown", slot: "hat", name: "Crown", price: 600 },
  { id: "bubbles", slot: "trail", name: "Bubbles", price: 150 },
  { id: "sparkles", slot: "trail", name: "Sparkles", price: 300 },
  { id: "hearts", slot: "trail", name: "Hearts", price: 300 },
];

export const SLOT_LABEL: Record<Slot, string> = { look: "Looks", hat: "Hats", trail: "Trails" };

// What a game pays, before the difficulty. Harder pays more (Thomas, 2026-11-06), so nobody farms
// Easy; Survival has one difficulty and pays x1.
export const COIN_RATE: Record<Difficulty, number> = { easy: 0.5, medium: 1, hard: 2 };
export const GAME_COINS = 1; // just for playing, so even a game that ends at once earns something
export const PROGRESS_COINS = 10; // for filling the growth bar (Classic and Speed): 1 per tenth
export const WIN_COINS = 6;
export const BAIT_COINS = 6; // per clump of bonus bait; even, so Easy's half is a whole number
export const LEVEL_COINS = 2; // per Survival level reached

export type Equipped = Partial<Record<Slot, string>>;

interface Game {
  id: string;
  coins: number;
}

interface State {
  name: string; // signed in as, or "" on this device only
  earned: number; // every coin ever earned, including games not yet synced
  owned: string[];
  equipped: Equipped;
  equippedAt: number; // when the outfit last changed; the newest outfit wins across devices
  pending: Game[]; // games not yet on the server
}

const KEY = "fishy-wallet";
const MAX_GAMES = 50; // per request; the server takes no more

function fresh(): State {
  return { name: "", earned: 0, owned: [], equipped: {}, equippedAt: 0, pending: [] };
}

function priceOf(id: string): number {
  return ITEMS.find((i) => i.id === id)?.price ?? 0;
}

export class Wallet {
  private s: State = fresh();
  private syncing: Promise<void> | null = null;
  private again = false;
  onChange: () => void = () => {};

  constructor() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
      if (saved && typeof saved === "object") this.s = { ...fresh(), ...saved };
    } catch {
      // storage blocked or garbled: start empty
    }
  }

  get name(): string {
    return this.s.name;
  }

  /** Coins to spend. Two devices buying at once offline can briefly take it below zero; it shows 0. */
  balance(): number {
    return Math.max(0, this.s.earned - this.s.owned.reduce((sum, id) => sum + priceOf(id), 0));
  }

  owns(id: string): boolean {
    return this.s.owned.includes(id);
  }

  wearing(slot: Slot): string | null {
    return this.s.equipped[slot] ?? null;
  }

  /** A finished game's coins. */
  award(coins: number): void {
    if (coins <= 0) return;
    this.s.earned += coins;
    if (!LOCAL) this.s.pending.push({ id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`, coins });
    this.changed();
  }

  /** Buy an item and put it on. False if it's too dear. */
  buy(id: string): boolean {
    const item = ITEMS.find((i) => i.id === id);
    if (!item || this.owns(id) || this.balance() < item.price) return false;
    this.s.owned.push(id);
    this.s.equipped[item.slot] = id;
    this.s.equippedAt = Date.now();
    this.changed();
    return true;
  }

  /** Put an owned item on, or take off whatever's in that slot (null). */
  wear(slot: Slot, id: string | null): void {
    if (id && !this.owns(id)) return;
    if (id) this.s.equipped[slot] = id;
    else delete this.s.equipped[slot];
    this.s.equippedAt = Date.now();
    this.changed();
  }

  /** Sign in (or make a new username): whatever this device has earned and bought joins it. Rejects
   * with a message to show. */
  async signIn(raw: string): Promise<void> {
    const name = raw.trim().replace(/\s+/g, " ");
    if (!name || name.length > NAME_MAX) throw new Error(`Use 1-${NAME_MAX} letters or numbers`);
    const was = this.s.name;
    this.s.name = name;
    try {
      await this.push(true);
    } catch (err) {
      this.s.name = was;
      throw err;
    }
    this.save();
    this.onChange();
    if (this.again) {
      this.again = false;
      void this.sync();
    }
  }

  /** Leave the account on the server and start this device over at zero. */
  signOut(): void {
    this.s = fresh();
    this.changed();
  }

  /** Send any new games and purchases, and pick up what other devices did. Quiet on failure: it
   * tries again next time. */
  sync(): Promise<void> {
    if (LOCAL || !this.s.name) return Promise.resolve();
    if (this.syncing) {
      this.again = true;
      return this.syncing;
    }
    this.syncing = this.push(false)
      .catch((err) => console.warn(err))
      .finally(() => {
        this.syncing = null;
        if (this.again) {
          this.again = false;
          void this.sync();
        }
      });
    return this.syncing;
  }

  private async push(signingIn: boolean): Promise<void> {
    const sent = this.s.pending.slice(0, MAX_GAMES); // a long spell signed out goes up in batches
    let res: Response;
    try {
      res = await fetch(API, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          wallet: this.s.name,
          games: sent,
          owned: this.s.owned,
          equipped: this.s.equipped,
          equippedAt: this.s.equippedAt,
        }),
      });
    } catch {
      throw new Error("Couldn't reach the server. Check the internet and try again.");
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? `Couldn't sign in (${res.status})`);
    if (!signingIn && body.name?.toLowerCase() !== this.s.name.toLowerCase()) return; // signed out meanwhile
    // games finished while this was on its way are still to send
    const later = this.s.pending.filter((g) => !sent.some((x) => x.id === g.id));
    this.s.pending = later;
    this.s.name = body.name;
    this.s.earned = body.earned + later.reduce((sum, g) => sum + g.coins, 0);
    const extra = this.s.owned.filter((id) => !body.owned.includes(id));
    this.s.owned = [...body.owned, ...extra];
    if (body.equippedAt >= this.s.equippedAt) {
      this.s.equipped = body.equipped;
      this.s.equippedAt = body.equippedAt;
    }
    if (later.length || extra.length || body.equippedAt < this.s.equippedAt) this.again = true;
    this.save();
    this.onChange();
  }

  private changed(): void {
    this.save();
    this.onChange();
    void this.sync();
  }

  private save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.s));
    } catch {
      // not remembering is fine; it's on the server if signed in
    }
  }
}
