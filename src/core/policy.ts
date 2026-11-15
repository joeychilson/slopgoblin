import type { Scores } from "./decisions.ts";
import type { Settings } from "./settings.ts";
import { CATEGORIES, THRESHOLD, type CategoryId } from "./taxonomy.ts";

export interface Verdict {
  /** The likeliest of the categories switched on. */
  category: CategoryId;
  /** The probability the post is in any category switched on. */
  score: number;
}

/**
 * Decides whether a post is hidden. Pure, so settings changes re-apply instantly
 * from cached scores without asking the model again.
 */
export function judge(
  {
    scores,
    isAd,
    handle,
    notSlop,
  }: { scores: Scores; isAd: boolean; handle: string; notSlop?: boolean },
  settings: Settings,
): Verdict | null {
  if (!settings.enabled || notSlop || settings.trusted.includes(handle.toLowerCase())) return null;
  if (isAd && settings.categories.ad) return { category: "ad", score: 1 };

  let score = 0;
  let top: { id: CategoryId; p: number } | undefined;
  for (const { id } of CATEGORIES) {
    const p = scores[id];
    if (p === undefined || !settings.categories[id]) continue;
    score += p;
    if (!top || p > top.p) top = { id, p };
  }
  return top && score >= THRESHOLD[settings.strictness] ? { category: top.id, score } : null;
}
