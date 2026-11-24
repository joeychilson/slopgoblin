import type { CheckedPost } from "../core/checked.ts";
import { addsContext, type Scores } from "../core/decisions.ts";
import type {
  ClassifyResponse,
  Priority,
  RuntimeMessage,
  TabMessage,
  TabState,
} from "../core/messages.ts";
import { judge, needsScores, type Judged, type Verdict } from "../core/policy.ts";
import { isReply, type Label, type Post, type ReaderNote } from "../core/post.ts";
import { updateSettings, watchSettings, type Settings } from "../core/settings.ts";
import type { SiteAdapter, SiteData } from "../sites/site.ts";
import { renderCell, type BarAction, type View } from "./bar.ts";

const RETRY_MS = 20_000;
/** Short settle skips rapid scroll-bys without delaying text posts. */
const FAST_SETTLE_MS = 300;
/** Max settle while waiting for X to hydrate an image or video poster. */
const MEDIA_SETTLE_MS = 1000;
/** Lookahead below the viewport only; posts above the fold won't reshape anyway. */
const LOOKAHEAD_PX = 1000;
const LOOKAHEAD = `0px 0px ${LOOKAHEAD_PX}px 0px`;
const ID_ATTR = "data-sg-post";
/** Evict unmounted posts past this count so multi-day tabs stay bounded. */
const KEEP = 2000;

interface Tracked {
  post: Post;
  status: "idle" | "pending" | "done" | "failed";
  queued?: boolean;
  scores: Scores;
  notSlop: boolean;
  revealed: boolean;
  letThrough?: "not-slop" | "trust";
  checkedAt?: number;
  avatar?: string;
}

export function startFeed(site: SiteAdapter, initialSettings: Settings) {
  new Feed(site, initialSettings);
}

class Feed {
  private readonly site: SiteAdapter;
  private settings: Settings;
  private readonly posts = new Map<string, Tracked>();
  private readonly follows = new Map<string, boolean>();
  private readonly labels = new Map<string, Label[]>();
  private readonly seen = new WeakSet<Element>();
  private readonly unreadable = new WeakSet<Element>();
  private readonly nearCells = new WeakSet<Element>();
  private readonly unsent = new Set<Tracked>();
  private readonly mediaWaiters = new Map<string, () => void>();
  private readableCount = 0;
  private unreadableCount = 0;
  private flushTimer: ReturnType<typeof setTimeout> | undefined;
  private stopped = false;

  private readonly observer: MutationObserver;
  private readonly intersection: IntersectionObserver;
  private readonly viewport: IntersectionObserver;
  private readonly unwatchSettings: () => void;
  private readonly unwatchData: (() => void) | undefined;

