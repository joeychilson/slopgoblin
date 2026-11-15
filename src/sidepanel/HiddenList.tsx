import { useState } from "preact/hooks";
import type { HiddenPost } from "../core/messages.ts";
import { CATEGORY, THRESHOLD, inSentence } from "../core/taxonomy.ts";
import { sendToTab } from "./hooks.ts";

/** Everything hidden in this tab, newest first, to check the goblin's work and undo it. */
export function HiddenList({ tabId, hidden }: { tabId: number; hidden: HiddenPost[] }) {
  return (
    <section class="hidden" aria-labelledby="hidden-title">
      <h2 id="hidden-title">Hidden posts</h2>
      <ul>
        {hidden.map((post) => (
          <Item key={post.id} post={post} tabId={tabId} />
        ))}
      </ul>
    </section>
  );
}

function Item({ post, tabId }: { post: HiddenPost; tabId: number }) {
  // Explicit text stays covered until asked for.
  const [covered, setCovered] = useState(post.category === "nsfw");
  const [expanded, setExpanded] = useState(false);
  const isAd = post.category === "ad";
  const label = isAd ? "Ad" : CATEGORY[post.category].label;
  // The same words as the bar in the feed.
  const unsure = post.score < THRESHOLD.balanced;

  async function showInFeed() {
    const found = await sendToTab<boolean>(tabId, { type: "reveal", id: post.id });
    if (!found) await chrome.tabs.create({ url: post.url });
  }

  return (
    <li class="post">
      <p class="post-head">
        <span class="post-what">
          {unsure && "Possibly "}
          <strong>{unsure ? inSentence(label) : label}</strong> from @{post.handle}
        </span>
        {!isAd && <span class="post-score">{Math.round(post.score * 100)}%</span>}
      </p>
      {covered ? (
        <button type="button" class="post-text is-covered" onClick={() => setCovered(false)}>
          Text hidden. Click to read it.
        </button>
      ) : (
        <button
          type="button"
          class="post-text"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {post.text || "No text, media only"}
        </button>
      )}
      <div class="post-actions">
        <button type="button" class="link is-primary" onClick={showInFeed}>
          Show in feed
        </button>
        {!isAd && (
          <button
            type="button"
            class="link"
            onClick={() => void sendToTab(tabId, { type: "not-slop", id: post.id })}
          >
            Not {inSentence(label)}
          </button>
        )}
      </div>
    </li>
  );
}
