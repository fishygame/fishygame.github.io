// High score boards for Fishy: an AWS Lambda behind a function URL, storing the top 10 of each game
// mode and difficulty in DynamoDB, both all time and for this week.
//   GET  ?mode=&difficulty= -> { scores: [{ name, score }], weekly: [...] }
//   POST { name, score, mode, difficulty, time } -> { scores, rank, weekly, weeklyRank } (a rank is
//        the new entry's index on that board, or -1 if it missed out)
// `scores` is the all-time board. The weekly board starts fresh every Monday, US Eastern time. Both
// allow repeats: a player with the ten best scores gets all ten places.
// Speed boards also keep how long each game took (`time`, whole seconds); scores saved before that
// have none.
// Leaving out the mode or difficulty means Classic on Medium, the original game, so older copies of
// the page still work. Names are checked here, not in the game, so the filter can't be skipped by
// editing the page.

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.TABLE;

const TOP = 10;
const WEEK_TTL = 365 * 86400; // old weeks expire (the table's TTL is on `expires`)
const ZONE = "America/New_York";
const NAME_MAX = 8;
const MAX_SCORE = 1_000_000; // far beyond a real game; anything bigger is someone poking the API
const MAX_TIME = 3600; // seconds; likewise
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

/** The boards' keys, or null for a mode or difficulty that doesn't exist. Classic on Medium keeps
 * the original board's key for all time, so its scores carried over. */
function boardKeys(mode = "classic", difficulty = "medium") {
  if (!MODES.includes(mode) || !DIFFICULTIES.includes(difficulty)) return null;
  const all = mode === "classic" && difficulty === "medium" ? "board" : `board#${mode}#${difficulty}`;
  return { all, week: `week#${weekStart()}#${mode}#${difficulty}` };
}

/** The Monday that starts this week, as YYYY-MM-DD, by the clock in Georgia. */
export function weekStart(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(now)
    .split("-")
    .map(Number);
  const day = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return day.toISOString().slice(0, 10);
}

/** The top 10, highest first. The sort is stable, so ties go to whoever got there first. */
function top(scores) {
  return [...scores].sort((a, b) => b.score - a.score).slice(0, TOP);
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
  const keys = boardKeys(body.mode, body.difficulty);
  if (!keys) return json(400, { error: "Bad game mode" });
  const name = cleanName(body.name);
  const score = body.score;
  if (!Number.isInteger(score) || score < 1 || score > MAX_SCORE) return json(400, { error: "Bad score" });
  if (!name) return json(400, { error: `Use 1-${NAME_MAX} letters or numbers` });
  if (isRude(name)) return json(400, { error: "Please pick a different name" });
  const time = body.mode === "speed" ? body.time : undefined;
  if (time !== undefined && (!Number.isInteger(time) || time < 0 || time > MAX_TIME)) {
    return json(400, { error: "Bad time" });
  }

  const ip = event.requestContext?.http?.sourceIp ?? "unknown";
  if (!(await claimCooldown(ip))) return json(429, { error: "Slow down a little and try again" });

  const entry = { name, score, ...(time !== undefined && { time }), at: new Date().toISOString() };
  const all = await place(keys.all, entry);
  if (!all) return json(503, { error: "Busy, try again" });
  const week = await place(keys.week, entry, Math.floor(Date.now() / 1000) + WEEK_TTL);
  if (!week) return json(503, { error: "Busy, try again" });
  return json(200, {
    scores: all.scores.map(publicEntry),
    rank: all.rank,
    weekly: week.scores.map(publicEntry),
    weeklyRank: week.rank,
  });
}

/** Add an entry to one board: read-modify-write with a version check, retrying if two scores land
 * at once. Resolves to the board and the entry's place on it (-1 if it missed out), or null if it
 * stayed too busy. */
async function place(pk, entry, expires) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const board = await getBoard(pk);
    const scores = top([...board.scores, entry]);
    const at = scores.indexOf(entry);
    if (at === -1) return { scores: board.scores, rank: -1 };
    try {
      await db.send(
        new PutCommand({
          TableName: TABLE,
          Item: { pk, scores, version: board.version + 1, ...(expires && { expires }) },
          ConditionExpression: "attribute_not_exists(pk) OR version = :v",
          ExpressionAttributeValues: { ":v": board.version },
        }),
      );
      return { scores, rank: at };
    } catch (err) {
      if (err.name !== "ConditionalCheckFailedException") throw err;
    }
  }
  return null;
}

function publicEntry({ name, score, time }) {
  return time === undefined ? { name, score } : { name, score, time };
}

export const handler = async (event) => {
  const method = event.requestContext?.http?.method;
  if (method === "GET") {
    const query = event.queryStringParameters ?? {};
    const keys = boardKeys(query.mode, query.difficulty);
    if (!keys) return json(400, { error: "Bad game mode" });
    const [all, week] = await Promise.all([getBoard(keys.all), getBoard(keys.week)]);
    return json(200, {
      scores: all.scores.map(publicEntry),
      weekly: week.scores.map(publicEntry),
    });
  }
  if (method === "POST") return submit(event);
  return json(405, { error: "Method not allowed" });
};
