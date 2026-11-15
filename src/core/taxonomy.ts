export type Strictness = "relaxed" | "balanced" | "strict";

export interface Question {
  instructions: string;
  yes: string;
  no: string;
}

interface Category {
  id: string;
  label: string;
  blurb: string;
  /** Absent for categories decided by a rule instead of the model (ads). */
  question?: Question;
  repliesOnly?: boolean;
}

/** Minimum probability of "yes" to hide a post. Tuned with `vp run eval`. */
export const THRESHOLD: Record<Strictness, number> = { relaxed: 0.9, balanced: 0.75, strict: 0.55 };

export const STRICTNESS = Object.keys(THRESHOLD) as Strictness[];

export const CATEGORIES = [
  {
    id: "ragebait",
    label: "Ragebait",
    blurb: "Built to make you angry",
    question: {
      instructions:
        "Is this post ragebait, designed to provoke anger or outrage for engagement rather than to inform or argue in good faith?",
      yes: "Inflammatory framing, sweeping generalizations about a group of people ('women/men/Gen Z/boomers are…'), strawmen, deliberately offensive or contrarian hot takes, outrage over trivial or invented situations, culture-war bait.",
      no: "An opinion argued with reasons, even a strong or controversial one; criticism of a specific action or person's conduct; reporting of upsetting news; obvious satire; ordinary disagreement.",
    },
  },
  {
    id: "ai_slop",
    label: "AI slop",
    blurb: "Generic AI-written filler and engagement listicles",
    question: {
      instructions:
        "Is this post low-effort AI-generated content, written in a generic chatbot voice to farm engagement rather than to say something the author actually knows or thinks?",
      yes: "Reads like unedited chatbot output: hollow hooks ('Here's the thing', 'Let that sink in'), formulaic listicles or threads of tools, prompts or lessons, 'It's not X. It's Y.' cadence, buzzword-heavy hype, emoji-bullet lists of platitudes, polished but empty motivational filler.",
      no: "Has a real human voice, specific details, first-hand experience, real news or information, or a genuine opinion. Posts about AI, AI research or news, and people showing what they built with AI are not AI slop.",
    },
  },
  {
    id: "clickbait",
    label: "Clickbait",
    blurb: "Sensational hooks and recycled viral clips",
    question: {
      instructions:
        "Is this post clickbait, sensationalized or withholding information to make people click, watch, or open a thread?",
      yes: "Curiosity gaps ('You won't believe…', 'What happened next…'), hype ('This changes EVERYTHING', 'X is DEAD'), fake urgency or 'BREAKING' on things that aren't news, hooks that promise secrets or a payoff the post doesn't deliver. Also content-farm posts: viral clips or images reposted behind a vague caption that hypes a reaction instead of saying what they show ('She wasn't expecting that 😂', 'This is what heaven sounds like', 'Music is everything', 'Wait for it'), and recycled viral stories passed off as the poster's own.",
      no: "Accurate headlines, genuine breaking news, straightforward announcements or links, posts that state their point directly, and thread intros from people sharing their own work or research, even when they build a little suspense. People sharing their own photos or videos, and fans posting a clip that names the artist, show, game or event it comes from.",
    },
  },
  {
    id: "engagement_bait",
    label: "Engagement bait",
    blurb: "Posts fishing for replies, likes and follows",
    question: {
      instructions:
        "Is this post engagement bait, written mainly to farm replies, likes, reposts or follows rather than to share something?",
      yes: "Asks for engagement as the point ('Reply YES if…', 'Like if you agree', 'Drop your city 👇', 'Comment X and I'll send it'), flattering or divisive prompts built to pull replies ('Most people won't understand this', 'Only real ones know'), empty 'gm'/'who's up?' farming, follow trains.",
      no: "A real question the author wants answered, a normal opinion, joke, news, announcement, or personal update. A post or thread that teases its own content is not engagement bait.",
    },
  },
  {
    id: "reply_spam",
    label: "Reply spam",
    blurb: "Sycophantic, bot-like and self-promo replies",
    repliesOnly: true,
    question: {
      instructions:
        "Is this reply low-value spam that adds nothing to the conversation it replies to?",
      yes: "Generic praise that could be pasted under any post ('Great insight! 🙌', 'So true 🔥', 'Thanks for sharing'), AI-written replies that just restate the parent, bot-like or emoji-only replies, 'check my bio', 'DM me', or unrelated self-promotion.",
      no: "A reply that adds information, a real opinion, a question, or a joke specific to the post, including short but genuine replies between people who know each other.",
    },
  },
  {
    id: "nsfw",
    label: "NSFW",
    blurb: "Nudity, porn bots and graphic gore",
    question: {
      instructions:
        "Is this post not safe for work: sexual, pornographic or graphically violent content?",
      yes: "Nudity or sexually explicit images, suggestive photos or clips posed to show off a body, porn or OnlyFans promotion ('link in bio 😈', '18+ 🔞'), porn-bot posts and replies ('my private pics are in my profile 💋'), sexual solicitation, explicit sexual descriptions, gore, or graphic injury and death.",
      no: "Ordinary swimwear, fitness, fashion or red-carpet photos; sex education and health; dating, relationships and LGBTQ+ topics; mild innuendo and jokes; art; news about sex crimes or violence that doesn't show it.",
    },
  },
  {
    id: "grift",
    label: "Grift",
    blurb: "Hustle bros, course funnels and coin shilling",
    question: {
      instructions: "Is this post a grift, selling or shilling something in a manipulative way?",
      yes: "Get-rich or passive-income claims ('I made $47k in 30 days 👇'), course, newsletter or 'DM me' funnels, memecoin or stock pumping, giveaways that require follows, too-good-to-be-true offers, undisclosed paid promotion.",
      no: "Someone plainly sharing or launching their own product, job postings, honest reviews, normal brand announcements, or ordinary discussion of money, markets, startups or crypto.",
    },
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
