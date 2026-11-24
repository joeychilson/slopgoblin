import type { Post, ReaderNote } from "../core/post.ts";
import type { SiteAdapter } from "./site.ts";
import { watchData } from "./x-data.ts";

// X's class names are generated; data-testid attributes are the stable hooks.
const SEL = {
  post: 'article[data-testid="tweet"]',
  cell: '[data-testid="cellInnerDiv"]',
  user: '[data-testid="User-Name"]',
  avatar: '[data-testid="Tweet-User-Avatar"]',
  text: '[data-testid="tweetText"]',
  showMore: '[data-testid="tweet-text-show-more-link"]',
  quoteText: '[data-testid="tweetText"], div[lang]',
  card: '[data-testid="card.wrapper"]',
  mediaSlot:
    '[data-testid="tweetPhoto"], [data-testid="videoPlayer"], [data-testid="videoComponent"]',
  // Community notes (X's code still calls them Birdwatch).
  note: '[data-testid="birdwatch-pivot"]',
  unratedNote: '[data-testid="icon-birdwatch-level"]',
  permalink: 'a[href*="/status/"]:has(time)',
  // Promoted posts sit inside one of these; X also wraps videos in it, but inside the post.
  ad: '[data-testid="placementTracking"]',
  viewer: 'a[data-testid="AppTabBar_Profile_Link"]',
  main: 'article[data-testid="tweet"][tabindex="-1"]',
};

const MEDIA =
  /^https:\/\/pbs\.twimg\.com\/(media|ext_tw_video_thumb|amplify_video_thumb|tweet_video_thumb|card_img)\//;

type Reply = NonNullable<Post["replyTo"]>;

/** The profile link isn't in every layout X renders, so remember the last one seen. */
let lastViewer: string | null = null;

export const x: SiteAdapter = {
  findPosts: () => [...document.querySelectorAll(SEL.post)],

  isFocused: (el) => el.matches(SEL.main),

  container: (el) => el.closest<HTMLElement>(SEL.cell),

  viewer: () =>
    (lastViewer =
      handleFrom(document.querySelector(SEL.viewer)?.getAttribute("href")) ?? lastViewer),

  // The first avatar is the author's; a quoted post's comes later.
  avatar: (el) =>
    el.querySelector(SEL.avatar)?.querySelector("img")?.getAttribute("src") ?? undefined,

  hasPendingMedia: (el) =>
    [...el.querySelectorAll(SEL.mediaSlot)].some((slot) => !images(slot).length),

  watchData,

  readPost(el) {
    const own = ownParts(el);
    const isAd = Boolean(el.closest(SEL.ad));
    if (!own?.handle || (!own.statusId && !isAd)) return null;
    const { handle, statusId, quote } = own;

    // Marking the "Show more" cut keeps truncated posts from reading as cliffhangers.
    const text = textOf(own.find(SEL.text)) + (own.find(SEL.showMore) ? "…" : "");
    const post: Post = {
      id: statusId ? `x:${statusId}` : `x:ad:${handle}:${text.length}:${text.slice(0, 40)}`,
      url: statusId ? `https://x.com/${handle}/status/${statusId}` : `https://x.com/${handle}`,
      author: { name: textOf(own.user.querySelector("a")) || handle, handle },
      text,
      images: images(el),
      labels: isAd ? ["ad"] : [],
    };

    const note = readNote(own.find(SEL.note));
    if (note) post.readerNote = note;
    const quoteHandle = handleIn(quote?.querySelector(SEL.user));
    if (quote && quoteHandle) {
      post.quote = { handle: quoteHandle, text: textOf(quote.querySelector(SEL.quoteText)) };
      const quoteNote = readNote(quote.querySelector(SEL.note));
      if (quoteNote) post.quote.readerNote = quoteNote;
    }
    const card = own.find(SEL.card);
    if (card) post.link = textOf(card).replace(/\s+/g, " ");
    const replyTo = replyContext(el, statusId);
    if (replyTo) post.replyTo = replyTo;
    return post;
  },
};

/** The parts of a post element belonging to it rather than to a quoted post. */
function ownParts(el: Element) {
  const [user, quoteUser] = el.querySelectorAll(SEL.user);
  if (!user) return null;
  const quote = quoteUser?.closest('[role="link"]');
  const find = (selector: string) =>
    [...el.querySelectorAll(selector)].find((node) => !quote?.contains(node));
  const permalink = find(SEL.permalink)?.getAttribute("href");
  return {
    user,
    quote,
    find,
    statusId: permalink?.match(/\/status\/(\d+)/)?.[1],
    handle: handleFrom(permalink) ?? handleIn(user),
  };
}

