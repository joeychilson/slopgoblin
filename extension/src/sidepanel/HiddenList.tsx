import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import type { CheckedPost, HiddenPost } from "../core/checked.ts";
import { letThroughNote, reason, type LetThrough } from "../core/policy.ts";
import { displayName } from "../core/post.ts";
import { trusting } from "../core/settings.ts";
import { CATEGORIES, CATEGORY, type CategoryId } from "../core/taxonomy.ts";
import { ICONS, Icon } from "./controls.tsx";
import { useHost } from "./host.ts";

/** Matches `.unfold` in panel.css. */
const OPEN_MS = 320;
/** Long enough to reach Undo. Stays while the pointer is over the bar. */
const UNDO_MS = 5000;
const PAGE_SIZE = 50;

/** The most recent let-through, kept briefly so the reader can take it back. */
interface Recent {
  id: string;
  handle: string;
  name: string;
  action: LetThrough;
  /** True once `hidden` reflects the let-through; reappearing means it was undone elsewhere. */
  gone?: boolean;
}

export function HiddenList(props: { hidden: HiddenPost[]; peek: boolean }) {
  const { hidden, peek } = props;
  const host = useHost();
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<CategoryId | "">("");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [recent, setRecent] = useState<Recent | null>(null);
  const [prevHidden, setPrevHidden] = useState(hidden);
  const filterSelect = useRef<HTMLSelectElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const restoring = useRef<string | null>(null);

  // Focus stays with the post Undo brought back, once the list has it again.
  useEffect(() => {
    const id = restoring.current;
    if (!id || !hidden.some(({ post }) => post.id === id)) return;
    restoring.current = null;
    list.current
      ?.querySelector<HTMLElement>(`.item[data-id="${CSS.escape(id)}"] .item-open`)
      ?.focus();
  }, [hidden]);

  // Clear the undo bar as soon as the let-through is undone elsewhere (in X or Settings).
  if (hidden !== prevHidden) {
    setPrevHidden(hidden);
    if (recent) {
      const listed =
        recent.action === "not-slop"
          ? hidden.some(({ post }) => post.id === recent.id)
          : hidden.some(({ post }) => post.handle.toLowerCase() === recent.handle);
      if (!listed && !recent.gone) setRecent({ ...recent, gone: true });
      else if (listed && recent.gone) setRecent(null);
    }
  }

  // Rows there when the panel opens arrive one after another; rows that turn up later, from a
  // new post or a filter, arrive at once.
  const [initialOrder, setInitialOrder] = useState(
    () => new Map(hidden.slice(0, PAGE_SIZE).map(({ post }, i) => [post.id, Math.min(i, 10)])),
  );

  // In the order Settings lists them, so they stay put as counts change.
  const kinds = useMemo(() => {
    const byKind = Map.groupBy(hidden, ({ verdict }) => verdict.category);
    return CATEGORIES.flatMap(({ id }) => {
      const count = byKind.get(id)?.length;
      return count ? [[id, count] as const] : [];
    });
  }, [hidden]);

  const canFilter = kinds.length >= 2;
  const active = canFilter && kinds.some(([id]) => id === filter) ? filter : "";
  const shown = useMemo(
    () => (active ? hidden.filter(({ verdict }) => verdict.category === active) : hidden),
    [hidden, active],
  );
  const visible = shown.slice(0, limit);
  const remaining = shown.length - visible.length;

  // A kind that has no posts left can't stay chosen, and one kind alone has nothing to choose from.
  if (filter && !active) setFilter("");

  // Older posts load as the reader scrolls near the end, without a button. Rows grow in from
  // nothing as they arrive, so it waits for a scroll rather than watching where the end is.
  const loaded = visible.length;
  useEffect(() => {
    if (!remaining) return;
    const onScroll = () => {
      if (scrollY + innerHeight < document.documentElement.scrollHeight - 600) return;
      setLimit((n) => Math.max(n, loaded + PAGE_SIZE));
    };
    addEventListener("scroll", onScroll, { passive: true });
    return () => removeEventListener("scroll", onScroll);
  }, [loaded, remaining]);

  function letThrough(item: HiddenPost, action: LetThrough) {
    const { id } = item.post;
    const handle = item.post.handle.toLowerCase();
    if (action === "not-slop") host.setNotSlop(id, true);
    else host.updateSettings(trusting(handle, true));
    setOpen(null);
    setRecent({ id, handle, name: displayName(item.post), action });
  }

  function focusFallback() {
    (
      document.querySelector<HTMLElement>(".list .item-open") ??
      filterSelect.current ??
      document.querySelector<HTMLElement>(".peek")
    )?.focus({ preventScroll: true });
  }

  function undoRecent() {
    if (!recent) return;
    if (recent.action === "not-slop") host.setNotSlop(recent.id, false);
    else host.updateSettings(trusting(recent.handle, false));
    setRecent(null);
    restoring.current = recent.id;
  }

  function dismissRecent(hadFocus: boolean) {
    setRecent(null);
    if (hadFocus) focusFallback();
  }

  if (!hidden.length && !peek && !recent) return null;

  const heading = active ? CATEGORY[active].label : "Hidden posts";
  return (
    <section className="hidden" aria-label="Hidden posts">
      <div className="list-head">
        {canFilter ? (
          // The select is beside the heading, not in it, so the heading reads as its title alone.
          <div className="list-title">
            <h2 key={heading} className="list-title-text">
              {heading}
            </h2>
            <Icon d={ICONS.chevron} size={16} weight={2.4} />
            <select
              ref={filterSelect}
              aria-label="Filter hidden posts by kind"
              title="Show one kind"
              value={active}
              onChange={(event) => {
                setFilter(event.currentTarget.value as CategoryId | "");
                setLimit(PAGE_SIZE);
                setOpen(null);
                if (initialOrder.size) setInitialOrder(new Map());
              }}
            >
              <KindOption value="" label="All" count={hidden.length} i={0} />
              {kinds.map(([id, count], i) => (
                <KindOption
                  key={id}
                  value={id}
                  label={CATEGORY[id].label}
                  count={count}
                  i={i + 1}
                />
              ))}
            </select>
          </div>
        ) : (
          <h2>{heading}</h2>
        )}
        <Peek on={peek} />
      </div>

      {recent && (
        <UndoBar
          key={`${recent.action}:${recent.id}`}
          note={letThroughNote(recent.action, recent.name)}
          onUndo={undoRecent}
          onDismiss={dismissRecent}
        />
      )}

      {visible.length > 0 ? (
        <ul ref={list} className="list">
          {visible.map((item) => {
            const { id } = item.post;
            return (
              <Item
                key={id}
                item={item}
                order={initialOrder.get(id)}
                open={open === id}
                onToggle={(next) => setOpen(next ? id : null)}
                onLetThrough={(action) => letThrough(item, action)}
              />
            );
          })}
        </ul>
      ) : (
        !recent && <p className="hint">Nothing hidden right now.</p>
      )}
    </section>
  );
}

