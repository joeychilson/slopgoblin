import { LABELS, type Label } from "../core/post.ts";
import type { SiteData } from "./site.ts";

/**
 * What X's data says that its page doesn't show, or not reliably. Posts on the page don't say
 * whether the reader follows their author, and X's labels under them ("Paid partnership", "Made
 * with AI") have no stable markup, but the data X loads for them has both. Only X's own page can
 * see that data, so `readData` runs there (loaded by content/page.ts) and passes handles with
 * follow status, and labeled posts' ids with their labels, nothing else, to `watchData` in the
 * content script, over DOM events.
 */

/** Page to content script: JSON `SiteData`. */
const DATA = "slopgoblin:data";
/** Content script to page: send everything known so far. The page script starts well before it. */
const ASK = "slopgoblin:ask-data";

const GRAPHQL = /^https:\/\/x\.com\/i\/api\/graphql\//;

/** In X's page, before X's own scripts: notes every author's follow status and every post's labels. */
export function readData() {
  const follows = new Map<string, boolean>();
  const labels = new Map<string, Label[]>();
  const announce = (data: SiteData) => {
    if (!data.follows.length && !data.labels.length) return;
    document.dispatchEvent(new CustomEvent(DATA, { detail: JSON.stringify(data) }));
  };
  document.addEventListener(ASK, () => announce({ follows: [...follows], labels: [...labels] }));

  function onLoad(this: XMLHttpRequest) {
    if (!GRAPHQL.test(this.responseURL)) return;
    try {
      const data: unknown =
        this.responseType === "json" ? this.response : JSON.parse(this.responseText);
      const found = dataIn(data);
      announce({
        follows: found.follows.filter(([handle, following]) => {
          if (follows.get(handle) === following) return false;
          follows.set(handle, following);
          return true;
        }),
        labels: found.labels.filter(([id, these]) => {
          if (labels.get(id)?.join() === these.join()) return false;
          labels.set(id, these);
          return true;
        }),
      });
    } catch {
      // Not JSON after all. X carries on either way.
    }
  }

  // X calls its API with XMLHttpRequest. Each response is read after X has it, and left as it is.
  window.XMLHttpRequest = class extends XMLHttpRequest {
    constructor() {
      super();
      this.addEventListener("load", onLoad);
    }
  };
}

/** In the content script: hears what `readData` finds, starting with everything so far. */
export function watchData(onChange: (data: SiteData) => void) {
  document.addEventListener(DATA, (event) => {
    const data = parse((event as CustomEvent<unknown>).detail);
    if (data.follows.length || data.labels.length) onChange(data);
  });
  document.dispatchEvent(new CustomEvent(ASK));
}

/** Every user in an API response that comes with whether the reader follows them, and every post X labels. */
function dataIn(data: unknown): SiteData {
  const found: SiteData = { follows: [], labels: [] };
  const visit = (value: unknown) => {
    if (typeof value !== "object" || value === null) return;
    if (field(value, "__typename") === "User") {
      const handle = field(field(value, "core"), "screen_name");
      const following = field(field(value, "relationship_perspectives"), "following");
      if (typeof handle === "string" && typeof following === "boolean") {
        found.follows.push([handle.toLowerCase(), following]);
      }
    }
    const id = field(value, "rest_id");
    const labels = labelsIn(field(value, "content_disclosure"));
    // As `readPost` in x.ts names posts.
    if (typeof id === "string" && labels.length) found.labels.push([`x:${id}`, labels]);
    for (const child of Object.values(value)) visit(child);
  };
  visit(data);
  return found;
}

/** The labels X shows under a post for what its author disclosed or X detected. */
function labelsIn(disclosure: unknown): Label[] {
  const labels: Label[] = [];
  if (field(field(disclosure, "advertising_disclosure"), "is_paid_promotion") === true) {
    labels.push("ad");
  }
  if (field(field(disclosure, "ai_generated_disclosure"), "has_ai_generated_media") === true) {
    labels.push("made_with_ai");
  }
  return labels;
}

const field = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>)[key] : undefined;

/**
 * Any script in the page can send the event, so it's checked. One that could forge it could
 * change the posts anyway.
 */
function parse(detail: unknown): SiteData {
  const none: SiteData = { follows: [], labels: [] };
  if (typeof detail !== "string") return none;
  try {
    const data: unknown = JSON.parse(detail);
    const follows = field(data, "follows");
    const labels = field(data, "labels");
    return {
      follows: Array.isArray(follows)
        ? follows.filter(
            (entry): entry is SiteData["follows"][number] =>
              Array.isArray(entry) && typeof entry[0] === "string" && typeof entry[1] === "boolean",
          )
        : [],
      labels: Array.isArray(labels)
        ? labels.filter(
            (entry): entry is SiteData["labels"][number] =>
              Array.isArray(entry) &&
              typeof entry[0] === "string" &&
              Array.isArray(entry[1]) &&
              entry[1].every((label) => LABELS.includes(label)),
          )
        : [],
    };
  } catch {
    return none;
  }
}
