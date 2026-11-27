import type { Label, Post } from "../core/post.ts";

/** Site data not reliably present in post markup. */
export interface SiteData {
  /** Lowercase handles and whether the reader follows each. */
  follows: [handle: string, following: boolean][];
  /** Post ids and the site's own labels on each. */
  labels: [id: string, labels: Label[]][];
}

export interface SiteAdapter {
  findPosts(): Element[];
  /** Null when the element can't be parsed yet (hydrating or changed markup). */
  readPost(el: Element): Post | null;
  /** The post a conversation page is about is never hidden. */
  isFocused(el: Element): boolean;
  /** The element to collapse; must wrap exactly one post. */
  container(el: Element): HTMLElement | null;
  /** Signed-in viewer's handle; their own posts are never judged. */
  viewer(): string | null;
  avatar(el: Element): string | undefined;
  /** True when the post has media slots whose images or posters haven't loaded yet. */
  hasPendingMedia?(el: Element): boolean;
  /** Streams site data starting with everything captured so far; returns an unsubscribe. */
  watchData?(onChange: (data: SiteData) => void): () => void;
}
