import { DecisionError, decide, questionKey, type Scores } from "../core/decisions.ts";
import type { ClassifyResponse, Priority } from "../core/messages.ts";
import { REFUSED, needsScores } from "../core/policy.ts";
import { isReply, type Post } from "../core/post.ts";
import { loadSettings } from "../core/settings.ts";
import { store, thisMonth, type ServiceStatus, type Usage } from "../core/storage.ts";
import { getEntry, putEntry } from "./cache.ts";

const CONCURRENCY = 4;
/** Posts queued this long were likely scrolled past; tabs ask again if still visible. */
const STALE_MS = 30_000;
/** Only bump `seen` in IndexedDB once a day to avoid writing on every cache hit. */
const TOUCH_MS = 864e5;
/** Stagger workers waking from a rate limit so one probes first instead of all four slamming 429. */
const RESUME_STAGGER_MS = 200;

interface Waiter {
  id: string;
  priority: Priority;
  queued: number;
  resolve: () => void;
}

interface Inflight {
  id: string;
  priority: Priority;
  promise: Promise<ClassifyResponse>;
}

let apiKey: string | undefined;
let keyRejected = false;
let pausedUntil = 0;
const paused = new Set<() => void>();
let active = 0;
const waiting: Waiter[] = [];
const inflight = new Map<string, Inflight>();

/** A key the reader just saved: what went wrong with the last one no longer stands. */
export function setApiKey(key: string | undefined) {
  apiKey = key;
  keyRejected = false;
  pausedUntil = 0;
  wakePaused();
  void setStatus({ kind: "ok" });
}

/**
 * A restarted worker takes up the key it had where its saved status left off, so it doesn't try
 * a key Google rejected again, or ask again before a rate limit is over.
 */
export function restoreApiKey(key: string | undefined, status: ServiceStatus | undefined) {
  apiKey = key;
  keyRejected = status?.kind === "bad-key";
  if (status?.kind === "rate-limited") pausedUntil = status.until;
}

export function classify(
  post: Post,
  cachedOnly: boolean,
  priority: Priority = 0,
): Promise<ClassifyResponse> {
  const key = questionKey(post);
  if (cachedOnly) return run(post, key, true, () => priority);
  const asking = `${post.id} ${key}`;
  let entry = inflight.get(asking);
  if (!entry) {
    const promise = run(post, key, false, () => inflight.get(asking)?.priority ?? priority).finally(
      () => inflight.delete(asking),
    );
    entry = { id: post.id, priority, promise };
    inflight.set(asking, entry);
  } else if (priority === 0) {
    prioritize([post.id]);
  }
  return entry.promise;
}

/** Promotes queued posts that just entered the viewport ahead of off-screen lookahead. */
export function prioritize(ids: string[]) {
  if (!ids.length) return;
  const urgent = new Set(ids);
  for (const entry of inflight.values()) {
    if (urgent.has(entry.id)) entry.priority = 0;
  }
  if (!waiting.length) return;
  const now = Date.now();
  const promoted: Waiter[] = [];
  for (let i = waiting.length - 1; i >= 0; i--) {
    if (!urgent.has(waiting[i]!.id)) continue;
    const [waiter] = waiting.splice(i, 1);
    waiter!.priority = 0;
    waiter!.queued = now;
    promoted.push(waiter!);
  }
  waiting.push(...promoted);
}

export async function setNotSlop(id: string, notSlop: boolean) {
  const entry = await getEntry(id);
  if (entry) await putEntry({ ...entry, notSlop });
}

async function run(
  post: Post,
  key: string,
  cachedOnly: boolean,
  priority: () => Priority,
): Promise<ClassifyResponse> {
  let entry = await getEntry(post.id);
  const now = Date.now();
  // A post the reader let through won't be hidden, so it isn't asked about again even when it
  // turns up with more context than it was answered on.
  if (entry && (entry.key === key || entry.notSlop)) {
    if (now - entry.seen > TOUCH_MS) void putEntry({ ...entry, seen: now }).catch(() => {});
    return { scores: entry.scores, notSlop: Boolean(entry.notSlop) };
  }

  if (!apiKey || keyRejected) return { needsKey: true };
  if (cachedOnly) return { uncached: true };

  const answer = await ask(post, priority());
  if (answer === "unkeyed") return { needsKey: true };
  if (answer === "unavailable") return { unavailable: true };
  const scores = answer === "blocked" ? REFUSED : answer;
  // Re-read in case the reader let the post through while this request was in flight.
  const { notSlop } = (await getEntry(post.id)) ?? {};
  entry = { id: post.id, key, scores, notSlop, seen: Date.now() };
  await putEntry(entry);
  return { scores: entry.scores, notSlop: Boolean(entry.notSlop) };
}

