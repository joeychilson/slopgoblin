import { useEffect, useMemo, useState } from "react";
import { CHECKED_PREFIX, type CheckedPost } from "../core/checked.ts";
import type { RuntimeMessage, TabMessage, TabState } from "../core/messages.ts";
import { loadSettings, updateSettings, watchSettings, type Settings } from "../core/settings.ts";
import { store, thisMonth, type Stored } from "../core/storage.ts";
import type { Host } from "./host.ts";

export function useSettings() {
  const [settings, setSettings] = useState<Settings>();
  useEffect(() => {
    void loadSettings().then(setSettings);
    return watchSettings(setSettings);
  }, []);
  return settings;
}

/** A stored value, kept live: `undefined` while it loads, `null` when there's none. */
function useStored<T>(item: Stored<T>): T | null | undefined {
  const [value, setValue] = useState<T | null>();
  useEffect(() => {
    let changed = false;
    void item.get().then((saved) => changed || setValue(saved ?? null));
    return item.watch((next) => {
      changed = true;
      setValue(next ?? null);
    });
  }, [item]);
  return value;
}

export const useApiKey = () => useStored(store.apiKey);

export const useStatus = () => useStored(store.status) ?? { kind: "ok" as const };

/** This month's checking, or nothing before anything has been checked. */
export function useUsage() {
  const usage = useStored(store.usage);
  return usage?.month === thisMonth() ? usage : undefined;
}

/** Every post checked since Chrome started, in any tab, newest first and kept live. Undefined while loading. */
export function useChecked() {
  const [checked, setChecked] = useState<CheckedPost[]>();
  useEffect(() => {
    const posts = new Map<string, CheckedPost>();
    /** Posts added or dropped while the list loaded: what it read of them is out of date. */
    const changed = new Set<string>();
    let loaded = false;
    const publish = () => loaded && setChecked([...posts.values()].sort((a, b) => b.at - a.at));

    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== "session") return;
      let touched = false;
      for (const [key, { newValue }] of Object.entries(changes)) {
        if (!key.startsWith(CHECKED_PREFIX)) continue;
        touched = true;
        if (!loaded) changed.add(key);
        if (newValue) posts.set(key, newValue as CheckedPost);
        else posts.delete(key);
      }
      if (touched) publish();
    };
    chrome.storage.onChanged.addListener(onChanged);
    void chrome.storage.session.get(null).then((all) => {
      for (const [key, value] of Object.entries(all)) {
        if (key.startsWith(CHECKED_PREFIX) && !changed.has(key)) {
          posts.set(key, value as CheckedPost);
        }
      }
      loaded = true;
      publish();
    });
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, []);
  return checked;
}

/** Dresses the panel in the same light, dim or dark as the site, once a page has said which. */
export function useSiteTheme() {
  const theme = useStored(store.siteTheme);
  useEffect(() => {
    if (theme) document.documentElement.dataset.theme = theme;
    else delete document.documentElement.dataset.theme;
  }, [theme]);
}

export interface ActiveTab {
  id: number;
  /** Only known for sites Slop Goblin runs on. */
  url?: string;
  /** Null when Slop Goblin isn't running in the tab. */
  state: TabState | null;
  /** True while the tab is mid-navigation, before its content script has had a chance to run. */
  loading?: boolean;
}

/** The feed state of whichever tab is active in this window, kept live. Undefined while loading, null when none. */
export function useActiveTab() {
  const [tab, setTab] = useState<ActiveTab | null>();
  useEffect(() => {
    let activeId: number | undefined;
    let seq = 0;

    const refresh = async () => {
      const call = ++seq;
      const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (call !== seq) return;
      activeId = active?.id;
      if (activeId === undefined) return setTab(null);
      const state = await sendToTab<TabState>(activeId, { type: "get-tab-state" });
      if (call === seq) {
        setTab({
          id: activeId,
          url: active?.url,
          state: state ?? null,
          loading: active?.status === "loading",
        });
      }
    };
    const onMessage = (message: RuntimeMessage, sender: chrome.runtime.MessageSender) => {
      if (message.type !== "tab-state" || sender.tab?.id !== activeId) return;
      setTab((tab) =>
        tab && tab.id === activeId ? { ...tab, state: message.state, loading: false } : tab,
      );
    };
    const onUpdated = (
      tabId: number,
      info: chrome.tabs.OnUpdatedInfo,
      updated: chrome.tabs.Tab,
    ) => {
      if (tabId !== activeId) return;
      if (info.status === "loading") {
        seq++;
        setTab({ id: tabId, url: updated.url, state: null, loading: true });
      } else if (info.status === "complete") {
        void refresh();
      }
    };

    void refresh();
    chrome.tabs.onActivated.addListener(refresh);
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.runtime.onMessage.addListener(onMessage);
    return () => {
      chrome.tabs.onActivated.removeListener(refresh);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.runtime.onMessage.removeListener(onMessage);
    };
  }, []);
  return tab;
}

/** Resolves to undefined when Slop Goblin isn't running in the tab. */
export function sendToTab<T>(tabId: number, message: TabMessage): Promise<T | undefined> {
  return chrome.tabs.sendMessage<TabMessage, T>(tabId, message).catch(() => undefined);
}

/** The time, with a re-render every second until `until`, for countdowns. */
export function useTicker(until: number) {
  const [, setTicks] = useState(0);
  const now = Date.now();
  const active = until > now;
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setTicks((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [active]);
  // Read on each render, so a countdown that starts while the panel is open starts right.
  return now;
}

/** The panel's host in the extension: settings in Chrome's storage, posts in the reader's tabs. */
export function useChromeHost(tab: ActiveTab | null | undefined): Host {
  const peekShortcut = useShortcut("toggle-peek");
  // Only a tab Slop Goblin runs in can show a post in place.
  const tabId = tab?.state ? tab.id : undefined;
  return useMemo(
    () => ({
      updateSettings: (patch) => void updateSettings(patch),
      setNotSlop: (id, notSlop) =>
        void chrome.runtime.sendMessage<RuntimeMessage>({ type: "not-slop", id, notSlop }),
      showInFeed: async (post) => {
        const found =
          tabId !== undefined && (await sendToTab<boolean>(tabId, { type: "reveal", id: post.id }));
        if (!found) await chrome.tabs.create({ url: post.url });
      },
      reloadTab: (id) => void chrome.tabs.reload(id),
      openX: () => void chrome.tabs.create({ url: "https://x.com/home" }),
      peekShortcut,
    }),
    [tabId, peekShortcut],
  );
}

function useShortcut(name: string) {
  const [shortcut, setShortcut] = useState<string>();
  useEffect(() => {
    void chrome.commands.getAll().then((commands) => {
      setShortcut(commands.find((c) => c.name === name)?.shortcut || undefined);
    });
  }, [name]);
  return shortcut;
}