  constructor(site: SiteAdapter, settings: Settings) {
    this.site = site;
    this.settings = settings;
    // Runs before paint so remounted posts are hidden again without flashing.
    this.observer = new MutationObserver((records) => this.onMutations(records));
    this.intersection = new IntersectionObserver((entries) => this.onIntersect(entries), {
      rootMargin: LOOKAHEAD,
    });
    this.viewport = new IntersectionObserver((entries) => this.onViewport(entries));
    this.unwatchSettings = watchSettings((next) => this.onSettings(next));
    // Before first scan so followed authors and site-labeled posts are never sent to Google.
    this.unwatchData = site.watchData?.((data) => this.onData(data));
    document.addEventListener("click", this.onBarClick, true);
    chrome.runtime.onMessage.addListener(this.onTabMessage);
    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src", "poster"],
    });
    this.scan();
    // Tell the side panel this tab is running before the site renders any post.
    this.changed();
  }

  private onMutations(records: MutationRecord[]) {
    let added = false;
    const touched = new Set<Element>();

    for (const record of records) {
      const target = record.target instanceof Element ? record.target : null;
      if (target?.closest(".sg-bar")) continue;
      if (record.type === "attributes") {
        const host = target?.closest(`[${ID_ATTR}]`);
        if (host) touched.add(host);
        continue;
      }
      let hasElement = false;
      let hasText = false;
      for (const node of record.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if ((node as Element).closest(".sg-bar")) continue;
          hasElement = true;
          break;
        }
        if (node.nodeType === Node.TEXT_NODE && node.nodeValue?.trim()) hasText = true;
      }
      if (!hasElement && !hasText) continue;
      const host = target?.closest(`[${ID_ATTR}]`);
      if (host) touched.add(host);
      if (hasElement || !host) added = true;
    }

    for (const el of touched) this.refreshElement(el);
    if (added) this.scan();
  }

  private onIntersect(entries: IntersectionObserverEntry[]) {
    for (const entry of entries) {
      const cell = entry.target;
      if (!entry.isIntersecting) {
        this.nearCells.delete(cell);
        continue;
      }
      this.nearCells.add(cell);
      const t = this.trackedIn(cell);
      if (t) this.askIfNear(t);
    }
  }

  private onViewport(entries: IntersectionObserverEntry[]) {
    const ids: string[] = [];
    for (const entry of entries) {
      const t = entry.isIntersecting ? this.trackedIn(entry.target) : undefined;
      if (t?.queued) ids.push(t.post.id);
    }
    if (ids.length) void this.send({ type: "prioritize", ids });
  }

  private scan() {
    let found = false;
    for (const el of this.site.findPosts()) {
      if (this.seen.has(el)) continue;
      const post = this.site.readPost(el);
      if (!post) {
        // Ignore empty hydration skeletons; only count non-empty elements that still fail to parse.
        if (!this.unreadable.has(el) && el.textContent?.trim()) {
          this.unreadable.add(el);
          this.unreadableCount++;
          found = true;
        }
        continue;
      }
      if (this.unreadable.delete(el)) this.unreadableCount--;
      this.seen.add(el);
      this.readableCount++;
      found = true;
      if (post.author.handle.toLowerCase() === this.site.viewer()?.toLowerCase()) continue;
      const cell = this.site.container(el);
      if (this.site.isFocused(el) || !cell) continue;

      el.setAttribute(ID_ATTR, post.id);
      const t = this.posts.get(post.id) ?? this.track(post);
      t.avatar ??= this.site.avatar(el);
      this.absorb(t, post);
      // Observe the cell wrapper rather than `<article>`, which goes `display: none` when collapsed.
      this.intersection.observe(cell);
      this.viewport.observe(cell);
      this.show(t, el, true);
      if (this.wantsRequest(t)) void this.request(t, !this.isNear(el));
    }
    if (found) this.changed();
  }

  private refreshElement(el: Element) {
    const t = this.trackedOf(el);
    if (!t) return;

    if (!t.avatar) {
      const avatar = this.site.avatar(el);
      if (avatar) {
        t.avatar = avatar;
        this.show(t, el, false);
        this.touched(t);
      }
    }

    const wake = this.mediaWaiters.get(t.post.id);
    if (wake && !this.site.hasPendingMedia?.(el)) wake();

    const reread = this.site.readPost(el);
    if (reread && this.absorb(t, reread)) this.askIfNear(t);
  }

  /**
   * Takes in a fresh read of a post. Only a gain counts, since X often reads a post again with
   * less, such as after unmounting its parent. True when it should be asked about again.
   */
  private absorb(t: Tracked, read: Post) {
    const merged = mergePost(t.post, read);
    const gained =
      addsContext(merged, t.post) || (!hasJudgeableContent(t.post) && hasJudgeableContent(merged));
    if (!gained) return false;
    t.post = merged;
    if (t.status === "done") t.status = "idle";
    return true;
  }

  private track(post: Post): Tracked {
    for (const [id, old] of this.posts) {
      if (this.posts.size < KEEP) break;
      if (!this.elementsOf(old).length) this.posts.delete(id);
    }
    const t: Tracked = { post, status: "idle", scores: {}, notSlop: false, revealed: false };
    this.posts.set(post.id, t);
    return t;
  }

  private onSettings(next: Settings) {
    this.settings = next;
    for (const t of this.posts.values()) {
      if (t.letThrough === "trust" && !this.settings.trusted.includes(handleOf(t))) {
        t.letThrough = undefined;
      }
    }
    for (const el of document.querySelectorAll(`[${ID_ATTR}]`)) {
      const t = this.trackedOf(el);
      if (!t) continue;
      // Show first so previously `display: none` cells have a real rect for `isNear`.
      this.show(t, el, true);
      this.askIfNear(t);
    }
    this.changed();
  }

  private onData(data: SiteData) {
    for (const [handle, following] of data.follows) this.follows.set(handle, following);
    for (const [id, these] of data.labels) this.labels.set(id, these);
    const handles = new Set(data.follows.map(([handle]) => handle));
    const ids = new Set(data.labels.map(([id]) => id));
    for (const t of this.posts.values()) {
      if (!handles.has(handleOf(t)) && !ids.has(t.post.id)) continue;
      this.render(t, false);
      this.askIfNear(t);
      this.touched(t);
    }
  }

  private judged(t: Tracked): Judged {
    return {
      scores: t.scores,
      labels: this.labelsOf(t),
      handle: t.post.author.handle,
      notSlop: t.notSlop,
      followed: this.follows.get(handleOf(t)),
    };
  }

  private labelsOf(t: Tracked) {
    return [...new Set([...t.post.labels, ...(this.labels.get(t.post.id) ?? [])])];
  }

  private verdict(t: Tracked) {
    return judge(this.judged(t), this.settings);
  }

  /** Whether the model's answer could change how the post is shown. */
  private worthAsking(t: Tracked) {
    return needsScores({ ...this.judged(t), isReply: isReply(t.post) }, this.settings);
  }

  private wantsRequest(t: Tracked) {
    return !this.stopped && (t.status === "idle" || t.status === "failed") && this.worthAsking(t);
  }

  private askIfNear(t: Tracked) {
    if (this.wantsRequest(t) && this.hasNearElement(t)) void this.request(t);
  }

  private async request(t: Tracked, cacheOnly = false) {
    t.status = "pending";
    this.changed();

    let asked = t.post;
    let res = await this.classify(t, true);
    if (this.stopped) return;
    if ("uncached" in res) {
      if (cacheOnly && !this.hasNearElement(t)) return this.setIdle(t);
      const el = await this.settle(t);
      if (this.stopped) return;
      if (!el || !this.worthAsking(t)) return this.setIdle(t);
      const reread = this.site.readPost(el);
      if (reread) t.post = mergePost(t.post, reread);
      // Don't send an empty placeholder shell before its text or media has appeared.
      if (!hasJudgeableContent(t.post)) return this.setIdle(t);
      asked = t.post;
      t.queued = true;
      try {
        res = await this.classify(t, false, priorityOf(this.site.container(el) ?? el));
      } finally {
        t.queued = false;
      }
      if (this.stopped) return;
    }

    if ("scores" in res) {
      t.scores = res.scores;
      t.notSlop ||= res.notSlop;
      t.status = "done";
      t.checkedAt ??= Date.now();
      this.touched(t);
      this.render(t, false);
      // It gained context while it was being asked about.
      if (t.post !== asked) {
        t.status = "idle";
        this.askIfNear(t);
      }
    } else if ("needsKey" in res) {
      this.setIdle(t);
    } else {
      t.status = "failed";
      setTimeout(() => this.askIfNear(t), RETRY_MS);
      this.changed();
    }
  }

  private setIdle(t: Tracked) {
    t.status = "idle";
    this.changed();
  }

  private trackedOf(el: Element) {
    return this.posts.get(el.getAttribute(ID_ATTR) ?? "");
  }

  private trackedIn(cell: Element) {
    const el = cell.querySelector(`[${ID_ATTR}]`);
    return el ? this.trackedOf(el) : undefined;
  }

  private async settle(t: Tracked): Promise<Element | undefined> {
    const initial = this.elementsOf(t)[0];
    if (!initial) return undefined;
    const pendingMedia = Boolean(this.site.hasPendingMedia?.(initial));
    await new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        if (this.mediaWaiters.get(t.post.id) === done) this.mediaWaiters.delete(t.post.id);
        resolve();
      };
      const timer = setTimeout(done, pendingMedia ? MEDIA_SETTLE_MS : FAST_SETTLE_MS);
      if (pendingMedia) this.mediaWaiters.set(t.post.id, done);
    });
    const el = this.elementsOf(t)[0];
    return el && this.isNear(el) ? el : undefined;
  }

  private async classify(
    t: Tracked,
    cachedOnly: boolean,
    priority: Priority = 0,
  ): Promise<ClassifyResponse> {
    const post: Post = { ...t.post, labels: this.labelsOf(t) };
    return (
      (await this.send<ClassifyResponse>({ type: "classify", post, cachedOnly, priority })) ?? {
        unavailable: true,
      }
    );
  }

  private render(t: Tracked, fresh: boolean) {
    for (const el of this.elementsOf(t)) this.show(t, el, fresh);
  }

  private elementsOf(t: Tracked) {
    return document.querySelectorAll(`[${ID_ATTR}="${CSS.escape(t.post.id)}"]`);
  }

  private hasNearElement(t: Tracked) {
    return [...this.elementsOf(t)].some((el) => this.isNear(el));
  }

  private isNear(el: Element) {
    const box = this.site.container(el) ?? el;
    if (this.nearCells.has(box)) return true;
    const rect = box.getBoundingClientRect();
    return rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight + LOOKAHEAD_PX;
  }

  /** `fresh` is false when a change lands on a post already on screen. */
  private show(t: Tracked, el: Element, fresh: boolean) {
    const cell = this.site.container(el);
    if (!cell || this.stopped) return;
    const verdict = this.verdict(t);
    if (verdict?.labeled && t.checkedAt === undefined) {
      t.checkedAt = Date.now();
      this.touched(t);
    }
    const view = viewFor(t, verdict, this.settings);
    // Avoid shifting the page under the reader for posts already scrolled above the fold.
    const reshapes = view.mode !== (cell.dataset.sg ?? "shown");
    if (!fresh && reshapes && cell.getBoundingClientRect().top < 0) return;
    renderCell(cell, view);
  }

  private readonly onBarClick = (event: MouseEvent) => {
    // Reject synthetic clicks so page scripts cannot toggle trusted handles or overrides.
    if (!event.isTrusted) return;
    const target = (event.target as Element | null)?.closest<HTMLElement>("[data-sg-action]");
    const id = target?.closest<HTMLElement>(".sg-bar")?.dataset.id;
    const t = id && this.posts.get(id);
    if (!target || !t) return;
    event.preventDefault();
    event.stopPropagation();
    this.act(t, target.dataset.sgAction as BarAction);
  };

  private act(t: Tracked, action: BarAction) {
    switch (action) {
      case "reveal":
      case "hide":
        t.revealed = action === "reveal";
        this.render(t, true);
        break;
      case "not-slop":
        t.letThrough = "not-slop";
        t.notSlop = true;
        this.render(t, true);
        void this.send({ type: "not-slop", id: t.post.id, notSlop: true });
        break;
      case "trust":
        t.letThrough = "trust";
        void updateSettings((s) => ({ trusted: [...new Set([...s.trusted, handleOf(t)])] }));
        break;
      case "undo":
        t.revealed = true;
        if (t.letThrough === "trust") {
          void updateSettings((s) => ({ trusted: s.trusted.filter((h) => h !== handleOf(t)) }));
        } else {
          t.notSlop = false;
          this.render(t, true);
          void this.send({ type: "not-slop", id: t.post.id, notSlop: false });
        }
        t.letThrough = undefined;
        break;
    }
  }

  private readonly onTabMessage = (
    message: TabMessage,
    _: unknown,
    sendResponse: (response: unknown) => void,
  ) => {
    switch (message.type) {
      case "get-tab-state":
        sendResponse(this.tabState());
        break;
      case "retry":
        for (const el of document.querySelectorAll(`[${ID_ATTR}]`)) {
          const t = this.trackedOf(el);
          if (t) this.askIfNear(t);
        }
        break;
      case "reveal": {
        const t = this.posts.get(message.id);
        const el = t && this.elementsOf(t)[0];
        if (t && el) {
          this.act(t, "reveal");
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        sendResponse(Boolean(el));
        break;
      }
      case "not-slop": {
        const t = this.posts.get(message.id);
        if (!t || t.notSlop === message.notSlop) break;
        if (message.notSlop && this.verdict(t)) t.letThrough = "not-slop";
        if (!message.notSlop && t.letThrough === "not-slop") t.letThrough = undefined;
        t.notSlop = message.notSlop;
        this.render(t, false);
        break;
      }
    }
    return false;
  };

  private tabState(): TabState {
    let pending = 0;
    for (const t of this.posts.values()) if (t.status === "pending") pending++;
    return {
      pending,
      broken: this.unreadableCount >= 5 && this.unreadableCount > this.readableCount,
    };
  }

  private touched(t: Tracked) {
    if (t.checkedAt !== undefined) this.unsent.add(t);
    this.changed();
  }

  private changed() {
    if (this.stopped) return;
    this.flushTimer ??= setTimeout(() => {
      this.flushTimer = undefined;
      if (this.unsent.size) {
        const posts: CheckedPost[] = [...this.unsent].map((t) => ({
          ...this.judged(t),
          id: t.post.id,
          url: t.post.url,
          name: t.post.author.name,
          avatar: t.avatar,
          text: t.post.text.slice(0, 600),
          at: t.checkedAt!,
        }));
        void this.send({ type: "checked", posts });
        this.unsent.clear();
      }
      void this.send({ type: "tab-state", state: this.tabState() });
    }, 250);
  }

  private async send<T>(message: RuntimeMessage): Promise<T | undefined> {
    if (!chrome.runtime?.id) {
      this.stop();
      return undefined;
    }
    return chrome.runtime.sendMessage<RuntimeMessage, T>(message).catch(() => undefined);
  }

  /** Restores all posts once this content script is orphaned by an extension reload or update. */
  private stop() {
    if (this.stopped) return;
    this.stopped = true;
    clearTimeout(this.flushTimer);
    this.observer.disconnect();
    this.intersection.disconnect();
    this.viewport.disconnect();
    this.unwatchSettings();
    this.unwatchData?.();
    document.removeEventListener("click", this.onBarClick, true);
    chrome.runtime.onMessage.removeListener(this.onTabMessage);
    for (const wake of this.mediaWaiters.values()) wake();
    this.mediaWaiters.clear();
    for (const cell of document.querySelectorAll<HTMLElement>("[data-sg]")) {
      renderCell(cell, { mode: "shown" });
    }
  }
}

