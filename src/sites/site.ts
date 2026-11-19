import type { Label, Post } from "../core/post.ts";

/** What a site's own data says that its page doesn't show, or not reliably. */
export interface SiteData {
  /** Lowercase handles, and whether the reader follows each. */
  follows: [handle: string, following: boolean][];
  /** Post ids, and the site's labels on each. */
  labels: [id: string, labels: Label[]][];
}

/** Everything site-specific. Adding a site means implementing this, listing it in `SITES` in content/index.ts and adding a manifest match. */
export interface SiteAdapter {
  findPosts(): Element[];
  /** Reads a post element. Null when it can't be read, which usually means the site's markup changed. */
  readPost(el: Element): Post | null;
  /** Whether this is the post the page is about. The reader opened it, so it's never hidden. */
  isFocused(el: Element): boolean;
  /** The element to collapse. It must wrap exactly one post. */
  container(el: Element): HTMLElement | null;
  /** Handle of the signed-in user; their own posts are never judged. */
  viewer(): string | null;
  /** The author's avatar URL, once the site has filled it in. */
  avatar(el: Element): string | undefined;
  /**
   * Calls `onChange` with what the site's data says, as the site loads it, starting with what it
   * already has. Without it, nobody counts as followed and only the labels in the markup count.
   */
  watchData?(onChange: (data: SiteData) => void): void;
}
