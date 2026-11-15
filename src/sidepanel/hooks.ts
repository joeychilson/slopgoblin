import { useEffect, useState } from "preact/hooks";
import { CHECKED_PREFIX, type CheckedPost } from "../core/checked.ts";
import type { RuntimeMessage, TabMessage, TabState } from "../core/messages.ts";
import { loadSettings, watchSettings, type Settings } from "../core/settings.ts";
import { store, thisMonth, type Stored } from "../core/storage.ts";

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
}

/** The feed state of whichever tab is active in this window, kept live. */
export function useActiveTab() {
  const [tab, setTab] = useState<ActiveTab>();
  useEffect(() => {
    let activeId: number | undefined;

    const refresh = async () => {
      const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
      activeId = active?.id;
      if (activeId === undefined) return setTab(undefined);
      const id = activeId;
      const state = await sendToTab<TabState>(id, { type: "get-tab-state" });
      if (id === activeId) setTab({ id, url: active?.url, state: state ?? null });
    };
    const onMessage = (message: RuntimeMessage, sender: chrome.runtime.MessageSender) => {
      if (message.type !== "tab-state" || sender.tab?.id !== activeId) return;
      setTab((tab) => tab && { ...tab, state: message.state });
    };
    const onUpdated = (tabId: number, info: chrome.tabs.OnUpdatedInfo) => {
      if (tabId === activeId && info.status === "complete") void refresh();
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

/** Re-renders every second while `active`, for countdowns. */
export function useTicker(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}
