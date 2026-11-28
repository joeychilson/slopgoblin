import { judge, type Judged, type Verdict } from "./policy.ts";
import type { Settings } from "./settings.ts";
import type { Strictness } from "./taxonomy.ts";

/** A post checked in this Chrome session, kept in `chrome.storage.session`. */
export interface CheckedPost extends Judged {
  id: string;
  url: string;
  name: string;
  avatar?: string;
  text: string;
  at: number;
}

export interface HiddenPost {
  post: CheckedPost;
  verdict: Verdict;
}

export const hiddenAmong = (posts: CheckedPost[], settings: Settings): HiddenPost[] =>
  posts.flatMap((post) => {
    const verdict = judge(post, settings);
    return verdict ? [{ post, verdict }] : [];
  });

/** How many posts each strictness would hide. */
export function hiddenAtEach(posts: CheckedPost[], settings: Settings): Record<Strictness, number> {
  const count = (strictness: Strictness) => hiddenAmong(posts, { ...settings, strictness }).length;
  return { relaxed: count("relaxed"), balanced: count("balanced"), strict: count("strict") };
}