/**
 * X unmounts the main post on a conversation page once you scroll down into replies; remember
 * each conversation's main post and which status IDs sit in its reply run.
 */
const MAX_CONVERSATIONS = 50;
const conversations = new Map<string, { main?: Reply; replies: Map<string, boolean> }>();

function replyContext(el: Element, statusId: string | undefined): Reply | undefined {
  const main = mainPostFor(el, statusId);
  const above = postAbove(el);
  // X joins a reply to the post above it with an empty thread line next to that post's avatar.
  if (above?.querySelector(SEL.avatar)?.nextElementSibling?.matches(":empty")) {
    return asReply(above);
  }
  return main;
}

function mainPostFor(el: Element, statusId: string | undefined) {
  const mainId = location.pathname.match(/^\/\w+\/status\/(\d+)/)?.[1];
  if (!mainId || !statusId) return undefined;
  let conversation = conversations.get(mainId);
  if (!conversation) {
    if (conversations.size >= MAX_CONVERSATIONS) {
      conversations.delete(conversations.keys().next().value!);
    }
    conversations.set(mainId, (conversation = { replies: new Map() }));
  }
  if (el.matches(SEL.main)) {
    conversation.main = asReply(el);
    return undefined;
  }

  let isReply = conversation.replies.get(statusId);
  if (isReply === undefined) {
    isReply = inReplies(el, conversation.replies);
    if (isReply !== undefined) conversation.replies.set(statusId, isReply);
  }
  return isReply ? conversation.main : undefined;
}

function inReplies(el: Element, replies: Map<string, boolean>): boolean | undefined {
  for (const cell of cellsAbove(el)) {
    const post = cell.querySelector(SEL.post);
    if (!post) {
      if (cell.querySelector("h2")) return false;
      continue;
    }
    if (post.matches(SEL.main)) return true;
    const known = replies.get(ownParts(post)?.statusId ?? "");
    if (known !== undefined) return known;
  }
  return undefined;
}

function postAbove(el: Element): Element | null {
  for (const cell of cellsAbove(el)) {
    const post = cell.querySelector(SEL.post);
    if (post || cell.querySelector("h2")) return post;
  }
  return null;
}

function* cellsAbove(el: Element) {
  for (let cell = el.closest(SEL.cell)?.previousElementSibling; cell;) {
    yield cell;
    cell = cell.previousElementSibling;
  }
}

function asReply(el: Element): Reply | undefined {
  const own = ownParts(el);
  return own?.handle ? { handle: own.handle, text: textOf(own.find(SEL.text)) } : undefined;
}

function readNote(box: Element | null | undefined): ReaderNote | undefined {
  // Heading, note body, and rating prompt are direct children; only the body sets `dir`.
  const body = box?.querySelector(":scope > [dir]");
  if (!box || !body) return undefined;
  // Strip trailing source links X appends to the note body.
  const parts = [...body.childNodes];
  while (parts.length && (parts.at(-1)!.nodeName === "A" || !rawText(parts.at(-1)!).trim())) {
    parts.pop();
  }
  const text = parts.map(rawText).join("").trim();
  return text ? { text, rated: !box.querySelector(SEL.unratedNote) } : undefined;
}

function images(el: Element): string[] {
  // Once a video starts playing its src is a blob, so read poster first.
  const sources = [...el.querySelectorAll("img, video[poster]")].map(
    (node) => node.getAttribute("poster") ?? node.getAttribute("src") ?? "",
  );
  return [...new Set(sources.filter((src) => MEDIA.test(src)).map(smallRendition))];
}

/** X's 680px rendition is plenty at the model's low resolution. */
function smallRendition(src: string) {
  const url = new URL(src);
  if (url.searchParams.has("name")) url.searchParams.set("name", "small");
  return url.href;
}

function handleFrom(href: string | null | undefined) {
  if (!href) return null;
  const handle = new URL(href, location.origin).pathname.match(/^\/(\w+)(?:\/|$)/)?.[1];
  // `/i/...` is X's internal namespace, not a user handle.
  return handle && handle !== "i" ? handle : null;
}

function handleIn(user: Element | null | undefined) {
  const at = [...(user?.querySelectorAll("a, span") ?? [])]
    .map((node) => node.textContent?.trim() ?? "")
    .find((label) => /^@\w+$/.test(label));
  return at?.slice(1) ?? null;
}

/** Text with emoji (rendered by X as `<img alt>`) put back in. */
function textOf(node: Element | null | undefined): string {
  return node ? rawText(node).trim() : "";
}

function rawText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.nodeValue ?? "";
  if (node instanceof HTMLImageElement) return node.alt;
  if (node.nodeName === "BR") return "\n";
  return [...node.childNodes].map(rawText).join("");
}
