import type { CheckedPost } from "../core/checked.ts";
import { addsContext, type Scores } from "../core/decisions.ts";
import type { ClassifyResponse, RuntimeMessage, TabMessage, TabState } from "../core/messages.ts";
import { judge, needsScores, type Judged, type Verdict } from "../core/policy.ts";
import { isReply, type Label, type Post } from "../core/post.ts";
import { updateSettings, watchSettings, type Settings } from "../core/settings.ts";
import type { SiteAdapter, SiteData } from "../sites/site.ts";
import { renderCell, type BarAction, type View } from "./bar.ts";

const RETRY_MS = 20_000;
/** X fills in a post's media a moment after it mounts, occasionally over a second later. */
const SETTLE_MS = 1000;
/** Marks each post element with its post's id. X discards elements constantly, so none are kept. */
const ID_ATTR = "data-sg-post";
/**
 * X tabs stay open for days. Past this many posts, those no longer on the page are forgotten;
 * their answers stay cached in the service worker.
 */
const KEEP = 2000;

interface Tracked {
  post: Post;
  /** "idle" while filtering is switched off: nothing is sent until it's back on. */
  status: "idle" | "pending" | "done" | "failed";
  scores: Scores;
  notSlop: boolean;
  revealed: boolean;
  /** Set when the reader lets the post through from its bar, which then confirms it. */
  letThrough?: "not-slop" | "trust";
  verdict: Verdict | null;
  /** When it was first judged, or found with a label. From then on it's in the side panel's list. */
  checkedAt?: number;
  /** X fills it in a moment after the post mounts. Kept for the list, which outlives the element. */
  avatar?: string;
}

