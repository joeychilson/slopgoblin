import { useEffect, useRef, useState } from "preact/hooks";
import type { HiddenPost } from "../core/messages.ts";
import { displayName } from "../core/post.ts";
import { updateSettings } from "../core/settings.ts";
import { CATEGORY, THRESHOLD, inSentence } from "../core/taxonomy.ts";
import { ICONS, Icon } from "./controls.tsx";
import { sendToTab } from "./hooks.ts";

/** How long a row takes to fold away; matches `row-out` in panel.css. */
const LEAVE_MS = 240;
/** How long a row takes to open; matches `.item-actions` in panel.css. */
const OPEN_MS = 320;

/**
 * Everything hidden in this tab, newest first: who posted it, why it went, and what it says.
 * Clicking one opens it in place, with the whole text and what can be done about it; one is
 * open at a time. Rows there when the panel opens arrive one after another; later ones slide
 * in at the top.
 */
export function HiddenList(props: { tabId: number; hidden: HiddenPost[]; peek: boolean }) {
  const { tabId, hidden } = props;
  const [open, setOpen] = useState<string | null>(null);
  const firstIds = useRef<string[] | null>(null);
  firstIds.current ??= hidden.map((post) => post.id);
  return (
    <section class="hidden" aria-labelledby="hidden-title">
      <div class="list-head">
        <h2 id="hidden-title">Hidden posts</h2>
        <Peek on={props.peek} />
      </div>
      <ul class="list" onKeyDown={(event) => event.key === "Escape" && setOpen(null)}>
        {hidden.map((post) => (
          <Item
            key={post.id}
            post={post}
            tabId={tabId}
            order={Math.min(firstIds.current!.indexOf(post.id), 10)}
            open={open === post.id}
            onToggle={(next) => setOpen(next ? post.id : null)}
          />
        ))}
      </ul>
    </section>
  );
}

function Peek({ on }: { on: boolean }) {
  const shortcut = useShortcut("toggle-peek");
  return (
    <button
      type="button"
      class="peek"
      aria-pressed={on}
      title="Show hidden posts in the feed, with a label"
      onClick={() => void updateSettings(() => ({ peek: !on }))}
    >
      <Icon d={ICONS.eye} size={16} />
      Peek in feed
      {shortcut && <kbd>{shortcut}</kbd>}
    </button>
  );
}

function Item(props: {
  post: HiddenPost;
  tabId: number;
  order: number;
  open: boolean;
  onToggle: (open: boolean) => void;
}) {
  const { post, tabId, order, open, onToggle } = props;
  const [leaving, setLeaving] = useState(false);
  const row = useRef<HTMLLIElement>(null);
  const isAd = post.category === "ad";
  const isNsfw = post.category === "nsfw";
  const label = isAd ? "Ad" : CATEGORY[post.category].label;
  const name = displayName(post);
  // The same words as the feed.
  const maybe = post.score < THRESHOLD.balanced;
  const why = maybe ? `Possibly ${inSentence(label)}` : label;
  const actionsId = `actions-${post.id}`;

  // Once it has opened, a row near the bottom scrolls up into view.
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(
      () => row.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }),
      OPEN_MS,
    );
    return () => clearTimeout(timer);
  }, [open]);

  async function showInFeed() {
    const found = await sendToTab<boolean>(tabId, { type: "reveal", id: post.id });
    if (!found) await chrome.tabs.create({ url: post.url });
  }

  // The row folds away first, then the feed is told, which takes it off the list.
  function letThrough() {
    onToggle(false);
    setLeaving(true);
    setTimeout(() => void sendToTab(tabId, { type: "not-slop", id: post.id }), LEAVE_MS);
  }

  function trust() {
    onToggle(false);
    void updateSettings((s) => ({
      trusted: [...new Set([...s.trusted, post.handle.toLowerCase()])],
    }));
  }

  const classes = ["item", open && "is-open", leaving && "is-leaving"].filter(Boolean).join(" ");
  return (
    <li ref={row} class={classes} style={order >= 0 ? `--order: ${order}` : undefined}>
      <div class="item-inner">
        <button
          type="button"
          class="item-open"
          aria-expanded={open}
          aria-controls={actionsId}
          onClick={() => onToggle(!open)}
        >
          <span class="avatar">
            {isNsfw ? (
              <Icon d={ICONS.eyeOff} size={16} />
            ) : (
              post.avatar && <img src={post.avatar} alt="" width="32" height="32" />
            )}
          </span>
          <span class="item-body">
            <span class="item-line">
              <span class="item-name">{name}</span>
              <span class={isAd || maybe ? "item-why is-quiet" : "item-why"}>{why}</span>
            </span>
            {/* Explicit text isn't repeated here; the feed covers it too. */}
            <span class={isNsfw || !post.text ? "item-text is-empty" : "item-text"}>
              {isNsfw ? "Text hidden" : post.text || "Media only"}
            </span>
          </span>
        </button>
        <div class="item-actions" id={actionsId} inert={!open}>
          <div>
            <div class="tray">
              <button type="button" style="--i: 0" onClick={showInFeed}>
                <Icon d={ICONS.eye} size={16} />
                <span>Show in feed</span>
              </button>
              {!isAd && (
                <>
                  <button type="button" style="--i: 1" onClick={letThrough}>
                    <Icon d={ICONS.check} size={16} />
                    <span>Not {inSentence(label)}</span>
                  </button>
                  <button type="button" style="--i: 2" onClick={trust}>
                    <Icon d={ICONS.trust} size={16} />
                    <span>Always show {name}</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </li>
  );
}

function useShortcut(name: string) {
  const [shortcut, setShortcut] = useState<string>();
  useEffect(() => {
    void chrome.commands.getAll().then((commands) => {
      setShortcut(commands.find((c) => c.name === name)?.shortcut || undefined);
    });
  }, [name]);
  return shortcut;
}
