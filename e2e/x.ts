/**
 * The built extension in headless Chromium, on a page shaped like X's timeline as far as
 * `src/sites/x.ts` reads it. X's API, its images and the Decisions API are mocked. A post's text
 * carries the answer the mock API gives: "[ragebait .9]" is ragebait 0.9; anything else is fine.
 */
import { fileURLToPath } from "node:url";
import { chromium, type BrowserContext, type Route, type Worker } from "playwright";

export interface MockPost {
  id: string;
  handle: string;
  name: string;
  text: string;
  ad?: boolean;
  /** A community note under it. */
  note?: string;
  /** Joined by a line to the reply under it. */
  thread?: boolean;
  /** What X shows under it, from its data. */
  label?: keyof typeof DISCLOSURES;
}

const DIST = fileURLToPath(new URL("../dist", import.meta.url));

/** How X's data says what it labels a post. */
const DISCLOSURES = {
  "Paid partnership": { advertising_disclosure: { is_paid_promotion: true } },
  "Made with AI": { ai_generated_disclosure: { has_ai_generated_media: true } },
};

/** What X's API tells its own page: whom the reader follows, and which posts it labels. */
const apiData = (posts: MockPost[]) => ({
  data: {
    users: ["friend", "brand"].map((handle) => ({
      __typename: "User",
      core: { screen_name: handle },
      relationship_perspectives: { following: true },
    })),
    tweets: posts.flatMap(({ id, label }) =>
      label ? [{ __typename: "Tweet", rest_id: id, content_disclosure: DISCLOSURES[label] }] : [],
    ),
  },
});

const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

export function cell({ id, handle, name, text, ad, note, thread }: MockPost) {
  const time = ad ? "" : `<a href="/${handle}/status/${id}"><time>1h</time></a>`;
  const noted = note
    ? `<div data-testid="birdwatch-pivot"><span>Readers added context</span><div dir="ltr">${note}</div></div>`
    : "";
  const article = `<article data-testid="tweet" tabindex="0"><div style="display:flex;gap:12px;padding:12px">
    <div><div data-testid="Tweet-User-Avatar"><img src="https://pbs.twimg.com/profile_images/${handle}/a.jpg"></div>${thread ? "<div></div>" : ""}</div>
    <div><div data-testid="User-Name"><a href="/${handle}">${name}</a> <a href="/${handle}">@${handle}</a> ${time}</div>
    <div data-testid="tweetText" lang="en">${text}</div>${noted}</div>
  </div></article>`;
  const body = ad ? `<div data-testid="placementTracking">${article}</div>` : article;
  return `<div data-testid="cellInnerDiv">${body}</div>`;
}

/** The reader is @me. Only /home has posts. */
function page(posts: MockPost[]) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>X</title></head><body>
    <nav><a data-testid="AppTabBar_Profile_Link" href="/me">Profile</a></nav>
    <main aria-label="Timeline">${posts.map(cell).join("")}</main>
    <script>
      const xhr = new XMLHttpRequest();
      xhr.open("GET", "https://x.com/i/api/graphql/abc/HomeTimeline");
      xhr.send();
    </script>
  </body></html>`;
}

export async function launch(posts: MockPost[], api?: (route: Route) => Promise<void>) {
  const ctx = await chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: true,
    // Tall enough that no post is above the fold, where a verdict waits for the next render.
    viewport: { width: 1000, height: 1600 },
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  });
  /** The text of each post sent to the Decisions API. */
  const sent: string[] = [];
  await ctx.route("https://x.com/i/api/**", (route) => route.fulfill({ json: apiData(posts) }));
  await ctx.route(/^https:\/\/x\.com\/(?!i\/api)/, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: page(new URL(route.request().url()).pathname === "/home" ? posts : []),
    }),
  );
  await ctx.route("https://pbs.twimg.com/**", (route) =>
    route.fulfill({ contentType: "image/png", body: PIXEL }),
  );
  await ctx.route("https://generativelanguage.googleapis.com/**", (route) => {
    const text: string = route.request().postDataJSON().input[0].text;
    sent.push(text);
    if (api) return api(route);
    const probabilities: Record<string, number> = {};
    for (const [, id, p] of text.matchAll(/\[(\w+) (\.\d+)\]/g)) probabilities[id!] = Number(p);
    probabilities.fine = 1 - Object.values(probabilities).reduce((sum, p) => sum + p, 0);
    return route.fulfill({ json: { answers: { kind: { probabilities } } } });
  });

  const errors: string[] = [];
  ctx.on("weberror", (error) => errors.push(String(error.error())));
  const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"));
  await sw.evaluate(() => chrome.storage.local.set({ apiKey: "test-key" }));
  return { ctx, sw, sent, errors, extension: new URL(sw.url()).host };
}

/** The reader's settings, changed first as the side panel would when there's a `patch`. */
export function settings(sw: Worker, patch?: object) {
  return sw.evaluate(async (patch) => {
    let { settings } = (await chrome.storage.sync.get("settings")) as { settings?: object };
    if (patch) await chrome.storage.sync.set({ settings: (settings = { ...settings, ...patch }) });
    return { trusted: [], ...settings } as { trusted: string[] };
  }, patch);
}

/** The side panel, in a tab of its own, taking the first X tab as the active one. */
export async function openPanel(ctx: BrowserContext, extension: string) {
  const panel = await ctx.newPage();
  await panel.setViewportSize({ width: 360, height: 900 });
  await panel.addInitScript(() => {
    const query = chrome.tabs.query.bind(chrome.tabs);
    chrome.tabs.query = async (info: chrome.tabs.QueryInfo) =>
      info.active ? (await query({ url: "https://x.com/*" })).slice(0, 1) : query(info);
  });
  await panel.goto(`chrome-extension://${extension}/sidepanel/index.html`);
  return panel;
}
