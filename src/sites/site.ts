import type { Post } from "../core/post.ts";

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
}
