import { readData } from "../sites/x-data.ts";

/**
 * Runs in the site's own page rather than the extension's isolated world, from document_start,
 * for what a site only shows its own scripts. Keyed by hostname, like `SITES` in index.ts.
 */
const IN_PAGE: Record<string, () => void> = { "x.com": readData };

IN_PAGE[location.hostname]?.();
