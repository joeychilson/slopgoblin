import { CHECKED_PREFIX, type CheckedPost } from "../core/checked.ts";

/** At <1 kB each, 3,000 posts fit comfortably inside session storage's 10 MB limit. */
const KEEP = 3000;

let kept: Promise<Map<string, CheckedPost>> | undefined;
let queue: Promise<void> = Promise.resolve();

function load() {
  kept ??= chrome.storage.session
    .get(null)
    .then(
      (all) =>
        new Map(
          Object.entries(all).flatMap(([key, value]) =>
            key.startsWith(CHECKED_PREFIX)
              ? [[key.slice(CHECKED_PREFIX.length), value as CheckedPost]]
              : [],
          ),
        ),
    );
  return kept;
}

function serialize(task: () => Promise<void>) {
  const next = queue.then(task, task);
  queue = next.catch(() => {});
  return next;
}

const keyOf = (id: string) => CHECKED_PREFIX + id;

export async function checkedPosts() {
  return [...(await load()).values()];
}

export function recordChecked(posts: CheckedPost[]) {
  return serialize(async () => {
    const all = await load();
    const items: Record<string, CheckedPost> = {};
    for (const post of posts) {
      const prev = all.get(post.id);
      const entry: CheckedPost = prev
        ? {
            ...post,
            avatar: post.avatar ?? prev.avatar,
            followed: post.followed ?? prev.followed,
            labels: [...new Set([...prev.labels, ...post.labels])],
            scores: Object.keys(post.scores).length ? post.scores : prev.scores,
            // Once a post has scores in this session, `updateChecked` owns its `notSlop` state.
            notSlop: Object.keys(prev.scores).length ? prev.notSlop : post.notSlop,
            at: Math.min(post.at, prev.at),
          }
        : post;
      all.set(post.id, entry);
      items[keyOf(post.id)] = entry;
    }
    await chrome.storage.session.set(items);
    await dropOldest(all);
  });
}

export function updateChecked(id: string, change: Partial<CheckedPost>) {
  return serialize(async () => {
    const all = await load();
    const post = all.get(id);
    if (!post) return;
    const entry = { ...post, ...change };
    all.set(id, entry);
    await chrome.storage.session.set({ [keyOf(id)]: entry });
  });
}

async function dropOldest(all: Map<string, CheckedPost>) {
  if (all.size <= KEEP) return;
  const oldest = [...all.values()]
    .sort((a, b) => a.at - b.at)
    .slice(0, all.size - KEEP)
    .map((post) => post.id);
  for (const id of oldest) all.delete(id);
  await chrome.storage.session.remove(oldest.map(keyOf));
}
