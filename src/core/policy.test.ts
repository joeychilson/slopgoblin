import { describe, expect, it } from "vite-plus/test";
import { judge, needsScores, type Judged } from "./policy.ts";
import { DEFAULT_SETTINGS, type Settings } from "./settings.ts";

const post = (over: Partial<Judged> = {}): Judged => ({
  scores: { ragebait: 0.5, clickbait: 0.2 },
  isAd: false,
  handle: "Someone",
  ...over,
});
const settings = (over: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, ...over });
const only = (...on: string[]) =>
  Object.fromEntries(
    Object.keys(DEFAULT_SETTINGS.categories).map((id) => [id, on.includes(id)]),
  ) as Settings["categories"];

describe("judge", () => {
  it("hides when the categories switched on add up to the strictness", () => {
    expect(judge(post(), settings())).toEqual({ category: "ragebait", score: 0.7 });
    expect(judge(post(), settings({ strictness: "relaxed" }))).toBeNull();
  });

  it("leaves categories switched off out of the sum and the reason", () => {
    expect(judge(post(), settings({ categories: only("ragebait") }))).toBeNull();
    expect(
      judge(post(), settings({ strictness: "strict", categories: only("clickbait", "nsfw") })),
    ).toBeNull();
    expect(judge(post(), settings({ strictness: "strict", categories: only("ragebait") }))).toEqual(
      { category: "ragebait", score: 0.5 },
    );
  });

  it("hides nothing while filtering is off or once the reader let a post through", () => {
    expect(judge(post(), settings({ enabled: false }))).toBeNull();
    expect(judge(post({ notSlop: true }), settings())).toBeNull();
  });

  it("never hides trusted handles, whatever their case", () => {
    expect(judge(post(), settings({ trusted: ["someone"] }))).toBeNull();
  });

  it("never hides people the reader follows, unless that's switched off", () => {
    expect(judge(post({ followed: true }), settings())).toBeNull();
    expect(judge(post({ followed: true }), settings({ trustFollowing: false }))).not.toBeNull();
    expect(judge(post({ followed: false }), settings())).not.toBeNull();
  });

  it("hides ads, even from people the reader follows", () => {
    const ad = post({ isAd: true, scores: {}, followed: true });
    expect(judge(ad, settings())).toEqual({ category: "ad", score: 1 });
    expect(judge(ad, settings({ categories: only("ragebait") }))).toBeNull();
    expect(judge(ad, settings({ trusted: ["someone"] }))).toBeNull();
  });
});

describe("needsScores", () => {
  it("asks about a post that could be hidden", () => {
    expect(needsScores(post(), settings())).toBe(true);
    // Whether the reader follows the author isn't known yet.
    expect(needsScores(post({ followed: undefined }), settings())).toBe(true);
  });

  it("sends nothing that couldn't be hidden", () => {
    expect(needsScores(post(), settings({ enabled: false }))).toBe(false);
    expect(needsScores(post({ isAd: true }), settings())).toBe(false);
    expect(needsScores(post(), settings({ trusted: ["someone"] }))).toBe(false);
    expect(needsScores(post({ followed: true }), settings())).toBe(false);
    expect(needsScores(post(), settings({ categories: only("ad") }))).toBe(false);
  });
});
