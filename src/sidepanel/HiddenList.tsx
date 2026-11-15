import { useState } from "preact/hooks";
import type { HiddenPost } from "../core/messages.ts";
import { CATEGORIES, CATEGORY, inSentence, type CategoryId } from "../core/taxonomy.ts";
import { ICONS, Icon } from "./controls.tsx";
import { sendToTab } from "./hooks.ts";

/** Hidden posts grouped by category, each group folded until opened. */
export function HiddenList({ tabId, hidden }: { tabId: number; hidden: HiddenPost[] }) {
  const [open, setOpen] = useState<ReadonlySet<CategoryId>>(new Set());
  const groups = CATEGORIES.map((c) => ({
    ...c,
    posts: hidden.filter((p) => p.category === c.id),
  })).filter((g) => g.posts.length);

  function toggle(id: CategoryId) {
    setOpen((ids) => {
      const next = new Set(ids);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  return (
    <section class="hidden" aria-labelledby="hidden-title">
      <h2 id="hidden-title">Hidden posts</h2>
      <ul class="groups">
        {groups.map(({ id, label, posts }) => (
          <li key={id}>
            <button
              type="button"
              class="group-head"
              aria-expanded={open.has(id)}
              onClick={() => toggle(id)}
            >
              <span class="group-label">{label}</span>
              <span class="group-count">{posts.length}</span>
              <Icon d={ICONS.open} size={16} />
            </button>
            {open.has(id) && (
              <ul class="posts">
                {posts.map((post) => (
                  <Item key={post.id} post={post} tabId={tabId} />
                ))}
              </ul>
            )}
          </li>
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

  async function showInFeed() {
    const found = await sendToTab<boolean>(tabId, { type: "reveal", id: post.id });
    if (!found) await chrome.tabs.create({ url: post.url });
  }

  return (
    <li class="post">
      <div class="post-head">
        <span class="post-who">@{post.handle}</span>
        <span class="post-score">{isAd ? "Ad" : `${Math.round(post.score * 100)}%`}</span>
      </div>
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
            Not {inSentence(CATEGORY[post.category].label)}
          </button>
        )}
      </div>
    </li>
  );
}
