import type { Scores } from "./decisions.ts";
import type { Label } from "./post.ts";
import type { Settings } from "./settings.ts";
import { ASKED, CATEGORIES, CATEGORY, THRESHOLD, type CategoryId } from "./taxonomy.ts";

export interface Verdict {
  /** The likeliest of the categories switched on, or the site's own label. */
  category: CategoryId;
  /** The probability the post is junk, of any kind. */
  score: number;
  /** The site labeled it itself; the model wasn't asked. */
  labeled?: true;
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

/** What a post's verdict rests on: the model's answer, the site's labels, and who posted it. */
export interface Judged {
  scores: Scores;
  labels: Label[];
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
  if (post.notSlop || shownAnyway(post, settings)) return null;
  const label = hidingLabel(post, settings);
  if (label) return { category: label, score: 1, labeled: true };

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
 * Whether the model's answer could change anything. Some posts are shown whatever it says, the
 * site's own labels hide others, and some categories are only for replies, so Google isn't
 * asked about those.
 */
export function needsScores(
  post: Omit<Judged, "scores"> & { isReply: boolean },
  settings: Settings,
) {
  return (
    !shownAnyway(post, settings) &&
    !hidingLabel(post, settings) &&
    ASKED.some((c) => settings.categories[c.id] && (post.isReply || !("repliesOnly" in c)))
  );
}

/**
 * Shown whatever it is: while filtering is off, from an author the reader trusts or follows, or
 * an ad the site labels while ads are switched off. Following an account doesn't make its ads
 * welcome.
 */
function shownAnyway(post: Omit<Judged, "scores">, settings: Settings) {
  if (!settings.enabled || settings.trusted.includes(post.handle.toLowerCase())) return true;
  if (post.labels.includes("ad")) return !settings.categories.ad;
  return settings.trustFollowing && post.followed === true;
}

/** The first of the site's labels on a post whose category is switched on. */
const hidingLabel = ({ labels }: { labels: Label[] }, settings: Settings) =>
  labels.find((label) => settings.categories[label]);
