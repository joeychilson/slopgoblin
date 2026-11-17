import type { PostContent, ReaderNote } from "./post.ts";
import { CATEGORIES, FINE, QUESTION, type CategoryId } from "./taxonomy.ts";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/decisions";
const MODEL = "gemini-decision-1";
/** Bump when `describePost` changes meaningfully, so cached scores get recomputed. */
const INPUT_VERSION = 3;
const MAX_IMAGES = 2;
const TIMEOUT_MS = 30_000;
/** Input tokens are all the Decisions API bills for. */
export const USD_PER_MILLION_TOKENS = 0.1;

/** The probability a post belongs to each category. What's left over is the chance it's fine. */
export type Scores = Partial<Record<CategoryId, number>>;

const OPTIONS = CATEGORIES.flatMap((c) =>
  "describes" in c ? [{ id: c.id, describes: c.describes, repliesOnly: "repliesOnly" in c }] : [],
);

const optionsFor = (isReply: boolean) => OPTIONS.filter((o) => isReply || !o.repliesOnly);

/**
 * The question a post or a reply is asked, in the API's own form. One question only: questions
 * in a request do sway each other's answers, whatever the docs say.
 */
function questionsFor(isReply: boolean) {
  const options = optionsFor(isReply);
  return {
    kind: {
      type: "choice",
      instructions: QUESTION,
      criteria: { fine: FINE, ...Object.fromEntries(options.map((o) => [o.id, o.describes])) },
    },
  };
}

const QUESTIONS = { post: questionsFor(false), reply: questionsFor(true) };
// Everything the model is asked, down to the option keys it reads, so no change can leave stale
// answers behind.
const keyFor = (questions: object) => hash(JSON.stringify([MODEL, INPUT_VERSION, questions]));
const POST_KEY = keyFor(QUESTIONS.post);
const REPLY_KEY = keyFor(QUESTIONS.reply);

/**
 * Fingerprints the question a post gets asked. A cached answer under another key is stale.
 * Reader notes are part of it: one can turn up hours after a post was first judged.
 */
export function questionKey(post: PostContent) {
  const key = post.replyTo ? REPLY_KEY : POST_KEY;
  const notes = [post.readerNote, post.quote?.readerNote].flatMap((n) =>
    n ? [n.rated, n.text] : [],
  );
  return notes.length ? `${key}.${hash(notes.join("|"))}` : key;
}

type DecisionErrorKind = "auth" | "rate" | "blocked" | "media" | "transient" | "fatal";

export class DecisionError extends Error {
  kind: DecisionErrorKind;
  retryAfterMs: number;

  constructor(kind: DecisionErrorKind, message: string, retryAfterMs = 0) {
    super(message);
    this.kind = kind;
    this.retryAfterMs = retryAfterMs;
  }
}

/** Asks the model which category a post falls in. `tokens` is what the request was billed. */
export async function decide(
  apiKey: string,
  post: PostContent,
  withImages = true,
): Promise<{ scores: Scores; tokens: number }> {
  const images = withImages ? (post.images ?? []).slice(0, MAX_IMAGES) : [];
  const isReply = Boolean(post.replyTo);
  const body = {
    model: MODEL,
    input: [
      { type: "text", text: describePost(post, images.length) },
      ...images.map((uri) => ({
        type: "image",
        uri,
        mime_type: imageMime(uri),
        resolution: "low",
      })),
    ],
    questions: isReply ? QUESTIONS.reply : QUESTIONS.post,
  };

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
      // A stalled connection, say after the laptop wakes, would hold a place in the queue forever.
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new DecisionError("transient", String(error));
  }
  if (!res.ok) throw await toDecisionError(res, images.length > 0);

  // A post Google's safety filters won't read comes back as an error, in `toDecisionError`.
  const json = (await res.json()) as {
    answers?: { kind?: { probabilities?: Record<string, number> } };
    usage?: { total_input_tokens?: number };
  };
  const probabilities = json.answers?.kind?.probabilities;
  if (!probabilities) throw new DecisionError("fatal", "Gemini gave no answer");
  return {
    scores: Object.fromEntries(optionsFor(isReply).map((o) => [o.id, probabilities[o.id] ?? 0])),
    tokens: json.usage?.total_input_tokens ?? 0,
  };
}

