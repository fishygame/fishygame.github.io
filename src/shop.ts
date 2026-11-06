// The coin shop (Thomas's son's idea, 2026-11-06): coins earned by playing buy looks, hats and
// trails for your fish. Players see the coins as pearls and the shop as The Clam Shack (Thomas,
// 2026-11-06); the code still says coins and shop. Cosmetics only, on purpose: anything that made you better would turn the
// high score boards into a contest of who's played the most, not who plays best.
//
// Coins are kept per player name, the same kind of name as on the boards, with no password (it's a
// family game; anyone who knows a name can use it). A device can hold several players, with one
// picked as playing (Thomas's brother and his kids share an iPad), and each game pays whoever's
// picked. On the family site each player's wallet syncs through the high scores Lambda, so adding
// the same name on another device brings their coins along. The itch build keeps them in the
// browser only.
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

/** One player's wallet, as this device last knew it. */
interface State {
  name: string;
  earned: number; // every coin ever earned, including games not yet synced
  owned: string[];
  equipped: Equipped;
  equippedAt: number; // when the outfit last changed; the newest outfit wins across devices
  pending: Game[]; // games not yet on the server
  dirty?: boolean; // bought or changed outfit since the last sync
}

/** Everyone who plays on this device. With nobody picked you play as a Guest (Thomas, 2026-11-06:
 * nobody should have to add a name just to play), and a Guest's games pay nothing, so on a shared
 * iPad coins only ever go to the player who earned them. */
interface Device {
  current: string | null; // key (name in lower case) of who's playing, or null for a Guest
  order: string[]; // keys, most recently picked first
  players: Record<string, State>;
}

const GUEST: State = Object.freeze({ name: "", earned: 0, owned: [], equipped: {}, equippedAt: 0, pending: [] }) as State;

export interface Player {
  key: string;
  name: string;
  balance: number;
}

const KEY = "fishy-wallet";
const MAX_GAMES = 50; // per request; the server takes no more

function fresh(name = ""): State {
  return { name, earned: 0, owned: [], equipped: {}, equippedAt: 0, pending: [] };
}

function priceOf(id: string): number {
  return ITEMS.find((i) => i.id === id)?.price ?? 0;
}

function balanceOf(s: State): number {
  // two devices buying at once offline can briefly take it below zero; it shows 0
  return Math.max(0, s.earned - s.owned.reduce((sum, id) => sum + priceOf(id), 0));
}

export class Wallet {
  private d: Device = { current: null, order: [], players: {} };
  private syncing: Promise<void> | null = null;
  private again = false;
  onChange: () => void = () => {};

