import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { LiveFeed } from "@/components/demo/live-feed";
import { LivePanel } from "@/components/demo/live-panel";
import { PillLink } from "@/components/pill-link";
import { useDemo } from "@/hooks/use-demo";
import { site } from "@/lib/site";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [{ property: "og:url", content: `${site.origin}/` }],
    links: [{ rel: "canonical", href: `${site.origin}/` }],
  }),
  component: Home,
});

function Home() {
  // The feed and the side panel are one demo: what's done in either shows in both.
  const demo = useDemo();
  return (
    <>
      <section aria-labelledby="hero-title" className="column split hero">
        <div className="hero-words">
          <h1 id="hero-title" className="display">
            Eats the junk in your X feed
          </h1>
          <p className="lede">
            A Chrome extension that hides AI slop, ragebait, clickbait and other junk as you scroll
            X.
          </p>
          <div className="hero-cta">
            <PillLink href={site.store} tone="ground" size="large">
              Add to Chrome
            </PillLink>
            <p className="note">Free and open source. Works with a free Gemini API key.</p>
          </div>
        </div>
        <LiveFeed demo={demo} />
      </section>

      <div className="page-sheet">
        <section aria-labelledby="panel-title" className="column split panel-section">
          <div>
            <h2 id="panel-title" className="title">
              See what it hid, and why
            </h2>
            <p className="body">
              The side panel lists what it hid lately, and why. Choose how strict it is, let through
              anything it got wrong, or peek at hidden posts in the feed. This one is live, on the
              feed above.
            </p>
          </div>
          <LivePanel demo={demo} />
        </section>

        <section aria-labelledby="setup-title" className="column split setup">
          <div>
            <h2 id="setup-title" className="title">
              Set up in a minute
            </h2>
            <ol className="steps">
              <Step>Add Slop Goblin to Chrome.</Step>
              <Step>
                Get a Gemini API key from <TextLink href={site.apiKey}>Google AI Studio</TextLink>.
              </Step>
              <Step>
                Click the goblin in Chrome’s extensions menu, paste the key, and scroll X.
              </Step>
            </ol>
            <div className="setup-cta">
              <PillLink href={site.store} tone="sheet" size="large">
                Add to Chrome
              </PillLink>
              <p className="note">Needs Chrome 123 or later.</p>
            </div>
          </div>
          <dl className="facts">
            <div>
              <dt>What it sends</dt>
              <dd>
                Posts you scroll past go to Google to be judged, with your key, and nowhere else.
                Your own posts, ads and people you follow aren’t sent. With a free key, Google may
                use what it receives to improve its products.{" "}
                <TextLink href={site.privacy}>Privacy policy</TextLink>
              </dd>
            </div>
            <div>
              <dt>What it costs</dt>
              <dd>Nothing with a free key. A paid key costs about 10¢ per 1,000 posts.</dd>
            </div>
          </dl>
        </section>
      </div>
    </>
  );
}

/** One numbered step. Its words are one cell, beside the number. */
function Step({ children }: { children: ReactNode }) {
  return (
    <li>
      <span>{children}</span>
    </li>
  );
}

function TextLink({ href, children }: { href: string; children: string }) {
  return (
    <a href={href} className="text-link">
      {children}
    </a>
  );
}