const handleOf = (t: Tracked) => t.post.author.handle.toLowerCase();

const hasJudgeableContent = (post: Post) =>
  Boolean(post.text || post.images?.length || post.quote || post.link || post.readerNote);

function bestNote(prev: ReaderNote | undefined, next: ReaderNote | undefined) {
  if (!prev) return next;
  if (!next) return prev;
  return prev.rated && !next.rated ? prev : next;
}

/** Keeps previously discovered context if X unmounts a parent or media while new content arrives. */
function mergePost(prev: Post, next: Post): Post {
  const quote =
    prev.quote && next.quote
      ? {
          handle: next.quote.handle,
          text: next.quote.text || prev.quote.text,
          readerNote: bestNote(prev.quote.readerNote, next.quote.readerNote),
        }
      : (next.quote ?? prev.quote);
  return {
    ...next,
    text: next.text || prev.text,
    images: (next.images?.length ?? 0) >= (prev.images?.length ?? 0) ? next.images : prev.images,
    // Once X unmounts the parent, a conversation page reads the main post as the parent instead.
    replyTo: prev.replyTo ?? next.replyTo,
    readerNote: bestNote(prev.readerNote, next.readerNote),
    quote,
    link: next.link ?? prev.link,
    labels: [...new Set([...prev.labels, ...next.labels])],
  };
}

function priorityOf(el: Element): Priority {
  const rect = el.getBoundingClientRect();
  return rect.bottom > 0 && rect.top < innerHeight ? 0 : 1;
}

function viewFor(t: Tracked, verdict: Verdict | null, settings: Settings): View {
  const { post, letThrough } = t;
  if (verdict) {
    const base = {
      id: post.id,
      author: post.author,
      avatar: t.avatar,
      verdict,
      peek: settings.peek && !t.revealed,
    };
    if (settings.peek || t.revealed) return { ...base, mode: "revealed" };
    return settings.hideMode === "remove" ? { mode: "removed" } : { ...base, mode: "collapsed" };
  }
  return settings.enabled && letThrough
    ? { mode: "confirmed", id: post.id, author: post.author, action: letThrough }
    : { mode: "shown" };
}