  constructor() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
      if (saved?.players) this.d = { current: saved.current ?? null, order: saved.order ?? [], players: saved.players };
      else if (saved?.name && typeof saved.name === "string") {
        // the one-player format from before the switcher (test devices only; it never shipped)
        const key = saved.name.toLowerCase();
        this.d = { current: key, order: [key], players: { [key]: { ...fresh(), ...saved } } };
      }
    } catch {
      // storage blocked or garbled: start empty
    }
  }

  /** Who's playing now: a Guest has nothing and earns nothing. */
  private get s(): State {
    return (this.d.current && this.d.players[this.d.current]) || GUEST;
  }

  /** The current player's name, or "" for a Guest. */
  get name(): string {
    return this.d.current ? this.s.name : "";
  }

  get current(): string | null {
    return this.d.current;
  }

  /** Everyone on this device, most recently picked first. */
  players(): Player[] {
    return this.d.order.map((key) => ({ key, name: this.d.players[key].name, balance: balanceOf(this.d.players[key]) }));
  }

  /** The current player's coins to spend. */
  balance(): number {
    return balanceOf(this.s);
  }

  owns(id: string): boolean {
    return this.s.owned.includes(id);
  }

  wearing(slot: Slot): string | null {
    return this.s.equipped[slot] ?? null;
  }

  /** A finished game's coins, to whoever's playing (a Guest gets none). */
  award(coins: number): void {
    if (coins <= 0 || !this.name) return;
    this.s.earned += coins;
    if (!LOCAL) this.s.pending.push({ id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`, coins });
    this.changed();
  }

  /** Buy an item and put it on. False if it's too dear. */
  buy(id: string): boolean {
    const item = ITEMS.find((i) => i.id === id);
    if (!item || !this.name || this.owns(id) || this.balance() < item.price) return false;
    this.s.owned.push(id);
    this.s.equipped[item.slot] = id;
    this.s.equippedAt = Date.now();
    this.s.dirty = true;
    this.changed();
    return true;
  }

  /** Put an owned item on, or take off whatever's in that slot (null). */
  wear(slot: Slot, id: string | null): void {
    if (!this.name || (id && !this.owns(id))) return;
    if (id) this.s.equipped[slot] = id;
    else delete this.s.equipped[slot];
    this.s.equippedAt = Date.now();
    this.s.dirty = true;
    this.changed();
  }

  /** Add a player and make them the one playing. On the family site the name is checked by the
   * server, and if it's already in use there (the same player on another device), their coins and
   * stuff come along. A new player starts at 0; Guest games don't carry over. Rejects with a
   * message to show. */
  async addPlayer(raw: string): Promise<void> {
    const name = raw.trim().replace(/\s+/g, " ");
    if (!name || name.length > NAME_MAX) throw new Error(LOCAL ? "Type your initials" : `Use 1-${NAME_MAX} letters or numbers`);
    const key = name.toLowerCase();
    if (this.d.players[key]) return this.switchTo(key);
    const state: State = fresh(name);
    if (!LOCAL) {
      state.dirty = true; // so the server makes the wallet, even with nothing in it yet
      await this.push(state, true);
    }
    this.d.players[key] = state;
    this.d.current = key;
    this.d.order = [key, ...this.d.order.filter((k) => k !== key)];
    this.save();
    this.onChange();
    void this.sync();
  }

  /** Make someone already on this device the one playing. */
  switchTo(key: string): void {
    if (!this.d.players[key]) return;
    this.d.current = key;
    this.d.order = [key, ...this.d.order.filter((k) => k !== key)];
    this.save();
    this.onChange();
    void this.sync(); // picks up anything they did on another device
  }

  /** Play as a Guest: no name, no coins. */
  playAsGuest(): void {
    this.d.current = null;
    this.save();
    this.onChange();
  }

  /** Take a player off this device. On the family site their unsynced games go up first, and if
   * they can't, this rejects rather than lose them. */
  async removePlayer(key: string): Promise<void> {
    const s = this.d.players[key];
    if (!s) return;
    if (!LOCAL && (s.pending.length || s.dirty)) {
      await this.push(s, true).catch(() => {
        throw new Error(`Couldn't save ${s.name}'s pearls. Check the internet and try again.`);
      });
    }
    delete this.d.players[key];
    this.d.order = this.d.order.filter((k) => k !== key);
    if (this.d.current === key) this.d.current = null; // a Guest until someone's picked
    this.save();
    this.onChange();
  }

  /** Send everyone's new games and purchases, and pick up what the current player did on other
   * devices. Quiet on failure: it tries again next time. */
  sync(): Promise<void> {
    if (LOCAL || !this.d.order.length) return Promise.resolve();
    if (this.syncing) {
      this.again = true;
      return this.syncing;
    }
    this.syncing = (async () => {
      for (const key of [...this.d.order]) {
        const s = this.d.players[key];
        if (!s || !(s.pending.length || s.dirty || key === this.d.current)) continue;
        await this.push(s, false).catch((err) => console.warn(err));
      }
    })().finally(() => {
      this.syncing = null;
      if (this.again) {
        this.again = false;
        void this.sync();
      }
    });
    return this.syncing;
  }

  /** Merge one player's wallet with the server's, updating `s` in place. */
  private async push(s: State, loud: boolean): Promise<void> {
    const sent = s.pending.slice(0, MAX_GAMES); // a long spell offline goes up in batches
    const equippedAt = s.equippedAt;
    let res: Response;
    try {
      res = await fetch(API, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wallet: s.name, games: sent, owned: s.owned, equipped: s.equipped, equippedAt }),
      });
    } catch {
      throw new Error("Couldn't reach the server. Check the internet and try again.");
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(loud ? (body.error ?? `Something went wrong (${res.status})`) : `wallet sync: ${res.status}`);
    // games finished while this was on its way are still to send
    const later = s.pending.filter((g) => !sent.some((x) => x.id === g.id));
    s.pending = later;
    s.name = body.name;
    s.earned = body.earned + later.reduce((sum, g) => sum + g.coins, 0);
    const extra = s.owned.filter((id) => !body.owned.includes(id));
    s.owned = [...body.owned, ...extra];
    if (body.equippedAt >= s.equippedAt) {
      s.equipped = body.equipped;
      s.equippedAt = body.equippedAt;
    }
    s.dirty = extra.length > 0 || s.equippedAt > equippedAt;
    if (later.length || s.dirty) this.again = true;
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
      localStorage.setItem(KEY, JSON.stringify(this.d));
    } catch {
      // not remembering is fine; it's on the server for anyone added on the family site
    }
  }
}
