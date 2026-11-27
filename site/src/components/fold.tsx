import type { ReactNode } from "react";

/**
 * Opens to its content's height, or closes to nothing, gliding either way. It clips a few pixels
 * out from its content rather than at its edge, so a focus ring around a link at the bottom shows.
 */
export function Fold({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div className={open ? "fold is-open" : "fold"} inert={!open}>
      <div>{children}</div>
    </div>
  );
}
