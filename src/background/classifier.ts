import { DecisionError, decide, questionKey, type Scores } from "../core/decisions.ts";
import {
  STATUS_KEY,
  USAGE_KEY,
  type ClassifyResponse,
  type ServiceStatus,
  type Usage,
} from "../core/messages.ts";
import type { Post } from "../core/post.ts";
import { loadSettings } from "../core/settings.ts";
import { getEntry, putEntry } from "./cache.ts";

const CONCURRENCY = 4;

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

/** Scores a post, from cache when possible. Concurrent calls for one post share a request. */
export function classify(post: Post, cachedOnly: boolean): Promise<ClassifyResponse> {
  if (cachedOnly) return run(post, true);
  let pending = inflight.get(post.id);
  if (!pending) {
    pending = run(post, false).finally(() => inflight.delete(post.id));
    inflight.set(post.id, pending);
  }
  return pending;
}

export async function setNotSlop(id: string, notSlop: boolean) {
  const entry = await getEntry(id);
  if (entry) await putEntry({ ...entry, notSlop });
}

async function run(post: Post, cachedOnly: boolean): Promise<ClassifyResponse> {
  const key = questionKey(post);
  let entry = await getEntry(post.id);
  if (entry?.key !== key) {
    if (cachedOnly) return { uncached: true };
    const answer = await ask(post);
    if (answer === "unavailable") return { unavailable: true };
    const blocked = answer === "blocked";
    entry = {
      id: post.id,
      key,
      scores: blocked ? {} : answer,
      blocked,
      notSlop: entry?.notSlop,
      seen: 0,
    };
  }
  await putEntry({ ...entry, seen: Date.now() });
  // Google's safety filters refuse to read some posts at all. What they refuse is explicit or worse.
  return { scores: entry.blocked ? { nsfw: 1 } : entry.scores, notSlop: Boolean(entry.notSlop) };
}

async function ask(post: Post): Promise<Scores | "blocked" | "unavailable"> {
  await acquire();
  try {
    let withImages = true;
    for (let attempt = 0; attempt < 6; attempt++) {
      if (pausedUntil > Date.now()) await sleep(pausedUntil - Date.now());
      // Filtering may have been switched off while this waited its turn.
      if (!apiKey || keyRejected || !(await loadSettings()).enabled) return "unavailable";
      try {
        const { scores, tokens } = await decide(apiKey, post, withImages);
        if (pausedUntil <= Date.now()) void setStatus({ kind: "ok" });
        recordUsage(tokens);
        return scores;
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

async function acquire() {
  if (active < CONCURRENCY) {
    active++;
    return;
  }
  await new Promise<void>((resolve) => waiting.push(resolve));
}

function release() {
  // Newest first: after a rate-limit pause, the posts on screen now matter more than the backlog.
  const next = waiting.pop();
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

let unsaved = { posts: 0, tokens: 0 };
let saving: ReturnType<typeof setTimeout> | undefined;

/** Adds a request to this month's tally, written in batches. */
function recordUsage(tokens: number) {
  unsaved.posts++;
  unsaved.tokens += tokens;
  saving ??= setTimeout(async () => {
    saving = undefined;
    const added = unsaved;
    unsaved = { posts: 0, tokens: 0 };
    const month = new Date().toISOString().slice(0, 7);
    const { [USAGE_KEY]: stored } = await chrome.storage.local.get(USAGE_KEY);
    const before = (stored as Usage | undefined)?.month === month ? (stored as Usage) : undefined;
    const usage: Usage = {
      month,
      posts: (before?.posts ?? 0) + added.posts,
      tokens: (before?.tokens ?? 0) + added.tokens,
    };
    await chrome.storage.local.set({ [USAGE_KEY]: usage });
  }, 2000);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
