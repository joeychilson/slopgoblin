import { GOBLIN_GLYPH } from "@slopgoblin/extension/core/glyphs.ts";
import { reason, type Verdict } from "@slopgoblin/extension/core/policy.ts";
import { displayName } from "@slopgoblin/extension/core/post.ts";
import type { ReactNode } from "react";

import { Fold } from "@/components/fold";
import type { BarAction, PostView } from "@/hooks/use-demo";
import type { DemoPost } from "@/lib/demo";

/**
 * One post in the demo feed. Junk folds into the bar the extension leaves in its place, in the same
 * words; Show opens it with a line above it.
 */
export function FeedPost(props: {
  post: DemoPost;
  view: PostView;
  onAction: (action: BarAction) => void;
}) {
  const { post, view, onAction } = props;
  const name = displayName(post);
  return (
    <li id={`post-${post.id}`} className="feed-post">
      <Fold open={view.mode === "collapsed"}>
        {view.verdict && (
          <button type="button" className="bar" onClick={() => onAction("reveal")}>
            <span className="bar-slot">
              <span className="bar-ghost" data-face={post.face} />
            </span>
            <span className="bar-what">
              <Why verdict={view.verdict} /> from {name}
            </span>
            <span className="bar-show">Show</span>
          </button>
        )}
      </Fold>
      <Fold open={view.mode !== "collapsed"}>
        <Fold open={view.mode === "revealed" || view.mode === "confirmed"}>
          {view.verdict && <Context name={name} view={view} onAction={onAction} />}
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
function Context(props: { name: string; view: PostView; onAction: (action: BarAction) => void }) {
  const { name, view, onAction } = props;
  if (!view.verdict) return null;
  let words: ReactNode;
  let actions: ReactNode;
  if (view.mode === "confirmed") {
    words =
      view.action === "trust"
        ? `Posts from ${name} will always show`
        : "This post won’t be hidden again";
    actions = <Action label="Undo" primary onClick={() => onAction("undo")} />;
  } else {
    const { midSentence } = reason(view.verdict);
    words = <Why verdict={view.verdict} />;
    actions = (
      <>
        {/* There's no arguing with X's own label. */}
        {!view.verdict.labeled && (
          <>
            <Action label={`Not ${midSentence}`} onClick={() => onAction("not-slop")} />
            <Action label={`Always show ${name}`} onClick={() => onAction("trust")} />
          </>
        )}
        {view.mode === "revealed" && !view.peek && (
          <Action label="Hide" primary onClick={() => onAction("hide")} />
        )}
      </>
    );
  }
  return (
    <div className="context">
      <span className="context-what">
        <svg className="context-goblin" viewBox={GOBLIN_GLYPH.viewBox} aria-hidden="true">
          <path d={GOBLIN_GLYPH.d} fillRule="evenodd" />
        </svg>
        {words}
      </span>
      {actions}
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
