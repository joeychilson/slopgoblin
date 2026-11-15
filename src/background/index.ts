import type { ClassifyResponse, RuntimeMessage } from "../core/messages.ts";
import { loadApiKey, updateSettings, watchApiKey } from "../core/settings.ts";
import { prune } from "./cache.ts";
import { classify, setApiKey, setNotSlop } from "./classifier.ts";

void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
void chrome.action.setBadgeBackgroundColor({ color: "#4f731a" });
void chrome.action.setBadgeTextColor({ color: "#ffffff" });

const keyLoaded = loadApiKey().then((key) => setApiKey(key, false));
watchApiKey((key) => setApiKey(key, true));
void prune();

chrome.runtime.onMessage.addListener((message: RuntimeMessage, sender, sendResponse) => {
  switch (message.type) {
    case "classify":
      keyLoaded
        .then(() => classify(message.post, message.cachedOnly))
        .then(sendResponse, (error: unknown) => {
          console.error("Slop Goblin:", error);
          sendResponse({ unavailable: true } satisfies ClassifyResponse);
        });
      return true;
    case "not-slop":
      void setNotSlop(message.id, message.notSlop);
      return false;
    case "tab-state": {
      const tabId = sender.tab?.id;
      const count = message.state.hidden.length;
      if (tabId !== undefined)
        void chrome.action.setBadgeText({ tabId, text: count ? String(count) : "" });
      return false;
    }
  }
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-peek") void updateSettings((s) => ({ peek: !s.peek }));
});
