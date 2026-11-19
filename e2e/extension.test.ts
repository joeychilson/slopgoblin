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
];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Reads until `ok` or 10 seconds pass, and returns the last read. */
async function until<T>(read: () => Promise<T>, ok: (value: T) => boolean = Boolean) {
  let value = await read();
  for (const end = Date.now() + 10_000; !ok(value) && Date.now() < end; value = await read()) {
    await sleep(100);
  }
  return value;
}

/** How a post is shown, and what its bar says, once it's shown as `want`. */
function look(x: Page, handle: string, want = "shown") {
  const read = () =>
    x.$eval(`[data-testid="cellInnerDiv"]:has(a[href="/${handle}"])`, (cell) => ({
      sg: (cell as HTMLElement).dataset.sg ?? "shown",
      bar: cell.querySelector<HTMLElement>(".sg-bar")?.innerText.replace(/\s+/g, " ") ?? "",
    }));
  return until(read, ({ sg }) => sg === want);
}

const click = (x: Page, handle: string, target: string) =>
  x.click(`[data-testid="cellInnerDiv"]:has(a[href="/${handle}"]) ${target}`);

const append = (x: Page, html: string) =>
  x.evaluate((html) => document.querySelector("main")!.insertAdjacentHTML("beforeend", html), html);

const handleIn = (text: string) => text.match(/^Author: .* \(@(\w+)\)$/m)?.[1];

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
    expect((await look(x, "rager", "collapsed")).bar).toMatch(/^Ragebait from Rage Farm/);
    expect((await look(x, "noted", "collapsed")).bar).toMatch(/^AI slop from Noted News/);
    expect((await look(x, "brand", "collapsed")).bar).toMatch(/^Ad from Big Brand/);
    // A name that's all emoji gives way to the handle, and a porn bot's avatar isn't shown.
    expect((await look(x, "nsfwbot", "collapsed")).bar).toMatch(/^NSFW from @nsfwbot/);
    expect(await x.locator(".sg-bar:has-text('@nsfwbot') .sg-ghost").count()).toBe(0);
    for (const handle of ["alice", "maybe", "friend", "me", "replier"]) {
      expect(await look(x, handle), handle).toMatchObject({ sg: "shown" });
    }
  });

  it("asks only about posts it could hide, once each", async () => {
    // Not the reader's own, not people they follow, not ads.
    const asked = await until(
      async () => m.sent.map(handleIn).sort((a = "", b = "") => a.localeCompare(b)),
      (h) => h.length >= 7,
    );
    expect(asked).toEqual(["alice", "maybe", "noted", "nsfwbot", "rager", "replier", "slopper"]);
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
    expect((await look(x, "rager", "revealed")).bar).toMatch(/Not ragebait Always show Rage Farm/);
    await click(x, "rager", "[data-sg-action=not-slop]");
    expect((await look(x, "rager", "confirmed")).bar).toMatch(/won't be hidden again/);
    await click(x, "rager", "[data-sg-action=undo]");
    await look(x, "rager", "revealed");
    await click(x, "rager", "[data-sg-action=hide]");
    expect((await look(x, "rager", "collapsed")).sg).toBe("collapsed");
  });

  it("always shows an author, and takes it back", async () => {
    await click(x, "slopper", ".sg-row");
    await click(x, "slopper", "[data-sg-action=trust]");
    expect((await look(x, "slopper", "confirmed")).bar).toMatch(/Growth Guru will always show/);
    expect((await settings(m.sw)).trusted).toEqual(["slopper"]);
    await click(x, "slopper", "[data-sg-action=undo]");
    expect((await look(x, "slopper", "revealed")).sg).toBe("revealed");
    expect((await settings(m.sw)).trusted).toEqual([]);
    // Trusted again from elsewhere: shown, without the line confirming it.
    await settings(m.sw, { trusted: ["slopper"] });
    const trusted = await look(x, "slopper");
    await settings(m.sw, { trusted: [] });
    expect(trusted).toEqual({ sg: "shown", bar: "" });
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
    expect((await look(x, "maybe", "collapsed")).bar).toMatch(/^Possibly clickbait/);
    await settings(m.sw, { strictness: "balanced", peek: true });
    expect((await look(x, "nsfwbot", "revealed")).bar).not.toMatch(/Hide/);
    await settings(m.sw, { peek: false, hideMode: "remove" });
    await look(x, "rager", "removed");
    await settings(m.sw, { hideMode: "collapse", categories: { ragebait: false } });
    await look(x, "rager");
    await settings(m.sw, { categories: {}, enabled: false });
    expect((await look(x, "nsfwbot")).sg).toBe("shown");
    await settings(m.sw, { enabled: true });
    expect((await look(x, "rager", "collapsed")).sg).toBe("collapsed");
    expect(m.sent.length).toBe(asked);
  });

  it("answers from its cache after a reload", async () => {
    const asked = m.sent.length;
    await x.reload();
    expect((await look(x, "rager", "collapsed")).sg).toBe("collapsed");
    await sleep(1500);
    expect(m.sent.length).toBe(asked);
  });

  it("asks again when the post a reply answers turns up", async () => {
    const parent = { id: "200", handle: "newsdesk", name: "News", text: "Big news.", thread: true };
    await x.evaluate(() =>
      document.querySelector('[data-testid="cellInnerDiv"]:has(a[href="/replier"])')!.remove(),
    );
    await append(x, cell(parent) + cell(POSTS.find((p) => p.handle === "replier")!));
    expect((await look(x, "replier", "collapsed")).bar).toMatch(/^Reply spam from Reply Guy/);
    expect(m.sent.at(-1)).toMatch(/Replying to @newsdesk, who posted:\n<parent>\nBig news/);
  });

  it("lists what's hidden in the side panel, and what each strictness would hide", async () => {
    // The toolbar badge counts the same list, once every verdict so far has reached it.
    const badge = await until(
      () => m.sw.evaluate(() => chrome.action.getBadgeText({})),
      (text) => text === "6",
    );
    panel = await openPanel(m.ctx, m.extension);
    expect(badge).toBe("6");
    const counts = () =>
      panel.$$eval(".segment", (all) =>
        all.map((s) => (s as HTMLElement).innerText.replace(/\s+/g, " ")).join(),
      );
    expect(await until(counts)).toBe("Relaxed 5,Balanced 6,Strict 7");
    // The list arriving isn't a post hidden while the reader watches.
    expect(await chomping(panel)).toBe(false);
    for (const name of ["Rage Farm", "Growth Guru", "Big Brand", "Noted News", "Reply Guy"]) {
      expect(await panel.innerText(".hidden")).toContain(name);
    }
  });

  it("lets a post through from the side panel, in the tab too", async () => {
    await panel.click('.item:has-text("Growth Guru") .item-open');
    await panel.click('.item:has-text("Growth Guru") button:has-text("Not AI slop")');
    expect((await look(x, "slopper", "confirmed")).sg).toBe("confirmed");
    const list = () => panel.innerText(".hidden");
    expect(await until(list, (text) => !text.includes("Growth Guru"))).not.toContain("Growth");
  });

  it("chomps when a post is hidden with the side panel open", async () => {
    await x.bringToFront();
    await append(x, cell({ id: "301", handle: "rager2", name: "Rager", text: "[ragebait .9]" }));
    expect(await until(() => chomping(panel))).toBe(true);
  });

  it("counts a rate limit down from when it starts", async () => {
    await m.sw.evaluate(() =>
      chrome.storage.session.set({ status: { kind: "rate-limited", until: Date.now() + 20_000 } }),
    );
    const notice = await until(() => panel.locator(".notice").innerText());
    expect(notice).toMatch(/resumes in (19|20)s/);
  });

  it("throws no errors", () => expect(m.errors).toEqual([]));
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
      const sheet = await until(
        () => panel.innerText(".sheet"),
        (text) => text.includes("rejected"),
      );
      expect(sheet).toMatch(/Google rejected your API key/);
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
