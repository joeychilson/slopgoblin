import { GOBLIN_GLYPH } from "@slopgoblin/extension/core/glyphs.ts";

import { PillLink } from "@/components/pill-link";
import { site } from "@/lib/site";

/** The green bar along the top. The page scrolls up under it. */
export function Header() {
  return (
    <>
      <a href="#main" className="skip">
        Skip to content
      </a>
      <header className="masthead">
        <div className="column masthead-row">
          <a href="/" className="wordmark-link">
            <svg viewBox={GOBLIN_GLYPH.viewBox} aria-hidden="true">
              <path d={GOBLIN_GLYPH.d} fillRule="evenodd" />
            </svg>
            {site.name}
          </a>
          <nav aria-label="Site" className="masthead-nav">
            <a href={site.repo} className="plain-link masthead-github">
              GitHub
            </a>
            <PillLink href={site.store} size="small">
              Add to Chrome
            </PillLink>
          </nav>
        </div>
      </header>
    </>
  );
}
