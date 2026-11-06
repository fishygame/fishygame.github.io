// The coin shop (Thomas's son's idea, 2026-11-06): coins earned by playing buy looks, hats and
// trails for your fish. Cosmetics only, on purpose: anything that made you better would turn the
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
export type Look = "plain" | "clown" | "spots" | "tiger" | "pizza" | "silver" | "camo" | "gold" | "midnight" | "rainbow";
export type Hat = "party" | "bow" | "shades" | "viking" | "pirate" | "tophat" | "diving" | "propeller" | "crown";
export type TrailKind = "bubbles" | "gas" | "notes" | "sparkles" | "stars" | "hearts";

export interface Item {
  id: Look | Hat | TrailKind;
  slot: Slot;
  name: string;
  price: number;
}

// "Looks" are patterns and finishes on the orange hero, never a plain color swap: the other fish
// use hues from green through pink, and red clashes with the danger outlines, so a blue or green
// hero would vanish into the crowd (so Camo is blaze orange hunting camo, not green). Each slot is
// cheapest first; 9 looks, 9 hats and 6 trails fill the shop's rows of 3. The Lambda's CATALOG
// must list the same ids: deploy it first when adding one.
export const ITEMS: Item[] = [
  { id: "clown", slot: "look", name: "Clownfish", price: 100 },
  { id: "spots", slot: "look", name: "Spotted", price: 100 },
  { id: "tiger", slot: "look", name: "Tiger", price: 150 },
  { id: "pizza", slot: "look", name: "Pizza", price: 200 },
  { id: "silver", slot: "look", name: "Silver", price: 200 },
  { id: "camo", slot: "look", name: "Camo", price: 250 },
  { id: "gold", slot: "look", name: "Gold", price: 400 },
  { id: "midnight", slot: "look", name: "Midnight", price: 400 },
  { id: "rainbow", slot: "look", name: "Rainbow", price: 1000 },
  { id: "party", slot: "hat", name: "Party hat", price: 75 },
  { id: "bow", slot: "hat", name: "Bow", price: 75 },
  { id: "shades", slot: "hat", name: "Sunglasses", price: 150 },
  { id: "viking", slot: "hat", name: "Viking horns", price: 200 },
  { id: "pirate", slot: "hat", name: "Pirate hat", price: 250 },
  { id: "tophat", slot: "hat", name: "Top hat", price: 250 },
  { id: "diving", slot: "hat", name: "Diving helmet", price: 300 },
  { id: "propeller", slot: "hat", name: "Propeller cap", price: 500 },
  { id: "crown", slot: "hat", name: "Crown", price: 600 },
  { id: "bubbles", slot: "trail", name: "Bubbles", price: 150 },
  { id: "gas", slot: "trail", name: "Gas", price: 150 },
  { id: "notes", slot: "trail", name: "Music notes", price: 200 },
  { id: "stars", slot: "trail", name: "Stars", price: 250 },
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
export const COIN_VALUE = 2; // per sinking coin caught; even, so Easy's half is a whole number
// Survival pays for each level you get through, more the deeper it gets (Thomas, 2026-11-06), so
// farming the easy early levels pays least: 1 a level for 1-3, 2 for 4-6, 4 for 7-9, 6 for 10-12,
// then 8. Getting through 10 levels (Thomas's best, dying on level 11) pays 27, about what
// the same few minutes of Classic on Medium pay.
export function levelCoins(level: number): number {
  return level <= 3 ? 1 : level <= 6 ? 2 : level <= 9 ? 4 : level <= 12 ? 6 : 8;
}

// The most Survival's levels pay in one game, reached getting through level 12 (about 4 minutes), so a
// marathon run can't buy the shop: past that only the chest's bonus coins pay (Thomas, 2026-11-06).
export const SURVIVAL_MAX = 40;

/** A Survival game's coins for its levels, ending on `level`: every level got through, up to
 * SURVIVAL_MAX. No coin just for playing, so dying on level 1 pays nothing. */
export function survivalCoins(level: number): number {
  let coins = 0;
  for (let l = 1; l < level; l++) coins += levelCoins(l);
  return Math.min(SURVIVAL_MAX, coins);
}

export type Equipped = Partial<Record<Slot, string>>;

/** "Guest" means playing without a name, so it can't be a player's name too: you couldn't tell the
 * two apart on the menu, and everyone who typed it would share one wallet. */
export function isGuestName(name: string): boolean {
  return name.trim().toLowerCase() === "guest";
}

// The most one game can pay as a single entry; the server caps each entry at this too. A longer game
// (a half-hour Survival run, a coin-hunting game on Hard) goes up as several entries.
const MAX_ENTRY = 200;

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
  pending: Game[]; // games not yet on the server
  dirty?: boolean; // owns something the server doesn't know about yet
  outfitDirty?: boolean; // changed outfit since the last sync
  outfitRev?: number; // bumped on each outfit change, to spot one made while a sync was out
  syncError?: string; // why the last sync failed, until one works
  addedAt?: number; // when added to this device, so a removal from before then doesn't apply
}

