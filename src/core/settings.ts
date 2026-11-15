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
};

const KEY = "settings";

export async function loadSettings(): Promise<Settings> {
  const { [KEY]: stored } = await chrome.storage.sync.get(KEY);
  return withDefaults(stored as Partial<Settings> | undefined);
}

export async function updateSettings(patch: (s: Settings) => Partial<Settings>) {
  const current = await loadSettings();
  await chrome.storage.sync.set({ [KEY]: { ...current, ...patch(current) } });
}

export const watchSettings = (onChange: (s: Settings) => void) =>
  watchStorage<Partial<Settings>>("sync", KEY, (stored) => onChange(withDefaults(stored)));

function withDefaults(stored: Partial<Settings> | undefined): Settings {
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    categories: { ...DEFAULT_SETTINGS.categories, ...stored?.categories },
  };
}

const API_KEY = "apiKey";

export async function loadApiKey(): Promise<string | undefined> {
  const { [API_KEY]: key } = await chrome.storage.local.get(API_KEY);
  return typeof key === "string" && key ? key : undefined;
}

export const saveApiKey = (key: string | null) =>
  key ? chrome.storage.local.set({ [API_KEY]: key }) : chrome.storage.local.remove(API_KEY);

export const watchApiKey = (onChange: (key: string | undefined) => void) =>
  watchStorage<string>("local", API_KEY, (key) => onChange(key || undefined));

/** Calls `onChange` with the new value whenever `key` changes in the given storage area. Returns an unsubscribe. */
export function watchStorage<T>(
  area: chrome.storage.AreaName,
  key: string,
  onChange: (value: T | undefined) => void,
): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, changedArea: string) => {
    if (changedArea === area && key in changes) onChange(changes[key]?.newValue as T | undefined);
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
