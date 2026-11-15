export type Strictness = "relaxed" | "balanced" | "strict";

interface Category {
  id: string;
  label: string;
  blurb: string;
  /** How the model is told to recognize it. Absent for categories decided by a rule (ads). */
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
  "Which label best fits this post from an X (Twitter) feed? Judge the post itself; a parent or quoted post is only context.";

export const FINE =
  "A normal post or reply. News; opinions and criticism about politics, public figures or events, even harsh or partisan ones; jokes and memes; fans reacting to a team, player, show or artist; sports banter; personal updates; someone's own work; real questions. A reply that reacts to its parent post, however short: congratulations, thanks, agreement, disagreement, an insult, a joke.";

/** Minimum probability of junk to hide a post. Tuned with `vp run eval`. */
export const THRESHOLD: Record<Strictness, number> = { relaxed: 0.85, balanced: 0.6, strict: 0.4 };

export const STRICTNESS = Object.keys(THRESHOLD) as Strictness[];

/**
 * What each strictness costs, as `vp run eval` measures it on timelines and reply threads.
 * Re-measure after moving a threshold.
 */
export const TRADEOFF: Record<Strictness, string> = {
  relaxed: "Hides only the unmistakable. About half the junk gets through.",
  balanced: "Catches most of the junk. About 1 real post in 200 is hidden by mistake.",
  strict: "Catches nearly all of it. About 1 real post in 30 is hidden by mistake.",
};

export const CATEGORIES = [
  {
    id: "ragebait",
    label: "Ragebait",
    blurb: "Built to make you angry",
    describes:
      "Bait built to make people angry for engagement: sweeping put-downs of a whole kind of person (women, men, a generation, a nationality, a profession), gender-war bait, outrage over trivial or made-up everyday incidents, and outrage-clip accounts whose caption is framed to provoke ('X was SHOCKED that…').",
  },
  {
    id: "ai_slop",
    label: "AI slop",
    blurb: "Chatbot filler and fake AI images",
    describes:
      "Generic chatbot-voice filler (hollow hooks, 'It's not X. It's Y.', emoji-bullet platitudes, tool or prompt listicles), made-up viral stories, or AI-generated images and video posted as filler or passed off as real.",
  },
  {
    id: "clickbait",
    label: "Clickbait",
    blurb: "Hype hooks and content-farm clips",
    describes:
      "Hides or hypes what it shows to make people watch or click: curiosity gaps ('I didn't know this 😱', 'Wait for it'), fake BREAKING, celebrity-gossip bait, and content-farm clips behind a vague reaction caption that doesn't say what the clip is.",
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
      "Manipulative selling or shilling: get-rich or passive-income claims, course or 'DM me' funnels, memecoin, token or stock pumps, airdrops, follow-to-win giveaways, scam offers.",
  },
  {
    id: "ad",
    label: "Ads",
    blurb: "Promoted posts",
  },
] as const satisfies readonly Category[];

export type CategoryId = (typeof CATEGORIES)[number]["id"];

export const CATEGORY = Object.fromEntries(CATEGORIES.map((c) => [c.id, c])) as Record<
  CategoryId,
  Category
>;

/** A label as it reads mid-sentence: "ragebait", but "AI slop" and "NSFW" keep their capitals. */
export const inSentence = (label: string) =>
  label.replace(/^[A-Z](?=[a-z])/, (c) => c.toLowerCase());
