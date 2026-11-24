// What the unit tests can't see: the content script, the service worker and the side panel
// together, on a mock X page (x.ts). `vp run e2e` builds first.
import type { Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { cell, launch, openPanel, settings, type MockPost } from "./x.ts";

const POSTS: MockPost[] = [
  { id: "101", handle: "alice", name: "Alice", text: "Lovely morning walk with the dog." },
  { id: "102", handle: "rager", name: "Rage Farm", text: "Women are all the same [ragebait .92]" },
  { id: "103", handle: "slopper", name: "Growth Guru", text: "It's not X. It's Y. [ai_slop .8]" },
  { id: "104", handle: "friend", name: "A Friend", text: "Reply YES [engagement_bait .95]" },
  { id: "105", handle: "maybe", name: "Maybe Bait", text: "I didn't know this 😱 [clickbait .55]" },
  { id: "106", handle: "brand", name: "Big Brand", text: "Buy our thing", ad: true },
  { id: "107", handle: "me", name: "Me", text: "My own post [ragebait .99]" },
  { id: "108", handle: "nsfwbot", name: "🔥🔥", text: "Click my link [nsfw .97]" },
  {
    id: "109",
    handle: "noted",
    name: "Noted News",
    text: "Real photo",
    note: "AI-made. [ai_slop .7]",
  },
  { id: "110", handle: "replier", name: "Reply Guy", text: "So true!! [reply_spam .9]" },
  {
    id: "111",
    handle: "imagine",
    name: "Grok Fan",
    text: "Made this [ai_slop .3]",
    label: "Made with AI",
  },
  {
    id: "112",
    handle: "sponsored",
    name: "Streamer",
    text: "Our sponsor",
    label: "Paid partnership",
  },
];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Retries an assertion for up to 10 seconds. */
const poll = <T>(read: () => T) => expect.poll(read, { timeout: 10_000 });

const cellOf = (handle: string) => `[data-testid="cellInnerDiv"]:has(a[href="/${handle}"])`;

/** How a post is shown, and what its bar says. */
const state = (x: Page, handle: string) =>
  x.$eval(cellOf(handle), (cell) => ({
    sg: (cell as HTMLElement).dataset.sg ?? "shown",
    bar: cell.querySelector<HTMLElement>(".sg-bar")?.innerText.replace(/\s+/g, " ") ?? "",
  }));

/** Waits for a post to be shown as `sg`, with a bar that matches `bar`. */
const shows = (x: Page, handle: string, sg: string, bar = /^/) =>
  poll(() => state(x, handle)).toMatchObject({ sg, bar: expect.stringMatching(bar) });

const click = (x: Page, handle: string, target: string) => x.click(`${cellOf(handle)} ${target}`);

const append = (x: Page, html: string) =>
  x.evaluate((html) => document.querySelector("main")!.insertAdjacentHTML("beforeend", html), html);

/** X shows a post again, now under the post it replies to. */
async function underParent(x: Page, parent: MockPost, reply: MockPost) {
  await x.locator(cellOf(reply.handle)).evaluate((el) => el.remove());
  await append(x, cell({ ...parent, thread: true }) + cell(reply));
}

const handleIn = (text: string) => text.match(/^Author: .* \(@(\w+)\)$/m)?.[1];

describe("side panel tab state", { timeout: 30_000 }, () => {
  it("clears stale X tab state as soon as the tab navigates away", async () => {
    const m = await launch([]);
    let finishNav!: () => void;
    const holdNav = new Promise<void>((resolve) => (finishNav = resolve));
    await m.ctx.route("https://example.com/", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<html><body>Elsewhere<script src="https://example.com/slow.js"></script></body></html>',
      }),
    );
    await m.ctx.route("https://example.com/slow.js", async (route) => {
      await holdNav;
      await route.fulfill({ contentType: "application/javascript", body: "" });
    });
    try {
      const tab = await m.ctx.newPage();
      await tab.goto("https://x.com/home");
      const panel = await m.ctx.newPage();
      await panel.addInitScript(() => {
        const query = chrome.tabs.query.bind(chrome.tabs);
        chrome.tabs.query = async (info: chrome.tabs.QueryInfo) =>
          info.active
            ? (await query({})).filter((t) => !t.url?.startsWith("chrome-extension://")).slice(-1)
            : query(info);
      });
      await panel.goto(`chrome-extension://${m.extension}/sidepanel/index.html`);
      await poll(() => panel.innerText(".summary")).toMatch(/Nothing checked yet/);

      // Start navigating away and hold the response so status stays "loading".
      const nav = tab.goto("https://example.com/").catch(() => {});
      await expect.poll(() => panel.innerText(".summary"), { timeout: 4_000 }).toMatch(/Not on X/);
      finishNav();
      await nav;
    } finally {
      finishNav();
      await m.ctx.close();
    }
  });

  it("does not flash Not on X while an X tab reloads", async () => {
    const m = await launch([]);
    let holdReload = false;
    let finishReload!: () => void;
    const reloadHeld = new Promise<void>((resolve) => (finishReload = resolve));
    await m.ctx.route("https://x.com/home", async (route) => {
      if (holdReload) {
        await route.fulfill({
          contentType: "text/html",
          body: '<!doctype html><html><body><script src="https://x.com/slow.js"></script></body></html>',
        });
        return;
      }
      await route.fallback();
    });
    await m.ctx.route("https://x.com/slow.js", async (route) => {
      await reloadHeld;
      await route.fulfill({ contentType: "application/javascript", body: "" });
    });
    try {
      const tab = await m.ctx.newPage();
      await tab.goto("https://x.com/home");
      const panel = await openPanel(m.ctx, m.extension);
      await poll(() => panel.innerText(".summary")).toMatch(/Nothing checked yet/);

      await panel.evaluate(() => {
        const seen: string[] = [];
        const record = () => {
          const text = document.querySelector(".summary h2")?.textContent ?? "";
          if (text && seen.at(-1) !== text) seen.push(text);
        };
        record();
        new MutationObserver(record).observe(document.body, {
          childList: true,
          subtree: true,
          characterData: true,
        });
        (window as unknown as { __headings: string[] }).__headings = seen;
      });

      holdReload = true;
      const reloading = tab.reload();
      await sleep(500);
      finishReload();
      await reloading;
      await sleep(300);

      const seen = await panel.evaluate(
        () => (window as unknown as { __headings: string[] }).__headings,
      );
      expect(seen).toEqual(["Nothing checked yet"]);
    } finally {
      finishReload();
      await m.ctx.close();
    }
  });
});

