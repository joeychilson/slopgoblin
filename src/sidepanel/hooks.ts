import { useEffect, useState } from "preact/hooks";
import {
  STATUS_KEY,
  THEME_KEY,
  USAGE_KEY,
  type RuntimeMessage,
  type ServiceStatus,
  type SiteTheme,
  type TabMessage,
  type TabState,
  type Usage,
} from "../core/messages.ts";
import {
  loadApiKey,
  loadSettings,
  watchApiKey,
  watchSettings,
  watchStorage,
  type Settings,
} from "../core/settings.ts";

export function useSettings() {
  const [settings, setSettings] = useState<Settings>();
  useEffect(() => {
    void loadSettings().then(setSettings);
    return watchSettings(setSettings);
  }, []);
  return settings;
}

/** `undefined` while loading, `null` when no key is saved. */
export function useApiKey() {
  const [key, setKey] = useState<string | null>();
  useEffect(() => {
    void loadApiKey().then((k) => setKey(k ?? null));
    return watchApiKey((k) => setKey(k ?? null));
  }, []);
  return key;
}

export function useStatus() {
  const [status, setStatus] = useState<ServiceStatus>({ kind: "ok" });
  useEffect(() => {
    void chrome.storage.session.get(STATUS_KEY).then((stored) => {
      if (stored[STATUS_KEY]) setStatus(stored[STATUS_KEY] as ServiceStatus);
    });
    return watchStorage<ServiceStatus>("session", STATUS_KEY, (next) => next && setStatus(next));
  }, []);
  return status;
}

/** This month's checking, or undefined before anything has been checked. */
export function useUsage() {
  const [usage, setUsage] = useState<Usage>();
  useEffect(() => {
    const month = new Date().toISOString().slice(0, 7);
    const show = (stored: Usage | undefined) =>
      setUsage(stored?.month === month ? stored : undefined);
    void chrome.storage.local.get(USAGE_KEY).then((stored) => show(stored[USAGE_KEY] as Usage));
    return watchStorage<Usage>("local", USAGE_KEY, show);
  }, []);
  return usage;
}

/** Dresses the panel in the same light, dim or dark as the site, once a page has said which. */
export function useSiteTheme() {
  useEffect(() => {
    const apply = (theme: SiteTheme | undefined) => {
      if (theme) document.documentElement.dataset.theme = theme;
      else delete document.documentElement.dataset.theme;
    };
    void chrome.storage.local
      .get(THEME_KEY)
      .then((stored) => apply(stored[THEME_KEY] as SiteTheme | undefined));
    return watchStorage<SiteTheme>("local", THEME_KEY, apply);
  }, []);
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
