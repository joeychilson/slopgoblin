import {
  letThroughFromPanel,
  step,
  viewFor,
  type BarAction,
  type PostState,
  type View,
} from "@slopgoblin/extension/content/view.ts";
import { hiddenAmong, type CheckedPost } from "@slopgoblin/extension/core/checked.ts";
import { DEFAULT_SETTINGS, trusting, type Settings } from "@slopgoblin/extension/core/settings.ts";
import type { Host } from "@slopgoblin/extension/sidepanel/host.ts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { type DemoPost, posts } from "@/lib/demo";

/** How long the goblin takes over each post. */
const READ_MS = 260;
/** How long it waits before the first, so it has climbed up by then. */
const START_MS = 900;

/** A post the goblin hasn't read yet shows as it is. */
const UNREAD: View = { mode: "shown" };

/** What the reader has done to a post in the feed. */
type Done = Pick<PostState, "revealed" | "letThrough">;

/** A post as the extension's feed keeps it. */
const stateOf = (post: CheckedPost, done: Done | undefined): PostState => ({
  post: { id: post.id, author: { name: post.name, handle: post.handle } },
  revealed: done?.revealed ?? false,
  letThrough: done?.letThrough,
});

/**
 * The extension at work on the demo feed: the posts the goblin has read, the reader's settings and
 * what they let through. The feed and the side panel share it, so either one changes both, by the
 * same rules as in X.
 */
export function useDemo() {
  const [read, setRead] = useState(0);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [notSlop, setNotSlop] = useState<ReadonlySet<string>>(new Set());
  const [done, setDone] = useState<ReadonlyMap<string, Done>>(new Map());
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
  const views = useMemo(() => {
    const verdicts = new Map(hidden.map(({ post, verdict }) => [post.id, verdict]));
    return new Map(
      checked.map((post) => [
        post.id,
        viewFor(stateOf(post, done.get(post.id)), verdicts.get(post.id) ?? null, settings),
      ]),
    );
  }, [checked, hidden, done, settings]);

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

  const host = useMemo<Host>(
    () => ({
      updateSettings: update,
      setNotSlop: (id, on) => {
        const isHidden = hidden.some(({ post }) => post.id === id);
        markNotSlop(id, on);
        setDone((all) => {
          const was = all.get(id);
          const letThrough = letThroughFromPanel(was?.letThrough, on, isHidden);
          return new Map(all).set(id, { revealed: was?.revealed ?? false, letThrough });
        });
      },
      showInFeed: (post) => {
        setDone((all) => {
          const { revealed, letThrough } = step(stateOf(post, all.get(post.id)), "reveal");
          return new Map(all).set(post.id, { revealed, letThrough });
        });
        document
          .getElementById(`post-${post.id}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      },
    }),
    [update, markNotSlop, hidden],
  );

  const act = (post: DemoPost, action: BarAction) => {
    const next = step(stateOf(post, done.get(post.id)), action);
    setDone((all) =>
      new Map(all).set(post.id, { revealed: next.revealed, letThrough: next.letThrough }),
    );
    if (next.trust !== undefined) update(trusting(post.handle, next.trust));
    if (next.notSlop !== undefined) markNotSlop(post.id, next.notSlop);
  };

  return {
    settings,
    checked,
    hidden,
    host,
    /** Posts the goblin hasn't got to yet. */
    pending: posts.length - read,
    viewOf: (post: DemoPost) => views.get(post.id) ?? UNREAD,
    act,
    start,
  };
}

export type Demo = ReturnType<typeof useDemo>;
