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
import { isReply, type Label, type Post } from "../core/post.ts";
import { updateSettings, watchSettings, type Settings } from "../core/settings.ts";
import type { SiteAdapter, SiteData } from "../sites/site.ts";
import { renderCell, type BarAction, type View } from "./bar.ts";

const RETRY_MS = 20_000;
/** Short settle skips rapid scroll-bys without delaying text posts. */
const FAST_SETTLE_MS = 180;
/** Max settle while waiting for X to hydrate a post's image or video poster. */
const MEDIA_SETTLE_MS = 1000;
/** Lookahead margin so upcoming posts are classified before scrolling into view. */
const LOOKAHEAD = "1000px 0px";
const ID_ATTR = "data-sg-post";
/** Evict unmounted posts past this count so multi-day tabs stay bounded. */
const KEEP = 2000;

interface Tracked {
  post: Post;
  status: "idle" | "pending" | "done" | "failed";
  scores: Scores;
  notSlop: boolean;
  revealed: boolean;
  letThrough?: "not-slop" | "trust";
  verdict: Verdict | null;
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
  private readonly near = new WeakSet<Element>();
  private readonly unsent = new Set<Tracked>();
  /** Resolvers for posts waiting on media hydration, woken early when media lands. */
  private readonly mediaWaiters = new Map<string, () => void>();
  private readableCount = 0;
  private unreadableCount = 0;
  private flushTimer: ReturnType<typeof setTimeout> | undefined;
  private stopped = false;

