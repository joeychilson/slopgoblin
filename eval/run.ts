// Sends every labeled post through the live Decisions API exactly as the extension would, then
// reports what each strictness hides: clean posts hidden by mistake, and junk caught.
// Answers are cached in eval/.cache.json under the question's fingerprint, so only posts whose
// question or content changed are asked again.
//
//   vp run eval                    the tables
//   vp run eval --misses           also list every mistake at "balanced"
//   vp run eval --misses strict    …or at another strictness
//
// eval/posts.jsonl is a written-to-order set that ships with the repo. Any eval/real/*.jsonl
// (same shape, collected from a real feed) is scored alongside it.
// The key comes from GEMINI_API_KEY, or from .env.local.

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import {
  DecisionError,
  USD_PER_MILLION_TOKENS,
  decide,
  questionKey,
  type Scores,
} from "../src/core/decisions.ts";
import { REFUSED, judge } from "../src/core/policy.ts";
import type { PostContent } from "../src/core/post.ts";
import { DEFAULT_SETTINGS, type Settings } from "../src/core/settings.ts";
import {
  CATEGORIES,
  STRICTNESS,
  THRESHOLD,
  type CategoryId,
  type Strictness,
} from "../src/core/taxonomy.ts";

interface Row extends PostContent {
  id: string;
  /** Every category a reasonable reader would file the post under. None means it should stay. */
  labels: CategoryId[];
  /** A judgment call either way. Scored, but left out of the totals. */
  unsure?: boolean;
  note?: string;
}

interface Answer {
  scores: Scores;
  tokens: number;
}

const dir = new URL(".", import.meta.url);
const cachePath = new URL(".cache.json", dir);
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error("Set GEMINI_API_KEY");

const read = (file: URL): Row[] =>
  readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));

const realDir = new URL("real/", dir);
const sets: { name: string; rows: Row[] }[] = [
  ...(existsSync(realDir) ? readdirSync(realDir) : [])
    .filter((file) => file.endsWith(".jsonl"))
    .sort()
    .map((file) => ({ name: file.replace(".jsonl", ""), rows: read(new URL(file, realDir)) })),
  { name: "synthetic", rows: read(new URL("posts.jsonl", dir)) },
];

const cache: Record<string, Answer> = existsSync(cachePath)
  ? JSON.parse(readFileSync(cachePath, "utf8"))
  : {};

const cacheKey = (row: Row) => {
  const { author, text, quote, link, replyTo, images } = row;
  const content = JSON.stringify([author, text, quote, link, replyTo, images]);
  return `${row.id}|${questionKey(row)}|${createHash("sha1").update(content).digest("hex").slice(0, 10)}`;
};

const all = sets.flatMap((set) => set.rows);
const missing = all.filter((row) => !(cacheKey(row) in cache));
if (missing.length) console.log(`Asking about ${missing.length} of ${all.length} posts…`);

await runPool(missing, 8, async (row) => {
  let withImages = true;
  for (let attempt = 0; ; attempt++) {
    try {
      cache[cacheKey(row)] = await decide(apiKey, row, withImages);
    } catch (error) {
      if (!(error instanceof DecisionError)) throw error;
      if (error.kind === "rate") {
        await sleep(error.retryAfterMs);
        continue;
      }
      if (error.kind === "transient" && attempt < 3) {
        await sleep(2000 * 2 ** attempt);
        continue;
      }
      if (error.kind === "media" && withImages) {
        withImages = false;
        continue;
      }
      if (error.kind !== "blocked") throw error;
      // The extension hides what Google's safety filter refuses to read, so the eval does too.
      console.warn(`${row.id}: blocked by the safety filter`);
      cache[cacheKey(row)] = { scores: REFUSED, tokens: 0 };
    }
    // Saved as answers arrive, so an interrupted run doesn't pay for them again.
    writeFileSync(cachePath, JSON.stringify(cache));
    return;
  }
});

const answerFor = (row: Row) => cache[cacheKey(row)]!;

/** The default settings at a strictness, with only the categories `on` picks switched on. */
const settingsAt = (
  strictness: Strictness,
  on: (id: CategoryId) => boolean = () => true,
): Settings => ({
  ...DEFAULT_SETTINGS,
  strictness,
  categories: Object.fromEntries(CATEGORIES.map((c) => [c.id, on(c.id)])) as Settings["categories"],
});
const verdict = (row: Row, settings: Settings) =>
  judge({ scores: answerFor(row).scores, isAd: false, handle: row.author.handle }, settings);

const firm = (rows: Row[]) => rows.filter((row) => !row.unsure);
const clean = (rows: Row[]) => firm(rows).filter((row) => !row.labels.length);
const junk = (rows: Row[]) => firm(rows).filter((row) => row.labels.length);
const hidden = (rows: Row[], settings: Settings) =>
  rows.filter((row) => verdict(row, settings)).length;