/**
 * A kind in the list's select: "Ragebait (2)". Where Chrome draws the select's list from CSS, the
 * brackets hide and the count sits at the row's end; the system's menu shows the text as it is.
 */
function KindOption(props: { value: string; label: string; count: number; i: number }) {
  const { label, count } = props;
  return (
    <option value={props.value} aria-label={`${label} (${count})`} style={{ "--i": props.i }}>
      <span className="kind-label">{label}</span>
      <span className="row-count">
        <span className="kind-bracket"> (</span>
        {count}
        <span className="kind-bracket">)</span>
      </span>
    </option>
  );
}

function UndoBar(props: {
  note: string;
  onUndo: () => void;
  onDismiss: (hadFocus: boolean) => void;
}) {
  const { note, onUndo, onDismiss } = props;
  const bar = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const onDismissRef = useRef(onDismiss);
  const messageId = useId();

  useEffect(() => {
    onDismissRef.current = onDismiss;
  });

  useEffect(() => {
    button.current?.focus({ preventScroll: true });
    let timer: ReturnType<typeof setTimeout>;
    const check = () => {
      // Not from under a pointer that may be on its way to Undo.
      if (bar.current?.matches(":hover")) {
        timer = setTimeout(check, 1000);
        return;
      }
      onDismissRef.current(Boolean(bar.current?.contains(document.activeElement)));
    };
    timer = setTimeout(check, UNDO_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div ref={bar} className="undo-bar">
      <output id={messageId}>{note}</output>
      <button
        ref={button}
        type="button"
        className="button small"
        aria-describedby={messageId}
        onClick={onUndo}
      >
        Undo
      </button>
    </div>
  );
}

function Peek({ on }: { on: boolean }) {
  const host = useHost();
  return (
    <button
      type="button"
      className="peek"
      aria-pressed={on}
      title="Show hidden posts in the feed, with a label"
      onClick={() => host.updateSettings(() => ({ peek: !on }))}
    >
      <Icon d={ICONS.eye} size={16} />
      Peek in feed
      {host.peekShortcut && <kbd>{host.peekShortcut}</kbd>}
    </button>
  );
}

function Item(props: {
  item: HiddenPost;
  order?: number;
  open: boolean;
  onToggle: (open: boolean) => void;
  onLetThrough: (action: LetThrough) => void;
}) {
  const { item, open, onToggle } = props;
  const host = useHost();
  const { post, verdict } = item;
  const row = useRef<HTMLLIElement>(null);
  const openButton = useRef<HTMLButtonElement>(null);
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

  function onEscape(event: ReactKeyboardEvent) {
    if (event.key !== "Escape" || !open) return;
    event.preventDefault();
    // Focus goes back to the post, not off the page with its closing actions.
    onToggle(false);
    openButton.current?.focus();
  }

  return (
    <li
      ref={row}
      className={open ? "item is-open" : "item"}
      data-id={post.id}
      style={props.order !== undefined ? { "--order": props.order } : undefined}
    >
      <div className="item-inner">
        <button
          ref={openButton}
          type="button"
          className="item-open"
          aria-expanded={open}
          aria-controls={actionsId}
          onClick={() => onToggle(!open)}
          onKeyDown={onEscape}
        >
          <Avatar post={post} nsfw={isNsfw} />
          <span className="item-body">
            <span className="item-line">
              <span className="item-name">{name}</span>
              <span className={verdict.labeled || possibly ? "item-why is-quiet" : "item-why"}>
                {possibly ? `Possibly ${midSentence}` : label}
              </span>
            </span>
            <span className={isNsfw || !post.text ? "item-text is-empty" : "item-text"}>
              {isNsfw ? "Text hidden" : post.text || "Media only"}
            </span>
          </span>
        </button>
        <div className={open ? "unfold is-open" : "unfold"} id={actionsId} inert={!open}>
          <div>
            <div className="tray">
              <button
                type="button"
                style={{ "--i": 0 }}
                onClick={() => host.showInFeed(post)}
                onKeyDown={onEscape}
              >
                <Icon d={ICONS.eye} size={16} />
                <span>Show in feed</span>
              </button>
              {!verdict.labeled && (
                <>
                  <button
                    type="button"
                    style={{ "--i": 1 }}
                    onClick={() => props.onLetThrough("not-slop")}
                    onKeyDown={onEscape}
                  >
                    <Icon d={ICONS.check} size={16} />
                    <span>Not {midSentence}</span>
                  </button>
                  <button
                    type="button"
                    style={{ "--i": 2 }}
                    onClick={() => props.onLetThrough("trust")}
                    onKeyDown={onEscape}
                  >
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

/** The author's photo; their initial when there's none, or it doesn't load. */
function Avatar({ post, nsfw }: { post: CheckedPost; nsfw: boolean }) {
  // The one that failed, so a new photo gets its own try.
  const [broken, setBroken] = useState<string>();
  const initial = displayName(post).replace(/^@/, "").trim().charAt(0).toUpperCase();
  return (
    <span className="avatar" aria-hidden="true">
      {nsfw ? (
        <Icon d={ICONS.eyeOff} size={16} />
      ) : post.avatar && post.avatar !== broken ? (
        <img
          src={post.avatar}
          alt=""
          width="32"
          height="32"
          loading="lazy"
          decoding="async"
          onError={() => setBroken(post.avatar)}
        />
      ) : (
        <span className="avatar-initial">{initial}</span>
      )}
    </span>
  );
}
