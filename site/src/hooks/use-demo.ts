import { hiddenAmong } from "@slopgoblin/extension/core/checked.ts";
import { judge, type Verdict } from "@slopgoblin/extension/core/policy.ts";
import { DEFAULT_SETTINGS, type Settings } from "@slopgoblin/extension/core/settings.ts";
import type { Host } from "@slopgoblin/extension/sidepanel/host.ts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { type DemoPost, posts } from "@/lib/demo";

/** How long the goblin takes over each post. */
const READ_MS = 260;
/** How long it waits before the first, so it has climbed up by then. */
const START_MS = 900;

export type BarAction = "reveal" | "hide" | "not-slop" | "trust" | "undo";
type LetThrough = "not-slop" | "trust";

/**
 * How a post shows in the feed, as `View` in the extension's `content/bar.ts`. Every state but
 * `shown` keeps a verdict, so a bar has its words while it folds away.
 */
export type PostView =
  | { mode: "shown"; verdict?: Verdict }
  | { mode: "collapsed"; verdict: Verdict }
  | { mode: "revealed"; verdict: Verdict; peek: boolean }
  | { mode: "confirmed"; verdict: Verdict; action: LetThrough };

/** The widest the goblin would ever judge a post, for its words while its bar folds away. */
const STRICTEST: Settings = { ...DEFAULT_SETTINGS, strictness: "strict" };

/**
 * The extension at work on the demo feed: the posts the goblin has read, the reader's settings and
 * what they let through. The feed and the side panel share it, so either one changes both.
 */
export function useDemo() {
  const [read, setRead] = useState(0);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [notSlop, setNotSlop] = useState<ReadonlySet<string>>(new Set());
  const [revealed, setRevealed] = useState<ReadonlySet<string>>(new Set());
  const [confirmed, setConfirmed] = useState<ReadonlyMap<string, LetThrough>>(new Map());
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const started = useRef(false);

  useEffect(() => () => clearTimeout(timer.current), []);

  /** Sends the goblin through the feed, once. */
  const start = useCallback(() => {
    if (started.current) return;
    started.current = true;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setRead(posts.length);
      return;
    }
    let n = 0;
    const next = () => {
      setRead(++n);
      if (n < posts.length) timer.current = setTimeout(next, READ_MS);
    };
    timer.current = setTimeout(next, START_MS);
  }, []);

  const checked = useMemo(
    () => posts.slice(0, read).map((post) => ({ ...post, notSlop: notSlop.has(post.id) })),
    [read, notSlop],
  );
  const hidden = useMemo(() => hiddenAmong(checked, settings), [checked, settings]);
  const verdicts = useMemo(
    () => new Map(hidden.map(({ post, verdict }) => [post.id, verdict])),
    [hidden],
  );

  const update = useCallback(
    (patch: (s: Settings) => Partial<Settings>) => setSettings((s) => ({ ...s, ...patch(s) })),
    [],
  );
  const markNotSlop = useCallback((id: string, on: boolean) => {
    setNotSlop((set) => {
      const next = new Set(set);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  const reveal = useCallback((id: string, on: boolean) => {
    setRevealed((set) => {
      const next = new Set(set);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const host = useMemo<Host>(
    () => ({
      updateSettings: update,
      setNotSlop: markNotSlop,
      showInFeed: (post) => {
        reveal(post.id, true);
        document.getElementById("feed")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      },
      // The demo's tab always has the goblin running in it.
      reloadTab: () => {},
      openX: () => window.open("https://x.com/home"),
    }),
    [update, markNotSlop, reveal],
  );

  const viewOf = (post: DemoPost, i: number): PostView => {
    if (i >= read) return { mode: "shown" };
    const verdict = verdicts.get(post.id);
    const words = verdict ?? judge({ ...post, notSlop: false }, STRICTEST) ?? undefined;
    const action = confirmed.get(post.id);
    if (action && words) return { mode: "confirmed", verdict: words, action };
    if (!verdict) return { mode: "shown", verdict: words };
    if (settings.peek) return { mode: "revealed", verdict, peek: true };
    if (revealed.has(post.id)) return { mode: "revealed", verdict, peek: false };
    return { mode: "collapsed", verdict };
  };

  const act = (post: DemoPost, action: BarAction) => {
    const handle = post.handle.toLowerCase();
    switch (action) {
      case "reveal":
      case "hide":
        reveal(post.id, action === "reveal");
        return;
      case "not-slop":
        markNotSlop(post.id, true);
        setConfirmed((c) => new Map(c).set(post.id, action));
        return;
      case "trust":
        update((s) => ({ trusted: [...new Set([...s.trusted, handle])] }));
        setConfirmed((c) => new Map(c).set(post.id, action));
        return;
      case "undo":
        if (confirmed.get(post.id) === "trust") {
          update((s) => ({ trusted: s.trusted.filter((h) => h !== handle) }));
        } else {
          markNotSlop(post.id, false);
        }
        setConfirmed((c) => {
          const next = new Map(c);
          next.delete(post.id);
          return next;
        });
        reveal(post.id, false);
    }
  };

  return {
    settings,
    checked,
    hidden,
    host,
    /** Posts the goblin hasn't got to yet. */
    pending: posts.length - read,
    viewOf,
    act,
    start,
  };
}

export type Demo = ReturnType<typeof useDemo>;
