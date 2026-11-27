// For programs that import this outside Chrome, like the eval and the website.
/// <reference types="chrome" />

/**
 * What Slop Goblin keeps in `chrome.storage`, besides the settings (`settings.ts`) and the
 * checked list (`checked.ts`). Nothing is kept anywhere else, apart from the service worker's
 * cache of answers in IndexedDB (`background/cache.ts`).
 */

/** One value in one storage area. */
export interface Stored<T> {
  get(): Promise<T | undefined>;
  set(value: T): Promise<void>;
  remove(): Promise<void>;
  /** Calls `onChange` with every new value. Returns an unsubscribe. */
  watch(onChange: (value: T | undefined) => void): () => void;
}

export function stored<T>(area: "local" | "sync" | "session", key: string): Stored<T> {
  // Looked up on use, so code built on this can be imported outside Chrome, as the eval does.
  const storage = () => chrome.storage[area];
  return {
    get: async () => (await storage().get(key))[key] as T | undefined,
    set: (value) => storage().set({ [key]: value }),
    remove: () => storage().remove(key),
    watch(onChange) {
      const listener = (changes: Record<string, chrome.storage.StorageChange>, changed: string) => {
        if (changed === area && key in changes) onChange(changes[key]!.newValue as T | undefined);
      };
      chrome.storage.onChanged.addListener(listener);
      return () => chrome.storage.onChanged.removeListener(listener);
    },
  };
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
  /** The reader's Gemini API key. Local, not synced: it's only ever sent to Google. */
  apiKey: stored<string>("local", "apiKey"),
  /** In memory, like the checked list: it describes this browser session. */
  status: stored<ServiceStatus>("session", "status"),
  usage: stored<Usage>("local", "usage"),
  siteTheme: stored<SiteTheme>("local", "siteTheme"),
};
