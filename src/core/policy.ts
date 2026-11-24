import type { Scores } from "./decisions.ts";
import type { Label } from "./post.ts";
import type { Settings } from "./settings.ts";
import { ASKED, CATEGORIES, CATEGORY, LIKELIEST, THRESHOLD, type CategoryId } from "./taxonomy.ts";

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
 * for an ad), the same mid-sentence ("Not an ad", "Possibly ragebait"), and whether it's hedged
 * with "Possibly" because only Strict would hide the post.
 */
export function reason({ category, score }: Verdict) {
  const label = category === "ad" ? "Ad" : CATEGORY[category].label;
  return {
    label,
    // "AI slop" and "NSFW" keep their capitals.
    midSentence:
      category === "ad" ? "an ad" : label.replace(/^[A-Z](?=[a-z])/, (c) => c.toLowerCase()),
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
  const known = settled(post, settings);
  if (known) return known === "shown" ? null : known;

  // A post that's several kinds has its chance split between them. Hide it when it's junk, one
  // kind stands out, and either the likeliest kind is switched on or at least half of its junk
  // score is kinds switched on.
  let score = 0;
  let on = 0;
  let topAll: { id: CategoryId; p: number } | undefined;
  let topOn: { id: CategoryId; p: number } | undefined;
  for (const { id } of CATEGORIES) {
    const p = post.scores[id];
    if (p === undefined) continue;
    score += p;
    if (!topAll || p > topAll.p) topAll = { id, p };
    if (!settings.categories[id]) continue;
    on += p;
    if (!topOn || p > topOn.p) topOn = { id, p };
  }
  return topOn &&
    topAll &&
    score >= THRESHOLD[settings.strictness] &&
    topAll.p >= LIKELIEST &&
    (on >= score / 2 || topOn.p >= topAll.p)
    ? { category: topOn.id, score }
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
    settled(post, settings) === undefined &&
    ASKED.some((c) => settings.categories[c.id] && (post.isReply || !("repliesOnly" in c)))
  );
}

/**
 * What's decided before the model's answer, in this order. Nothing is hidden while filtering is
 * off, once the reader let a post through, or from an author the reader trusts. The site's ad
 * label hides a post, even from someone the reader follows: following an account doesn't make
 * its ads welcome. Nothing else from them is hidden. Then the site's other labels hide. An ad
 * shown because ads are off isn't asked about. Undefined when it's up to the model.
 */
function settled(post: Omit<Judged, "scores">, settings: Settings): Verdict | "shown" | undefined {
  if (!settings.enabled || post.notSlop || settings.trusted.includes(post.handle.toLowerCase())) {
    return "shown";
  }
  const ad = post.labels.includes("ad");
  if (ad && settings.categories.ad) return labeled("ad");
  if (settings.trustFollowing && post.followed === true) return "shown";
  if (post.labels.includes("made_with_ai") && settings.categories.made_with_ai) {
    return labeled("made_with_ai");
  }
  return ad ? "shown" : undefined;
}

const labeled = (category: Label): Verdict => ({ category, score: 1, labeled: true });
