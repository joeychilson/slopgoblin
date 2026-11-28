import { useMemo, type ReactNode } from "react";
import { hiddenAtEach, type CheckedPost } from "../core/checked.ts";
import type { Settings } from "../core/settings.ts";
import { STRICTNESS, TRADEOFF, type Strictness } from "../core/taxonomy.ts";
import { Segments } from "./controls.tsx";
import { useHost } from "./host.ts";

export function Summary(props: {
  settings: Settings;
  checked: CheckedPost[];
  /** The active tab's posts still on the way. */
  pending: number;
  /** Said in place of the counts while the active tab needs something first. */
  message?: ReactNode;
}) {
  const { settings, checked, pending, message } = props;
  const host = useHost();
  const counts = useMemo(
    () => (settings.enabled && checked.length ? hiddenAtEach(checked, settings) : undefined),
    [checked, settings],
  );

  // Strictness changes nothing while filtering is off, so omit it.
  if (!settings.enabled) {
    return (
      <section className="summary" aria-label="Summary">
        <Message title="Filtering is off">
          Nothing is hidden, and no posts are sent to Google.
        </Message>
      </section>
    );
  }

  return (
    <section className="summary" aria-label="Summary">
      {message ??
        (checked.length ? (
          <Caption checked={checked.length} pending={pending} />
        ) : (
          <Message title="Nothing checked yet">Posts get checked as you scroll.</Message>
        ))}
      <Segments<Strictness>
        name="strictness"
        label="Strictness"
        value={settings.strictness}
        options={STRICTNESS.map((level) => ({
          value: level,
          label: level[0]!.toUpperCase() + level.slice(1),
          count: counts?.[level],
        }))}
        onChange={(strictness) => host.updateSettings(() => ({ strictness }))}
      />
      <p className="trade" key={settings.strictness}>
        {TRADEOFF[settings.strictness]}
      </p>
    </section>
  );
}

function Caption(props: { checked: number; pending: number }) {
  return (
    <div className="caption">
      <h2>Hidden lately</h2>
      <span>
        {props.checked.toLocaleString()} checked
        {props.pending > 0 && `, ${props.pending} on the way`}
      </span>
    </div>
  );
}

export function Message(props: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="message">
      <h2>{props.title}</h2>
      <p>{props.children}</p>
      {props.action}
    </div>
  );
}
