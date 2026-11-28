import { store } from "./storage.ts";
import { CATEGORIES, type CategoryId, type Strictness } from "./taxonomy.ts";

export interface Settings {
  enabled: boolean;
  strictness: Strictness;
  categories: Record<CategoryId, boolean>;
  /** "collapse" leaves a slim bar in place of the post; "remove" hides it entirely. */
  hideMode: "collapse" | "remove";
  /** Show hidden posts in place, tagged, to audit the filter. */
  peek: boolean;
  /** Lowercase handles that are never hidden. */
  trusted: string[];
  /** Accounts the reader follows are never hidden either, apart from their ads. */
  trustFollowing: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  strictness: "balanced",
  categories: Object.fromEntries(CATEGORIES.map((c) => [c.id, true])) as Record<
    CategoryId,
    boolean
  >,
  hideMode: "collapse",
  peek: false,
  trusted: [],
  trustFollowing: true,
};

/** The change that always shows an author's posts, or stops doing so. */
export const trusting =
  (handle: string, on: boolean) =>
  ({ trusted }: Settings): Partial<Settings> => {
    // `judge` compares handles in lowercase.
    const h = handle.toLowerCase();
    return { trusted: on ? [...new Set([...trusted, h])] : trusted.filter((t) => t !== h) };
  };

export const loadSettings = async () => withDefaults(await store.settings.get());

export const updateSettings = (patch: (s: Settings) => Partial<Settings>) =>
  store.settings.update((s) => {
    const current = withDefaults(s);
    return { ...current, ...patch(current) };
  });

export const watchSettings = (onChange: (s: Settings) => void) =>
  store.settings.watch((s) => onChange(withDefaults(s)));

function withDefaults(saved: Partial<Settings> | undefined): Settings {
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    categories: { ...DEFAULT_SETTINGS.categories, ...saved?.categories },
  };
}
