// Scores eval/posts.jsonl against the live Decisions API and reports how well each
// category's question separates labeled posts. Answers are cached per question version
// in eval/.cache.json, so rewording one question only re-asks that question.
//
//   vp run eval            precision and recall per category and strictness
//   vp run eval --misses   also list mistakes at "balanced"
//
// The key comes from GEMINI_API_KEY, or from .env.local.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import {
  DecisionError,
  decide,
  questionsFor,
  type AskedQuestion,
  type Scores,
} from "../src/core/decisions.ts";
import type { PostContent } from "../src/core/post.ts";
import { CATEGORIES, THRESHOLD, type CategoryId, type Strictness } from "../src/core/taxonomy.ts";

interface Row extends PostContent {
  id: string;
  labels: CategoryId[];
  note?: string;
}

const dir = new URL(".", import.meta.url);
const cachePath = new URL(".cache.json", dir);
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error("Set GEMINI_API_KEY");

const rows: Row[] = readFileSync(new URL("posts.jsonl", dir), "utf8")
  .split("\n")
  .filter((line) => line.trim())
  .map((line) => JSON.parse(line));
const cache: Record<string, number> = existsSync(cachePath)
  ? JSON.parse(readFileSync(cachePath, "utf8"))
  : {};
// The text length re-asks a post whose text was edited.
const cacheKey = (row: Row, q: AskedQuestion) => `${row.id}|${q.key}|${row.text.length}`;

await runPool(rows, 8, async (row) => {
  const missing = questionsFor(row).filter((q) => !(cacheKey(row, q) in cache));
  if (!missing.length) return;
  for (let attempt = 0; ; attempt++) {
    try {
      const answers = await decide(apiKey, row, missing);
      for (const q of missing) {
        if (q.key in answers) cache[cacheKey(row, q)] = answers[q.key]!;
      }
      // Saved as answers arrive, so an interrupted run doesn't pay for them again.
      writeFileSync(cachePath, JSON.stringify(cache));
      return;
    } catch (error) {
      if (!(error instanceof DecisionError)) throw error;
      if (error.kind === "rate") await sleep(error.retryAfterMs);
      else if (error.kind === "transient" && attempt < 3) await sleep(2000 * 2 ** attempt);
      else if (error.kind === "blocked") {
        console.warn(`${row.id}: blocked by safety filter`);
        return;
      } else throw error;
    }
  }
});

const scored = rows.map((row) => ({
  row,
  scores: Object.fromEntries(
    questionsFor(row).map((q) => [q.category, cache[cacheKey(row, q)] ?? 0]),
  ) as Scores,
}));
const levels: Strictness[] = ["relaxed", "balanced", "strict"];
const pct = (n: number) => (Number.isFinite(n) ? `${Math.round(n * 100)}%`.padStart(4) : "   –");

console.log(
  `\n${rows.length} posts, hidden at ${levels.map((l) => `${l} ≥ ${THRESHOLD[l]}`).join(", ")}\n`,
);
console.log(`${"".padEnd(20)} │ ${levels.map((l) => l.padEnd(9)).join(" │ ")}`);
console.log(`${"category".padEnd(20)} │ ${levels.map(() => "   P    R").join(" │ ")}`);
for (const category of CATEGORIES) {
  if (!("question" in category)) continue;
  const relevant = scored.filter((s) => s.scores[category.id] !== undefined);
  const positives = relevant.filter((s) => s.row.labels.includes(category.id)).length;
  const cells = levels.map((level) => {
    const hits = relevant.filter((s) => (s.scores[category.id] ?? 0) >= THRESHOLD[level]);
    const tp = hits.filter((s) => s.row.labels.includes(category.id)).length;
    return `${pct(tp / hits.length)} ${pct(tp / positives)}`;
  });
  console.log(`${category.id.padEnd(16)} ${String(positives).padStart(3)} │ ${cells.join(" │ ")}`);
}

// What users actually feel: clean posts that got hidden, and slop that slipped through.
console.log("\nwhole post        false hides   slop caught");
for (const level of levels) {
  const hidden = scored.map((s) => ({ ...s, hidden: hiddenBy(s.scores, level) }));
  const clean = hidden.filter((s) => !s.row.labels.length);
  const slop = hidden.filter((s) => s.row.labels.length);
  const falseHides = clean.filter((s) => s.hidden.length).length;
  const caught = slop.filter((s) => s.hidden.length).length;
  console.log(
    `${level.padEnd(16)} ${`${falseHides}/${clean.length}`.padStart(8)} ${pct(falseHides / clean.length)}   ${`${caught}/${slop.length}`.padStart(7)} ${pct(caught / slop.length)}`,
  );
}

if (process.argv.includes("--misses")) {
  console.log("\nMistakes at balanced:");
  for (const { row, scores } of scored) {
    const hidden = hiddenBy(scores, "balanced");
    const wrong = hidden.filter((c) => !row.labels.includes(c));
    const missed = row.labels.filter((c) => !hidden.includes(c) && scores[c] !== undefined);
    if (!wrong.length && !missed.length) continue;
    const fmt = (ids: CategoryId[]) => ids.map((c) => `${c} ${pct(scores[c] ?? 0).trim()}`);
    console.log(
      `\n${row.id}  ${[...fmt(wrong).map((s) => `+${s}`), ...fmt(missed).map((s) => `-${s}`)].join("  ")}`,
    );
    console.log(`  ${row.text.replaceAll("\n", " ").slice(0, 220)}`);
    if (row.note) console.log(`  note: ${row.note}`);
  }
}

/** Every category over the threshold, unlike `judge`, which picks one, so misses can be listed. */
function hiddenBy(scores: Scores, level: Strictness): CategoryId[] {
  return CATEGORIES.filter((c) => (scores[c.id] ?? -1) >= THRESHOLD[level]).map((c) => c.id);
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