function describePost(post: PostContent, imageCount: number): string {
  const lines = [
    // Saying up front that this is content to be judged also keeps Google's word filter from
    // refusing posts over a slur they contain.
    "A post from an X (Twitter) feed. Judge the post itself; a parent or quoted post is only context.",
    "",
    `Author: ${post.author.name} (@${post.author.handle})`,
  ];
  const { replyTo, quote } = post;
  if (replyTo) {
    const parent = replyTo.text || "(no text)";
    lines.push(`Replying to @${replyTo.handle}, who posted:`, tag("parent", parent, 600));
  }
  lines.push(tag("post", post.text || "(no text)", 2000));
  if (post.readerNote) lines.push(...describeNote(post.readerNote, "the post"));
  if (quote) {
    lines.push(`Quoting @${quote.handle}:`, tag("quoted", quote.text || "(no text)", 600));
    if (quote.readerNote) {
      lines.push(
        ...describeNote(quote.readerNote, "the quoted post"),
        // Without this a post gets judged apart from the fake it passes along.
        "A post that repeats, reacts to or builds on what a note calls false, fake, AI-made or bait is junk of that kind too, unless it corrects the quoted post or calls it out. A note that only adds context or fixes a detail changes nothing.",
      );
    }
  }
  if (post.link) lines.push(`Link card: ${clip(post.link, 200)}`);
  if (imageCount) lines.push(`Attached image${imageCount > 1 ? "s" : ""} follow.`);
  return lines.join("\n");
}

function describeNote(note: ReaderNote, target: string) {
  const how = note.rated
    ? "Readers added this community note"
    : "Readers proposed this community note (others have not rated it yet)";
  return [`${how} to ${target}:`, tag("note", note.text, 500)];
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text);
/** Wraps text from the site. A tag inside it is defused, so it can't close this one early. */
const tag = (name: string, text: string, max: number) =>
  `<${name}>\n${clip(text, max).replace(/<(\/?\w+)>/g, "‹$1›")}\n</${name}>`;

function imageMime(uri: string): string {
  const url = new URL(uri);
  const ext = url.searchParams.get("format") ?? url.pathname.split(".").pop() ?? "";
  if (ext === "png" || ext === "webp" || ext === "gif") return `image/${ext}`;
  return "image/jpeg";
}

const BLOCKED_CODES = new Set([
  "safety",
  "prohibited_content",
  "blocklist",
  "image_safety",
  "content_blocked",
]);

interface ApiErrorBody {
  error?: {
    code?: number | string;
    message?: string;
    details?: { reason?: string; retryDelay?: string }[];
  };
}

async function toDecisionError(res: Response, sentImages: boolean): Promise<DecisionError> {
  const { error = {} } = ((await res.json().catch(() => ({}))) as ApiErrorBody) ?? {};
  const message = error.message ?? `HTTP ${res.status}`;
  const code = typeof error.code === "string" ? error.code : "";
  const reasons = new Set(error.details?.map((d) => d.reason));

  if (res.status === 401 || res.status === 403 || reasons.has("API_KEY_INVALID")) {
    return new DecisionError("auth", message);
  }
  if (res.status === 429) {
    const delay =
      Number(res.headers.get("retry-after")) ||
      Number.parseFloat(error.details?.find((d) => d.retryDelay)?.retryDelay ?? "") ||
      20;
    return new DecisionError("rate", message, delay * 1000);
  }
  if (BLOCKED_CODES.has(code)) return new DecisionError("blocked", message);
  if (sentImages && (res.status === 404 || /url|fetch|image/i.test(message))) {
    return new DecisionError("media", message);
  }
  if (res.status >= 500) return new DecisionError("transient", message);
  return new DecisionError("fatal", message);
}

/** FNV-1a, enough to fingerprint question wording. */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
