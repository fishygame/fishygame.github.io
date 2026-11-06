// The Lambda's wallet and score checks, against an in-memory table: node server/dev/test.mjs
import assert from "node:assert/strict";
import { loadHandler } from "./local-lambda.mjs";

const handler = await loadHandler();

const get = (q) => handler({ requestContext: { http: { method: "GET" } }, queryStringParameters: q });
const post = (b, ip = "1.2.3.4") =>
  handler({ requestContext: { http: { method: "POST", sourceIp: ip } }, body: JSON.stringify(b) });
const body = (r) => JSON.parse(r.body);

// a brand-new name reads as empty
let r = await get({ wallet: "Hunter" });
assert.equal(r.statusCode, 200);
assert.deepEqual(body(r), { name: "Hunter", earned: 0, owned: [], equipped: {}, equippedAt: 0, exists: false });

// signing in creates it, with what the device had
r = await post({ wallet: "Hunter", games: [{ id: "game-aaa1", coins: 12 }], owned: ["crown"], equipped: { hat: "crown" }, equippedAt: 100 });
assert.equal(r.statusCode, 200, r.body);
assert.deepEqual(body(r), { name: "Hunter", earned: 12, owned: ["crown"], equipped: { hat: "crown" }, equippedAt: 100, exists: true });

// a retried game doesn't pay twice; a new one does; names match whatever the capitals
r = await post({ wallet: "hunter", games: [{ id: "game-aaa1", coins: 12 }, { id: "game-bbb2", coins: 5 }], owned: [], equipped: {}, equippedAt: 50 });
assert.equal(body(r).earned, 17);
assert.equal(body(r).name, "Hunter");
// an older outfit loses; owned is a union
assert.deepEqual(body(r).equipped, { hat: "crown" });
r = await post({ wallet: "HUNTER", games: [], owned: ["gold"], equipped: { look: "gold" }, equippedAt: 200 });
assert.deepEqual(body(r).owned, ["crown", "gold"]);
assert.deepEqual(body(r).equipped, { look: "gold" });
assert.equal(body(r).equippedAt, 200);

// nothing new: no write
globalThis.__calls = [];
r = await post({ wallet: "Hunter", games: [{ id: "game-bbb2", coins: 5 }], owned: ["gold"], equipped: {}, equippedAt: 10 });
assert.equal(r.statusCode, 200);
assert.deepEqual(globalThis.__calls, ["get"]);

// two devices at once: the write retries and nothing's lost
globalThis.__race = 2;
r = await post({ wallet: "Hunter", games: [{ id: "game-ccc3", coins: 3 }], owned: [], equipped: {}, equippedAt: 0 });
assert.equal(body(r).earned, 20);
assert.equal(globalThis.__store.get("wallet#hunter").earned, 20);

// GET reads it back, without the seen list
r = await get({ wallet: "hunter" });
assert.deepEqual(body(r), { name: "Hunter", earned: 20, owned: ["crown", "gold"], equipped: { look: "gold" }, equippedAt: 200, exists: true });

// bad input gets a 400 and writes nothing
const before = JSON.stringify([...globalThis.__store]);
for (const bad of [
  { wallet: "" },
  { wallet: "waytoolongname" },
  { wallet: "fuck" },
  { wallet: "Guest" },
  { wallet: " gUeSt " },
  { wallet: "Hunter", games: [{ id: "x", coins: 1 }] },
  { wallet: "Hunter", games: [{ id: "game-ddd4", coins: 9999 }] },
  { wallet: "Hunter", games: [{ id: "game-ddd4", coins: 1.5 }] },
  { wallet: "Hunter", games: Array.from({ length: 51 }, (_, i) => ({ id: `game-x${i}xx`, coins: 1 })) },
  { wallet: "Hunter", owned: ["<script>"] },
  { wallet: "Hunter", equipped: { weapon: "gun" } },
  { wallet: "Hunter", equipped: [] },
  { wallet: "Hunter", equippedAt: -1 },
]) {
  r = await post(bad);
  assert.equal(r.statusCode, 400, JSON.stringify(bad) + " -> " + r.body);
}
r = await get({ wallet: "" });
assert.equal(r.statusCode, 400);
assert.equal(JSON.stringify([...globalThis.__store]), before);

// scores still work, and a wallet sync doesn't use up the score cooldown
r = await post({ name: "Hunter", score: 500, mode: "classic", difficulty: "hard", end: "fish" }, "9.9.9.9");
assert.equal(r.statusCode, 200, r.body);
assert.equal(body(r).rank, 0);
r = await post({ wallet: "Hunter", games: [{ id: "game-eee5", coins: 2 }] }, "9.9.9.9");
assert.equal(r.statusCode, 200);
r = await post({ name: "Hunter", score: 600, mode: "classic", difficulty: "hard", end: "fish" }, "9.9.9.9");
assert.equal(r.statusCode, 429); // the score cooldown itself is unchanged
r = await get({ mode: "classic", difficulty: "hard" });
assert.equal(body(r).scores[0].score, 500);
r = await post({ name: "Hunter", score: 1, mode: "bogus" });
assert.equal(r.statusCode, 400);
r = await handler({ requestContext: { http: { method: "POST" } }, body: "not json" });
assert.equal(r.statusCode, 400);
r = await handler({ requestContext: { http: { method: "POST" } }, body: "42" });
assert.equal(r.statusCode, 400);

console.log("all wallet and score checks passed");
