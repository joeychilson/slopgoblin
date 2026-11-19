import type { Scores } from "./decisions.ts";
import type { Settings } from "./settings.ts";
import { CATEGORIES, CATEGORY, THRESHOLD, type CategoryId } from "./taxonomy.ts";

export interface Verdict {
  /** The likeliest of the categories switched on. */
  category: CategoryId;
  /** The probability the post is junk, of any kind. */
  score: number;
}

/**
 * How a verdict reads, the same in the feed and in the side panel: the category's label ("Ad"
 * for an ad), hedged with "Possibly" when only Strict would hide the post.
 */
export function reason({ category, score }: Verdict) {
  return {
    label: category === "ad" ? "Ad" : CATEGORY[category].label,
    possibly: score < THRESHOLD.balanced,
  };
}

/** What a post's verdict rests on: the model's answer, and what's known about who posted it. */
export interface Judged {
  scores: Scores;
  isAd: boolean;
  handle: string;
  /** The reader let it through. */
  notSlop?: boolean;
  /** The reader follows its author. Undefined until the site has said. */
  followed?: boolean;
}

/**
 * Decides whether a post is hidden. Pure, so settings changes re-apply instantly
 * from cached scores without asking the model again.
 */
export function judge(post: Judged, settings: Settings): Verdict | null {
  if (!settings.enabled || post.notSlop || alwaysShown(post, settings)) return null;
  // X marks ads itself. Following an account doesn't make its ads welcome.
  if (post.isAd) return settings.categories.ad ? { category: "ad", score: 1 } : null;
  if (shownAsFollowed(post, settings)) return null;

  // A post that's several kinds has its chance split between them. It's hidden when it's junk
  // and at least half of that is kinds switched on, so switching a kind off shows the posts that
  // are mostly that kind, and only those.
  let score = 0;
  let on = 0;
  let top: { id: CategoryId; p: number } | undefined;
  for (const { id } of CATEGORIES) {
    const p = post.scores[id];
    if (p === undefined) continue;
    score += p;
    if (!settings.categories[id]) continue;
    on += p;
    if (!top || p > top.p) top = { id, p };
  }
  return top && score >= THRESHOLD[settings.strictness] && on >= score / 2
    ? { category: top.id, score }
    : null;
}

/** Google's safety filters refuse to read some posts at all. What they refuse is explicit or worse. */
export const REFUSED: Scores = { nsfw: 1 };

/**
 * Whether the model's answer could change anything. Ads are marked by the site, some authors
 * are never hidden, and some categories are only for replies, so Google isn't asked about those.
 */
export function needsScores(
  post: Omit<Judged, "scores"> & { isReply: boolean },
  settings: Settings,
) {
  return (
    settings.enabled &&
    !post.isAd &&
    !alwaysShown(post, settings) &&
    !shownAsFollowed(post, settings) &&
    CATEGORIES.some(
      (c) =>
        "describes" in c && settings.categories[c.id] && (post.isReply || !("repliesOnly" in c)),
    )
  );
}

const alwaysShown = ({ handle }: { handle: string }, settings: Settings) =>
  settings.trusted.includes(handle.toLowerCase());

const shownAsFollowed = ({ followed }: { followed?: boolean }, settings: Settings) =>
  settings.trustFollowing && followed === true;
