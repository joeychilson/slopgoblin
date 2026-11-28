import { reason, type LetThrough, type Verdict } from "../core/policy.ts";
import { displayName, type Post } from "../core/post.ts";
import type { Settings } from "../core/settings.ts";

/**
 * How a post shows in the feed, and what the reader's actions do to it. `bar.ts` draws it into
 * the site's page, and the website's demo feed draws it in React, so the two can't drift.
 */
export type View =
  | { mode: "shown" }
  | { mode: "removed" }
  | ({ mode: "collapsed" } & Flagged)
  | ({ mode: "revealed" } & Flagged)
  /** A post the reader let through, with a line saying so and a way back. */
  | { mode: "confirmed"; id: string; author: Post["author"]; action: LetThrough };

/** A post with a verdict, folded into a bar or showing with a line above it. */
interface Flagged {
  id: string;
  author: Post["author"];
  /** Missing until the site has loaded it. */
  avatar?: string;
  verdict: Verdict;
  /** Revealed by peek mode rather than by the user, so there's nothing to re-hide. */
  peek: boolean;
}

export type BarAction = "reveal" | "hide" | "not-slop" | "trust" | "undo";

/** A post showing with a line above it, rather than folded into a bar. */
export type LineView = Extract<View, { mode: "revealed" | "confirmed" }>;

export interface LineAction {
  action: BarAction;
  label: string;
}

/**
 * What the line above a showing post offers: ways to let it through, then the main action, which
 * sits where Show was so the reader can flip a post back and forth.
 */
export function lineActions(view: LineView): { more: LineAction[]; main?: LineAction } {
  if (view.mode === "confirmed") return { more: [], main: { action: "undo", label: "Undo" } };
  // There's no arguing with the site's own label.
  const more: LineAction[] = view.verdict.labeled
    ? []
    : [
        { action: "not-slop", label: `Not ${reason(view.verdict).midSentence}` },
        { action: "trust", label: `Always show ${displayName(view.author)}` },
      ];
  return { more, main: view.peek ? undefined : { action: "hide", label: "Hide" } };
}

/** What the feed keeps of a post that decides how it shows. */
export interface PostState {
  post: Pick<Post, "id" | "author">;
  avatar?: string;
  revealed: boolean;
  letThrough?: LetThrough;
}

export function viewFor(state: PostState, verdict: Verdict | null, settings: Settings): View {
  const { post, letThrough } = state;
  if (verdict) {
    const base = {
      id: post.id,
      author: post.author,
      avatar: state.avatar,
      verdict,
      peek: settings.peek && !state.revealed,
    };
    if (settings.peek || state.revealed) return { ...base, mode: "revealed" };
    return settings.hideMode === "remove" ? { mode: "removed" } : { ...base, mode: "collapsed" };
  }
  return settings.enabled && letThrough
    ? { mode: "confirmed", id: post.id, author: post.author, action: letThrough }
    : { mode: "shown" };
}

/**
 * What a bar's action does to its post. `notSlop` is set when the action marks or unmarks the
 * post as not junk, and `trust` when it starts or stops always showing the author.
 */
export function step(
  state: PostState,
  action: BarAction,
): Pick<PostState, "revealed" | "letThrough"> & { notSlop?: boolean; trust?: boolean } {
  const { revealed, letThrough } = state;
  switch (action) {
    case "reveal":
    case "hide":
      return { revealed: action === "reveal", letThrough };
    case "not-slop":
      return { revealed, letThrough: "not-slop", notSlop: true };
    case "trust":
      return { revealed, letThrough: "trust", trust: true };
    case "undo":
      // The post stays open, with Hide, so the reader can see what came back.
      return letThrough === "trust"
        ? { revealed: true, trust: false }
        : { revealed: true, notSlop: false };
  }
}

/**
 * A post's let-through after the side panel marks it as junk or not. Letting a hidden post
 * through there leaves the same line in the feed as letting it through from its bar.
 */
export function letThroughFromPanel(
  letThrough: LetThrough | undefined,
  notSlop: boolean,
  hidden: boolean,
): LetThrough | undefined {
  if (notSlop) return hidden ? "not-slop" : letThrough;
  return letThrough === "not-slop" ? undefined : letThrough;
}
