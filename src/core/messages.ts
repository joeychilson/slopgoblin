import type { CheckedPost } from "./checked.ts";
import type { Scores } from "./decisions.ts";
import type { Post } from "./post.ts";

/** 0 = currently visible in the viewport; 1 = upcoming lookahead buffer. */
export type Priority = 0 | 1;

/** Sent to the service worker, except `tab-state` which is observed by the side panel. */
export type RuntimeMessage =
  | { type: "classify"; post: Post; cachedOnly: boolean; priority?: Priority }
  | { type: "prioritize"; ids: string[] }
  | { type: "checked"; posts: CheckedPost[] }
  | { type: "not-slop"; id: string; notSlop: boolean }
  | { type: "tab-state"; state: TabState };

export type ClassifyResponse =
  | { scores: Scores; notSlop: boolean }
  | { unavailable: true }
  /** No working API key yet; the tab stops retrying until one is saved. */
  | { needsKey: true }
  | { uncached: true };

export type TabMessage =
  | { type: "get-tab-state" }
  | { type: "retry" }
  | { type: "reveal"; id: string }
  | { type: "not-slop"; id: string; notSlop: boolean };

export interface TabState {
  pending: number;
  /** Posts are on the page but can't be read: the site's markup probably changed. */
  broken: boolean;
}