  private readonly observer: MutationObserver;
  private readonly intersection: IntersectionObserver;
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
    this.unwatchSettings = watchSettings((next) => this.onSettings(next));
    // Before first scan so followed authors and site-labeled posts are never sent to Google.
    this.unwatchData = site.watchData?.((data) => this.onData(data));
    document.addEventListener("click", this.onBarClick, true);
    chrome.runtime.onMessage.addListener(this.onTabMessage);
    this.observer.observe(document.body, { childList: true, subtree: true });
    this.scan();
    // Tell the side panel this tab is running before the site renders any post.
    this.changed();
  }

  private onMutations(records: MutationRecord[]) {
    let addedNodes = false;
    const touchedPosts = new Set<Element>();

    for (const record of records) {
      let relevant = false;
      for (const node of record.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        const el = node as Element;
        if (el.classList.contains("sg-bar") || el.closest(".sg-bar")) continue;
        relevant = true;
        break;
      }
      if (!relevant) continue;
      addedNodes = true;
      const host = (record.target as Element).closest?.(`[${ID_ATTR}]`);
      if (host) touchedPosts.add(host);
    }

    if (!addedNodes) return;

    for (const el of touchedPosts) this.refreshElement(el);
    this.scan();
  }

  private onIntersect(entries: IntersectionObserverEntry[]) {
    for (const entry of entries) {
      const el = entry.target;
      if (!entry.isIntersecting) {
        this.near.delete(el);
        continue;
      }
      this.near.add(el);
      const t = this.trackedOf(el);
      if (t && this.wantsRequest(t)) void this.request(t);
    }
  }

  private scan() {
    let found = false;
    for (const el of this.site.findPosts()) {
      if (this.seen.has(el)) continue;
      const post = this.site.readPost(el);
      if (!post) {
        // Ignore empty hydration skeletons; only count elements with text that still fail to parse.
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
      if (this.site.isFocused(el) || !this.site.container(el)) continue;

      el.setAttribute(ID_ATTR, post.id);
      const t = this.posts.get(post.id) ?? this.track(post);
      if (!t.avatar) t.avatar = this.site.avatar(el);
      if (addsContext(post, t.post)) {
        t.post = post;
        if (t.status === "done") t.status = "idle";
      }
      this.intersection.observe(el);
      this.show(t, el, true);
      if (this.wantsRequest(t)) void this.request(t, !this.isNear(el));
    }
    if (found) this.changed();
  }

  /** Picks up late-hydrating avatars, media, or community notes inside an already-tracked post. */
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
    if (reread && addsContext(reread, t.post)) {
      t.post = reread;
      if (t.status === "done") t.status = "idle";
      if (this.wantsRequest(t) && this.isNear(el)) void this.request(t);
    }
  }

  private track(post: Post): Tracked {
    const t: Tracked = {
      post,
      status: "idle",
      scores: {},
      notSlop: false,
      revealed: false,
      verdict: null,
    };
    for (const [id, old] of this.posts) {
      if (this.posts.size < KEEP) break;
      if (!this.elementsOf(old).length) this.posts.delete(id);
    }
    this.posts.set(post.id, t);
    this.rejudge(t);
    return t;
  }

  private checked(t: Tracked) {
    t.status = "done";
    this.rejudge(t);
    this.listed(t);
  }

  private listed(t: Tracked) {
    t.checkedAt ??= Date.now();
    this.touched(t);
  }

  private onSettings(next: Settings) {
    this.settings = next;
    for (const t of this.posts.values()) {
      if (t.letThrough === "trust" && !this.settings.trusted.includes(handleOf(t))) {
        t.letThrough = undefined;
      }
      this.rejudge(t);
    }
    for (const el of document.querySelectorAll(`[${ID_ATTR}]`)) {
      const t = this.trackedOf(el);
      if (!t) continue;
      // Show first so previously display:none cells have a real rect for `isNear`.
      this.show(t, el, true);
      if (this.wantsRequest(t) && this.isNear(el)) void this.request(t);
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
      this.update(t, false);
      if (this.wantsRequest(t) && this.nearElementOf(t)) void this.request(t);
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

  private wantsRequest(t: Tracked) {
    return !this.stopped && (t.status === "idle" || t.status === "failed") && this.worthAsking(t);
  }

  private worthAsking(t: Tracked) {
    return needsScores({ ...this.judged(t), isReply: isReply(t.post) }, this.settings);
  }

  private async request(t: Tracked, cacheOnly = false) {
    t.status = "pending";
    this.changed();

    let asked = t.post;
    let res = await this.classify(t, true);
    if ("uncached" in res) {
      if (cacheOnly && !this.nearElementOf(t)) return this.setIdle(t);
      const el = await this.settle(t);
      if (!el || !this.worthAsking(t)) return this.setIdle(t);
      const reread = this.site.readPost(el);
      if (reread && !addsContext(t.post, reread)) t.post = reread;
      // Don't send an empty placeholder shell before its text or media has appeared.
      if (!hasJudgeableContent(t.post)) return this.setIdle(t);
      asked = t.post;
      res = await this.classify(t, false, priorityOf(this.site.container(el) ?? el));
    }

    if ("scores" in res) {
      t.scores = res.scores;
      t.notSlop ||= res.notSlop;
      this.checked(t);
      for (const el of this.elementsOf(t)) this.show(t, el, false);
      if (addsContext(t.post, asked)) {
        t.status = "idle";
        if (this.wantsRequest(t) && this.nearElementOf(t)) void this.request(t);
      }
    } else if ("needsKey" in res) {
      this.setIdle(t);
    } else {
      t.status = "failed";
      setTimeout(() => {
        if (this.wantsRequest(t) && this.nearElementOf(t)) void this.request(t);
      }, RETRY_MS);
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

  /**
   * Gives a mounted post a brief beat to finish rendering (longer only while a media slot is
   * still empty, waking early as soon as its image or video poster loads).
   */
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
    if (!el || !this.isNear(el)) return undefined;
    return el;
  }

  private async classify(
    t: Tracked,
    cachedOnly: boolean,
    priority: Priority = 0,
  ): Promise<ClassifyResponse> {
    const post: Post = { ...t.post, labels: this.labelsOf(t) };
    const res = await this.send<ClassifyResponse>({ type: "classify", post, cachedOnly, priority });
    return res ?? { unavailable: true };
  }

  private rejudge(t: Tracked) {
    t.verdict = judge(this.judged(t), this.settings);
  }

  private update(t: Tracked, fresh: boolean) {
    this.rejudge(t);
    for (const el of this.elementsOf(t)) this.show(t, el, fresh);
  }

  private elementsOf(t: Tracked) {
    return document.querySelectorAll(`[${ID_ATTR}="${CSS.escape(t.post.id)}"]`);
  }

  private nearElementOf(t: Tracked) {
    return [...this.elementsOf(t)].find((el) => this.isNear(el));
  }

  private isNear(el: Element) {
    if (this.near.has(el)) return true;
    const box = (this.site.container(el) ?? el).getBoundingClientRect();
    return box.height > 0 && box.bottom > 0 && box.top < innerHeight + 1000;
  }

  /** `fresh` is false when a change lands on a post already on screen. */
  private show(t: Tracked, el: Element, fresh: boolean) {
    const cell = this.site.container(el);
    if (!cell || this.stopped) return;
    if (t.verdict?.labeled && t.checkedAt === undefined) this.listed(t);
    const view = viewFor(t, this.settings);
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
        this.update(t, true);
        break;
      case "not-slop":
        t.letThrough = "not-slop";
        this.setNotSlop(t, true, true);
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
          this.setNotSlop(t, false, true);
          void this.send({ type: "not-slop", id: t.post.id, notSlop: false });
        }
        t.letThrough = undefined;
        break;
    }
  }

  private setNotSlop(t: Tracked, notSlop: boolean, fresh: boolean) {
    t.notSlop = notSlop;
    this.update(t, fresh);
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
          if (t && this.wantsRequest(t) && this.isNear(el)) void this.request(t);
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
        if (message.notSlop && t.verdict) t.letThrough = "not-slop";
        if (!message.notSlop && t.letThrough === "not-slop") t.letThrough = undefined;
        this.setNotSlop(t, message.notSlop, false);
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

  private checkedPost(t: Tracked): CheckedPost {
    const { post } = t;
    return {
      ...this.judged(t),
      id: post.id,
      url: post.url,
      name: post.author.name,
      avatar: t.avatar,
      text: post.text.slice(0, 600),
      at: t.checkedAt!,
    };
  }

  private changed() {
    this.flushTimer ??= setTimeout(() => {
      this.flushTimer = undefined;
      if (this.unsent.size) {
        void this.send({
          type: "checked",
          posts: [...this.unsent].map((t) => this.checkedPost(t)),
        });
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

function handleOf(t: Tracked) {
  return t.post.author.handle.toLowerCase();
}

function hasJudgeableContent(post: Post) {
  return Boolean(post.text || post.images?.length || post.quote || post.link || post.readerNote);
}

function priorityOf(el: Element): Priority {
  const rect = el.getBoundingClientRect();
  return rect.bottom > 0 && rect.top < innerHeight ? 0 : 1;
}

function viewFor(t: Tracked, settings: Settings): View {
  const { verdict, post, letThrough } = t;
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
