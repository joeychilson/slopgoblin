import { hiddenAmong } from "../core/checked.ts";
import { loadSettings, watchSettings } from "../core/settings.ts";
import { store } from "../core/storage.ts";
import { checkedPosts } from "./checked.ts";

/**
 * The toolbar badge: how many posts the side panel lists as hidden lately, so clicking it shows
 * exactly that many. It's the same in every tab, like the list. Chrome draws the badge at its own
 * size and place; only the text and colors are up to the extension.
 */
export function startBadge() {
  void chrome.action.setBadgeBackgroundColor({ color: "#4f731a" });
  void chrome.action.setBadgeTextColor({ color: "#ffffff" });
  watchSettings(updateBadge);
  store.checked.watch(updateBadge);
  updateBadge();
}

let timer: ReturnType<typeof setTimeout> | undefined;

/** Recounts, a quarter-second's worth of changes at a time. */
function updateBadge() {
  timer ??= setTimeout(() => {
    timer = undefined;
    void show();
  }, 250);
}

async function show() {
  const [posts, settings] = await Promise.all([checkedPosts(), loadSettings()]);
  const count = hiddenAmong(posts, settings).length;
  // Four characters is about all that fits.
  await chrome.action.setBadgeText({ text: count > 99 ? "99+" : count ? String(count) : "" });
  await chrome.action.setTitle({
    title: count ? `Slop Goblin: ${count} hidden lately` : "Slop Goblin",
  });
}
