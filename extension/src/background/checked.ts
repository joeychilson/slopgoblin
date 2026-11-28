import type { CheckedPost } from "../core/checked.ts";
import { store } from "../core/storage.ts";

/** At <1 kB each, 3,000 posts fit comfortably inside session storage's 10 MB limit. */
const KEEP = 3000;

// Every change is made to this map in one synchronous step once it has loaded, and written in
// that order, so writes from different tabs can't interleave.
let kept: Promise<Map<string, CheckedPost>> | undefined;

const load = () => (kept ??= store.checked.getAll());

export async function checkedPosts() {
  return [...(await load()).values()];
}

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
    items[post.id] = entry;
  }
  await store.checked.set(items);
  await dropOldest(all);
}

export async function updateChecked(id: string, change: Partial<CheckedPost>) {
  const all = await load();
  const post = all.get(id);
  if (!post) return;
  const entry = { ...post, ...change };
  all.set(id, entry);
  await store.checked.set({ [id]: entry });
}

async function dropOldest(all: Map<string, CheckedPost>) {
  if (all.size <= KEEP) return;
  const oldest = [...all.values()]
    .sort((a, b) => a.at - b.at)
    .slice(0, all.size - KEEP)
    .map((post) => post.id);
  for (const id of oldest) all.delete(id);
  await store.checked.remove(oldest);
}
