import type { ReactNode } from "react";

/**
 * The panel's frame: a green ground with the header on it, and one paper sheet holding
 * everything else, with the goblin hanging on to its top edge.
 */
export function Den(props: { header: ReactNode; goblin: ReactNode; children: ReactNode }) {
  return (
    <div className="den">
      <header className="top">{props.header}</header>
      <div className="edge">
        {props.goblin}
        <div className="sheet">{props.children}</div>
      </div>
    </div>
  );
}
