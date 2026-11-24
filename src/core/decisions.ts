import { isReply, type PostContent, type ReaderNote } from "./post.ts";
import { ASKED, FINE, QUESTION, type CategoryId } from "./taxonomy.ts";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/decisions";
const MODEL = "gemini-decision-1";
/** Bump when `describePost` changes meaningfully, so cached scores get recomputed. */
const INPUT_VERSION = 5;
const MAX_IMAGES = 2;
const TIMEOUT_MS = 30_000;
/** Input tokens are all the Decisions API bills for. */
export const USD_PER_MILLION_TOKENS = 0.1;

export type Scores = Partial<Record<CategoryId, number>>;

const optionsFor = (reply: boolean) => ASKED.filter((c) => reply || !("repliesOnly" in c));

// One question only: multiple questions in one request sway each other's answers.
function questionsFor(reply: boolean) {
  const options = optionsFor(reply);
  return {
    kind: {
      type: "choice",
      instructions: QUESTION,
      criteria: { fine: FINE, ...Object.fromEntries(options.map((o) => [o.id, o.describes])) },
    },
  };
}

const QUESTIONS = { post: questionsFor(false), reply: questionsFor(true) };
const keyFor = (questions: object) => hash(JSON.stringify([MODEL, INPUT_VERSION, questions]));
const POST_KEY = keyFor(QUESTIONS.post);
const REPLY_KEY = keyFor(QUESTIONS.reply);
const THREAD_KEY = `${POST_KEY}.thread`;

const imageCount = (post: PostContent) => Math.min(post.images?.length ?? 0, MAX_IMAGES);

/**
 * Fingerprints the question and late-arriving context a post gets judged on, so cached scores
 * are asked again when wording, parent post, images, or community notes change.
 */
export function questionKey(post: PostContent) {
  let key = isReply(post) ? REPLY_KEY : post.replyTo ? THREAD_KEY : POST_KEY;
  const images = imageCount(post);
  if (images) key += `.i${images}`;
  const notes = [post.readerNote, post.quote?.readerNote].flatMap((n) =>
    n ? [n.rated, n.text] : [],
  );
  return notes.length ? `${key}.${hash(notes.join("|"))}` : key;
}

/** Whether `next` carries new context (`replyTo`, images, notes) worth re-judging on. */
export function addsContext(next: PostContent, prev: PostContent) {
  if (imageCount(next) > imageCount(prev)) return true;
  const context = (post: PostContent) => [
    post.replyTo,
    post.readerNote,
    post.readerNote?.rated,
    post.quote?.readerNote,
    post.quote?.readerNote?.rated,
  ];
  const before = context(prev);
  return context(next).some((part, i) => part && !before[i]);
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
  const reply = isReply(post);
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
    questions: reply ? QUESTIONS.reply : QUESTIONS.post,
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

  const json = (await res.json()) as {
    answers?: { kind?: { probabilities?: Record<string, number> } };
    prompt_feedback?: { block_reason?: string; block_reason_message?: string };
    usage?: { total_input_tokens?: number };
  };
  if (json.prompt_feedback?.block_reason) {
    throw new DecisionError(
      "blocked",
      json.prompt_feedback.block_reason_message ?? json.prompt_feedback.block_reason,
    );
  }
  const probabilities = json.answers?.kind?.probabilities;
  if (!probabilities) throw new DecisionError("fatal", "Gemini gave no answer");
  return {
    scores: Object.fromEntries(optionsFor(reply).map((o) => [o.id, probabilities[o.id] ?? 0])),
    tokens: json.usage?.total_input_tokens ?? 0,
  };
}

function describePost(post: PostContent, images: number): string {
  const lines = [
    // Saying up front that this is content to be judged also keeps Google's word filter from
    // refusing posts over a slur they contain.
    "A post from an X (Twitter) feed. Judge the post itself; a parent or quoted post is only context.",
    "",
    `Author: ${defuse(post.author.name)} (@${post.author.handle})`,
  ];
  const { replyTo, quote } = post;
  if (replyTo) {
    const parent = replyTo.text || "(no text)";
    lines.push(
      isReply(post)
        ? `Replying to @${replyTo.handle}, who posted:`
        : "Continuing the author's own thread, after:",
      tag("parent", parent, 600),
    );
  }
  lines.push(tag("post", post.text || "(no text)", 2000));
  if (post.readerNote) lines.push(...describeNote(post.readerNote, "the post"));
  if (quote) {
    lines.push(`Quoting @${quote.handle}:`, tag("quoted", quote.text || "(no text)", 600));
    if (quote.readerNote) {
      lines.push(
        ...describeNote(quote.readerNote, "the quoted post"),
        // Without this a post gets judged apart from the fake it passes along.
        "This post quotes a post whose community note calls it false, fake, AI-made or bait. Unless it questions, corrects or calls out the quoted post, judge it as junk of the same kind (not fine), even if it only reacts, jokes, or comments on the false premise. A note that only adds neutral context or fixes a detail changes nothing.",
      );
    }
  }
  if (post.link) lines.push(`Link card: ${defuse(clip(post.link, 200))}`);
  if (images) lines.push(`Attached image${images > 1 ? "s" : ""} follow.`);
  return lines.join("\n");
}

function describeNote(note: ReaderNote, target: string) {
  const how = note.rated
    ? "Readers added this community note"
    : "Readers proposed this community note (others have not rated it yet)";
  return [`${how} to ${target}:`, tag("note", note.text, 500)];
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text);
// Defuse tag-like sequences so site text can't close or forge our wrapper tags.
const defuse = (text: string) => text.replace(/<(\s*\/?\s*[a-z][^<>]*)>/gi, "‹$1›");
const tag = (name: string, text: string, max: number) =>
  `<${name}>\n${defuse(clip(text, max))}\n</${name}>`;

function imageMime(uri: string) {
  const url = new URL(uri);
  const ext = url.searchParams.get("format") ?? url.pathname.split(".").pop();
  return ext === "png" || ext === "webp" || ext === "gif" ? `image/${ext}` : "image/jpeg";
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

  if (
    res.status === 401 ||
    res.status === 403 ||
    reasons.has("API_KEY_INVALID") ||
    reasons.has("API_KEY_EXPIRED")
  ) {
    return new DecisionError("auth", message);
  }
  if (res.status === 429) {
    const raw =
      Number(res.headers.get("retry-after")) ||
      Number.parseFloat(error.details?.find((d) => d.retryDelay)?.retryDelay ?? "") ||
      20;
    const delay = Math.min(Math.max(raw, 1), 300);
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