/** Everyone who plays on this device. With nobody picked you play as a Guest (Thomas, 2026-11-06:
 * nobody should have to add a name just to play), and a Guest's games pay nothing, so on a shared
 * iPad coins only ever go to the player who earned them. */
interface Device {
  current: string | null; // key (name in lower case) of who's playing, or null for a Guest
  order: string[]; // keys, most recently picked first
  players: Record<string, State>;
  removed: Record<string, number>; // key -> when taken off, so another tab's copy can't bring them back
}

export interface Player {
  key: string;
  name: string;
  balance: number;
  syncError: string | null;
}

const KEY = "fishy-wallet";
const MAX_GAMES = 50; // per request; the server takes no more
const RETRY = 30_000; // ms before trying a failed sync again
const BY_ID = new Map(ITEMS.map((i) => [i.id as string, i]));
const GUEST: State = Object.freeze({ name: "", earned: 0, owned: [], equipped: {}, pending: [] }) as State;

function fresh(name = ""): State {
  return { name, earned: 0, owned: [], equipped: {}, pending: [] };
}

/** A saved or downloaded player, cleaned up: anything malformed, and any item this version of the
 * game doesn't know (one added later, or junk), is dropped rather than allowed to crash drawing. */
function normalize(raw: unknown): State | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.name !== "string" || !r.name) return null;
  const known = (id: unknown): id is string => typeof id === "string" && BY_ID.has(id);
  const equipped: Equipped = {};
  if (r.equipped && typeof r.equipped === "object") {
    for (const [slot, id] of Object.entries(r.equipped as Record<string, unknown>)) {
      if (known(id) && BY_ID.get(id)!.slot === slot) equipped[slot as Slot] = id;
    }
  }
  const pending = Array.isArray(r.pending)
    ? r.pending.filter((g): g is Game => !!g && typeof g.id === "string" && Number.isFinite(g.coins) && g.coins > 0)
    : [];
  return {
    name: r.name,
    earned: Number.isFinite(r.earned) ? Math.max(0, r.earned as number) : 0,
    owned: Array.isArray(r.owned) ? [...new Set(r.owned.filter(known))] : [],
    equipped,
    pending,
    dirty: r.dirty === true,
    outfitDirty: r.outfitDirty === true,
    outfitRev: Number.isFinite(r.outfitRev) ? (r.outfitRev as number) : 0,
    addedAt: Number.isFinite(r.addedAt) ? (r.addedAt as number) : 0,
    syncError: typeof r.syncError === "string" ? r.syncError : undefined,
  };
}

