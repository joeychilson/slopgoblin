import { DecisionError, decide, questionKey, type Scores } from "../core/decisions.ts";
import type { ClassifyResponse } from "../core/messages.ts";
import { REFUSED, needsScores } from "../core/policy.ts";
import { isReply, type Post } from "../core/post.ts";
import { loadSettings } from "../core/settings.ts";
import { store, thisMonth, type ServiceStatus } from "../core/storage.ts";
import { getEntry, putEntry } from "./cache.ts";

const CONCURRENCY = 4;
/**
 * A post that waited this long for its turn has most likely been scrolled past, so it isn't
 * sent. Its tab asks again if it's still on the page.
 */
const STALE_MS = 30_000;

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
  if (!isNew) return;
  // The old key's rate limit isn't this one's.
  pausedUntil = 0;
  void setStatus({ kind: "ok" });
}

/**
 * Scores a post, from cache when possible. Concurrent calls for one post share a request, unless
 * they'd ask a different question: one tab can show the post a reply answers, another not.
 */
export function classify(post: Post, cachedOnly: boolean): Promise<ClassifyResponse> {
  const key = questionKey(post);
  if (cachedOnly) return run(post, key, true);
  const asking = `${post.id} ${key}`;
  let pending = inflight.get(asking);
  if (!pending) {
    pending = run(post, key, false).finally(() => inflight.delete(asking));
    inflight.set(asking, pending);
  }
  return pending;
}

export async function setNotSlop(id: string, notSlop: boolean) {
  const entry = await getEntry(id);
  if (entry) await putEntry({ ...entry, notSlop });
}

async function run(post: Post, key: string, cachedOnly: boolean): Promise<ClassifyResponse> {
  let entry = await getEntry(post.id);
  if (entry?.key !== key) {
    if (cachedOnly) return { uncached: true };
    const answer = await ask(post);
    if (answer === "unavailable") return { unavailable: true };
    const scores = answer === "blocked" ? REFUSED : answer;
    // Read again: the reader may have let the post through while it waited for an answer.
    const { notSlop } = (await getEntry(post.id)) ?? {};
    entry = { id: post.id, key, scores, notSlop, seen: 0 };
  }
  await putEntry({ ...entry, seen: Date.now() });
  return { scores: entry.scores, notSlop: Boolean(entry.notSlop) };
}

async function ask(post: Post): Promise<Scores | "blocked" | "unavailable"> {
  const queued = Date.now();
  await acquire();
  try {
    if (Date.now() - queued > STALE_MS) return "unavailable";
    const asked = { labels: post.labels, handle: post.author.handle, isReply: isReply(post) };
    let withImages = true;
    let failures = 0;
    for (let attempt = 0; attempt < 6; attempt++) {
      while (pausedUntil > Date.now()) await sleep(pausedUntil - Date.now());
      // Filtering may have been switched off, or the author marked "Always show", meanwhile.
      if (!apiKey || keyRejected || !needsScores(asked, await loadSettings())) {
        return "unavailable";
      }
      try {
        const { scores, tokens } = await decide(apiKey, post, withImages);
        if (pausedUntil <= Date.now()) void setStatus({ kind: "ok" });
        recordUsage(tokens);
        return scores;
      } catch (error) {
        if (!(error instanceof DecisionError)) throw error;
        switch (error.kind) {
          case "rate":
            pausedUntil = Math.max(pausedUntil, Date.now() + error.retryAfterMs);
            void setStatus({ kind: "rate-limited", until: pausedUntil });
            continue;
          case "media":
            if (!withImages) return "unavailable";
            withImages = false;
            continue;
          // Counted apart from the attempts, which rate limits and image errors use up too.
          case "transient":
            if (++failures === 3) {
              void setStatus({ kind: "offline" });
              return "unavailable";
            }
            await sleep(1000 * 3 ** (failures - 1));
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
  await store.status.set(status);
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
    const month = thisMonth();
    const saved = await store.usage.get();
    const before = saved?.month === month ? saved : { posts: 0, tokens: 0 };
    await store.usage.set({
      month,
      posts: before.posts + added.posts,
      tokens: before.tokens + added.tokens,
    });
  }, 2000);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
