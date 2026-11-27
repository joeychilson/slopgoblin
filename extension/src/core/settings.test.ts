import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { loadSettings, updateSettings } from "./settings.ts";

describe("updateSettings", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("preserves both patches when called concurrently", async () => {
    const data: Record<string, unknown> = {};
    const tick = () => new Promise((resolve) => setTimeout(resolve, 5));
    vi.stubGlobal("chrome", {
      storage: {
        sync: {
          get: async (key: string) => {
            await tick();
            return { [key]: structuredClone(data[key]) };
          },
          set: async (items: Record<string, unknown>) => {
            await tick();
            Object.assign(data, structuredClone(items));
          },
        },
      },
    });

    await Promise.all([
      updateSettings((s) => ({ categories: { ...s.categories, ragebait: false } })),
      updateSettings((s) => ({ categories: { ...s.categories, ai_slop: false } })),
    ]);

    const saved = await loadSettings();
    expect(saved.categories.ragebait).toBe(false);
    expect(saved.categories.ai_slop).toBe(false);
  });
});
