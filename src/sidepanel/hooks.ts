import { useEffect, useState } from "preact/hooks";
import {
  STATUS_KEY,
  type RuntimeMessage,
  type ServiceStatus,
  type TabMessage,
  type TabState,
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
