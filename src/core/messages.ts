import type { CheckedPost } from "./checked.ts";
import type { Scores } from "./decisions.ts";
import type { Post } from "./post.ts";

/** Sent by content scripts and the side panel. All but `tab-state`, which is for the side panel, are for the service worker. */
export type RuntimeMessage =
  | { type: "classify"; post: Post; cachedOnly: boolean }
  /** Posts newly checked, or changed since, for the list in `background/checked.ts`. */
  | { type: "checked"; posts: CheckedPost[] }
  | { type: "not-slop"; id: string; notSlop: boolean }
  | { type: "tab-state"; state: TabState };

export type ClassifyResponse =
  | { scores: Scores; notSlop: boolean }
  | { unavailable: true }
  /** Answer to `cachedOnly` when the post hasn't been judged yet. */
  | { uncached: true };

/** Sent to a tab's content script, by the side panel or by the service worker passing on a let-through. */
export type TabMessage =
  | { type: "get-tab-state" }
  | { type: "reveal"; id: string }
  | { type: "not-slop"; id: string; notSlop: boolean };

/** What's happening in one tab right now. What's been checked in every tab is in the checked list. */
export interface TabState {
  /** Waiting for an answer. */
  pending: number;
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

/** What this month's checking has used, kept in `chrome.storage.local`. */
export interface Usage {
  /** "2026-11". */
  month: string;
  posts: number;
  tokens: number;
}

export const USAGE_KEY = "usage";

/** The site's light, dim or dark background, last seen. The side panel matches it. */
export type SiteTheme = "light" | "dim" | "dark";

export const THEME_KEY = "siteTheme";
