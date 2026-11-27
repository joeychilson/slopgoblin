import { describe, expect, it } from "vite-plus/test";
import { REFUSED, judge, needsScores, reason, type Judged } from "./policy.ts";
import { DEFAULT_SETTINGS, type Settings } from "./settings.ts";

const post = (over: Partial<Judged> = {}): Judged => ({
  scores: { ragebait: 0.5, clickbait: 0.2 },
  labels: [],
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

  it("hides a post when its likeliest kind or at least half of its junk score is switched on", () => {
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
    const split = post({ scores: { ragebait: 0.35, clickbait: 0.25, engagement_bait: 0.2 } });
    expect(judge(split, settings({ categories: only("ragebait") }))).toEqual({
      category: "ragebait",
      score: 0.8,
    });
    expect(judge(split, settings({ categories: only("clickbait") }))).toBeNull();
    const tied = post({ scores: { ragebait: 0.3, clickbait: 0.3, engagement_bait: 0.2 } });
    expect(judge(tied, settings({ categories: only("clickbait") }))).toEqual({
      category: "clickbait",
      score: 0.8,
    });
  });

  it("leaves a post alone when its junk chance is spread thin over several kinds", () => {
    const spread = post({ scores: { clickbait: 0.25, grift: 0.2, ai_slop: 0.15 } });
    expect(judge(spread, settings({ strictness: "strict" }))).toBeNull();
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

  it("hides what X labels an ad, even from people the reader follows", () => {
    const ad = post({ labels: ["ad"], scores: {}, followed: true });
    expect(judge(ad, settings())).toEqual({ category: "ad", score: 1, labeled: true });
    expect(judge(ad, settings({ categories: only("ragebait") }))).toBeNull();
    expect(judge(ad, settings({ trusted: ["someone"] }))).toBeNull();
  });

  it("hides a post with both of X's labels as whichever applies, in any order", () => {
    const both = post({ labels: ["made_with_ai", "ad"], scores: {} });
    const made = { category: "made_with_ai", score: 1, labeled: true };
    expect(judge(both, settings({ categories: only("made_with_ai") }))).toEqual(made);
    expect(judge({ ...both, followed: true }, settings())).toEqual({ ...made, category: "ad" });
  });

  it("hides what X labels made with AI, but not from people the reader follows", () => {
    const made = post({ labels: ["made_with_ai"], scores: {} });
    expect(judge(made, settings())).toEqual({ category: "made_with_ai", score: 1, labeled: true });
    expect(judge({ ...made, followed: true }, settings())).toBeNull();
    // Switched off, the label counts for nothing and the model's answer decides.
    const slop = { ...made, scores: { ai_slop: 0.8 } };
    expect(judge(slop, settings({ categories: only("ai_slop") }))).toEqual({
      category: "ai_slop",
      score: 0.8,
    });
  });
});

describe("reason", () => {
  it('reads mid-sentence as "an ad", and keeps the capitals of AI slop', () => {
    expect(reason({ category: "ad", score: 0.55 })).toEqual({
      label: "Ad",
      midSentence: "an ad",
      possibly: true,
    });
    expect(reason({ category: "ragebait", score: 0.7 }).midSentence).toBe("ragebait");
    expect(reason({ category: "ai_slop", score: 0.7 }).midSentence).toBe("AI slop");
  });
});

describe("needsScores", () => {
  const asked = (over: Partial<Judged> = {}, isReply = false) => ({ ...post(over), isReply });

  it("asks about a post that could be hidden", () => {
    expect(needsScores(asked(), settings())).toBe(true);
    // Whether the reader follows the author isn't known yet.
    expect(needsScores(asked({ followed: undefined }), settings())).toBe(true);
    expect(needsScores(asked({}, true), settings({ categories: only("reply_spam") }))).toBe(true);
    // X marks only the ads it's paid to show; the model finds the sales pitches.
    expect(needsScores(asked(), settings({ categories: only("ad") }))).toBe(true);
    const made = asked({ labels: ["made_with_ai"] });
    expect(needsScores(made, settings({ categories: only("ai_slop") }))).toBe(true);
  });

  it("sends nothing that couldn't be hidden", () => {
    expect(needsScores(asked(), settings({ enabled: false }))).toBe(false);
    expect(needsScores(asked({ labels: ["ad"] }), settings())).toBe(false);
    expect(needsScores(asked({ labels: ["ad"] }), settings({ categories: only("ragebait") }))).toBe(
      false,
    );
    expect(needsScores(asked({ labels: ["made_with_ai"] }), settings())).toBe(false);
    expect(needsScores(asked(), settings({ trusted: ["someone"] }))).toBe(false);
    expect(needsScores(asked({ followed: true }), settings())).toBe(false);
    expect(needsScores(asked(), settings({ categories: only("reply_spam") }))).toBe(false);
  });

  it("skips a post the reader already let through", () => {
    expect(needsScores(asked({ notSlop: true }), settings())).toBe(false);
  });
});
