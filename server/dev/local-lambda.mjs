// Loads ../high-scores.mjs with the AWS SDK swapped for an in-memory table, for testing the Lambda
// on this machine without touching the real boards or wallets. Used by test.mjs and serve.mjs.
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** A copy of the Lambda's handler on an empty table. `globalThis.__store` is the table (a Map by
 * key), `globalThis.__calls` the database calls made ("get" / "put"), and `globalThis.__race = n`
 * makes the next n writes fail as if another device had just written. */
export async function loadHandler() {
  const src = readFileSync(new URL("../high-scores.mjs", import.meta.url), "utf8")
    .replace(/^import \{ DynamoDBClient \}.*$/m, "")
    .replace(
      /^import \{ DynamoDBDocumentClient, GetCommand, PutCommand \}.*$/m,
      `const store = globalThis.__store;
class GetCommand { constructor(i) { this.kind = "get"; this.input = i; } }
class PutCommand { constructor(i) { this.kind = "put"; this.input = i; } }
class DynamoDBClient {}
const DynamoDBDocumentClient = { from: () => ({ send: async (c) => {
  globalThis.__calls.push(c.kind);
  if (c.kind === "get") { const v = store.get(c.input.Key.pk); return { Item: v && structuredClone(v) }; }
  const item = c.input.Item; const cur = store.get(item.pk);
  if (globalThis.__race) { globalThis.__race--; const e = new Error("race"); e.name = "ConditionalCheckFailedException"; throw e; }
  const vals = c.input.ExpressionAttributeValues ?? {};
  const ok = !cur || (c.input.ConditionExpression.includes("version") && cur.version === vals[":v"]) ||
    (c.input.ConditionExpression.includes("expires <") && cur.expires < vals[":now"]);
  if (!ok) { const e = new Error("cond"); e.name = "ConditionalCheckFailedException"; throw e; }
  store.set(item.pk, structuredClone(item)); return {};
} }) };`,
    );
  globalThis.__store = new Map();
  globalThis.__calls = [];
  const out = join(tmpdir(), `fishy-lambda-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
  writeFileSync(out, src);
  process.env.TABLE = "t";
  const { handler } = await import(pathToFileURL(out).href);
  return handler;
}
