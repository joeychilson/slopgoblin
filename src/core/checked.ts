import { judge, type Judged, type Verdict } from "./policy.ts";
import type { Settings } from "./settings.ts";
import { STRICTNESS, type Strictness } from "./taxonomy.ts";

/** A post checked in this Chrome session, kept in `chrome.storage.session`. */
export interface CheckedPost extends Judged {
  id: string;
  url: string;
  name: string;
  avatar?: string;
  text: string;
  at: number;
}

/** Each post gets its own key so updates write and announce only that post. */
export const CHECKED_PREFIX = "checked:";

export interface HiddenPost {
  post: CheckedPost;
  verdict: Verdict;
}

export function hiddenAmong(posts: CheckedPost[], settings: Settings): HiddenPost[] {
  const hidden: HiddenPost[] = [];
  for (const post of posts) {
    const verdict = judge(post, settings);
    if (verdict) hidden.push({ post, verdict });
  }
  return hidden;
}

/** Counts how many posts each strictness would hide in one pass. */
export function hiddenAtEach(posts: CheckedPost[], settings: Settings): Record<Strictness, number> {
  const counts: Record<Strictness, number> = { relaxed: 0, balanced: 0, strict: 0 };
  const configs = STRICTNESS.map((strictness) => ({
    strictness,
    settings: { ...settings, strictness },
  }));
  for (const post of posts) {
    for (const config of configs) {
      if (judge(post, config.settings)) counts[config.strictness]++;
    }
  }
  return counts;
}