describe("on X", { timeout: 30_000 }, () => {
  let m: Awaited<ReturnType<typeof launch>>;
  let x: Page;
  let panel: Page;

  beforeAll(async () => {
    m = await launch(POSTS);
    x = await m.ctx.newPage();
    await x.goto("https://x.com/home");
  }, 60_000);
  afterAll(() => m.ctx.close());

  it("hides junk, with a bar that says why", async () => {
    await shows(x, "rager", "collapsed", /^Ragebait from Rage Farm/);
    await shows(x, "noted", "collapsed", /^AI slop from Noted News/);
    await shows(x, "brand", "collapsed", /^Ad from Big Brand/);
    await shows(x, "sponsored", "collapsed", /^Ad from Streamer/);
    await shows(x, "imagine", "collapsed", /^Made with AI from Grok Fan/);
    // A name that's all emoji gives way to the handle, and a porn bot's avatar isn't shown.
    await shows(x, "nsfwbot", "collapsed", /^NSFW from @nsfwbot/);
    expect(await x.locator(".sg-bar:has-text('@nsfwbot') .sg-ghost").count()).toBe(0);
    for (const handle of ["alice", "maybe", "friend", "me", "replier"]) {
      await shows(x, handle, "shown");
    }
  });

  it("asks only about posts it could hide, once each", async () => {
    // Not the reader's own, not people they follow, not ads, not what X labels made with AI.
    await poll(() => m.sent.map(handleIn).sort((a = "", b = "") => a.localeCompare(b))).toEqual([
      "alice",
      "maybe",
      "noted",
      "nsfwbot",
      "rager",
      "replier",
      "slopper",
    ]);
    const noted = m.sent.find((text) => handleIn(text) === "noted");
    expect(noted).toMatch(/Readers added this community note to the post:\n<note>\nAI-made/);
  });

  it("tells the side panel it's running before the site shows a post", async () => {
    const heard = m.sw.evaluate(
      () =>
        new Promise<boolean>((resolve) => {
          chrome.runtime.onMessage.addListener((message: { type: string }, sender) => {
            if (message.type === "tab-state" && sender.tab?.url?.endsWith("/messages")) {
              resolve(true);
            }
          });
          setTimeout(() => resolve(false), 5000);
        }),
    );
    const messages = await m.ctx.newPage();
    await messages.goto("https://x.com/messages");
    expect(await heard).toBe(true);
    await messages.close();
  });

  it("lets a post through from its bar, and takes it back", async () => {
    await click(x, "rager", ".sg-row");
    await shows(x, "rager", "revealed", /Not ragebait Always show Rage Farm/);
    await click(x, "rager", "[data-sg-action=not-slop]");
    await shows(x, "rager", "confirmed", /won't be hidden again/);
    await click(x, "rager", "[data-sg-action=undo]");
    await shows(x, "rager", "revealed");
    await click(x, "rager", "[data-sg-action=hide]");
    await shows(x, "rager", "collapsed");
  });

  it("always shows an author, and takes it back", async () => {
    await click(x, "slopper", ".sg-row");
    await click(x, "slopper", "[data-sg-action=trust]");
    await shows(x, "slopper", "confirmed", /Growth Guru will always show/);
    expect((await settings(m.sw)).trusted).toEqual(["slopper"]);
    await click(x, "slopper", "[data-sg-action=undo]");
    await shows(x, "slopper", "revealed");
    expect((await settings(m.sw)).trusted).toEqual([]);
    // Trusted again from elsewhere: shown, without the line confirming it.
    await settings(m.sw, { trusted: ["slopper"] });
    try {
      await shows(x, "slopper", "shown", /^$/);
    } finally {
      await settings(m.sw, { trusted: [] });
    }
  });

  it("offers no way to argue with X's own label", async () => {
    await click(x, "imagine", ".sg-row");
    await shows(x, "imagine", "revealed", /^Made with AI Hide$/);
    await click(x, "imagine", "[data-sg-action=hide]");
    await shows(x, "imagine", "collapsed");
  });

  it("ignores a bar a script fakes", async () => {
    await x.evaluate(() => {
      const bar = document.createElement("div");
      bar.className = "sg-bar";
      bar.dataset.id = "x:102";
      bar.innerHTML = '<button data-sg-action="trust">Always show</button>';
      document.body.append(bar);
      bar.querySelector("button")!.click();
    });
    await sleep(500);
    expect((await settings(m.sw)).trusted).toEqual([]);
  });

  it("applies settings to the answers it has, without asking again", async () => {
    const asked = m.sent.length;
    await settings(m.sw, { strictness: "strict" });
    await shows(x, "maybe", "collapsed", /^Possibly clickbait/);
    await settings(m.sw, { strictness: "balanced", peek: true });
    await shows(x, "nsfwbot", "revealed");
    expect((await state(x, "nsfwbot")).bar).not.toMatch(/Hide/);
    await settings(m.sw, { peek: false, hideMode: "remove" });
    await shows(x, "rager", "removed");
    await settings(m.sw, { hideMode: "collapse", categories: { ragebait: false } });
    await shows(x, "rager", "shown");
    await settings(m.sw, { categories: {}, enabled: false });
    await shows(x, "nsfwbot", "shown");
    await settings(m.sw, { enabled: true });
    await shows(x, "rager", "collapsed");
    expect(m.sent.length).toBe(asked);
  });

  it("answers from its cache after a reload", async () => {
    const asked = m.sent.length;
    await x.reload();
    await shows(x, "rager", "collapsed");
    await sleep(1500);
    expect(m.sent.length).toBe(asked);
  });

  it("asks again when the post a reply answers turns up", async () => {
    const replier = POSTS.find((p) => p.handle === "replier")!;
    await underParent(
      x,
      { id: "200", handle: "newsdesk", name: "News", text: "Big news." },
      replier,
    );
    await shows(x, "replier", "collapsed", /^Reply spam from Reply Guy/);
    // The parent is asked about too, so not necessarily last.
    expect(m.sent.findLast((text) => handleIn(text) === "replier")).toMatch(
      /Replying to @newsdesk, who posted:\n<parent>\nBig news/,
    );
  });

  it("asks about a reply first seen alone, once it shows as one", async () => {
    // Only reply spam on: alone, the reply isn't worth asking about.
    const off = { ragebait: false, ai_slop: false, clickbait: false, engagement_bait: false };
    await settings(m.sw, { categories: { ...off, nsfw: false, grift: false, ad: false } });
    const reply = {
      id: "401",
      handle: "replybot",
      name: "Reply Bot",
      text: "Wow!! [reply_spam .9]",
    };
    try {
      await append(x, cell(reply));
      await underParent(x, { id: "400", handle: "blogger", name: "Blog", text: "Hi." }, reply);
      await shows(x, "replybot", "collapsed", /^Reply spam from Reply Bot/);
    } finally {
      await settings(m.sw, { categories: {} });
    }
  });

  it("asks about a post X labels made with AI while that switch is off", async () => {
    await settings(m.sw, { categories: { made_with_ai: false } });
    try {
      await poll(() => m.sent.map(handleIn)).toContain("imagine");
      await shows(x, "imagine", "shown");
    } finally {
      await settings(m.sw, { categories: {} });
    }
    await shows(x, "imagine", "collapsed", /^Made with AI/);
  });

  it("lists what's hidden in the side panel, and what each strictness would hide", async () => {
    // The toolbar badge counts the same list, once every verdict so far has reached it.
    await poll(() => m.sw.evaluate(() => chrome.action.getBadgeText({}))).toBe("9");
    panel = await openPanel(m.ctx, m.extension);
    const counts = () =>
      panel.$$eval(".segment", (all) =>
        all.map((s) => (s as HTMLElement).innerText.replace(/\s+/g, " ")).join(),
      );
    await poll(counts).toBe("Relaxed 8,Balanced 9,Strict 10");
    // The list arriving isn't a post hidden while the reader watches.
    expect(await chomping(panel)).toBe(false);
    const list = await panel.innerText(".hidden");
    for (const name of [
      "Rage Farm",
      "Growth Guru",
      "Big Brand",
      "Streamer",
      "Grok Fan",
      "Noted News",
      "Reply Bot",
    ]) {
      expect(list).toContain(name);
    }
  });

  it("lets a post through from the side panel, in the tab too, and undoes it", async () => {
    await panel.click('.item:has-text("Growth Guru") .item-open');
    await panel.click('.item:has-text("Growth Guru") button:has-text("Not AI slop")');
    await shows(x, "slopper", "confirmed");
    await poll(() => panel.innerText(".hidden")).not.toContain("Growth Guru");
    await poll(() => panel.innerText(".undo-bar")).toMatch(/won't be hidden again/);
    await panel.click(".undo-bar .undo-link");
    await shows(x, "slopper", "collapsed");
    await poll(() => panel.innerText(".hidden")).toContain("Growth Guru");
    // Let it through again so subsequent counts stay consistent.
    await panel.click('.item:has-text("Growth Guru") .item-open');
    await panel.click('.item:has-text("Growth Guru") button:has-text("Not AI slop")');
    await shows(x, "slopper", "confirmed");
  });

  it("filters hidden posts by category in the side panel", async () => {
    await panel.selectOption(".filter-select", "ragebait");
    await poll(() => panel.locator(".list .item").count()).toBe(1);
    expect(await panel.innerText(".list")).toContain("Rage Farm");
    await panel.click('.filter-bar button:has-text("Show all")');
    await poll(() => panel.locator(".list .item").count()).toBeGreaterThan(1);
  });

  it("re-checks a post when a lazy-loaded image arrives later", async () => {
    const lazy: MockPost = {
      id: "305",
      handle: "lazyimg",
      name: "Lazy Img",
      text: "Look at this",
    };
    await append(x, cell(lazy));
    await poll(() => m.sent.map(handleIn)).toContain("lazyimg");
    const before = m.sent.length;
    await x.locator(cellOf("lazyimg")).evaluate((el) => {
      const img = document.createElement("img");
      img.src = "https://pbs.twimg.com/media/lazy.jpg?format=jpg&name=small";
      el.querySelector('[data-testid="tweetText"]')!.after(img);
    });
    await poll(() => m.sent.length).toBeGreaterThan(before);
    expect(m.sent.at(-1)).toMatch(/Attached image/);
  });

  it("applies live follow and unfollow changes without reloading", async () => {
    await m.ctx.route("https://x.com/i/api/1.1/friendships/*.json", (route) =>
      route.fulfill({ json: { screen_name: "rager" } }),
    );
    await x.evaluate(() =>
      fetch("https://x.com/i/api/1.1/friendships/create.json", { method: "POST" }),
    );
    await shows(x, "rager", "shown");
    await x.evaluate(() =>
      fetch("https://x.com/i/api/1.1/friendships/destroy.json", { method: "POST" }),
    );
    await shows(x, "rager", "collapsed");
  });

  it("chomps when a post is hidden with the side panel open", async () => {
    await x.bringToFront();
    await append(x, cell({ id: "301", handle: "rager2", name: "Rager", text: "[ragebait .9]" }));
    await poll(() => chomping(panel)).toBe(true);
  });

  it("counts a rate limit down from when it starts", async () => {
    await m.sw.evaluate(() =>
      chrome.storage.session.set({ status: { kind: "rate-limited", until: Date.now() + 20_000 } }),
    );
    // The first number it shows, not one it counts down to later.
    expect(await panel.locator(".notice").innerText()).toMatch(/resumes in (19|20)s/);
  });

  it("gives ad rows a valid aria-controls id without spaces", async () => {
    const controls = await panel
      .locator('.item:has-text("Big Brand") .item-open')
      .getAttribute("aria-controls");
    expect(controls).toMatch(/^\S+$/);
    expect(await panel.evaluate((id) => Boolean(document.getElementById(id!)), controls)).toBe(
      true,
    );
  });

  it("does not pop unchanged strictness counts on unrelated re-renders", async () => {
    const fresh = await openPanel(m.ctx, m.extension);
    try {
      await poll(() => fresh.locator(".segment-count").count()).toBe(3);
      expect(await fresh.locator(".segment-count.is-new").count()).toBe(0);
      await fresh.click('label.segment:has-text("Strict")');
      await poll(() => settings(m.sw)).toMatchObject({ strictness: "strict" });
      expect(await fresh.locator(".segment-count.is-new").count()).toBe(0);
    } finally {
      await settings(m.sw, { strictness: "balanced" });
      await fresh.close();
    }
  });

  it("stops the rate-limit countdown timer once it expires", async () => {
    const fresh = await m.ctx.newPage();
    await fresh.addInitScript(() => {
      const active = new Set<number>();
      const origSet = window.setInterval;
      const origClear = window.clearInterval;
      window.setInterval = ((...args: Parameters<typeof setInterval>) => {
        const id = origSet(...args);
        active.add(id);
        return id;
      }) as typeof setInterval;
      window.clearInterval = ((id?: number) => {
        if (id !== undefined) active.delete(id);
        return origClear(id);
      }) as typeof clearInterval;
      (window as unknown as { __intervals: () => number }).__intervals = () => active.size;
      const query = chrome.tabs.query.bind(chrome.tabs);
      chrome.tabs.query = async (info: chrome.tabs.QueryInfo) =>
        info.active ? (await query({ url: "https://x.com/*" })).slice(0, 1) : query(info);
    });
    try {
      await m.sw.evaluate(() =>
        chrome.storage.session.set({
          status: { kind: "rate-limited", until: Date.now() + 1200 },
        }),
      );
      await fresh.goto(`chrome-extension://${m.extension}/sidepanel/index.html`);
      await poll(() => fresh.locator(".notice").count()).toBe(1);
      await poll(() => fresh.locator(".notice").count()).toBe(0);
      await expect
        .poll(
          () =>
            fresh.evaluate(() =>
              (window as unknown as { __intervals: () => number }).__intervals(),
            ),
          { timeout: 2_000 },
        )
        .toBe(0);
    } finally {
      await m.sw.evaluate(() => chrome.storage.session.set({ status: { kind: "ok" } }));
      await fresh.close();
    }
  });

  it("throws no errors", () => expect(m.errors).toEqual([]));
});

describe("feed and checked-list sync", { timeout: 60_000 }, () => {
  it("does not record labeled posts while filtering is off, and hides them once re-enabled", async () => {
    const ad: MockPost = { id: "601", handle: "brand", name: "Brand", text: "Buy now", ad: true };
    const m = await launch([ad]);
    try {
      await settings(m.sw, { enabled: false });
      const page = await m.ctx.newPage();
      await page.goto("https://x.com/home");
      await shows(page, "brand", "shown");
      await sleep(500);
      const whileOff = await m.sw.evaluate(() => chrome.storage.session.get(null));
      expect(Object.keys(whileOff).filter((k) => k.startsWith("checked:"))).toEqual([]);

      await settings(m.sw, { enabled: true });
      await shows(page, "brand", "collapsed", /^Ad from Brand/);
      await poll(() =>
        m.sw.evaluate(async () =>
          Object.keys(await chrome.storage.session.get(null)).filter((k) =>
            k.startsWith("checked:"),
          ),
        ),
      ).toHaveLength(1);
    } finally {
      await m.ctx.close();
    }
  });

  it("re-checks a post when its parent arrives while a request is in flight", async () => {
    const reply: MockPost = {
      id: "602",
      handle: "replier",
      name: "Reply Guy",
      text: "So true!! [reply_spam .9]",
    };
    let firstReply!: () => void;
    const holdFirst = new Promise<void>((resolve) => (firstReply = resolve));
    let held = false;
    const m = await launch([reply], async (route) => {
      const text: string = route.request().postDataJSON().input[0].text;
      if (!held && handleIn(text) === "replier") {
        held = true;
        await holdFirst;
      }
      const isRep = text.includes("Replying to @");
      const probabilities = isRep ? { reply_spam: 0.9, fine: 0.1 } : { fine: 1 };
      await route.fulfill({ json: { answers: { kind: { probabilities } } } });
    });
    try {
      const page = await m.ctx.newPage();
      await page.goto("https://x.com/home");
      await poll(() => m.sent.length).toBe(1);
      // Parent turns up while the first classification is still in flight.
      await underParent(
        page,
        { id: "603", handle: "newsdesk", name: "News", text: "Big news." },
        reply,
      );
      firstReply();
      await shows(page, "replier", "collapsed", /^Reply spam from Reply Guy/);
    } finally {
      await m.ctx.close();
    }
  });

  it("does not resurrect the trust confirmation after untrusting from settings", async () => {
    const slopper: MockPost = {
      id: "604",
      handle: "slopper",
      name: "Growth Guru",
      text: "It's not X. It's Y. [ai_slop .8]",
    };
    const m = await launch([slopper]);
    try {
      const page = await m.ctx.newPage();
      await page.goto("https://x.com/home");
      await shows(page, "slopper", "collapsed");
      await click(page, "slopper", ".sg-row");
      await click(page, "slopper", "[data-sg-action=trust]");
      await shows(page, "slopper", "confirmed", /Growth Guru will always show/);
      // Untrust via Settings (not Undo), then trust again from elsewhere.
      await settings(m.sw, { trusted: [] });
      await shows(page, "slopper", "revealed");
      await settings(m.sw, { trusted: ["slopper"] });
      await shows(page, "slopper", "shown", /^$/);
    } finally {
      await m.ctx.close();
    }
  });
});

describe("with a key Google rejects", { timeout: 60_000 }, () => {
  it("says so in the side panel", async () => {
    const rejected = {
      code: 400,
      message: "API key not valid.",
      details: [{ reason: "API_KEY_INVALID" }],
    };
    const m = await launch(POSTS, (route) =>
      route.fulfill({ status: 400, json: { error: rejected } }),
    );
    try {
      await (await m.ctx.newPage()).goto("https://x.com/home");
      const panel = await openPanel(m.ctx, m.extension);
      await poll(() => panel.innerText(".sheet")).toMatch(/Google rejected your API key/);
    } finally {
      await m.ctx.close();
    }
  });
});

describe("when rate-limited or missing a key", { timeout: 60_000 }, () => {
  const four: MockPost[] = [1, 2, 3, 4].map((n) => ({
    id: `50${n}`,
    handle: `rager${n}`,
    name: `Rager ${n}`,
    text: `Junk ${n} [ragebait .9]`,
  }));

  it("wakes paused requests when the API key is replaced", async () => {
    const m = await launch(four, (route) => {
      if (route.request().headers()["x-goog-api-key"] === "test-key") {
        return route.fulfill({
          status: 429,
          headers: { "retry-after": "60" },
          json: { error: { message: "Rate limit exceeded" } },
        });
      }
      return route.fulfill({
        json: { answers: { kind: { probabilities: { ragebait: 0.9, fine: 0.1 } } } },
      });
    });
    try {
      const page = await m.ctx.newPage();
      await page.goto("https://x.com/home");
      await poll(() => m.sent.length).toBe(4);
      await m.sw.evaluate(() => chrome.storage.local.set({ apiKey: "fresh-key" }));
      for (const { handle } of four) {
        await expect
          .poll(() => state(page, handle), { timeout: 4_000 })
          .toMatchObject({
            sg: "collapsed",
          });
      }
    } finally {
      await m.ctx.close();
    }
  });

  it("resumes immediately when an API key is saved after opening X without one", async () => {
    const m = await launch(four.slice(0, 2));
    try {
      await m.sw.evaluate(() => chrome.storage.local.remove("apiKey"));
      const page = await m.ctx.newPage();
      await page.goto("https://x.com/home");
      await sleep(1500);
      expect(m.sent).toEqual([]);
      await m.sw.evaluate(() => chrome.storage.local.set({ apiKey: "good-key" }));
      await expect
        .poll(() => state(page, "rager1"), { timeout: 4_000 })
        .toMatchObject({
          sg: "collapsed",
        });
      await expect
        .poll(() => state(page, "rager2"), { timeout: 4_000 })
        .toMatchObject({
          sg: "collapsed",
        });
    } finally {
      await m.ctx.close();
    }
  });
});

/** Whether the goblin is mid-chomp: an animation on its jaw that isn't one of its CSS ones. */
function chomping(panel: Page) {
  return panel.evaluate(() =>
    document
      .querySelector(".lurker-jaw")!
      .getAnimations()
      .some((a) => !(a instanceof CSSAnimation) && !(a instanceof CSSTransition)),
  );
}
