import type { Scores } from "./decisions.ts";
import type { Settings } from "./settings.ts";
import { CATEGORIES, THRESHOLD, type CategoryId } from "./taxonomy.ts";

export interface Verdict {
  category: CategoryId;
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

  let verdict: Verdict | null = null;
  for (const { id } of CATEGORIES) {
    const score = scores[id];
    if (score === undefined || !settings.categories[id]) continue;
    if (score >= THRESHOLD[settings.strictness] && score > (verdict?.score ?? 0)) {
      verdict = { category: id, score };
    }
  }
  return verdict;
}
