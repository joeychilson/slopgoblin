import type { Scores } from "../core/decisions.ts";
import type { ClassifyResponse, RuntimeMessage, TabMessage, TabState } from "../core/messages.ts";
import { judge, type Verdict } from "../core/policy.ts";
import type { Post } from "../core/post.ts";
import { updateSettings, watchSettings, type Settings } from "../core/settings.ts";
import { CATEGORIES, STRICTNESS, type Strictness } from "../core/taxonomy.ts";
import type { SiteAdapter } from "../sites/site.ts";
import { renderCell, type BarAction, type View } from "./bar.ts";

const RETRY_MS = 20_000;
/** X fills in a post's media a moment after it mounts, occasionally over a second later. */
const SETTLE_MS = 1000;
/** Marks each post element with its post's id. X discards elements constantly, so none are kept. */
const ID_ATTR = "data-sg-post";

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
  hiddenAt: number;
}

/** Watches the page for posts, gets them judged, and keeps their elements in sync with the verdicts. */
export function startFeed(site: SiteAdapter, initialSettings: Settings) {
  let settings = initialSettings;
  const posts = new Map<string, Tracked>();
  const seen = new WeakSet<Element>();
  let readable = 0;
  let unreadable = 0;
  let stateTimer: ReturnType<typeof setTimeout> | undefined;

  // Runs before paint, so remounted posts are hidden again without flashing.
  const observer = new MutationObserver(scan);
  watchSettings(onSettings);
  document.addEventListener("click", onBarClick, true);
  chrome.runtime.onMessage.addListener(onTabMessage);
  observer.observe(document.body, { childList: true, subtree: true });
  scan();

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
      if (site.isFocused(el)) continue;
      el.setAttribute(ID_ATTR, post.id);
      const t = posts.get(post.id) ?? track(post);
      if (wantsRequest(t)) void request(t);
      show(t, el, true);
    }
    if (found) changed();

    // X adds avatars a moment after a post mounts, so bars pick theirs up as they arrive.
    for (const ghost of document.querySelectorAll<HTMLElement>(".sg-ghost:not([style])")) {
      const el = ghost.closest("[data-sg]")?.querySelector(`[${ID_ATTR}]`);
      const src = el && site.avatar(el);
      if (src) ghost.style.backgroundImage = `url(${JSON.stringify(src)})`;
    }
  }

  function track(post: Post): Tracked {
    const t: Tracked = {
      post,
      status: post.isAd ? "done" : "idle",
      scores: {},
      notSlop: false,
      revealed: false,
      verdict: null,
      hiddenAt: 0,
    };
    posts.set(post.id, t);
    if (post.isAd) rejudge(t);
    return t;
  }

  function onSettings(next: Settings) {
    settings = next;
    for (const t of posts.values()) rejudge(t);
    for (const el of document.querySelectorAll(`[${ID_ATTR}]`)) {
      const t = posts.get(el.getAttribute(ID_ATTR) ?? "");
      if (!t) continue;
      if (wantsRequest(t)) void request(t);
      show(t, el, true);
    }
    changed();
  }

  /** Nothing is sent for posts no setting could hide: that's the cheapest request there is. */
  function wantsRequest(t: Tracked) {
    if (t.status !== "idle" && t.status !== "failed") return false;
    if (!settings.enabled || t.post.isAd || settings.trusted.includes(handleOf(t))) return false;
    return CATEGORIES.some((c) => "describes" in c && settings.categories[c.id]);
  }

  async function request(t: Tracked) {
    t.status = "pending";
    changed();
    // Cached scores come back straight away. A post that still needs judging gets a moment to
    // finish rendering first, then is read again.
    let res = await classify(t.post, true);
    if ("uncached" in res) {
      await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
      const el = elementsOf(t)[0];
      // Scrolled past and unmounted already, or switched off: it's judged if it comes back.
      if (!el || !settings.enabled) {
        t.status = "idle";
        changed();
        return;
      }
      t.post = site.readPost(el) ?? t.post;
      res = await classify(t.post, false);
    }

    if ("scores" in res) {
      t.status = "done";
      t.scores = res.scores;
      t.notSlop ||= res.notSlop;
      update(t, false);
    } else {
      t.status = "failed";
      setTimeout(() => {
        if (wantsRequest(t) && elementsOf(t).length) void request(t);
      }, RETRY_MS);
    }
    changed();
  }

  async function classify(post: Post, cachedOnly: boolean): Promise<ClassifyResponse> {
    const res = await send<ClassifyResponse>({ type: "classify", post, cachedOnly });
    return res ?? { unavailable: true };
  }

  function rejudge(t: Tracked) {
    const verdict = verdictAt(t, settings.strictness);
    if (verdict && !t.verdict) t.hiddenAt = Date.now();
    t.verdict = verdict;
  }

  function verdictAt(t: Tracked, strictness: Strictness) {
    return judge(
      { scores: t.scores, isAd: t.post.isAd, handle: t.post.author.handle, notSlop: t.notSlop },
      { ...settings, strictness },
    );
  }

  function update(t: Tracked, fresh: boolean) {
    rejudge(t);
    for (const el of elementsOf(t)) show(t, el, fresh);
  }

  function elementsOf(t: Tracked) {
    return document.querySelectorAll(`[${ID_ATTR}="${CSS.escape(t.post.id)}"]`);
  }

  /** `fresh` is false when a verdict lands on a post already on screen. */
  function show(t: Tracked, el: Element, fresh: boolean) {
    const cell = site.container(el);
    if (!cell) return;
    const view = viewFor(t);
    // Collapsing a post the reader has scrolled past would yank the page up under them.
    // It gets hidden the next time the site renders it instead.
    if (!fresh && view.mode !== "shown" && cell.getBoundingClientRect().top < 0) return;
    renderCell(cell, view);
  }

  function viewFor(t: Tracked): View {
    const { verdict, post, letThrough } = t;
    if (verdict) {
      const base = {
        id: post.id,
        author: post.author,
        verdict,
        peek: settings.peek && !t.revealed,
      };
      if (settings.peek || t.revealed) return { ...base, mode: "revealed" };
      return settings.hideMode === "remove" ? { mode: "removed" } : { ...base, mode: "collapsed" };
    }
    // The confirmation lasts as long as what it confirms.
    const holds =
      letThrough === "trust"
        ? settings.trusted.includes(handleOf(t))
        : letThrough === "not-slop" && t.notSlop;
    return settings.enabled && letThrough && holds
      ? { mode: "confirmed", id: post.id, author: post.author, action: letThrough }
      : { mode: "shown" };
  }

  function onBarClick(event: MouseEvent) {
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
        setNotSlop(t, true);
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
          setNotSlop(t, false);
        }
        break;
    }
  }

  function setNotSlop(t: Tracked, notSlop: boolean) {
    t.notSlop = notSlop;
    update(t, true);
    void send({ type: "not-slop", id: t.post.id, notSlop });
    changed();
  }

  const handleOf = (t: Tracked) => t.post.author.handle.toLowerCase();

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
      case "not-slop": {
        const t = posts.get(message.id);
        if (t) act(t, "not-slop");
        break;
      }
    }
    return false;
  }

  function tabState(): TabState {
    const all = [...posts.values()];
    const judged = all.filter((t) => t.status === "done");
    return {
      checked: judged.length,
      pending: all.filter((t) => t.status === "pending").length,
      hidden: all
        .sort((a, b) => b.hiddenAt - a.hiddenAt)
        .flatMap(({ post, verdict }) =>
          verdict
            ? [
                {
                  id: post.id,
                  url: post.url,
                  handle: post.author.handle,
                  text: post.text.slice(0, 600),
                  category: verdict.category,
                  score: verdict.score,
                },
              ]
            : [],
        ),
      hiddenAt: Object.fromEntries(
        STRICTNESS.map((s) => [s, judged.filter((t) => verdictAt(t, s)).length]),
      ) as Record<Strictness, number>,
      broken: unreadable >= 5 && unreadable > readable,
    };
  }

  function changed() {
    stateTimer ??= setTimeout(() => {
      stateTimer = undefined;
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
    observer.disconnect();
    document.removeEventListener("click", onBarClick, true);
    for (const cell of document.querySelectorAll<HTMLElement>("[data-sg]")) {
      renderCell(cell, { mode: "shown" });
    }
  }
}
