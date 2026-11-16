import { judge, type Judged, type Verdict } from "./policy.ts";
import type { Settings } from "./settings.ts";
import { STRICTNESS, type Strictness } from "./taxonomy.ts";

/**
 * A post checked since Chrome started, in any tab. Content scripts report them, the service
 * worker keeps them in `chrome.storage.session` (memory only, cleared when Chrome quits), and
 * the side panel lists and counts the ones the current settings hide.
 */
export interface CheckedPost extends Judged {
  id: string;
  url: string;
  name: string;
  /** Missing until the site has loaded it. */
  avatar?: string;
  text: string;
  /** When it was first checked. */
  at: number;
}

/** Each post is stored under its own key, so an update writes and announces only that post. */
export const CHECKED_PREFIX = "checked:";

export interface HiddenPost {
  post: CheckedPost;
  verdict: Verdict;
}

/** The posts the settings hide, in the order given. */
export function hiddenAmong(posts: CheckedPost[], settings: Settings): HiddenPost[] {
  return posts.flatMap((post) => {
    const verdict = judge(post, settings);
    return verdict ? [{ post, verdict }] : [];
  });
}

/** How many posts each strictness would hide, so the panel can show what switching does. */
export function hiddenAtEach(posts: CheckedPost[], settings: Settings) {
  return Object.fromEntries(
    STRICTNESS.map((strictness) => [
      strictness,
      posts.filter((post) => judge(post, { ...settings, strictness })).length,
    ]),
  ) as Record<Strictness, number>;
}
