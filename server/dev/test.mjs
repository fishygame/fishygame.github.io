// The Lambda's wallet and score checks, against an in-memory table: node server/dev/test.mjs
import assert from "node:assert/strict";
import { loadHandler } from "./local-lambda.mjs";

const handler = await loadHandler();

let ipCount = 0;
const get = (q) => handler({ requestContext: { http: { method: "GET" } }, queryStringParameters: q });
// each wallet post from its own IP unless given one, so the rate limit only bites where it's tested
const post = (b, ip = `10.0.0.${++ipCount}`) =>
  handler({ requestContext: { http: { method: "POST", sourceIp: ip } }, body: JSON.stringify(b) });
const body = (r) => JSON.parse(r.body);
const store = () => globalThis.__store;

// a brand-new name reads as empty
let r = await get({ wallet: "Hunter" });
assert.equal(r.statusCode, 200);
assert.deepEqual(body(r), { name: "Hunter", earned: 0, owned: [], equipped: {}, equippedAt: 0, exists: false });

// adding a player makes the wallet, with what the device had; the outfit time is the server's
const before = Date.now();
r = await post({ wallet: "Hunter", games: [{ id: "game-aaa1", coins: 12 }], owned: ["crown"], equipped: { hat: "crown" }, outfitChanged: true });
assert.equal(r.statusCode, 200, r.body);
let w = body(r);
assert.deepEqual([w.name, w.earned, w.owned, w.equipped, w.exists], ["Hunter", 12, ["crown"], { hat: "crown" }, true]);
assert.ok(w.equippedAt >= before && w.equippedAt <= Date.now());

// a retried game doesn't pay twice; a new one does; names match whatever the capitals; an outfit
// sent without outfitChanged (a device that hasn't changed it) doesn't replace the stored one
r = await post({ wallet: "hunter", games: [{ id: "game-aaa1", coins: 12 }, { id: "game-bbb2", coins: 5 }], owned: [], equipped: {} });
w = body(r);
assert.deepEqual([w.earned, w.name, w.equipped], [17, "Hunter", { hat: "crown" }]);
// a change replaces it; owned is a union
r = await post({ wallet: "HUNTER", games: [], owned: ["gold"], equipped: { look: "gold" }, outfitChanged: true });
w = body(r);
assert.deepEqual([w.owned, w.equipped], [["crown", "gold"], { look: "gold" }]);

// a device's clock can't matter: an old client's equippedAt is ignored
r = await post({ wallet: "Hunter", equipped: { hat: "crown" }, equippedAt: 9007199254740991 });
assert.deepEqual(body(r).equipped, { look: "gold" });

// nothing new: no write
globalThis.__calls = [];
r = await post({ wallet: "Hunter", games: [{ id: "game-bbb2", coins: 5 }], owned: ["gold"], equipped: {} });
assert.equal(r.statusCode, 200);
assert.deepEqual(globalThis.__calls, ["get"]);

// two devices at once: the write retries and nothing's lost
globalThis.__race = 2;
r = await post({ wallet: "Hunter", games: [{ id: "game-ccc3", coins: 3 }] });
assert.equal(body(r).earned, 20);
assert.equal(store().get("wallet#hunter").earned, 20);

// GET reads it back, without the seen list
r = await get({ wallet: "hunter" });
w = body(r);
assert.deepEqual([w.earned, w.owned, w.equipped, w.exists], [20, ["crown", "gold"], { look: "gold" }, true]);
assert.equal(w.seen, undefined);

// the review's attacks (2026-11-06): none of them can freeze, block or bury a wallet
// an unknown item in the outfit (would crash drawing) is dropped
r = await post({ wallet: "Mia", equipped: { look: "zzz", hat: "crown", weapon: "gun" }, outfitChanged: true });
assert.equal(r.statusCode, 200, r.body);
assert.deepEqual(body(r).equipped, { hat: "crown" });
// junk and repeated owned ids are dropped, so the owned list can't be buried or overfilled
r = await post({ wallet: "Mia", owned: ["crown", "crown", "crown", "<script>", ...Array.from({ length: 60 }, (_, i) => `junk${i}`)] });
assert.deepEqual(body(r).owned, ["crown"]);
r = await post({ wallet: "Mia", owned: ["party"] });
assert.deepEqual(body(r).owned, ["crown", "party"]);
// a bad game is dropped and an oversized one capped, and the rest of the batch still counts
r = await post({
  wallet: "Mia",
  games: [
    { id: "x", coins: 5 },
    { id: "game-big001", coins: 9999 },
    { id: "game-frac01", coins: 2.7 },
    { id: "game-neg001", coins: -5 },
    { id: "game-ok0001", coins: 4 },
  ],
});
assert.equal(r.statusCode, 200, r.body);
assert.equal(body(r).earned, 200 + 2 + 4);
// stored junk from before these checks is cleaned on the way out
store().set("wallet#old", { pk: "wallet#old", name: "Old", earned: 1, owned: ["crown", "nope", "crown"], seen: [], equipped: { look: "nope" }, equippedAt: 0, version: 1 });
r = await get({ wallet: "old" });
assert.deepEqual([body(r).owned, body(r).equipped], [["crown"], {}]);

