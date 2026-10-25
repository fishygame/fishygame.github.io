// High score boards for Fishy: an AWS Lambda behind a function URL, storing the top 5 of each game
// mode and difficulty in DynamoDB.
//   GET  ?mode=&difficulty= -> { scores: [{ name, score }] }
//   POST { name, score, mode, difficulty } -> { scores, rank } (rank is the new entry's index, or -1
//        if it missed out)
// Leaving out the mode or difficulty means Classic on Medium, the original game, so older copies of
// the page still work. Names are checked here, not in the game, so the filter can't be skipped by
// editing the page.

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.TABLE;

const TOP = 5;
const NAME_MAX = 8;
const MAX_SCORE = 1_000_000; // far beyond a real game; anything bigger is someone poking the API
const COOLDOWN = 10; // seconds between submissions from the same IP
const MODES = ["classic", "speed"];
const DIFFICULTIES = ["easy", "medium", "hard"];

// Matched anywhere in the name, after undoing l33t-speak and repeated letters.
const BLOCKED_ANYWHERE = [
  "fuck", "fuk", "fck", "shit", "cunt", "nigg", "niga", "bitch", "biatch", "whore", "slut",
  "penis", "vagin", "pussy", "dildo", "porn", "nazi", "hitler", "faggot", "fagot", "retard",
  "twat", "jizz", "boob", "bastard", "molest", "kkk",
];
// Matched only as a whole word, since they hide inside harmless ones (class, peacock, grapes...).
const BLOCKED_WORDS = [
  "ass", "arse", "asshole", "cum", "tit", "tits", "fag", "dick", "cock", "sex", "sexy", "rape",
  "spic", "chink", "kike", "wank", "homo", "damn", "crap", "piss", "hoe", "hore", "anal", "anus",
  "pedo",
];
const LEET = { 0: "o", 1: "i", 3: "e", 4: "a", 5: "s", 7: "t", 8: "b", 9: "g", "@": "a", $: "s", "!": "i" };

function isRude(name) {
  const plain = [...name.toLowerCase()].map((c) => LEET[c] ?? c).join("");
  const words = plain.split(/[^a-z]+/).filter(Boolean);
  const squashed = words.join("");
  const deduped = squashed.replace(/(.)\1+/g, "$1"); // "fuuuck" -> "fuck"
  if (BLOCKED_ANYWHERE.some((w) => squashed.includes(w) || deduped.includes(w))) return true;
  const variants = [...words, squashed, ...words.map((w) => w.replace(/(.)\1+/g, "$1"))];
  return variants.some((w) => BLOCKED_WORDS.includes(w));
}

/** Trimmed name with single spaces, or null if it's empty, too long or has odd characters. */
function cleanName(raw) {
  if (typeof raw !== "string") return null;
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length < 1 || name.length > NAME_MAX) return null;
  if (!/^[A-Za-z0-9 _\-.!?'@$]+$/.test(name)) return null;
  return name;
}

function json(statusCode, body) {
  return { statusCode, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

/** The board's key, or null for a mode or difficulty that doesn't exist. Classic on Medium keeps
 * the original board's key, so its scores carried over. */
function boardKey(mode = "classic", difficulty = "medium") {
  if (!MODES.includes(mode) || !DIFFICULTIES.includes(difficulty)) return null;
  return mode === "classic" && difficulty === "medium" ? "board" : `board#${mode}#${difficulty}`;
}

async function getBoard(pk) {
  const { Item } = await db.send(new GetCommand({ TableName: TABLE, Key: { pk } }));
  return Item ?? { pk, scores: [], version: 0 };
}

/** Rate limit per IP: claims a short-lived marker row, or returns false if one is still live. */
async function claimCooldown(ip) {
  const now = Math.floor(Date.now() / 1000);
  try {
    await db.send(
      new PutCommand({
        TableName: TABLE,
        Item: { pk: `ip#${ip}`, expires: now + COOLDOWN },
        ConditionExpression: "attribute_not_exists(pk) OR expires < :now",
        ExpressionAttributeValues: { ":now": now },
      }),
    );
    return true;
  } catch (err) {
    if (err.name === "ConditionalCheckFailedException") return false;
    throw err;
  }
}

async function submit(event) {
  let body;
  try {
    const raw = event.isBase64Encoded ? Buffer.from(event.body ?? "", "base64").toString() : event.body;
    body = JSON.parse(raw ?? "");
  } catch {
    return json(400, { error: "Bad request" });
  }
  const pk = boardKey(body.mode, body.difficulty);
  if (!pk) return json(400, { error: "Bad game mode" });
  const name = cleanName(body.name);
  const score = body.score;
  if (!Number.isInteger(score) || score < 1 || score > MAX_SCORE) return json(400, { error: "Bad score" });
  if (!name) return json(400, { error: `Use 1-${NAME_MAX} letters or numbers` });
  if (isRude(name)) return json(400, { error: "Please pick a different name" });

  const ip = event.requestContext?.http?.sourceIp ?? "unknown";
  if (!(await claimCooldown(ip))) return json(429, { error: "Slow down a little and try again" });

  // read-modify-write with a version check, retrying if two scores land at once
  for (let attempt = 0; attempt < 5; attempt++) {
    const board = await getBoard(pk);
    const entry = { name, score, at: new Date().toISOString() };
    // ties go to whoever got there first
    const scores = [...board.scores, entry].sort((a, b) => b.score - a.score).slice(0, TOP);
    const rank = scores.indexOf(entry);
    if (rank === -1) return json(200, { scores: board.scores.map(publicEntry), rank });
    try {
      await db.send(
        new PutCommand({
          TableName: TABLE,
          Item: { pk, scores, version: board.version + 1 },
          ConditionExpression: "attribute_not_exists(pk) OR version = :v",
          ExpressionAttributeValues: { ":v": board.version },
        }),
      );
      return json(200, { scores: scores.map(publicEntry), rank });
    } catch (err) {
      if (err.name !== "ConditionalCheckFailedException") throw err;
    }
  }
  return json(503, { error: "Busy, try again" });
}

function publicEntry({ name, score }) {
  return { name, score };
}

export const handler = async (event) => {
  const method = event.requestContext?.http?.method;
  if (method === "GET") {
    const query = event.queryStringParameters ?? {};
    const pk = boardKey(query.mode, query.difficulty);
    if (!pk) return json(400, { error: "Bad game mode" });
    return json(200, { scores: (await getBoard(pk)).scores.map(publicEntry) });
  }
  if (method === "POST") return submit(event);
  return json(405, { error: "Method not allowed" });
};
