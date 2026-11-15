import type { PostContent } from "./post.ts";
import { CATEGORIES, type CategoryId, type Question } from "./taxonomy.ts";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/decisions";
const MODEL = "gemini-decision-1";
/** Bump when `describePost` changes meaningfully, so cached scores get recomputed. */
const INPUT_VERSION = 1;
const MAX_IMAGES = 2;

export type Scores = Partial<Record<CategoryId, number>>;

export interface AskedQuestion {
  category: CategoryId;
  /** Doubles as the API question key and the cache key: it changes whenever the wording does. */
  key: string;
  question: Question;
  repliesOnly: boolean;
}

export const QUESTIONS: AskedQuestion[] = CATEGORIES.flatMap((c) =>
  "question" in c
    ? [
        {
          category: c.id,
          key: `${c.id}-${hash(`${INPUT_VERSION}|${c.question.instructions}|${c.question.yes}|${c.question.no}`)}`,
          question: c.question,
          repliesOnly: "repliesOnly" in c && c.repliesOnly,
        },
      ]
    : [],
);

export const questionsFor = (post: PostContent) =>
  QUESTIONS.filter((q) => !q.repliesOnly || post.replyTo);

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

/**
 * Asks the given questions about a post. Returns the probability of "yes" per question key,
 * leaving out any question the API didn't answer.
 */
export async function decide(
  apiKey: string,
  post: PostContent,
  questions: AskedQuestion[],
  withImages = true,
): Promise<Record<string, number>> {
  const images = withImages ? (post.images ?? []).slice(0, MAX_IMAGES) : [];
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
    questions: Object.fromEntries(
      questions.map((q) => [
        q.key,
        {
          type: "noul",
          instructions: q.question.instructions,
          criteria: { true_description: q.question.yes, false_description: q.question.no },
        },
      ]),
    ),
  };

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new DecisionError("transient", String(error));
  }
  if (!res.ok) throw await toDecisionError(res, images.length > 0);

  const { answers } = (await res.json()) as { answers: Record<string, { noul?: number }> };
  return Object.fromEntries(
    questions.flatMap(({ key }) => {
      const p = answers[key]?.noul;
      return p === undefined ? [] : [[key, p]];
    }),
  );
}

function describePost(post: PostContent, imageCount: number): string {
  const lines = [
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
  if (quote) lines.push(`Quoting @${quote.handle}:`, tag("quoted", quote.text, 600));
  if (post.link) lines.push(`Link card: ${clip(post.link, 200)}`);
  if (imageCount) lines.push(`Attached image${imageCount > 1 ? "s" : ""} follow.`);
  return lines.join("\n");
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text);
const tag = (name: string, text: string, max: number) =>
  `<${name}>\n${clip(text, max)}\n</${name}>`;

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
