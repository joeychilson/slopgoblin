export type Strictness = "relaxed" | "balanced" | "strict";

interface Category {
  id: string;
  label: string;
  blurb: string;
  /** How the model is told to recognize it. Without it, only a site's own label decides. */
  describes?: string;
  repliesOnly?: boolean;
}

/**
 * The model answers one multiple-choice question per post: which of the categories below fits,
 * or `fine`. It returns a probability for every option, so a post's chance of being junk is
 * everything that didn't go to `fine`. Wording here is tuned with `vp run eval`; the options'
 * detail is what keeps real posts out, so measure before trimming it.
 */
export const QUESTION =
  "Which label best fits this post from an X (Twitter) feed? Judge the post itself; a parent or quoted post is only context. Posts are recent and often report events, releases, media and prices you haven't heard of: unless a community note says otherwise, don't judge whether a claim is true, only how the post is made.";

export const FINE =
  "A normal post or reply. News: headlines, updates, posters and galleries that say what happened or show an announcement, even with BREAKING or JUST IN, and even about events, films, games, castings, releases or prices you haven't heard of; opinions and criticism about politics, public figures or events, even harsh or partisan ones; jokes and memes; fans reacting to a team, player, show or artist; sports banter; personal updates; someone's own work; real questions. A reply that reacts to its parent post, however short: congratulations, thanks, agreement, disagreement, an insult, a joke.";

/** Minimum probability of junk to hide a post. Tuned with `vp run eval`. */
export const THRESHOLD: Record<Strictness, number> = { relaxed: 0.75, balanced: 0.6, strict: 0.5 };

/**
 * Minimum probability of the likeliest kind, at any strictness. When the model spreads a post's
 * junk chance thin over several kinds, it couldn't place the post, and those are mostly real
 * posts that look dramatic: finance headlines, gaming news. Tuned with `vp run eval`.
 */
export const LIKELIEST = 0.3;

export const STRICTNESS = Object.keys(THRESHOLD) as Strictness[];

/**
 * What each strictness costs, in a few words, as `vp run eval` measures it on timelines and
 * reply threads: Relaxed catches about 3 in 5 junk posts and hides 1 real post in 800,
 * Balanced about 3 in 4 and 1 in 300, Strict over 4 in 5 and 1 in 90. Re-measure after moving a
 * threshold.
 */
export const TRADEOFF: Record<Strictness, string> = {
  relaxed: "Hides only the obvious junk.",
  balanced: "Hides most junk, rarely a real post.",
  strict: "Hides nearly all junk, and a few real posts.",
};

export const CATEGORIES = [
  {
    id: "ragebait",
    label: "Ragebait",
    blurb: "Built to make you angry",
    describes:
      "Bait built to make people angry for engagement: sweeping put-downs or stereotypes of a whole group (women, men, a race, a generation, a nationality, a profession, or a lifestyle/political out-group), racial slurs or '#noticing' tropes, gender-war or us-vs-them demonization ('they hate you'), outrage over trivial or made-up everyday incidents, and outrage-clip accounts whose caption is framed to provoke ('X was SHOCKED that…').",
  },
  {
    id: "ai_slop",
    label: "AI slop",
    blurb: "Chatbot filler and fake AI images",
    describes:
      "Generic chatbot-voice filler (hollow hooks, 'It's not X. It's Y.', emoji-bullet platitudes, tool or prompt listicles), story templates written to go viral, or AI-generated images and video posted as filler or passed off as real.",
  },
  {
    id: "made_with_ai",
    label: "Made with AI",
    blurb: "Images and video X labels as AI-made",
  },
  {
    id: "clickbait",
    label: "Clickbait",
    blurb: "Hype hooks and content-farm clips",
    describes:
      "Hides or hypes what it shows to make people watch or click: curiosity gaps ('I didn't know this 😱', 'Wait for it'), melodramatic all-caps BREAKING ('SENDS SHOCKWAVES', 'BREAKS DOWN IN TEARS'), celebrity-gossip bait, and content-farm clips behind a vague reaction caption that doesn't say what the clip is.",
  },
  {
    id: "engagement_bait",
    label: "Engagement bait",
    blurb: "Fishing for replies, likes and follows",
    describes:
      "Exists to farm replies, likes or follows: 'Reply YES if…', 'Which one?', bait questions over a clip, like or follow trains, empty 'gm' posts.",
  },
  {
    id: "reply_spam",
    label: "Reply spam",
    blurb: "Bot filler and self-promo in replies",
    repliesOnly: true,
    describes:
      "A reply that isn't a real reaction to its parent post: bot-like or emoji-only filler, generic praise that would fit under any post, AI-written restatement of the parent, 'check my bio', self-promotion, shilling, off-topic links.",
  },
  {
    id: "nsfw",
    label: "NSFW",
    blurb: "Nudity, porn bots and gore",
    describes:
      "Nudity, sexual or pornographic content, bodies posed to titillate, porn or OnlyFans promotion, porn bots, explicit sexual descriptions, gore.",
  },
  {
    id: "grift",
    label: "Grift",
    blurb: "Get-rich schemes, shilling and scams",
    describes:
      "Manipulative selling or shilling: get-rich or passive-income claims, course or 'DM me' funnels, memecoin, token or stock pumps (not market news or prices), airdrops, follow-to-win giveaways, scam offers.",
  },
  {
    id: "ad",
    label: "Ads",
    blurb: "Paid promotions and sales pitches",
    describes:
      "A sales pitch, not news: a plug for the poster's own paid service ('sign up now', free trials, 'join the…'). Not a maker announcing or showing what they built.",
  },
] as const satisfies readonly Category[];

export type CategoryId = (typeof CATEGORIES)[number]["id"];

/** The categories Google is asked about. */
export const ASKED = CATEGORIES.filter((c) => "describes" in c);

export const CATEGORY = Object.fromEntries(CATEGORIES.map((c) => [c.id, c])) as Record<
  CategoryId,
  Category
>;
