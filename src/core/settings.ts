import { stored } from "./storage.ts";
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

/** Synced through the reader's Chrome profile. */
const saved = stored<Partial<Settings>>("sync", "settings");

export const loadSettings = async () => withDefaults(await saved.get());

let pending: Promise<void> = Promise.resolve();

export function updateSettings(patch: (s: Settings) => Partial<Settings>) {
  const run = async () => {
    const current = await loadSettings();
    await saved.set({ ...current, ...patch(current) });
  };
  const next = pending.then(run, run);
  pending = next.catch(() => {});
  return next;
}

export const watchSettings = (onChange: (s: Settings) => void) =>
  saved.watch((s) => onChange(withDefaults(s)));

function withDefaults(saved: Partial<Settings> | undefined): Settings {
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    categories: { ...DEFAULT_SETTINGS.categories, ...saved?.categories },
  };
}
