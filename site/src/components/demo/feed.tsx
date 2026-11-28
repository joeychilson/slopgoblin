import {
  lineActions,
  type BarAction,
  type LineView,
  type View,
} from "@slopgoblin/extension/content/view.ts";
import { GOBLIN_GLYPH } from "@slopgoblin/extension/core/glyphs.ts";
import { letThroughNote, reason, type Verdict } from "@slopgoblin/extension/core/policy.ts";
import { displayName } from "@slopgoblin/extension/core/post.ts";
import { useEffect, useRef, useState } from "react";

import { Fold } from "@/components/fold";
import type { DemoPost } from "@/lib/demo";

/**
 * One post in the demo feed, drawn from the same view as its bar in X. Junk folds into the bar,
 * in the same words; Show opens it with a line above it.
 */
export function FeedPost(props: {
  post: DemoPost;
  view: View;
  onAction: (action: BarAction) => void;
}) {
  const { post, view } = props;
  const name = displayName(post);
  // A bar or a line folding away keeps its words until it's gone.
  const [bar, setBar] = useState(view);
  const [line, setLine] = useState(view);
  if (view.mode === "collapsed" && view !== bar) setBar(view);
  if ((view.mode === "revealed" || view.mode === "confirmed") && view !== line) setLine(view);

  // As in X, focus on a button that goes moves to the new bar's last one: Show, Hide or Undo.
  const item = useRef<HTMLLIElement>(null);
  const hadFocus = useRef(false);
  const onAction = (action: BarAction) => {
    hadFocus.current = Boolean(item.current?.contains(document.activeElement));
    props.onAction(action);
  };
  useEffect(() => {
    if (!hadFocus.current) return;
    hadFocus.current = false;
    const buttons = item.current?.querySelectorAll<HTMLElement>("button") ?? [];
    [...buttons].findLast((button) => !button.closest("[inert]"))?.focus();
  }, [view]);

  return (
    <li ref={item} id={`post-${post.id}`} className="feed-post">
      <Fold open={view.mode === "collapsed"}>
        {bar.mode === "collapsed" && (
          <button type="button" className="bar" onClick={() => onAction("reveal")}>
            <span className="bar-slot">
              <span className="bar-ghost" data-face={post.face} />
            </span>
            <span className="bar-what">
              <Why verdict={bar.verdict} /> from {name}
            </span>
            <span className="bar-show">Show</span>
          </button>
        )}
      </Fold>
      <Fold open={view.mode !== "collapsed" && view.mode !== "removed"}>
        <Fold open={view.mode === "revealed" || view.mode === "confirmed"}>
          {(line.mode === "revealed" || line.mode === "confirmed") && (
            <Context name={name} view={line} onAction={onAction} />
          )}
        </Fold>
        <Body post={post} name={name} />
      </Fold>
    </li>
  );
}

/** The reason, as the bar puts it: "Ragebait", or "Possibly ragebait" when it's a close call. */
function Why({ verdict }: { verdict: Verdict }) {
  const { label, midSentence, possibly } = reason(verdict);
  return possibly ? (
    <>
      Possibly <strong>{midSentence}</strong>
    </>
  ) : (
    <strong>{label}</strong>
  );
}

/**
 * The line above a post that's showing anyway: a small goblin lined up with the avatar, the words,
 * then what can be done about it.
 */
function Context(props: { name: string; view: LineView; onAction: (action: BarAction) => void }) {
  const { name, view, onAction } = props;
  const { more, main } = lineActions(view);
  return (
    <div className="context">
      <span className="context-what">
        <svg className="context-goblin" viewBox={GOBLIN_GLYPH.viewBox} aria-hidden="true">
          <path d={GOBLIN_GLYPH.d} fillRule="evenodd" />
        </svg>
        {view.mode === "confirmed" ? (
          letThroughNote(view.action, name)
        ) : (
          <Why verdict={view.verdict} />
        )}
      </span>
      {more.map(({ action, label }) => (
        <Action key={action} label={label} onClick={() => onAction(action)} />
      ))}
      {main && <Action label={main.label} primary onClick={() => onAction(main.action)} />}
    </div>
  );
}

function Action(props: { label: string; primary?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={props.primary ? "context-action is-primary" : "context-action"}
      onClick={props.onClick}
    >
      {props.label}
    </button>
  );
}

function Body({ post, name }: { post: DemoPost; name: string }) {
  return (
    <article className="post">
      <span className="post-avatar" aria-hidden="true" data-face={post.face}>
        {name[0]}
      </span>
      <div className="post-main">
        <div className="post-head">
          <span className="post-name">{name}</span>
          <span className="post-meta">{post.labels.includes("ad") ? "· Ad" : `· ${post.ago}`}</span>
          {post.followed && <span className="post-following">Following</span>}
        </div>
        {post.replyingTo && <p className="post-reply">Replying to {post.replyingTo}</p>}
        <p className="post-text">{post.text}</p>
      </div>
    </article>
  );
}