/** Watches the page for posts, gets them judged, and keeps their elements in sync with the verdicts. */
export function startFeed(site: SiteAdapter, initialSettings: Settings) {
  let settings = initialSettings;
  const posts = new Map<string, Tracked>();
  /** Lowercase handles, as the site reveals whether the reader follows them. */
  const follows = new Map<string, boolean>();
  /** Post ids, and the labels the site's data gives them. */
  const labels = new Map<string, Label[]>();
  const seen = new WeakSet<Element>();
  /** Checked posts whose entry in the side panel's list is out of date. */
  const unsent = new Set<Tracked>();
  let readable = 0;
  let unreadable = 0;
  let flushTimer: ReturnType<typeof setTimeout> | undefined;
  /** The extension was reloaded or removed: nothing can be judged or changed any more. */
  let stopped = false;

  // Runs before paint, so remounted posts are hidden again without flashing.
  const observer = new MutationObserver(scan);
  watchSettings(onSettings);
  // Before the first scan, so Google is never asked about posts by people the reader follows, or
  // about posts the site labels.
  site.watchData?.(onData);
  document.addEventListener("click", onBarClick, true);
  chrome.runtime.onMessage.addListener(onTabMessage);
  observer.observe(document.body, { childList: true, subtree: true });
  scan();
  // Tells the side panel this tab is running, before the site has shown a post.
  changed();

  function scan() {
    let found = false;
    for (const el of site.findPosts()) {
      if (seen.has(el)) continue;
      seen.add(el);
      found = true;
      const post = site.readPost(el);
      if (!post) {
        unreadable++;
        continue;
      }
      readable++;
      if (post.author.handle.toLowerCase() === site.viewer()?.toLowerCase()) continue;
      // The post the page is about is never hidden, and one with nothing to fold can't be.
      if (site.isFocused(el) || !site.container(el)) continue;
      el.setAttribute(ID_ATTR, post.id);
      const t = posts.get(post.id) ?? track(post);
      // The post it replies to, or a note, can turn up after the post was first read without it.
      // That can make it worth asking about (a reply, when only replies are filtered), or worth
      // asking again.
      if (addsContext(post, t.post)) {
        t.post = post;
        if (t.status === "done") t.status = "idle";
      }
      if (wantsRequest(t)) void request(t);
      show(t, el, true);
    }
    if (found) changed();

    // X adds avatars a moment after a post mounts, so they're picked up as they arrive.
    for (const el of document.querySelectorAll(`[${ID_ATTR}]`)) {
      const t = posts.get(el.getAttribute(ID_ATTR) ?? "");
      if (!t || t.avatar) continue;
      t.avatar = site.avatar(el);
      if (!t.avatar) continue;
      show(t, el, false);
      touched(t);
    }
  }

  function track(post: Post): Tracked {
    const t: Tracked = {
      post,
      status: "idle",
      scores: {},
      notSlop: false,
      revealed: false,
      verdict: null,
    };
    for (const [id, old] of posts) {
      if (posts.size < KEEP) break;
      if (!elementsOf(old).length) posts.delete(id);
    }
    posts.set(post.id, t);
    rejudge(t);
    return t;
  }

  /** The post has its answer. */
  function checked(t: Tracked) {
    t.status = "done";
    rejudge(t);
    listed(t);
  }

  /** Puts the post in the side panel's list. */
  function listed(t: Tracked) {
    t.checkedAt ??= Date.now();
    touched(t);
  }

  function onSettings(next: Settings) {
    settings = next;
    for (const t of posts.values()) {
      if (t.letThrough === "trust" && !settings.trusted.includes(handleOf(t))) {
        t.letThrough = undefined;
      }
      rejudge(t);
    }
    for (const el of document.querySelectorAll(`[${ID_ATTR}]`)) {
      const t = posts.get(el.getAttribute(ID_ATTR) ?? "");
      if (!t) continue;
      if (wantsRequest(t)) void request(t);
      show(t, el, true);
    }
    changed();
  }

  function onData(data: SiteData) {
    for (const [handle, following] of data.follows) follows.set(handle, following);
    for (const [id, these] of data.labels) labels.set(id, these);
    const handles = new Set(data.follows.map(([handle]) => handle));
    const ids = new Set(data.labels.map(([id]) => id));
    for (const t of posts.values()) {
      if (!handles.has(handleOf(t)) && !ids.has(t.post.id)) continue;
      update(t, false);
      if (wantsRequest(t) && elementsOf(t).length) void request(t);
      touched(t);
    }
  }

  // Helpers are function declarations, not consts: scan() and the follows handshake run at
  // startup, above them, and a const isn't there yet.

  /** What a post's verdict rests on. */
  function judged(t: Tracked): Judged {
    return {
      scores: t.scores,
      labels: labelsOf(t),
      handle: t.post.author.handle,
      notSlop: t.notSlop,
      followed: follows.get(handleOf(t)),
    };
  }

  /** The labels in the post's markup, and any the site's data has given it. */
  function labelsOf(t: Tracked) {
    return [...new Set([...t.post.labels, ...(labels.get(t.post.id) ?? [])])];
  }

  function wantsRequest(t: Tracked) {
    return !stopped && (t.status === "idle" || t.status === "failed") && worthAsking(t);
  }

  function worthAsking(t: Tracked) {
    return needsScores({ ...judged(t), isReply: isReply(t.post) }, settings);
  }

  async function request(t: Tracked) {
    t.status = "pending";
    changed();
    // Cached scores come back straight away. A post that still needs judging gets a moment to
    // finish rendering first, then is read again.
    let asked = t.post;
    let res = await classify(t, true);
    if ("uncached" in res) {
      await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
      const el = elementsOf(t)[0];
      // Scrolled past and unmounted already, or no longer worth asking (switched off, or the
      // site has since said the reader follows its author): it's judged if it comes back.
      if (!el || !worthAsking(t)) {
        t.status = "idle";
        changed();
        return;
      }
      const reread = site.readPost(el);
      if (reread && !addsContext(t.post, reread)) t.post = reread;
      asked = t.post;
      res = await classify(t, false);
    }

    if ("scores" in res) {
      t.scores = res.scores;
      t.notSlop ||= res.notSlop;
      checked(t);
      for (const el of elementsOf(t)) show(t, el, false);
      // More context arrived while this answer was in flight; ask again with it.
      if (addsContext(t.post, asked)) {
        t.status = "idle";
        if (wantsRequest(t) && elementsOf(t).length) void request(t);
      }
    } else {
      t.status = "failed";
      setTimeout(() => {
        if (wantsRequest(t) && elementsOf(t).length) void request(t);
      }, RETRY_MS);
      changed();
    }
  }

  async function classify(t: Tracked, cachedOnly: boolean): Promise<ClassifyResponse> {
    const post: Post = { ...t.post, labels: labelsOf(t) };
    const res = await send<ClassifyResponse>({ type: "classify", post, cachedOnly });
    return res ?? { unavailable: true };
  }

  function rejudge(t: Tracked) {
    t.verdict = judge(judged(t), settings);
  }

  function update(t: Tracked, fresh: boolean) {
    rejudge(t);
    for (const el of elementsOf(t)) show(t, el, fresh);
  }

  function elementsOf(t: Tracked) {
    return document.querySelectorAll(`[${ID_ATTR}="${CSS.escape(t.post.id)}"]`);
  }

  /** `fresh` is false when a change lands on a post already on screen. */
  function show(t: Tracked, el: Element, fresh: boolean) {
    const cell = site.container(el);
    if (!cell || stopped) return;
    if (t.verdict?.labeled && t.checkedAt === undefined) listed(t);
    const view = viewFor(t);
    // Folding or unfolding a post the reader has scrolled past would move the page under them.
    // It changes the next time the site renders it instead; only its bar's words change now.
    const reshapes = view.mode !== (cell.dataset.sg ?? "shown");
    if (!fresh && reshapes && cell.getBoundingClientRect().top < 0) return;
    renderCell(cell, view);
  }

  function viewFor(t: Tracked): View {
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

  function onBarClick(event: MouseEvent) {
    // Only the reader's own clicks: a script in the page could fake a bar and click it.
    if (!event.isTrusted) return;
    const target = (event.target as Element | null)?.closest<HTMLElement>("[data-sg-action]");
    const id = target?.closest<HTMLElement>(".sg-bar")?.dataset.id;
    const t = id && posts.get(id);
    if (!target || !t) return;
    event.preventDefault();
    event.stopPropagation();
    act(t, target.dataset.sgAction as BarAction);
  }

  function act(t: Tracked, action: BarAction) {
    switch (action) {
      case "reveal":
      case "hide":
        t.revealed = action === "reveal";
        update(t, true);
        break;
      case "not-slop":
        t.letThrough = "not-slop";
        setNotSlop(t, true, true);
        void send({ type: "not-slop", id: t.post.id, notSlop: true });
        break;
      case "trust":
        // The settings change re-renders every post by this author.
        t.letThrough = "trust";
        void updateSettings((s) => ({ trusted: [...new Set([...s.trusted, handleOf(t)])] }));
        break;
      case "undo":
        t.revealed = true;
        if (t.letThrough === "trust") {
          void updateSettings((s) => ({ trusted: s.trusted.filter((h) => h !== handleOf(t)) }));
        } else {
          setNotSlop(t, false, true);
          void send({ type: "not-slop", id: t.post.id, notSlop: false });
        }
        t.letThrough = undefined;
        break;
    }
  }

  function setNotSlop(t: Tracked, notSlop: boolean, fresh: boolean) {
    t.notSlop = notSlop;
    update(t, fresh);
  }

  function handleOf(t: Tracked) {
    return t.post.author.handle.toLowerCase();
  }

  function onTabMessage(
    message: TabMessage,
    _: unknown,
    sendResponse: (response: unknown) => void,
  ) {
    switch (message.type) {
      case "get-tab-state":
        sendResponse(tabState());
        break;
      case "reveal": {
        const t = posts.get(message.id);
        const el = t && elementsOf(t)[0];
        if (t && el) {
          act(t, "reveal");
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        sendResponse(Boolean(el));
        break;
      }
      // Let through, or put back, from the side panel or another tab. A post hidden here gets
      // the same confirming line as one let through from its own bar.
      case "not-slop": {
        const t = posts.get(message.id);
        if (!t || t.notSlop === message.notSlop) break;
        if (message.notSlop && t.verdict) t.letThrough = "not-slop";
        if (!message.notSlop && t.letThrough === "not-slop") t.letThrough = undefined;
        setNotSlop(t, message.notSlop, false);
        break;
      }
    }
    return false;
  }

  function tabState(): TabState {
    let pending = 0;
    for (const t of posts.values()) if (t.status === "pending") pending++;
    return { pending, broken: unreadable >= 5 && unreadable > readable };
  }

  /** Puts a checked post's entry in the side panel's list on the next send. */
  function touched(t: Tracked) {
    if (t.checkedAt !== undefined) unsent.add(t);
    changed();
  }

  /** What the side panel's list keeps of a post. Only for checked ones. */
  function checkedPost(t: Tracked): CheckedPost {
    const { post } = t;
    return {
      ...judged(t),
      id: post.id,
      url: post.url,
      name: post.author.name,
      avatar: t.avatar,
      text: post.text.slice(0, 600),
      at: t.checkedAt!,
    };
  }

  /** Sends what changed, a quarter-second's worth at a time. */
  function changed() {
    flushTimer ??= setTimeout(() => {
      flushTimer = undefined;
      if (unsent.size) void send({ type: "checked", posts: [...unsent].map(checkedPost) });
      unsent.clear();
      void send({ type: "tab-state", state: tabState() });
    }, 250);
  }

  /** Resolves to undefined when the extension can't be reached. */
  async function send<T>(message: RuntimeMessage): Promise<T | undefined> {
    // After the extension is reloaded or updated, this orphaned script can no longer reach it.
    if (!chrome.runtime?.id) {
      stop();
      return undefined;
    }
    return chrome.runtime.sendMessage<RuntimeMessage, T>(message).catch(() => undefined);
  }

  /** Puts every post back as the site rendered it, since nothing can be judged or revealed now. */
  function stop() {
    if (stopped) return;
    stopped = true;
    observer.disconnect();
    document.removeEventListener("click", onBarClick, true);
    for (const cell of document.querySelectorAll<HTMLElement>("[data-sg]")) {
      renderCell(cell, { mode: "shown" });
    }
  }
}
