import type { Scores } from "./decisions.ts";
import type { Post } from "./post.ts";
import type { CategoryId, Strictness } from "./taxonomy.ts";

/** Sent by content scripts; `tab-state` is a broadcast the side panel also listens to. */
export type RuntimeMessage =
  /** Only the categories switched on are asked about. */
  | { type: "classify"; post: Post; categories: CategoryId[]; cachedOnly: boolean }
  | { type: "not-slop"; id: string; notSlop: boolean }
  | { type: "tab-state"; state: TabState };

export type ClassifyResponse =
  | { scores: Scores; notSlop: boolean }
  | { unavailable: true }
  /** Answer to `cachedOnly` when the post hasn't been judged yet. */
  | { uncached: true };

/** Sent by the side panel to the content script of the active tab. */
export type TabMessage =
  | { type: "get-tab-state" }
  | { type: "reveal"; id: string }
  | { type: "not-slop"; id: string };

export interface HiddenPost {
  id: string;
  url: string;
  handle: string;
  text: string;
  category: CategoryId;
  score: number;
}

export interface TabState {
  checked: number;
  pending: number;
  /** Newest first. */
  hidden: HiddenPost[];
  /** How many posts each strictness would hide, so the panel can show what switching does. */
  hiddenAt: Record<Strictness, number>;
  /** Every judged post except ads: its highest score among the categories switched on. */
  scored: { score: number; hidden: boolean }[];
  /** Posts are on the page but can't be read: the site's markup probably changed. */
  broken: boolean;
}

export type ServiceStatus =
  | { kind: "ok" }
  | { kind: "bad-key"; message: string }
  | { kind: "rate-limited"; until: number }
  | { kind: "offline" }
  /** The API rejected a request for a reason retrying won't fix. */
  | { kind: "error"; message: string };

export const STATUS_KEY = "status";
