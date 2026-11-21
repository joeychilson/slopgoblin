import { CHECKED_PREFIX, type CheckedPost } from "../core/checked.ts";

/**
 * How many posts the list keeps, newest first. At well under 1 kB each that's a few MB of
 * session storage's 10, and a long day of scrolling.
 */
const KEEP = 3000;

/** Every kept post, by id: read once per service worker start, then kept in step with storage. */
let kept: Promise<Map<string, CheckedPost>> | undefined;

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

const keyOf = (id: string) => CHECKED_PREFIX + id;

export async function checkedPosts() {
  return [...(await load()).values()];
}

/** Adds posts or brings them up to date. A post keeps the time it was first checked, in any tab. */
export async function recordChecked(posts: CheckedPost[]) {
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
}

/** Changes a post already on the list, which may no longer be open in any tab. */
export async function updateChecked(id: string, change: Partial<CheckedPost>) {
  const all = await load();
  const post = all.get(id);
  if (!post) return;
  const entry = { ...post, ...change };
  all.set(id, entry);
  await chrome.storage.session.set({ [keyOf(id)]: entry });
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
