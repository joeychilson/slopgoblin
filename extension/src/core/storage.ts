// For programs that import this outside Chrome, like the eval and the website.
/// <reference types="chrome" />
import type { CheckedPost } from "./checked.ts";
import type { Settings } from "./settings.ts";

/**
 * What Slop Goblin keeps in `chrome.storage`. Nothing is kept anywhere else, apart from the
 * service worker's cache of answers in IndexedDB (`background/cache.ts`).
 */

type Area = "local" | "sync" | "session";

/** One value in one storage area. */
export interface Stored<T> {
  get(): Promise<T | undefined>;
  set(value: T): Promise<void>;
  /**
   * Changes what's saved. Changes in one page, or in the service worker, wait their turn, so none
   * is lost.
   */
  update(change: (saved: T | undefined) => T): Promise<void>;
  remove(): Promise<void>;
  /** Calls `onChange` with every new value. Returns an unsubscribe. */
  watch(onChange: (value: T | undefined) => void): () => void;
}

export function stored<T>(area: Area, key: string): Stored<T> {
  // Looked up on use, so code built on this can be imported outside Chrome, as the eval does.
  const storage = () => chrome.storage[area];
  const get = async () => (await storage().get(key))[key] as T | undefined;
  const set = (value: T) => storage().set({ [key]: value });
  let last: Promise<void> = Promise.resolve();
  return {
    get,
    set,
    update: (change) => {
      const run = async () => set(change(await get()));
      const next = last.then(run, run);
      last = next.catch(() => {});
      return next;
    },
    remove: () => storage().remove(key),
    watch: (onChange) =>
      watchArea(area, (changes) => {
        if (key in changes) onChange(changes[key]!.newValue as T | undefined);
      }),
  };
}

/**
 * Values by id in one storage area, each under its own key, so a change writes and announces only
 * that value.
 */
function storedEach<T>(area: Area, prefix: string) {
  const storage = () => chrome.storage[area];
  const byId = <V>(items: Record<string, V>) =>
    new Map(
      Object.entries(items).flatMap(([key, value]) =>
        key.startsWith(prefix) ? [[key.slice(prefix.length), value] as const] : [],
      ),
    );
  return {
    getAll: async () => byId((await storage().get(null)) as Record<string, T>),
    set: (values: Record<string, T>) =>
      storage().set(
        Object.fromEntries(Object.entries(values).map(([id, value]) => [prefix + id, value])),
      ),
    remove: (ids: string[]) => storage().remove(ids.map((id) => prefix + id)),
    /** Calls `onChange` with each id that changed and its new value, undefined once removed. */
    watch: (onChange: (changes: Map<string, T | undefined>) => void) =>
      watchArea(area, (changes) => {
        const mine = byId(changes);
        if (mine.size) {
          onChange(new Map([...mine].map(([id, { newValue }]) => [id, newValue as T | undefined])));
        }
      }),
  };
}

function watchArea(
  area: Area,
  onChange: (changes: Record<string, chrome.storage.StorageChange>) => void,
) {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, changed: string) => {
    if (changed === area) onChange(changes);
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

/** How the Decisions API last answered, for the side panel's notices. */
export type ServiceStatus =
  | { kind: "ok" }
  | { kind: "bad-key"; message: string }
  | { kind: "rate-limited"; until: number }
  | { kind: "offline" }
  /** The API rejected a request for a reason retrying won't fix. */
  | { kind: "error"; message: string };

/** What this month's checking has used. */
export interface Usage {
  /** "2026-11", in UTC. */
  month: string;
  posts: number;
  tokens: number;
}

export const thisMonth = () => new Date().toISOString().slice(0, 7);

/** The site's light, dim or dark background, last seen. The side panel matches it. */
export type SiteTheme = "light" | "dim" | "dark";

export const store = {
  /**
   * Synced through the reader's Chrome profile. Only what the reader changed is saved, so
   * `settings.ts` reads and changes it, filling in the defaults.
   */
  settings: stored<Partial<Settings>>("sync", "settings"),
  /** The reader's Gemini API key. Local, not synced: it's only ever sent to Google. */
  apiKey: stored<string>("local", "apiKey"),
  /** In memory, like the checked list: it describes this browser session. */
  status: stored<ServiceStatus>("session", "status"),
  usage: stored<Usage>("local", "usage"),
  siteTheme: stored<SiteTheme>("local", "siteTheme"),
  /** Posts checked in this Chrome session, in any tab, by id: in memory, like the status. */
  checked: storedEach<CheckedPost>("session", "checked:"),
};
