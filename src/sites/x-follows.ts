/**
 * Whom the reader follows on X. Posts on the page don't show it, but the data X loads for them
 * does: every author comes with `relationship_perspectives.following`. Only X's own page can see
 * that data, so `readFollows` runs there (loaded by content/page.ts) and passes handles and
 * follow status, nothing else, to `watchFollows` in the content script, over DOM events.
 */

type Follows = [handle: string, following: boolean][];

/** Page to content script: JSON `Follows`, lowercase handles. */
const FOLLOWS = "slopgoblin:follows";
/** Content script to page: send everything known so far. The page script starts well before it. */
const ASK = "slopgoblin:ask-follows";

const GRAPHQL = /^https:\/\/x\.com\/i\/api\/graphql\//;

/** In X's page, before X's own scripts: notes the follow status of every author X loads. */
export function readFollows() {
  const known = new Map<string, boolean>();
  const announce = (follows: Follows) => {
    if (!follows.length) return;
    document.dispatchEvent(new CustomEvent(FOLLOWS, { detail: JSON.stringify(follows) }));
  };
  document.addEventListener(ASK, () => announce([...known]));

  function onLoad(this: XMLHttpRequest) {
    if (!GRAPHQL.test(this.responseURL)) return;
    try {
      const data: unknown =
        this.responseType === "json" ? this.response : JSON.parse(this.responseText);
      const changed: Follows = [];
      for (const [handle, following] of usersIn(data)) {
        if (known.get(handle) === following) continue;
        known.set(handle, following);
        changed.push([handle, following]);
      }
      announce(changed);
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

/** In the content script: hears what `readFollows` finds, starting with everything so far. */
export function watchFollows(onChange: (follows: Follows) => void) {
  document.addEventListener(FOLLOWS, (event) => {
    const follows = parse((event as CustomEvent<unknown>).detail);
    if (follows.length) onChange(follows);
  });
  document.dispatchEvent(new CustomEvent(ASK));
}

/** Every user in an API response that comes with whether the reader follows them. */
function usersIn(data: unknown): Follows {
  const users: Follows = [];
  const visit = (value: unknown) => {
    if (typeof value !== "object" || value === null) return;
    if (field(value, "__typename") === "User") {
      const handle = field(field(value, "core"), "screen_name");
      const following = field(field(value, "relationship_perspectives"), "following");
      if (typeof handle === "string" && typeof following === "boolean") {
        users.push([handle.toLowerCase(), following]);
      }
    }
    for (const child of Object.values(value)) visit(child);
  };
  visit(data);
  return users;
}

const field = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>)[key] : undefined;

/** Any script in the page can send the event, so it's checked. A forged one can only show posts. */
function parse(detail: unknown): Follows {
  if (typeof detail !== "string") return [];
  try {
    const data: unknown = JSON.parse(detail);
    if (!Array.isArray(data)) return [];
    return data.filter(
      (entry): entry is Follows[number] =>
        Array.isArray(entry) && typeof entry[0] === "string" && typeof entry[1] === "boolean",
    );
  } catch {
    return [];
  }
}
