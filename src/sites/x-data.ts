import { LABELS, type Label } from "../core/post.ts";
import type { SiteData } from "./site.ts";

/**
 * Runs in X's page world (from `content/page.ts` at document_start) to read follow status and
 * X's own disclosure labels from X's API responses, passing only those fields to the content script.
 */
const DATA = "slopgoblin:data";
const ASK = "slopgoblin:ask-data";

const GRAPHQL = /^https:\/\/x\.com\/i\/api\/graphql\//;
const FRIENDSHIP = /^https:\/\/x\.com\/i\/api\/1\.1\/friendships\/(create|destroy)\.json/;
const MAX_ENTRIES = 10_000;

export function readData() {
  const follows = new Map<string, boolean>();
  const labels = new Map<string, Label[]>();

  const remember = <V>(map: Map<string, V>, key: string, value: V) => {
    if (map.size >= MAX_ENTRIES && !map.has(key)) {
      map.delete(map.keys().next().value!);
    }
    map.set(key, value);
  };

  const announce = (data: SiteData) => {
    if (!data.follows.length && !data.labels.length) return;
    document.dispatchEvent(new CustomEvent(DATA, { detail: JSON.stringify(data) }));
  };

  const ingest = (url: string, data: unknown) => {
    const match = FRIENDSHIP.exec(url);
    const found: SiteData = match ? friendshipIn(data, match[1] === "create") : dataIn(data);
    announce({
      follows: found.follows.filter(([handle, following]) => {
        if (follows.get(handle) === following) return false;
        remember(follows, handle, following);
        return true;
      }),
      labels: found.labels.filter(([id, these]) => {
        if (labels.get(id)?.join() === these.join()) return false;
        remember(labels, id, these);
        return true;
      }),
    });
  };

  document.addEventListener(ASK, () => announce({ follows: [...follows], labels: [...labels] }));

  function onLoad(this: XMLHttpRequest) {
    const url = this.responseURL;
    if (this.status < 200 || this.status >= 300) return;
    if (!GRAPHQL.test(url) && !FRIENDSHIP.test(url)) return;
    try {
      const data: unknown =
        this.responseType === "json" ? this.response : JSON.parse(this.responseText);
      ingest(url, data);
    } catch {
      // Non-JSON response; leave X untouched.
    }
  }

  window.XMLHttpRequest = class extends XMLHttpRequest {
    constructor() {
      super();
      this.addEventListener("load", onLoad);
    }
  };

  const origFetch = window.fetch;
  if (typeof origFetch === "function") {
    window.fetch = function (input, init) {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.href : (input?.url ?? "");
      const promise = origFetch.call(this, input, init);
      if (GRAPHQL.test(url) || FRIENDSHIP.test(url)) {
        void promise
          .then((res) => (res.ok ? res.clone().json() : undefined))
          .then((data) => {
            if (data !== undefined) ingest(url, data);
          })
          .catch(() => {});
      }
      return promise;
    };
  }
}

export function watchData(onChange: (data: SiteData) => void): () => void {
  const listener = (event: Event) => {
    const data = parse((event as CustomEvent<unknown>).detail);
    if (data.follows.length || data.labels.length) onChange(data);
  };
  document.addEventListener(DATA, listener);
  document.dispatchEvent(new CustomEvent(ASK));
  return () => document.removeEventListener(DATA, listener);
}

function friendshipIn(data: unknown, following: boolean): SiteData {
  const handle = field(data, "screen_name");
  return typeof handle === "string"
    ? { follows: [[handle.toLowerCase(), following]], labels: [] }
    : { follows: [], labels: [] };
}

/** Iterative scan over an X GraphQL payload to avoid deep recursion and per-node array churn. */
function dataIn(root: unknown): SiteData {
  const found: SiteData = { follows: [], labels: [] };
  const stack: unknown[] = [root];
  while (stack.length) {
    const value = stack.pop();
    if (typeof value !== "object" || value === null) continue;
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) stack.push(value[i]);
      continue;
    }
    const obj = value as Record<string, unknown>;
    if (obj.__typename === "User") {
      const handle = field(obj.core, "screen_name") ?? field(obj.legacy, "screen_name");
      const following =
        field(obj.relationship_perspectives, "following") ?? field(obj.legacy, "following");
      if (typeof handle === "string" && typeof following === "boolean") {
        found.follows.push([handle.toLowerCase(), following]);
      }
    }
    if (typeof obj.rest_id === "string" && obj.content_disclosure) {
      const labels = labelsIn(obj.content_disclosure);
      if (labels.length) found.labels.push([`x:${obj.rest_id}`, labels]);
    }
    for (const key in obj) {
      const child = obj[key];
      if (typeof child === "object" && child !== null) stack.push(child);
    }
  }
  return found;
}

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

// Any script in the page can dispatch DOM events, so validate external payload shape.
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
