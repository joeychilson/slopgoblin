import type { CheckedPost } from "@slopgoblin/extension/core/checked.ts";

/**
 * A post in the demo feed: what the extension keeps of a checked post, with the scores Gemini
 * might give it, and what the feed shows of it. Every post and person is made up.
 */
export interface DemoPost extends CheckedPost {
  /** Which of the `--face-*` colors its avatar uses. */
  face: 1 | 2 | 3 | 4 | 5;
  /** How long ago it was posted. Ads say "Ad" instead. */
  ago?: string;
  replyingTo?: string;
}

type Seed = Omit<DemoPost, "url" | "at" | "labels"> & Partial<Pick<DemoPost, "labels">>;

const seeds: Seed[] = [
  {
    id: "bread",
    name: "Maya Ortiz",
    handle: "mayaortiz",
    face: 1,
    ago: "12m",
    followed: true,
    text: "Third try at sourdough. Finally got an ear on it.",
    scores: {},
  },
  {
    id: "outrage",
    name: "Daily Outrage",
    handle: "dailyoutrage",
    face: 5,
    ago: "40m",
    text: "Gen Z really thinks showing up to work is optional now. Unbelievable.",
    scores: { ragebait: 0.91 },
  },
  {
    id: "dark-mode",
    name: "Sam Reyes",
    handle: "samreyes",
    face: 4,
    ago: "1h",
    followed: true,
    text: "Dark mode is live. Two weeks of arguing about gray.",
    scores: {},
  },
  {
    id: "signals",
    name: "Signal Kings",
    handle: "signalkings",
    face: 2,
    ago: "1h",
    replyingTo: "Sam Reyes",
    text: "Great post!! 🔥 Check my bio for the free signals that changed my life",
    scores: { reply_spam: 0.88, grift: 0.06 },
  },
  {
    id: "tools",
    name: "Tyler | AI Growth",
    handle: "tyleraigrowth",
    face: 3,
    ago: "2h",
    text: "AI won’t replace you. A person using AI will. Here are 10 tools that will make you unstoppable 🧵👇",
    scores: { ai_slop: 0.71, engagement_bait: 0.07 },
  },
  {
    id: "bank",
    name: "Northwind Bank",
    handle: "northwindbank",
    face: 4,
    labels: ["ad"],
    text: "Banking that keeps up with you. Open an account in minutes.",
    scores: {},
  },
  {
    id: "clip",
    name: "Clip Vault",
    handle: "clipvault",
    face: 1,
    ago: "3h",
    text: "I didn’t know this 😱😱 wait for the end",
    scores: { clickbait: 0.72 },
  },
  {
    id: "nadia",
    name: "Nadia Chen",
    handle: "nadiachen",
    face: 3,
    ago: "3h",
    followed: true,
    text: "Every “10x engineer” I know spends half the afternoon naming a boolean.",
    scores: { ragebait: 0.62 },
  },
  {
    id: "bus",
    name: "Riverside Transit",
    handle: "riversidetransit",
    face: 2,
    ago: "4h",
    text: "The 14 is back on its usual route from Monday.",
    scores: {},
  },
  {
    id: "presale",
    name: "Moon Calls 🚀",
    handle: "mooncalls",
    face: 5,
    ago: "4h",
    text: "This gem is about to 100x. Presale closes tonight, DM me before it’s too late",
    scores: { grift: 0.96 },
  },
  {
    id: "poll",
    name: "Poll Farm",
    handle: "pollfarm",
    face: 3,
    ago: "5h",
    text: "Which one are you? Reply below and I’ll follow back 👇",
    scores: { engagement_bait: 0.67 },
  },
  // A hot take that only Strict hides: the real post it costs.
  {
    id: "pizza",
    name: "Liam Park",
    handle: "liampark",
    face: 4,
    ago: "6h",
    text: "Pineapple on pizza is fine and you all need a hobby",
    scores: { ragebait: 0.54 },
  },
];

/** Newest first, as the side panel lists them. */
export const posts: DemoPost[] = seeds.map((seed, i) => ({
  labels: [],
  ...seed,
  url: `#post-${seed.id}`,
  at: seeds.length - i,
}));
