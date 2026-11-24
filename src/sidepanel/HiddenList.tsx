import { useEffect, useId, useMemo, useRef, useState } from "preact/hooks";
import type { CheckedPost, HiddenPost } from "../core/checked.ts";
import type { RuntimeMessage } from "../core/messages.ts";
import { reason } from "../core/policy.ts";
import { displayName } from "../core/post.ts";
import { updateSettings } from "../core/settings.ts";
import { CATEGORIES, CATEGORY, type CategoryId } from "../core/taxonomy.ts";
import { ICONS, Icon } from "./controls.tsx";
import { sendToTab } from "./hooks.ts";

/** Matches `row-out` in panel.css. */
const LEAVE_MS = 240;
/** Matches `.unfold` in panel.css. */
const OPEN_MS = 320;
/** Long enough to reach Undo. The row stays while the pointer is on it. */
const SETTLE_MS = 5000;
/** An undone row waits this long at most for the list to have it back. */
const RESTORE_MS = 2000;
const PAGE_SIZE = 50;

type LetThrough = "not-slop" | "trust";

/**
 * A row the reader just let through. It stays where it was, saying what happened with an Undo,
 * then folds away, like the post's bar in the feed.
 */
interface Settling {
  item: HiddenPost;
  action: LetThrough;
  leaving: boolean;
  /** Another post by an author just marked "Always show": it only folds away. */
  quiet?: boolean;
  /** Shown as hidden again while the list catches up. */
  undone?: boolean;
  /** True once `hidden` has reflected the let-through; reappearing means it was undone. */
  gone?: boolean;
}