async function ask(
  post: Post,
  priority: Priority,
): Promise<Scores | "blocked" | "unkeyed" | "unavailable"> {
  const queued = await acquire(post.id, priority);
  try {
    if (Date.now() - queued > STALE_MS) return "unavailable";
    const asked = { labels: post.labels, handle: post.author.handle, isReply: isReply(post) };
    let withImages = true;
    let transient = 0;
    let rateHits = 0;

    for (;;) {
      while (pausedUntil > Date.now() && apiKey && !keyRejected) await waitPause();
      const settings = await loadSettings();
      if (!apiKey || keyRejected) return "unkeyed";
      if (!needsScores(asked, settings)) return "unavailable";
      const usedKey = apiKey;
      try {
        const { scores, tokens } = await decide(usedKey, post, withImages);
        if (pausedUntil <= Date.now()) void setStatus({ kind: "ok" });
        recordUsage(tokens);
        return scores;
      } catch (error) {
        if (!(error instanceof DecisionError)) throw error;
        switch (error.kind) {
          case "rate":
            if (apiKey !== usedKey) continue;
            if (++rateHits > 4) return "unavailable";
            pausedUntil = Math.max(pausedUntil, Date.now() + error.retryAfterMs);
            void setStatus({ kind: "rate-limited", until: pausedUntil });
            continue;
          case "media":
            if (!withImages) return "unavailable";
            withImages = false;
            continue;
          case "transient":
            if (++transient === 3) {
              void setStatus({ kind: "offline" });
              return "unavailable";
            }
            await sleep(1000 * 3 ** (transient - 1));
            continue;
          case "blocked":
            return "blocked";
          case "auth":
            if (apiKey !== usedKey) continue;
            keyRejected = true;
            wakePaused();
            void setStatus({ kind: "bad-key", message: error.message });
            return "unkeyed";
          case "fatal":
            void setStatus({ kind: "error", message: error.message });
            return "unavailable";
        }
      }
    }
  } finally {
    release();
  }
}

function waitPause() {
  return new Promise<void>((resolve) => {
    const ms = pausedUntil - Date.now() + paused.size * RESUME_STAGGER_MS;
    if (ms <= 0) return resolve();
    const wake = () => {
      clearTimeout(timer);
      paused.delete(wake);
      resolve();
    };
    const timer = setTimeout(wake, ms);
    paused.add(wake);
  });
}

function wakePaused() {
  for (const wake of paused) wake();
}

function acquire(id: string, priority: Priority): Promise<number> {
  const now = Date.now();
  if (active < CONCURRENCY) {
    active++;
    return Promise.resolve(now);
  }
  return new Promise<number>((resolve) => {
    const waiter: Waiter = { id, priority, queued: now, resolve: () => resolve(waiter.queued) };
    waiting.push(waiter);
  });
}

function release() {
  // Highest priority (visible posts) first; within a tier, newest first so active scrolling wins.
  let best = -1;
  for (let i = waiting.length - 1; i >= 0; i--) {
    if (best === -1 || waiting[i]!.priority < waiting[best]!.priority) {
      best = i;
      if (waiting[best]!.priority === 0) break;
    }
  }
  if (best !== -1) {
    const [next] = waiting.splice(best, 1);
    next!.resolve();
  } else {
    active--;
  }
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

function recordUsage(tokens: number) {
  unsaved.posts++;
  unsaved.tokens += tokens;
  saving ??= setTimeout(() => {
    saving = undefined;
    const added = unsaved;
    unsaved = { posts: 0, tokens: 0 };
    const count = (saved: Usage | undefined): Usage => {
      const month = thisMonth();
      const before = saved?.month === month ? saved : { posts: 0, tokens: 0 };
      return { month, posts: before.posts + added.posts, tokens: before.tokens + added.tokens };
    };
    store.usage.update(count).catch(() => {});
  }, 1000);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
