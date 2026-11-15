import { GOBLIN_GLYPH } from "../core/goblin.ts";
import type { Verdict } from "../core/policy.ts";
import { displayName, type Post } from "../core/post.ts";
import { CATEGORY, THRESHOLD, inSentence } from "../core/taxonomy.ts";

type Author = Post["author"];

export type View =
  | { mode: "shown" }
  | { mode: "removed" }
  | {
      mode: "collapsed" | "revealed";
      id: string;
      author: Author;
      /** Missing until the site has loaded it. */
      avatar?: string;
      verdict: Verdict;
      /** Revealed by peek mode rather than by the user, so there's nothing to re-hide. */
      peek: boolean;
    }
  /** A post the reader let through, with a line saying so and a way back. */
  | { mode: "confirmed"; id: string; author: Author; action: "not-slop" | "trust" };

export type BarAction = "reveal" | "hide" | "not-slop" | "trust" | "undo";

/** Applies a view to a post's container. Hiding is pure CSS keyed off `data-sg`. */
export function renderCell(cell: HTMLElement, view: View) {
  let bar = cell.querySelector<HTMLElement>(":scope > .sg-bar");
  if (view.mode === "shown") {
    delete cell.dataset.sg;
    bar?.remove();
    return;
  }

  cell.dataset.sg = view.mode;
  if (view.mode === "removed") return;

  if (!bar) {
    bar = el("div", "sg-bar");
    cell.prepend(bar);
  }
  const key = JSON.stringify(view);
  if (bar.dataset.key === key) return;
  bar.dataset.key = key;
  bar.dataset.id = view.id;
  bar.replaceChildren(row(view));
}

function row(view: Exclude<View, { mode: "shown" | "removed" }>) {
  const name = displayName(view.author);
  if (view.mode === "confirmed") {
    const message =
      view.action === "trust"
        ? `Posts from ${name} will always show`
        : "This post won't be hidden again";
    return context(message, [], button("undo", "sg-link sg-primary", "Undo"));
  }

  const { category, score } = view.verdict;
  const label = category === "ad" ? "Ad" : CATEGORY[category].label;
  // Only Strict hides posts the model is this unsure about.
  const why =
    score < THRESHOLD.balanced
      ? ["Possibly ", el("strong", "", inSentence(label))]
      : [el("strong", "", label)];

  if (view.mode === "collapsed") {
    // The author's faded avatar stands in for the post. A porn bot's avatar would defeat the point.
    const mark = category === "nsfw" ? eyeOff() : ghost(view.avatar);
    return button("reveal", "sg-row", [
      el("span", "sg-slot", [mark]),
      el("span", "sg-what", [...why, ` from ${name}`]),
      el("span", "sg-show", "Show"),
    ]);
  }

  const letThrough =
    category === "ad"
      ? []
      : [
          button("not-slop", "sg-link", `Not ${inSentence(label)}`),
          button("trust", "sg-link", `Always show ${name}`),
        ];
  // Hide sits where Show was, so the reader can flip a post back and forth.
  return context(
    why,
    letThrough,
    view.peek ? undefined : button("hide", "sg-link sg-primary", "Hide"),
  );
}

/**
 * A line above the post: a small goblin lined up with the avatar's left edge, then the words.
 * The post itself sits right under it.
 */
function context(what: string | (string | Node)[], more: Node[], primary?: HTMLElement) {
  const words = typeof what === "string" ? [what] : what;
  const parts = [el("span", "sg-what", [goblin(), ...words])];
  if (more.length) parts.push(el("span", "sg-more", more));
  if (primary) parts.push(primary);
  return el("div", "sg-context", parts);
}

const SVG = "http://www.w3.org/2000/svg";

function glyph(viewBox: string, paths: string[], className: string) {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", viewBox);
  svg.setAttribute("class", className);
  svg.setAttribute("aria-hidden", "true");
  for (const d of paths) {
    const path = document.createElementNS(SVG, "path");
    path.setAttribute("d", d);
    svg.append(path);
  }
  return svg;
}

const eyeOff = () =>
  glyph(
    "0 0 24 24",
    [
      "M9.9 5.7A9 9 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-2 2.8M6.6 6.6C3.9 8.3 2.5 12 2.5 12s3.5 6.5 9.5 6.5a9 9 0 0 0 5.4-1.9",
      "M9.9 9.9a3 3 0 0 0 4.2 4.2",
      "M3 3l18 18",
    ],
    "sg-glyph",
  );

/** A blank circle until the avatar has loaded. */
function ghost(avatar: string | undefined) {
  const node = el("span", "sg-ghost");
  if (avatar) node.style.backgroundImage = `url(${JSON.stringify(avatar)})`;
  return node;
}

/** In one color, so it takes the line's gray. */
const goblin = () => glyph(GOBLIN_GLYPH.viewBox, [GOBLIN_GLYPH.d], "sg-goblin");

function el(tag: string, className: string, content: string | (string | Node)[] = []) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (typeof content === "string") node.textContent = content;
  else node.append(...content);
  return node;
}

function button(action: BarAction, className: string, content: string | (string | Node)[]) {
  const node = el("button", className, content);
  node.setAttribute("type", "button");
  node.dataset.sgAction = action;
  return node;
}
