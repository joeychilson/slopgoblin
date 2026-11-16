import type { Post, ReaderNote } from "../core/post.ts";
import type { SiteAdapter } from "./site.ts";
import { watchFollows } from "./x-follows.ts";

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
  // Community notes. X's code still calls them by their first name, Birdwatch.
  note: '[data-testid="birdwatch-pivot"]',
  unratedNote: '[data-testid="icon-birdwatch-level"]',
  permalink: 'a[href*="/status/"]:has(time)',
  // Promoted posts sit inside one of these. X also wraps videos in it, but inside the post.
  ad: '[data-testid="placementTracking"]',
  viewer: 'a[data-testid="AppTabBar_Profile_Link"]',
  // The post a conversation page is about.
  main: 'article[data-testid="tweet"][tabindex="-1"]',
};

const MEDIA =
  /^https:\/\/pbs\.twimg\.com\/(media|ext_tw_video_thumb|amplify_video_thumb|tweet_video_thumb|card_img)\//;

type Reply = NonNullable<Post["replyTo"]>;

/** The profile link isn't in every layout X has, so the last one seen stands in. */
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

  watchFollows,

  readPost(el) {
    const own = ownParts(el);
    const isAd = Boolean(el.closest(SEL.ad));
    if (!own?.handle || (!own.statusId && !isAd)) return null;
    const { handle, statusId, quote } = own;

    // X cuts long posts off at "Show more". Marking the cut keeps it from reading as a cliffhanger.
    const text = textOf(own.find(SEL.text)) + (own.find(SEL.showMore) ? "…" : "");
    const post: Post = {
      id: statusId ? `x:${statusId}` : `x:ad:${handle}:${text.length}:${text.slice(0, 40)}`,
      url: statusId ? `https://x.com/${handle}/status/${statusId}` : `https://x.com/${handle}`,
      author: { name: textOf(own.user.querySelector("a")) || handle, handle },
      text,
      images: images(el),
      isAd,
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

/** The parts of a post element that belong to it rather than to a post it quotes. */
function ownParts(el: Element) {
  // A quoted post has its own author line; the article's first one is the post's.
  const [user, quoteUser] = el.querySelectorAll(SEL.user);
  if (!user) return null;
  // X renders a quoted post as one big link.
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
 * A conversation page lists the main post, its replies, then headed sections of other posts
 * ("Discover more", "Probable spam"). X unmounts posts far off screen, so the main post may be
 * gone by the time a reply further down renders; which posts are replies is remembered instead,
 * per conversation, so going back to one still works.
 */
const conversations = new Map<string, { main?: Reply; replies: Map<string, boolean> }>();

function replyContext(el: Element, statusId: string | undefined): Reply | undefined {
  const main = mainPostFor(el, statusId);
  const above = postAbove(el);
  // X joins a reply to the post above it with a line down from that post's avatar.
  if (above?.querySelector(SEL.avatar)?.nextElementSibling?.matches(":empty")) {
    return asReply(above);
  }
  return main;
}

/** On a conversation page, the main post if `el` is one of its replies. */
function mainPostFor(el: Element, statusId: string | undefined) {
  const mainId = location.pathname.match(/^\/\w+\/status\/(\d+)/)?.[1];
  if (!mainId || !statusId) return undefined;
  let conversation = conversations.get(mainId);
  if (!conversation) conversations.set(mainId, (conversation = { replies: new Map() }));
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

/** Whether `el` is in the run of replies under the main post; undefined if nothing above it shows. */
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

/** The post right above `el` in the list, unless a section heading comes first. */
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

/** The box under a post is a heading, the note, then a prompt to rate it. */
function readNote(box: Element | null | undefined): ReaderNote | undefined {
  // Of the three, only the note is a direct child that sets a text direction.
  const body = box?.querySelector(":scope > [dir]");
  if (!box || !body) return undefined;
  // A note ends with its sources, as links X has cut short.
  const parts = [...body.childNodes];
  while (parts.length && (parts.at(-1)!.nodeName === "A" || !rawText(parts.at(-1)!).trim())) {
    parts.pop();
  }
  const text = parts.map(rawText).join("").trim();
  return text ? { text, rated: !box.querySelector(SEL.unratedNote) } : undefined;
}

function images(el: Element): string[] {
  // Once a video starts loading its src is a blob, so its poster comes first.
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
  return new URL(href, location.origin).pathname.match(/^\/(\w+)(?:\/|$)/)?.[1] ?? null;
}

function handleIn(user: Element | null | undefined) {
  const at = [...(user?.querySelectorAll("a, span") ?? [])]
    .map((node) => node.textContent?.trim() ?? "")
    .find((label) => /^@\w+$/.test(label));
  return at?.slice(1) ?? null;
}

/** Text with emoji (rendered by X as <img alt>) put back in. */
function textOf(node: Element | null | undefined): string {
  return node ? rawText(node).trim() : "";
}

function rawText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.nodeValue ?? "";
  if (node instanceof HTMLImageElement) return node.alt;
  if (node.nodeName === "BR") return "\n";
  return [...node.childNodes].map(rawText).join("");
}