const cell = (value: string | number, width: number) => String(value).padStart(width);
const levelHeads = STRICTNESS.map((s) => `${s} ≥${THRESHOLD[s]}`.padStart(15)).join("  ");

// What a reader feels: posts that should have stayed but were hidden, and junk that was caught.
console.log(`\n${"".padEnd(26)}${levelHeads}`);
console.log(
  `${"set".padEnd(14)}${cell("clean", 6)}${cell("junk", 6)}${STRICTNESS.map(() => "    wrong  caught").join("")}`,
);
const total = { name: "all", rows: all };
for (const { name, rows } of sets.length > 1 ? [...sets, total] : sets) {
  const cells = STRICTNESS.map(
    (s) =>
      `${cell(hidden(clean(rows), settingsAt(s)), 9)}${cell(hidden(junk(rows), settingsAt(s)), 8)}`,
  );
  console.log(
    `${name.padEnd(14)}${cell(clean(rows).length, 6)}${cell(junk(rows).length, 6)}${cells.join("")}`,
  );
}

// Per category: how much of it is caught, and how often the bar names a category it was labeled.
console.log(
  `\n${"category".padEnd(17)}${cell("junk", 6)}${STRICTNESS.map((s) => cell(s, 10)).join("")}${cell("named", 10)}`,
);
for (const category of CATEGORIES) {
  if (!("describes" in category)) continue;
  const labeled = junk(all).filter((row) => row.labels.includes(category.id));
  const caught = labeled.flatMap((row) => {
    const hit = verdict(row, settingsAt("balanced"));
    return hit ? [row.labels.includes(hit.category)] : [];
  });
  const named = caught.filter(Boolean).length;
  console.log(
    `${category.id.padEnd(17)}${cell(labeled.length, 6)}${STRICTNESS.map((s) => cell(hidden(labeled, settingsAt(s)), 10)).join("")}${cell(`${named}/${caught.length}`, 10)}`,
  );
}

// The switches, at Balanced: a reader who keeps only one category, or switches one off. Of
// the junk they still want hidden, how much is; and how many posts they asked to see are
// hidden anyway: real ones, and junk only of the kinds switched off.
console.log(
  `\n${"switches".padEnd(17)}${cell("only this on", 16)}${cell("this off", 16)}\n${"".padEnd(17)}${cell("caught", 10)}${cell("wrong", 6)}${cell("caught", 10)}${cell("wrong", 6)}`,
);
const switched = (settings: Settings) => {
  const wanted = (row: Row) => row.labels.some((label) => settings.categories[label]);
  const want = firm(all).filter(wanted);
  const rest = firm(all).filter((row) => !wanted(row));
  return `${cell(`${hidden(want, settings)}/${want.length}`, 10)}${cell(hidden(rest, settings), 6)}`;
};
for (const { id } of CATEGORIES.filter((c) => "describes" in c)) {
  const alone = settingsAt("balanced", (c) => c === id);
  const off = settingsAt("balanced", (c) => c !== id);
  console.log(`${id.padEnd(17)}${switched(alone)}${switched(off)}`);
}

const tokens = all.map((row) => answerFor(row).tokens).filter(Boolean);
const average = tokens.reduce((sum, n) => sum + n, 0) / tokens.length;
console.log(
  `\n${Math.round(average)} tokens a post on average: $${((average * USD_PER_MILLION_TOKENS) / 1000).toFixed(3)} per 1,000 posts.`,
);

const flag = process.argv.indexOf("--misses");
if (flag !== -1) {
  const level = STRICTNESS.find((s) => s === process.argv[flag + 1]) ?? "balanced";
  const pct = (p: number) => `${Math.round(p * 100)}%`;
  const describe = (row: Row) => {
    const top = Object.entries(answerFor(row).scores)
      .filter(([, p]) => p >= 0.05)
      .sort(([, a], [, b]) => b - a)
      .map(([id, p]) => `${id} ${pct(p)}`);
    const lines = [
      `${row.id}  @${row.author.handle}  ${top.join(", ") || "fine"}`,
      `  ${row.text.replaceAll("\n", " ").slice(0, 220) || "(no text)"}`,
    ];
    if (row.labels.length) lines.push(`  labeled: ${row.labels.join(", ")}`);
    if (row.note) lines.push(`  note: ${row.note}`);
    return lines.join("\n");
  };
  const wrong = clean(all).filter((row) => verdict(row, settingsAt(level)));
  const missed = junk(all).filter((row) => !verdict(row, settingsAt(level)));
  console.log(`\nHidden at ${level}, should have stayed (${wrong.length}):\n`);
  console.log(wrong.map(describe).join("\n\n"));
  console.log(`\nJunk that got through at ${level} (${missed.length}):\n`);
  console.log(missed.map(describe).join("\n\n"));
}

async function runPool<T>(items: T[], size: number, task: (item: T) => Promise<void>) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await task(items[next++]!);
  };
  await Promise.all(Array.from({ length: size }, worker));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
