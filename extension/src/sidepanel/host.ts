import { createContext, useContext } from "react";
import type { CheckedPost } from "../core/checked.ts";
import type { Settings } from "../core/settings.ts";

/**
 * What the panel does beyond drawing itself. In the extension that's Chrome (`useChromeHost`);
 * on the website, a demo feed on the page.
 */
export interface Host {
  updateSettings: (patch: (s: Settings) => Partial<Settings>) => void;
  /** Lets a post through, or hides it again. */
  setNotSlop: (id: string, notSlop: boolean) => void;
  /** In its tab when it's still there, or opened in a new one. */
  showInFeed: (post: CheckedPost) => void;
  /** For a tab that was open before the extension was. */
  reloadTab: (id: number) => void;
  openX: () => void;
  /** The keyboard shortcut for Peek, when the reader has one. */
  peekShortcut?: string;
}

export const HostContext = createContext<Host | null>(null);

export function useHost() {
  const host = useContext(HostContext);
  if (!host) throw new Error("The panel is drawn outside a HostContext.");
  return host;
}
