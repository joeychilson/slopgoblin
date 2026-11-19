import { describe, expect, it } from "vite-plus/test";
import { REFUSED, judge, needsScores, type Judged } from "./policy.ts";
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
  it("hides junk at the strictness, named for its likeliest kind", () => {
    expect(judge(post(), settings())).toEqual({ category: "ragebait", score: 0.7 });
    expect(judge(post(), settings({ strictness: "relaxed" }))).toBeNull();
  });

  it("hides a post only when at least half of it is kinds switched on", () => {
    expect(judge(post(), settings({ categories: only("ragebait") }))).toEqual({
      category: "ragebait",
      score: 0.7,
    });
    expect(
      judge(post(), settings({ strictness: "strict", categories: only("clickbait", "nsfw") })),
    ).toBeNull();
    const even = post({ scores: { ragebait: 0.4, clickbait: 0.4 } });
    expect(judge(even, settings({ categories: only("clickbait") }))).toEqual({
      category: "clickbait",
      score: 0.8,
    });
  });

  it("counts a post Google refused to read as NSFW", () => {
    expect(judge(post({ scores: REFUSED }), settings())).toEqual({ category: "nsfw", score: 1 });
    expect(judge(post({ scores: REFUSED }), settings({ categories: only("ragebait") }))).toBeNull();
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
  const asked = (over: Partial<Judged> = {}, isReply = false) => ({ ...post(over), isReply });

  it("asks about a post that could be hidden", () => {
    expect(needsScores(asked(), settings())).toBe(true);
    // Whether the reader follows the author isn't known yet.
    expect(needsScores(asked({ followed: undefined }), settings())).toBe(true);
    expect(needsScores(asked({}, true), settings({ categories: only("reply_spam") }))).toBe(true);
  });

  it("sends nothing that couldn't be hidden", () => {
    expect(needsScores(asked(), settings({ enabled: false }))).toBe(false);
    expect(needsScores(asked({ isAd: true }), settings())).toBe(false);
    expect(needsScores(asked(), settings({ trusted: ["someone"] }))).toBe(false);
    expect(needsScores(asked({ followed: true }), settings())).toBe(false);
    expect(needsScores(asked(), settings({ categories: only("ad") }))).toBe(false);
    expect(needsScores(asked(), settings({ categories: only("reply_spam") }))).toBe(false);
  });
});
