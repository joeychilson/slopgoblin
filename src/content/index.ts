import { loadSettings } from "../core/settings.ts";
import type { SiteAdapter } from "../sites/site.ts";
import { x } from "../sites/x.ts";
import css from "./content.css?inline";
import { startFeed } from "./feed.ts";

const SITES: Record<string, SiteAdapter> = { "x.com": x };
const site = SITES[location.hostname];

const style = document.createElement("style");
style.textContent = css;
document.head.append(style);

syncTheme();
new MutationObserver(syncTheme).observe(document.body, {
  attributes: true,
  attributeFilter: ["style", "class"],
});

if (site) void loadSettings().then((settings) => startFeed(site, settings));

/** Matches our in-feed UI to the site's light, dim or dark background. */
function syncTheme() {
  const [r = 255, g = 255, b = 255, a = 1] =
    getComputedStyle(document.body)
      .backgroundColor.match(/[\d.]+/g)
      ?.map(Number) ?? [];
  const sum = r + g + b;
  document.documentElement.dataset.sgTheme =
    a === 0 || sum > 384 ? "light" : sum > 30 ? "dim" : "dark";
}
