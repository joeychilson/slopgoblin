import type { Verdict } from "../core/policy.ts";
import type { Post } from "../core/post.ts";
import { CATEGORY, THRESHOLD, inSentence } from "../core/taxonomy.ts";

type Author = Post["author"];

export type View =
  | { mode: "shown" }
  | { mode: "removed" }
  | {
      mode: "collapsed" | "revealed";
      id: string;
      author: Author;
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
  const name = nameOf(view.author);
  if (view.mode === "confirmed") {
    const message =
      view.action === "trust"
        ? `Posts from ${name} will always show.`
        : "Got it. This post won't be hidden again.";
    return el("div", "sg-row", [
      el("span", "", message),
      el("span", "sg-actions", [button("undo", "sg-link sg-primary", "Undo")]),
    ]);
  }

  const { category, score } = view.verdict;
  const label = category === "ad" ? "Ad" : CATEGORY[category].label;
  if (view.mode === "collapsed") {
    // The author's faded avatar stands in for the post. A porn bot's avatar would defeat the point.
    const mark = category === "nsfw" ? eyeOff() : el("span", "sg-ghost");
    // Only Strict hides posts the model is this unsure about.
    const what =
      score < THRESHOLD.balanced
        ? ["Possibly ", el("strong", "", inSentence(label)), ` from ${name}`]
        : [el("strong", "", label), ` from ${name}`];
    return button("reveal", "sg-row", [
      el("span", "sg-slot", [mark]),
      el("span", "sg-what", what),
      el("span", "sg-show", "Show"),
    ]);
  }

  const actions: Node[] = [];
  if (category !== "ad") {
    actions.push(
      button("not-slop", "sg-link", `Not ${inSentence(label)}`),
      button("trust", "sg-link", `Always show ${name}`),
    );
  }
  if (!view.peek) actions.push(button("hide", "sg-link sg-primary", "Hide"));
  const why = category === "ad" ? [label] : [label, `, ${Math.round(score * 100)}% sure`];
  return el("div", "sg-row", [
    el("span", "", [el("strong", "", why[0]!), ...why.slice(1)]),
    el("span", "sg-actions", actions),
  ]);
}

/** The display name, unless it's all symbols and emoji, as plenty are. */
const nameOf = ({ name, handle }: Author) => (/[\p{L}\p{N}]/u.test(name) ? name : `@${handle}`);

function eyeOff() {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "sg-glyph");
  svg.setAttribute("aria-hidden", "true");
  for (const d of [
    "M9.9 5.7A9 9 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-2 2.8M6.6 6.6C3.9 8.3 2.5 12 2.5 12s3.5 6.5 9.5 6.5a9 9 0 0 0 5.4-1.9",
    "M9.9 9.9a3 3 0 0 0 4.2 4.2",
    "M3 3l18 18",
  ]) {
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", d);
    svg.append(path);
  }
  return svg;
}

function el(tag: string, className: string, content: string | (string | Node)[] = []) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (typeof content === "string") node.textContent = content;
  else node.append(...content);
  return node;
}

function button(action: BarAction, className: string, content: string | Node[]) {
  const node = el("button", className, content);
  node.setAttribute("type", "button");
  node.dataset.sgAction = action;
  return node;
}