function balanceOf(s: State): number {
  // two devices buying at once offline can briefly take it below zero; it shows 0
  const spent = [...new Set(s.owned)].reduce((sum, id) => sum + (BY_ID.get(id)?.price ?? 0), 0);
  return Math.max(0, s.earned - spent);
}

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export class Wallet {
  private d: Device = { current: null, order: [], players: {}, removed: {} };
  private synced = new Set<string>(); // game ids this tab has got onto the server, so an older saved copy doesn't count them again
  private syncing: Promise<void> | null = null;
  private again = false;
  private retry: number | null = null;
  onChange: () => void = () => {};

  constructor() {
    this.d = this.load() ?? this.d;
    // another tab (or window) changed things: pick them up rather than later saving over them
    window.addEventListener("storage", (e) => {
      if (e.key !== KEY) return;
      const theirs = this.load();
      if (!theirs) return;
      this.d = this.merge(theirs, this.d);
      this.onChange();
    });
  }

  /** The saved device, cleaned up, or null if there's none (or it's unreadable). */
  private load(): Device | null {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
      if (!saved || typeof saved !== "object") return null;
      const d: Device = { current: null, order: [], players: {}, removed: {} };
      if (saved.removed && typeof saved.removed === "object") {
        for (const [key, at] of Object.entries(saved.removed)) if (Number.isFinite(at)) d.removed[key] = at as number;
      }
      if (saved.players && typeof saved.players === "object") {
        for (const [key, raw] of Object.entries(saved.players)) {
          const s = normalize(raw);
          if (s && key === s.name.toLowerCase()) d.players[key] = s;
        }
        const order = Array.isArray(saved.order) ? saved.order.filter((k: unknown) => typeof k === "string") : [];
        d.order = [...new Set<string>([...order, ...Object.keys(d.players)])].filter((k) => d.players[k]);
        d.current = typeof saved.current === "string" && d.players[saved.current] ? saved.current : null;
      } else {
        // the one-player format from before the switcher (test devices only; it never shipped)
        const s = normalize(saved);
        if (s) {
          const key = s.name.toLowerCase();
          d.players[key] = s;
          d.order = [key];
          d.current = key;
        }
      }
      return d;
    } catch {
      return null;
    }
  }

  /** `base` with anything only `extra` knows added in: players, unsynced games and purchases, and
   * removals (a player taken off in either copy stays off, unless added again after that). */
  private merge(base: Device, extra: Device): Device {
    for (const [key, at] of Object.entries(extra.removed)) base.removed[key] = Math.max(base.removed[key] ?? 0, at);
    for (const [key, x] of Object.entries(extra.players)) {
      const b = base.players[key];
      if (!b) {
        base.players[key] = x;
        if (!base.order.includes(key)) base.order.push(key);
        continue;
      }
      for (const g of x.pending) {
        if (this.synced.has(g.id) || b.pending.some((p) => p.id === g.id)) continue;
        b.pending.push(g);
        b.earned += g.coins;
      }
      const more = x.owned.filter((id) => !b.owned.includes(id));
      if (more.length) {
        b.owned.push(...more);
        b.dirty = true;
      }
    }
    for (const [key, at] of Object.entries(base.removed)) {
      const p = base.players[key];
      if (!p) continue;
      if ((p.addedAt ?? 0) > at) {
        delete base.removed[key]; // added again since
        continue;
      }
      delete base.players[key];
      base.order = base.order.filter((k) => k !== key);
      if (base.current === key) base.current = null;
    }
    return base;
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
    return this.d.order.map((key) => {
      const s = this.d.players[key];
      return { key, name: s.name, balance: balanceOf(s), syncError: s.syncError ?? null };
    });
  }

  /** The current player's coins to spend. */
  balance(): number {
    return balanceOf(this.s);
  }

  owns(id: string): boolean {
    return this.s.owned.includes(id);
  }

  /** The outfit of a player on this device, by name (any capitals), or null if there's no such
   * player: the boards' fish fall back on it (itch keeps no wallets on a server). */
  outfitOf(name: string): Equipped | null {
    return this.d.players[name.trim().toLowerCase()]?.equipped ?? null;
  }

  /** What's on in a slot, if it's something this version of the game has. */
  wearing(slot: Slot): string | null {
    const id = this.s.equipped[slot];
    return id && BY_ID.get(id)?.slot === slot ? id : null;
  }

  /** A finished game's coins, to whoever's playing (a Guest gets none). */
  award(coins: number): void {
    coins = Math.floor(coins);
    if (coins <= 0 || !this.name) return;
    this.s.earned += coins;
    if (!LOCAL) for (let left = coins; left > 0; left -= MAX_ENTRY) this.s.pending.push({ id: newId(), coins: Math.min(MAX_ENTRY, left) });
    this.changed();
  }

  /** Buy an item and put it on. False if it's too dear. */
  buy(id: string): boolean {
    const item = BY_ID.get(id);
    if (!item || !this.name || this.owns(id) || this.balance() < item.price) return false;
    this.s.owned.push(id);
    this.s.dirty = true;
    this.s.equipped[item.slot] = id;
    this.outfitChanged();
    return true;
  }

  /** Put an owned item on, or take off whatever's in that slot (null). */
  wear(slot: Slot, id: string | null): void {
    if (!this.name || (id && !this.owns(id))) return;
    if (id) this.s.equipped[slot] = id;
    else delete this.s.equipped[slot];
    this.outfitChanged();
  }

  private outfitChanged(): void {
    this.s.outfitDirty = true;
    this.s.outfitRev = (this.s.outfitRev ?? 0) + 1;
    this.changed();
  }

  /** Add a player. On the family site the name is checked by the server, and if it's already in
   * use there (the same player on another device), their coins and stuff come along. A new player
   * starts at 0; Guest games don't carry over. `pick` "ifGuest" makes them the one playing only if
   * nobody's been picked meanwhile (for players added on their own, while someone may be choosing).
   * Rejects with a message to show. */
  async addPlayer(raw: string, pick: "always" | "ifGuest" = "always"): Promise<void> {
    const name = raw.trim().replace(/\s+/g, " ");
    if (!name || name.length > NAME_MAX) throw new Error(LOCAL ? "Type your initials" : `Use 1-${NAME_MAX} letters or numbers`);
    if (isGuestName(name)) throw new Error("Guest is for playing without a name. Pick your own!");
    const key = name.toLowerCase();
    if (this.d.players[key]) {
      if (pick === "always" || !this.d.current) this.switchTo(key);
      return;
    }
    const state: State = { ...fresh(name), addedAt: Date.now() };
    if (!LOCAL) {
      state.dirty = true; // so the server makes the wallet, even with nothing in it yet
      await this.push(state, true);
    }
    delete this.d.removed[key];
    this.d.players[key] = state;
    this.d.order = [...this.d.order.filter((k) => k !== key), key];
    if (pick === "always" || !this.d.current) this.pick(key);
    this.save();
    this.onChange();
    void this.sync();
  }

  /** Make someone already on this device the one playing. */
  switchTo(key: string): void {
    if (!this.d.players[key]) return;
    this.pick(key);
    this.save();
    this.onChange();
    void this.sync(); // picks up anything they did on another device
  }

  private pick(key: string): void {
    this.d.current = key;
    this.d.order = [key, ...this.d.order.filter((k) => k !== key)];
  }

  /** Play as a Guest: no name, no coins. */
  playAsGuest(): void {
    this.d.current = null;
    this.save();
    this.onChange();
  }

  /** Take a player off this device. On the family site everything of theirs not yet on the server
   * goes up first, however many batches that takes, and if it can't, this rejects rather than lose
   * it. */
  async removePlayer(key: string): Promise<void> {
    const s = this.d.players[key];
    if (!s) return;
    for (let tries = 0; !LOCAL && (s.pending.length || s.dirty || s.outfitDirty); tries++) {
      if (tries >= 25) throw new Error(`Couldn't save all of ${s.name}'s coins. Try again in a minute.`);
      await this.push(s, true).catch(() => {
        throw new Error(`Couldn't save ${s.name}'s coins. Check the internet and try again.`);
      });
    }
    this.d.removed[key] = Date.now();
    delete this.d.players[key];
    this.d.order = this.d.order.filter((k) => k !== key);
    if (this.d.current === key) this.d.current = null; // a Guest until someone's picked
    this.save();
    this.onChange();
  }

  /** Send everyone's new games and purchases, and pick up what the current player did on other
   * devices. On failure it notes why (the menu shows it) and tries again in a while. */
  sync(): Promise<void> {
    if (LOCAL || !this.d.order.length) return Promise.resolve();
    if (this.syncing) {
      this.again = true;
      return this.syncing;
    }
    let failed = false;
    this.syncing = (async () => {
      for (const key of [...this.d.order]) {
        const s = this.d.players[key];
        if (!s || !(s.pending.length || s.dirty || s.outfitDirty || key === this.d.current)) continue;
        await this.push(s, false).catch((err) => {
          failed = true;
          console.warn(err);
        });
      }
    })().finally(() => {
      this.syncing = null;
      if (this.again) {
        this.again = false;
        void this.sync();
      } else if (failed && this.retry === null) {
        this.retry = window.setTimeout(() => {
          this.retry = null;
          void this.sync();
        }, RETRY);
      }
    });
    return this.syncing;
  }

  /** Merge one player's wallet with the server's, updating `s` in place. */
  private async push(s: State, loud: boolean): Promise<void> {
    const sent = s.pending.slice(0, MAX_GAMES); // a long spell offline goes up in batches
    const rev = s.outfitRev ?? 0;
    let res: Response;
    try {
      res = await fetch(API, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wallet: s.name, games: sent, owned: s.owned, equipped: s.equipped, outfitChanged: !!s.outfitDirty }),
      });
    } catch {
      s.syncError = "Couldn't reach the server";
      this.save();
      this.onChange();
      throw new Error("Couldn't reach the server. Check the internet and try again.");
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      s.syncError = body.error ?? `Server error ${res.status}`;
      this.save();
      this.onChange();
      throw new Error(loud ? (body.error ?? `Something went wrong (${res.status})`) : `wallet sync: ${res.status}`);
    }
    const server = normalize(body);
    if (!server) throw new Error("wallet sync: odd reply");
    for (const g of sent) this.synced.add(g.id);
    // games finished while this was on its way are still to send
    const later = s.pending.filter((g) => !sent.some((x) => x.id === g.id));
    s.pending = later;
    s.name = server.name;
    s.earned = server.earned + later.reduce((sum, g) => sum + g.coins, 0);
    const extra = s.owned.filter((id) => BY_ID.has(id) && !server.owned.includes(id));
    s.owned = [...server.owned, ...extra];
    s.dirty = extra.length > 0;
    // the server's outfit, unless it was changed here while this was on its way
    if ((s.outfitRev ?? 0) === rev) {
      s.equipped = server.equipped;
      s.outfitDirty = false;
    }
    delete s.syncError;
    if (later.length || s.dirty || s.outfitDirty) this.again = true;
    this.save();
    this.onChange();
  }

  private changed(): void {
    this.save();
    this.onChange();
    void this.sync();
  }

  /** Save, first taking in anything another tab saved meanwhile, so two tabs don't lose each
   * other's players or games. */
  private save(): void {
    try {
      const theirs = this.load();
      if (theirs) this.d = this.merge(this.d, theirs);
      localStorage.setItem(KEY, JSON.stringify(this.d));
    } catch {
      // not remembering is fine; it's on the server for anyone added on the family site
    }
  }
}