export function HiddenList(props: { hidden: HiddenPost[]; tabId?: number; peek: boolean }) {
  const { tabId, hidden, peek } = props;
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<CategoryId | "">("");
  const [choosing, setChoosing] = useState(false);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [settling, setSettling] = useState<ReadonlyMap<string, Settling>>(new Map());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const title = useRef<HTMLButtonElement>(null);
  const picker = useRef<HTMLDivElement>(null);
  const kindsId = useId();

  // Rows there when the panel opens arrive one after another; rows that turn up later, from a
  // new post or a filter, arrive at once.
  const opening = useRef(true);
  useEffect(() => {
    opening.current = false;
  }, []);

  // Let-through rows stay in their place until they fold away.
  const rows = useMemo(() => {
    const listed = new Set(hidden.map(({ post }) => post.id));
    const extra = [...settling.values()].filter(({ item }) => !listed.has(item.post.id));
    if (!extra.length) return hidden;
    return [...hidden, ...extra.map(({ item }) => item)].sort((a, b) => b.post.at - a.post.at);
  }, [hidden, settling]);

  // In the order Settings lists them, so they stay put as counts change.
  const kinds = useMemo(() => {
    const byKind = Map.groupBy(rows, ({ verdict }) => verdict.category);
    return CATEGORIES.flatMap(({ id }) => {
      const count = byKind.get(id)?.length;
      return count ? [[id, count] as const] : [];
    });
  }, [rows]);

  const canFilter = kinds.length >= 2;
  const active = canFilter && kinds.some(([id]) => id === filter) ? filter : "";
  const shown = useMemo(
    () => (active ? rows.filter(({ verdict }) => verdict.category === active) : rows),
    [rows, active],
  );
  const visible = shown.slice(0, limit);
  const remaining = shown.length - visible.length;

  useEffect(() => {
    if (filter && !active) setFilter("");
    if (choosing && !canFilter) setChoosing(false);
  }, [filter, active, choosing, canFilter]);

  // The kinds close on a click anywhere else, like a menu.
  useEffect(() => {
    if (!choosing) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (title.current?.contains(target) || picker.current?.contains(target)) return;
      setChoosing(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [choosing]);

  // Track when let-through rows leave `hidden`, and hand them back as soon as they return
  // (whether undone here, from the post's bar in the feed, or from Settings).
  useEffect(() => {
    const listed = new Set(hidden.map(({ post }) => post.id));
    setSettling((prev) => {
      if (!prev.size) return prev;
      let changed = false;
      const next = new Map(prev);
      for (const [id, s] of prev) {
        if (!listed.has(id)) {
          if (!s.gone) {
            next.set(id, { ...s, gone: true });
            changed = true;
          }
        } else if (s.gone) {
          clearTimer(id);
          next.delete(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [hidden]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

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

  function clearTimer(id: string) {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
  }

  function later(id: string, ms: number, run: () => void) {
    clearTimer(id);
    timers.current.set(
      id,
      setTimeout(() => {
        timers.current.delete(id);
        run();
      }, ms),
    );
  }

  function drop(...ids: string[]) {
    for (const id of ids) clearTimer(id);
    setSettling((prev) => {
      const next = new Map(prev);
      for (const id of ids) next.delete(id);
      return next;
    });
  }

  function letThrough(item: HiddenPost, action: LetThrough) {
    const { id } = item.post;
    const handle = item.post.handle.toLowerCase();
    if (action === "not-slop") {
      void chrome.runtime.sendMessage<RuntimeMessage>({ type: "not-slop", id, notSlop: true });
    } else {
      void updateSettings((s) => ({ trusted: [...new Set([...s.trusted, handle])] }));
    }
    // The author's other posts go too, and fold away now.
    const others =
      action === "trust"
        ? rows.filter((o) => o.post.id !== id && o.post.handle.toLowerCase() === handle)
        : [];
    setOpen(null);
    setSettling((prev) => {
      const next = new Map(prev).set(id, { item, action, leaving: false });
      for (const other of others) {
        next.set(other.post.id, { item: other, action, leaving: true, quiet: true });
      }
      return next;
    });
    later(id, SETTLE_MS, () => leave(id));
    for (const other of others) later(other.post.id, LEAVE_MS, () => drop(other.post.id));
  }

  function leave(id: string) {
    const row = document.querySelector(`.item[data-id="${CSS.escape(id)}"]`);
    // Not from under a pointer that may be on its way to Undo.
    if (row?.matches(":hover")) return later(id, 1000, () => leave(id));
    // Keyboard focus on the row moves on to the next one rather than falling off the page.
    if (row?.contains(document.activeElement)) {
      const next = row.nextElementSibling ?? row.previousElementSibling;
      (
        next?.querySelector<HTMLElement>(".item-open, .item-undo") ??
        title.current ??
        document.querySelector<HTMLElement>(".peek")
      )?.focus();
    }
    setSettling((prev) => {
      const settled = prev.get(id);
      return settled ? new Map(prev).set(id, { ...settled, leaving: true }) : prev;
    });
    later(id, LEAVE_MS, () => drop(id));
  }

  function undo(id: string) {
    const settled = settling.get(id);
    if (!settled) return;
    const { item, action } = settled;
    const handle = item.post.handle.toLowerCase();
    if (action === "not-slop") {
      void chrome.runtime.sendMessage<RuntimeMessage>({ type: "not-slop", id, notSlop: false });
    } else {
      void updateSettings((s) => ({ trusted: s.trusted.filter((h) => h !== handle) }));
    }
    const restored = [
      id,
      ...(action === "trust"
        ? [...settling.values()]
            .filter((s) => s.quiet && s.item.post.handle.toLowerCase() === handle)
            .map((s) => s.item.post.id)
        : []),
    ];
    setSettling((prev) => {
      const next = new Map(prev);
      for (const otherId of restored) {
        const current = prev.get(otherId);
        if (current) next.set(otherId, { ...current, undone: true, leaving: false, quiet: false });
      }
      return next;
    });
    for (const otherId of restored) later(otherId, RESTORE_MS, () => drop(otherId));
    // Focus stays on the row, now hidden again.
    requestAnimationFrame(() =>
      document.querySelector<HTMLElement>(`.item[data-id="${CSS.escape(id)}"] .item-open`)?.focus(),
    );
  }

  /** One thing open at a time: the kinds, or a post. */
  function toggleKinds() {
    if (!choosing) setOpen(null);
    setChoosing(!choosing);
  }

  function pick(next: CategoryId | "") {
    setFilter(next);
    setLimit(PAGE_SIZE);
    setChoosing(false);
    title.current?.focus();
  }

  if (!rows.length && !peek) return null;

  const heading = active ? CATEGORY[active].label : "Hidden posts";
  return (
    <section class="hidden" aria-labelledby="hidden-title">
      <div class="list-head">
        <h2 id="hidden-title">
          {canFilter ? (
            <button
              ref={title}
              type="button"
              class="list-title"
              aria-expanded={choosing}
              aria-controls={kindsId}
              title="Show one kind"
              onClick={toggleKinds}
              onKeyDown={(event) => {
                if (event.key === "Escape" && choosing) {
                  event.preventDefault();
                  setChoosing(false);
                } else if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setOpen(null);
                  setChoosing(true);
                  requestAnimationFrame(() => focusKind(kindsId, 0));
                }
              }}
            >
              <span key={heading} class="list-title-text">
                {heading}
              </span>
              <Icon d={ICONS.chevron} size={16} weight={2.4} />
            </button>
          ) : (
            heading
          )}
        </h2>
        <Peek on={peek} />
      </div>

      {canFilter && (
        <div
          ref={picker}
          class={choosing ? "unfold kinds is-open" : "unfold kinds"}
          id={kindsId}
          inert={!choosing}
        >
          <div>
            <ul
              class="rows"
              aria-label="Show"
              onKeyDown={(event) =>
                onKindsKey(event, kindsId, () => {
                  setChoosing(false);
                  title.current?.focus();
                })
              }
            >
              <Kind label="All" count={rows.length} on={!active} i={0} onPick={() => pick("")} />
              {kinds.map(([id, count], i) => (
                <Kind
                  key={id}
                  label={CATEGORY[id].label}
                  count={count}
                  on={active === id}
                  i={i + 1}
                  onPick={() => pick(id)}
                />
              ))}
            </ul>
          </div>
        </div>
      )}

      {visible.length > 0 ? (
        <ul
          class="list"
          onKeyDown={(event) => {
            if (event.key !== "Escape" || !open) return;
            // Focus goes back to the post, not off the page with its closing actions.
            const closing = open;
            setOpen(null);
            requestAnimationFrame(() =>
              document
                .querySelector<HTMLElement>(`.item[data-id="${CSS.escape(closing)}"] .item-open`)
                ?.focus(),
            );
          }}
        >
          {visible.map((item, i) => {
            const { id } = item.post;
            const settled = settling.get(id);
            return (
              <Item
                key={id}
                item={item}
                tabId={tabId}
                order={opening.current ? Math.min(i, 10) : -1}
                open={open === id}
                settled={settled && !settled.undone && !settled.quiet ? settled.action : undefined}
                leaving={Boolean(settled?.leaving)}
                onToggle={(next) => {
                  if (next) setChoosing(false);
                  setOpen(next ? id : null);
                }}
                onLetThrough={(action) => letThrough(item, action)}
                onUndo={() => undo(id)}
              />
            );
          })}
        </ul>
      ) : (
        <p class="hint">Nothing hidden right now.</p>
      )}
    </section>
  );
}

function Kind(props: { label: string; count: number; on: boolean; i: number; onPick: () => void }) {
  return (
    <li>
      <button
        type="button"
        class="row"
        aria-pressed={props.on}
        style={`--i: ${props.i}`}
        onClick={props.onPick}
      >
        <span class="row-text">
          <span class="row-title">{props.label}</span>
        </span>
        <span class="row-count">{props.count}</span>
      </button>
    </li>
  );
}

function focusKind(trayId: string, index: number) {
  const kinds = document.querySelectorAll<HTMLElement>(`[id="${trayId}"] .row`);
  if (kinds.length) kinds[(index + kinds.length) % kinds.length]!.focus();
}

function onKindsKey(event: KeyboardEvent, trayId: string, close: () => void) {
  const kinds = [...document.querySelectorAll<HTMLElement>(`[id="${trayId}"] .row`)];
  const at = kinds.indexOf(document.activeElement as HTMLElement);
  const to = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: kinds.length - 1 }[event.key];
  if (event.key === "Escape") {
    event.preventDefault();
    close();
  } else if (to !== undefined) {
    event.preventDefault();
    focusKind(trayId, to);
  }
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
  settled?: LetThrough;
  leaving: boolean;
  onToggle: (open: boolean) => void;
  onLetThrough: (action: LetThrough) => void;
  onUndo: () => void;
}) {
  const { item, tabId, open, settled, leaving, onToggle } = props;
  const { post, verdict } = item;
  const [order] = useState(props.order);
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

  const classes = ["item", open && "is-open", settled && "is-settled", leaving && "is-leaving"]
    .filter(Boolean)
    .join(" ");
  return (
    <li
      ref={row}
      class={classes}
      data-id={post.id}
      style={order >= 0 ? `--order: ${order}` : undefined}
    >
      <div class="item-inner">
        {settled ? (
          <Settled post={post} nsfw={isNsfw} action={settled} onUndo={props.onUndo} />
        ) : (
          <>
            <button
              type="button"
              class="item-open"
              aria-expanded={open}
              aria-controls={actionsId}
              onClick={() => onToggle(!open)}
            >
              <Avatar post={post} nsfw={isNsfw} />
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
            <div class={open ? "unfold is-open" : "unfold"} id={actionsId} inert={!open}>
              <div>
                <div class="tray">
                  <button type="button" style="--i: 0" onClick={showInFeed}>
                    <Icon d={ICONS.eye} size={16} />
                    <span>Show in feed</span>
                  </button>
                  {!verdict.labeled && (
                    <>
                      <button
                        type="button"
                        style="--i: 1"
                        onClick={() => props.onLetThrough("not-slop")}
                      >
                        <Icon d={ICONS.check} size={16} />
                        <span>Not {midSentence}</span>
                      </button>
                      <button
                        type="button"
                        style="--i: 2"
                        onClick={() => props.onLetThrough("trust")}
                      >
                        <Icon d={ICONS.trust} size={16} />
                        <span>Always show {name}</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </li>
  );
}

/** The author's photo; their initial when there's none, or it doesn't load. */
function Avatar({ post, nsfw }: { post: CheckedPost; nsfw: boolean }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [post.avatar]);
  const initial = displayName(post).replace(/^@/, "").trim().charAt(0).toUpperCase();
  return (
    <span class="avatar" aria-hidden="true">
      {nsfw ? (
        <Icon d={ICONS.eyeOff} size={16} />
      ) : post.avatar && !broken ? (
        <img
          src={post.avatar}
          alt=""
          width="32"
          height="32"
          loading="lazy"
          decoding="async"
          onError={() => setBroken(true)}
        />
      ) : (
        <span class="avatar-initial">{initial}</span>
      )}
    </span>
  );
}

/** What letting a post through did, in the words its bar in the feed uses. */
function Settled(props: {
  post: CheckedPost;
  nsfw: boolean;
  action: LetThrough;
  onUndo: () => void;
}) {
  const undoButton = useRef<HTMLButtonElement>(null);
  const messageId = useId();
  const name = displayName(props.post);
  useEffect(() => undoButton.current?.focus(), []);
  return (
    <div class="item-settled">
      <Avatar post={props.post} nsfw={props.nsfw} />
      <span class="item-body">
        <span class="item-line">
          <span class="item-name">{name}</span>
          <button
            ref={undoButton}
            type="button"
            class="item-why item-undo"
            aria-describedby={messageId}
            onClick={props.onUndo}
          >
            Undo
          </button>
        </span>
        <span id={messageId} class="item-text">
          {props.action === "trust"
            ? `Posts from ${name} will always show`
            : "This post won't be hidden again"}
        </span>
      </span>
    </div>
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
