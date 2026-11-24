import { useEffect, useId, useMemo, useRef, useState } from "preact/hooks";
import type { HiddenPost } from "../core/checked.ts";
import type { RuntimeMessage } from "../core/messages.ts";
import { reason } from "../core/policy.ts";
import { displayName } from "../core/post.ts";
import { updateSettings } from "../core/settings.ts";
import { CATEGORY, type CategoryId } from "../core/taxonomy.ts";
import { ICONS, Icon } from "./controls.tsx";
import { sendToTab } from "./hooks.ts";

/** Matches `row-out` in panel.css. */
const LEAVE_MS = 240;
/** Matches `.item-actions` in panel.css. */
const OPEN_MS = 320;
const PAGE_SIZE = 50;
const UNDO_MS = 6000;

type UndoAction =
  | { kind: "not-slop"; id: string; text: string }
  | { kind: "trust"; handle: string; text: string };

export function HiddenList(props: { hidden: HiddenPost[]; tabId?: number; peek: boolean }) {
  const { tabId, hidden } = props;
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<CategoryId | null>(null);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [undo, setUndo] = useState<UndoAction | null>(null);

  const firstOrder = useRef<Map<string, number> | null>(null);
  const filtersRef = useRef<HTMLDivElement>(null);
  firstOrder.current ??= new Map(hidden.map(({ post }, i) => [post.id, Math.min(i, 10)]));

  const categoryCounts = useMemo(() => {
    const counts = new Map<CategoryId, number>();
    for (const { verdict } of hidden) {
      counts.set(verdict.category, (counts.get(verdict.category) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [hidden]);

  useEffect(() => {
    if (filter && !categoryCounts.some(([id]) => id === filter)) {
      setFilter(null);
      filtersRef.current?.scrollTo({ left: 0 });
    }
  }, [filter, categoryCounts]);

  const activeFilter = filter && categoryCounts.some(([id]) => id === filter) ? filter : null;
  const filtered = useMemo(
    () =>
      activeFilter ? hidden.filter(({ verdict }) => verdict.category === activeFilter) : hidden,
    [hidden, activeFilter],
  );
  const visible = filtered.slice(0, limit);
  const remaining = filtered.length - visible.length;

  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(() => setUndo(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [undo]);

  function performUndo() {
    if (!undo) return;
    if (undo.kind === "not-slop") {
      void chrome.runtime.sendMessage<RuntimeMessage>({
        type: "not-slop",
        id: undo.id,
        notSlop: false,
      });
    } else {
      const handle = undo.handle;
      void updateSettings((s) => ({ trusted: s.trusted.filter((h) => h !== handle) }));
    }
    setUndo(null);
  }

  if (!hidden.length && !props.peek && !undo) return null;

  return (
    <section
      class="hidden"
      aria-labelledby={hidden.length || props.peek ? "hidden-title" : undefined}
    >
      {(hidden.length > 0 || props.peek) && (
        <div class="list-head">
          <h2 id="hidden-title">Hidden posts</h2>
          <Peek on={props.peek} />
        </div>
      )}

      {undo && (
        <div class="undo-bar" role="status">
          <span>{undo.text}</span>
          <button type="button" class="undo-link" onClick={performUndo}>
            Undo
          </button>
        </div>
      )}

      {categoryCounts.length >= 2 && (
        <div ref={filtersRef} class="filters" role="group" aria-label="Filter by category">
          <button
            type="button"
            class="filter-pill"
            aria-pressed={activeFilter === null}
            onClick={() => {
              setFilter(null);
              setLimit(PAGE_SIZE);
            }}
          >
            All <span>{hidden.length}</span>
          </button>
          {categoryCounts.map(([id, count]) => (
            <button
              key={id}
              type="button"
              class="filter-pill"
              aria-pressed={activeFilter === id}
              onClick={() => {
                setFilter(activeFilter === id ? null : id);
                setLimit(PAGE_SIZE);
              }}
            >
              {CATEGORY[id].label} <span>{count}</span>
            </button>
          ))}
        </div>
      )}

      {visible.length > 0 && (
        <ul class="list" onKeyDown={(event) => event.key === "Escape" && setOpen(null)}>
          {visible.map((item) => (
            <Item
              key={item.post.id}
              item={item}
              tabId={tabId}
              order={firstOrder.current!.get(item.post.id) ?? -1}
              open={open === item.post.id}
              onToggle={(next) => setOpen(next ? item.post.id : null)}
              onUndo={setUndo}
            />
          ))}
        </ul>
      )}

      {remaining > 0 && (
        <button
          type="button"
          class="button small load-more"
          onClick={() => setLimit((n) => n + PAGE_SIZE)}
        >
          Show {Math.min(remaining, PAGE_SIZE)} older ({remaining} more)
        </button>
      )}
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
  item: HiddenPost;
  tabId?: number;
  order: number;
  open: boolean;
  onToggle: (open: boolean) => void;
  onUndo: (action: UndoAction) => void;
}) {
  const { item, tabId, order, open, onToggle, onUndo } = props;
  const { post, verdict } = item;
  const [leaving, setLeaving] = useState(false);
  const row = useRef<HTMLLIElement>(null);
  const isNsfw = verdict.category === "nsfw";
  const { label, midSentence, possibly } = reason(verdict);
  const name = displayName(post);
  const actionsId = useId();

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(
      () => row.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }),
      OPEN_MS,
    );
    return () => clearTimeout(timer);
  }, [open]);

  async function showInFeed() {
    const found =
      tabId !== undefined && (await sendToTab<boolean>(tabId, { type: "reveal", id: post.id }));
    if (!found) await chrome.tabs.create({ url: post.url });
  }

  function letThrough() {
    if (leaving) return;
    onToggle(false);
    setLeaving(true);
    setTimeout(() => {
      void chrome.runtime.sendMessage<RuntimeMessage>({
        type: "not-slop",
        id: post.id,
        notSlop: true,
      });
      onUndo({ kind: "not-slop", id: post.id, text: "This post won't be hidden again" });
    }, LEAVE_MS);
  }

  function trust() {
    const handle = post.handle.toLowerCase();
    onToggle(false);
    void updateSettings((s) => ({ trusted: [...new Set([...s.trusted, handle])] }));
    onUndo({ kind: "trust", handle, text: `Posts from ${name} will always show` });
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
              post.avatar && (
                <img
                  src={post.avatar}
                  alt=""
                  width="32"
                  height="32"
                  loading="lazy"
                  decoding="async"
                />
              )
            )}
          </span>
          <span class="item-body">
            <span class="item-line">
              <span class="item-name">{name}</span>
              <span class={verdict.labeled || possibly ? "item-why is-quiet" : "item-why"}>
                {possibly ? `Possibly ${midSentence}` : label}
              </span>
            </span>
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
              {!verdict.labeled && (
                <>
                  <button type="button" style="--i: 1" onClick={letThrough}>
                    <Icon d={ICONS.check} size={16} />
                    <span>Not {midSentence}</span>
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
