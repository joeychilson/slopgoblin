import { EYE_OFF, GOBLIN_GLYPH } from "../core/glyphs.ts";
import { letThroughNote, reason } from "../core/policy.ts";
import { displayName } from "../core/post.ts";
import type { BarAction, View } from "./view.ts";

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
    return context(
      letThroughNote(view.action, name),
      [],
      button("undo", "sg-link sg-primary", "Undo"),
    );
  }

  const { category } = view.verdict;
  const { label, midSentence, possibly } = reason(view.verdict);
  const why = possibly ? ["Possibly ", el("strong", "", midSentence)] : [el("strong", "", label)];

  if (view.mode === "collapsed") {
    // The author's faded avatar stands in for the post. A porn bot's avatar would defeat the point.
    const mark = category === "nsfw" ? glyph("0 0 24 24", EYE_OFF, "sg-glyph") : ghost(view.avatar);
    return button("reveal", "sg-row", [
      el("span", "sg-slot", [mark]),
      el("span", "sg-what", [...why, ` from ${name}`]),
      el("span", "sg-show", "Show"),
    ]);
  }

  // There's no arguing with the site's own label.
  const letThrough = view.verdict.labeled
    ? []
    : [
        button("not-slop", "sg-link", `Not ${midSentence}`),
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

function glyph(viewBox: string, d: string, className: string) {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", viewBox);
  svg.setAttribute("class", className);
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(SVG, "path");
  path.setAttribute("d", d);
  svg.append(path);
  return svg;
}

/** A blank circle until the avatar has loaded. */
function ghost(avatar: string | undefined) {
  const node = el("span", "sg-ghost");
  if (avatar) node.style.backgroundImage = `url(${JSON.stringify(avatar)})`;
  return node;
}

/** In one color, so it takes the line's gray. */
const goblin = () => glyph(GOBLIN_GLYPH.viewBox, GOBLIN_GLYPH.d, "sg-goblin");

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
