import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { CheckedPost } from "../core/checked.ts";

describe("recordChecked", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("preserves avatar, labels, followed and notSlop when another tab sends a stale entry", async () => {
    const session: Record<string, unknown> = {};
    vi.stubGlobal("chrome", {
      storage: {
        session: {
          get: async () => structuredClone(session),
          set: async (items: Record<string, unknown>) => {
            Object.assign(session, structuredClone(items));
          },
          remove: async (keys: string[]) => {
            for (const key of keys) delete session[key];
          },
        },
      },
    });

    const { checkedPosts, recordChecked, updateChecked } = await import("./checked.ts");
    const first: CheckedPost = {
      id: "x:1",
      url: "https://x.com/rager/status/1",
      name: "Rager",
      handle: "rager",
      avatar: "https://pbs.twimg.com/profile_images/rager/a.jpg",
      text: "Junk",
      scores: { ragebait: 0.9 },
      labels: ["made_with_ai"],
      followed: false,
      notSlop: false,
      at: 100,
    };
    await recordChecked([first]);
    await updateChecked("x:1", { notSlop: true });

    // A second tab flushes before its avatar/follows arrive or before it heard about notSlop.
    await recordChecked([
      {
        ...first,
        avatar: undefined,
        labels: [],
        followed: undefined,
        notSlop: false,
        at: 200,
      },
    ]);

    expect(await checkedPosts()).toEqual([{ ...first, notSlop: true }]);
  });

  it("serializes concurrent recordChecked and updateChecked writes", async () => {
    const session: Record<string, unknown> = {};
    const tick = () => new Promise((resolve) => setTimeout(resolve, 5));
    vi.stubGlobal("chrome", {
      storage: {
        session: {
          get: async () => structuredClone(session),
          set: async (items: Record<string, unknown>) => {
            await tick();
            Object.assign(session, structuredClone(items));
          },
          remove: async (keys: string[]) => {
            for (const key of keys) delete session[key];
          },
        },
      },
    });

    const { checkedPosts, recordChecked, updateChecked } = await import("./checked.ts");
    const post: CheckedPost = {
      id: "x:2",
      url: "https://x.com/rager/status/2",
      name: "Rager",
      handle: "rager",
      text: "Junk",
      scores: { ragebait: 0.9 },
      labels: [],
      notSlop: false,
      at: 100,
    };

    await Promise.all([recordChecked([post]), updateChecked("x:2", { notSlop: true })]);
    expect(await checkedPosts()).toEqual([{ ...post, notSlop: true }]);
  });
});