// wallet writes are rate limited per IP, separately from the score cooldown
for (let i = 0; i < 30; i++) {
  r = await post({ wallet: "Flood", games: [{ id: `game-fl${String(i).padStart(4, "0")}`, coins: 1 }] }, "6.6.6.6");
  assert.equal(r.statusCode, 200, `write ${i}: ${r.body}`);
}
r = await post({ wallet: "Flood", games: [{ id: "game-fl9999", coins: 1 }] }, "6.6.6.6");
assert.equal(r.statusCode, 429);
// a sync with nothing new isn't a write, so it isn't limited
r = await post({ wallet: "Flood" }, "6.6.6.6");
assert.equal(r.statusCode, 200);
// and the minute passes
store().get("wip#6.6.6.6").expires = 0;
r = await post({ wallet: "Flood", games: [{ id: "game-fl9999", coins: 1 }] }, "6.6.6.6");
assert.equal(r.statusCode, 200);
assert.equal(body(r).earned, 31);

// bad input gets a 400 and writes nothing
const snapshot = JSON.stringify([...store()]);
for (const bad of [
  { wallet: "" },
  { wallet: "waytoolongname" },
  { wallet: "fuck" },
  { wallet: "Guest" },
  { wallet: " gUeSt " },
  { wallet: "Hunter", games: Array.from({ length: 51 }, (_, i) => ({ id: `game-x${i}xx`, coins: 1 })) },
  { wallet: "Hunter", games: "lots" },
  { wallet: "Hunter", owned: Array.from({ length: 201 }, () => "crown") },
  { wallet: "Hunter", equipped: [] },
]) {
  r = await post(bad);
  assert.equal(r.statusCode, 400, JSON.stringify(bad) + " -> " + r.body);
}
r = await get({ wallet: "" });
assert.equal(r.statusCode, 400);
assert.equal(JSON.stringify([...store()]), snapshot);

// scores still work, and wallet writes don't use up the score cooldown
r = await post({ name: "Hunter", score: 500, mode: "classic", difficulty: "hard", end: "fish" }, "9.9.9.9");
assert.equal(r.statusCode, 200, r.body);
assert.equal(body(r).rank, 0);
r = await post({ wallet: "Hunter", games: [{ id: "game-eee5", coins: 2 }] }, "9.9.9.9");
assert.equal(r.statusCode, 200);
r = await post({ name: "Hunter", score: 600, mode: "classic", difficulty: "hard", end: "fish" }, "9.9.9.9");
assert.equal(r.statusCode, 429); // the score cooldown itself is unchanged
r = await get({ mode: "classic", difficulty: "hard" });
assert.equal(body(r).scores[0].score, 500);
// each board entry wears its player's outfit (Hunter's is the gold look), matched whatever the capitals
assert.deepEqual(body(r).scores[0].outfit, { look: "gold" });
assert.deepEqual(body(r).players[0].outfit, { look: "gold" });
r = await post({ name: "Nobody", score: 300, mode: "classic", difficulty: "hard", end: "fish" }, "8.8.8.8");
assert.equal(body(r).scores[1].name, "Nobody");
assert.equal(body(r).scores[1].outfit, undefined); // no wallet: a plain fish
assert.deepEqual(body(r).scores[0].outfit, { look: "gold" });
r = await post({ name: "Hunter", score: 1, mode: "bogus" });
assert.equal(r.statusCode, 400);
r = await handler({ requestContext: { http: { method: "POST" } }, body: "not json" });
assert.equal(r.statusCode, 400);
r = await handler({ requestContext: { http: { method: "POST" } }, body: "42" });
assert.equal(r.statusCode, 400);

console.log("all wallet and score checks passed");
