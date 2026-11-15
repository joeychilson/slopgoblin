import type { Scores } from "./decisions.ts";
import type { Post } from "./post.ts";
import type { CategoryId, Strictness } from "./taxonomy.ts";

/** Sent by content scripts; `tab-state` is a broadcast the side panel also listens to. */
export type RuntimeMessage =
  | { type: "classify"; post: Post; cachedOnly: boolean }
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
  name: string;
  /** Left out for NSFW posts, and until the site has loaded it. */
  avatar?: string;
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
