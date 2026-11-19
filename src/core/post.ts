import type { CategoryId } from "./taxonomy.ts";

/** What a site itself labels a post: an ad, or made with AI. */
export const LABELS = ["ad", "made_with_ai"] as const satisfies CategoryId[];
export type Label = (typeof LABELS)[number];

/** Context readers attached to a post, such as an X community note. */
export interface ReaderNote {
  text: string;
  /** False while the site still shows it as a proposal other readers haven't rated. */
  rated: boolean;
}

/** What the classifier sees. Site adapters produce this; the eval set is made of it. */
export interface PostContent {
  author: { name: string; handle: string };
  text: string;
  readerNote?: ReaderNote;
  quote?: { handle: string; text: string; readerNote?: ReaderNote };
  /** Link card summary, e.g. "nytimes.com · Headline". */
  link?: string;
  replyTo?: { handle: string; text: string };
  images?: string[];
}

/** The display name, unless it's all symbols and emoji, as plenty are. */
export const displayName = ({ name, handle }: { name: string; handle: string }) =>
  /[\p{L}\p{N}]/u.test(name) ? name : `@${handle}`;

export interface Post extends PostContent {
  /** Site-scoped stable id, e.g. "x:1857304412". */
  id: string;
  url: string;
  /** The labels its markup shows. The site's data can add more later (`SiteAdapter.watchData`). */
  labels: Label[];
}

/** A reply to someone else. One to the author's own post continues a thread, so it can't be reply spam. */
export const isReply = ({ replyTo, author }: PostContent) =>
  replyTo !== undefined && replyTo.handle.toLowerCase() !== author.handle.toLowerCase();
