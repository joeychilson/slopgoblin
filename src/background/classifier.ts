import {
  DecisionError,
  QUESTIONS,
  decide,
  questionsFor,
  type AskedQuestion,
} from "../core/decisions.ts";
import { STATUS_KEY, type ClassifyResponse, type ServiceStatus } from "../core/messages.ts";
import type { Post } from "../core/post.ts";
import { loadSettings } from "../core/settings.ts";
import type { CategoryId } from "../core/taxonomy.ts";
import { getEntry, putEntry, type Entry } from "./cache.ts";

const CONCURRENCY = 4;
const CURRENT_KEYS = new Set(QUESTIONS.map((q) => q.key));

let apiKey: string | undefined;
let keyRejected = false;
let pausedUntil = 0;
let active = 0;
const waiting: (() => void)[] = [];
const inflight = new Map<string, Promise<ClassifyResponse>>();

/** `isNew` is false when a restarted worker loads the key it already had, so the status stands. */
export function setApiKey(key: string | undefined, isNew: boolean) {
  apiKey = key;
  keyRejected = false;
  if (isNew) void setStatus({ kind: "ok" });
}

/**
 * Scores a post on the given categories, from cache when possible. Concurrent calls for one post
 * share a request.
 */
export function classify(
  post: Post,
  categories: CategoryId[],
  cachedOnly: boolean,
): Promise<ClassifyResponse> {
  if (cachedOnly) return run(post, categories, true);
  let pending = inflight.get(post.id);
  if (!pending) {
    pending = run(post, categories, false).finally(() => inflight.delete(post.id));
    inflight.set(post.id, pending);
  }
  return pending;
}

export async function setNotSlop(id: string, notSlop: boolean) {
  const entry = await getEntry(id);
  if (entry) await putEntry({ ...entry, notSlop });
}

async function run(
  post: Post,
  categories: CategoryId[],
  cachedOnly: boolean,
): Promise<ClassifyResponse> {
  const entry: Entry = (await getEntry(post.id)) ?? { id: post.id, scores: {}, seen: 0 };
  const asked = questionsFor(post).filter((q) => categories.includes(q.category));
  const missing = entry.blocked ? [] : asked.filter((q) => !(q.key in entry.scores));

  if (missing.length) {
    if (cachedOnly) return { uncached: true };
    const answers = await ask(post, missing);
    if (answers === "unavailable") return { unavailable: true };
    if (answers === "blocked") entry.blocked = true;
    else entry.scores = { ...pickCurrent(entry.scores), ...answers };
  }
  entry.seen = Date.now();
  await putEntry(entry);

  const scores = Object.fromEntries(
    asked.filter((q) => q.key in entry.scores).map((q) => [q.category, entry.scores[q.key]]),
  );
  // Google's safety filters refuse to read some posts at all. What they refuse is explicit or worse.
  if (entry.blocked) scores.nsfw = 1;
  return { scores, notSlop: Boolean(entry.notSlop) };
}

async function ask(
  post: Post,
  questions: AskedQuestion[],
): Promise<Record<string, number> | "blocked" | "unavailable"> {
  await acquire();
  try {
    let withImages = true;
    for (let attempt = 0; attempt < 6; attempt++) {
      if (pausedUntil > Date.now()) await sleep(pausedUntil - Date.now());
      // Filtering may have been switched off while this waited its turn.
      if (!apiKey || keyRejected || !(await loadSettings()).enabled) return "unavailable";
      try {
        const answers = await decide(apiKey, post, questions, withImages);
        if (pausedUntil <= Date.now()) void setStatus({ kind: "ok" });
        return answers;
      } catch (error) {
        if (!(error instanceof DecisionError)) throw error;
        switch (error.kind) {
          case "rate":
            pausedUntil = Date.now() + error.retryAfterMs;
            void setStatus({ kind: "rate-limited", until: pausedUntil });
            continue;
          case "media":
            if (!withImages) return "unavailable";
            withImages = false;
            continue;
          case "transient":
            if (attempt >= 2) {
              void setStatus({ kind: "offline" });
              return "unavailable";
            }
            await sleep(1000 * 3 ** attempt);
            continue;
          case "blocked":
            return "blocked";
          case "auth":
            keyRejected = true;
            void setStatus({ kind: "bad-key", message: error.message });
            return "unavailable";
          case "fatal":
            void setStatus({ kind: "error", message: error.message });
            return "unavailable";
        }
      }
    }
    return "unavailable";
  } finally {
    release();
  }
}

function pickCurrent(scores: Record<string, number>) {
  return Object.fromEntries(Object.entries(scores).filter(([key]) => CURRENT_KEYS.has(key)));
}

async function acquire() {
  if (active < CONCURRENCY) {
    active++;
    return;
  }
  await new Promise<void>((resolve) => waiting.push(resolve));
}

function release() {
  const next = waiting.shift();
  if (next) next();
  else active--;
}

let lastStatus = "";

async function setStatus(status: ServiceStatus) {
  const json = JSON.stringify(status);
  if (json === lastStatus) return;
  lastStatus = json;
  await chrome.storage.session.set({ [STATUS_KEY]: status });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
