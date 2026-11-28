import type { ClassifyResponse, RuntimeMessage, TabMessage } from "../core/messages.ts";
import { updateSettings } from "../core/settings.ts";
import { store } from "../core/storage.ts";
import { startBadge } from "./badge.ts";
import { prune } from "./cache.ts";
import { recordChecked, updateChecked } from "./checked.ts";
import { classify, prioritize, restoreApiKey, setApiKey, setNotSlop } from "./classifier.ts";

void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
startBadge();

let keyWatched = false;
const keyLoaded = Promise.all([store.apiKey.get(), store.status.get()]).then(([key, status]) => {
  if (!keyWatched) restoreApiKey(key, status);
});
store.apiKey.watch((key) => {
  keyWatched = true;
  setApiKey(key);
  if (key) void tellTabs({ type: "retry" }, undefined);
});
void prune();

/** Where the content scripts run, from the manifest. */
const SITE_URLS = [
  ...new Set(chrome.runtime.getManifest().content_scripts?.flatMap((s) => s.matches ?? [])),
];

chrome.runtime.onMessage.addListener((message: RuntimeMessage, sender, sendResponse) => {
  switch (message.type) {
    case "classify":
      keyLoaded
        .then(() => classify(message.post, message.cachedOnly, message.priority))
        .then(sendResponse, (error: unknown) => {
          console.error("Slop Goblin:", error);
          sendResponse({ unavailable: true } satisfies ClassifyResponse);
        });
      return true;
    case "prioritize":
      prioritize(message.ids);
      return false;
    case "checked":
      void recordChecked(message.posts);
      return false;
    case "not-slop":
      void letThrough(message.id, message.notSlop, sender.tab?.id);
      return false;
    case "tab-state":
      // For the side panel.
      return false;
  }
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-peek") void updateSettings((s) => ({ peek: !s.peek }));
});

/**
 * A post let through, or put back, from its bar or the side panel. It's kept with the post's
 * cached answer and in the checked list, and passed on to every other tab with the site open.
 */
async function letThrough(id: string, notSlop: boolean, fromTab: number | undefined) {
  await Promise.all([setNotSlop(id, notSlop), updateChecked(id, { notSlop })]);
  await tellTabs({ type: "not-slop", id, notSlop }, fromTab);
}

async function tellTabs(message: TabMessage, except: number | undefined) {
  const tabs = await chrome.tabs.query({ url: SITE_URLS });
  const ids = tabs.flatMap(({ id }) => (id === undefined || id === except ? [] : [id]));
  // Tabs opened before the extension was installed have no content script to answer.
  await Promise.all(ids.map((id) => chrome.tabs.sendMessage(id, message).catch(() => {})));
}
