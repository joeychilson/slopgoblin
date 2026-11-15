import type { ComponentChildren } from "preact";

/**
 * The panel's frame: a green ground with the header on it, and one paper sheet holding
 * everything else, with the goblin hanging on to its top edge.
 */
export function Den(props: {
  header: ComponentChildren;
  goblin: ComponentChildren;
  children: ComponentChildren;
}) {
  return (
    <>
      <header class="top">{props.header}</header>
      <div class="edge">
        {props.goblin}
        <main class="sheet">{props.children}</main>
      </div>
    </>
  );
}
