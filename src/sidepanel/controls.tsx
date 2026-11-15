import { useEffect, useRef } from "preact/hooks";

export function Switch(props: {
  checked: boolean;
  label: string;
  id?: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      id={props.id}
      class="switch"
      aria-checked={props.checked}
      aria-label={props.label}
      onClick={() => props.onChange(!props.checked)}
    />
  );
}

export interface Segment<T extends string> {
  value: T;
  label: string;
  /** Shown after the label: what picking this one would mean here. */
  count?: number;
}

/** Radio buttons in a slim track, with the chosen one on a pill that springs across to it. */
export function Segments<T extends string>(props: {
  name: string;
  label: string;
  value: T;
  options: Segment<T>[];
  onChange: (value: T) => void;
}) {
  const { options, value } = props;
  const at = options.findIndex((o) => o.value === value);
  return (
    <div
      class="segments"
      role="radiogroup"
      aria-label={props.label}
      style={`--n: ${options.length}; --at: ${at}`}
    >
      <span class="segments-pill" aria-hidden="true" />
      {options.map((option) => (
        <label key={option.value} class="segment">
          <input
            type="radio"
            name={props.name}
            aria-label={
              option.count === undefined ? undefined : `${option.label}, hides ${option.count}`
            }
            checked={option.value === value}
            onChange={() => props.onChange(option.value)}
          />
          {option.label}
          {option.count !== undefined && <Count n={option.count} />}
        </label>
      ))}
    </div>
  );
}

/** A number that pops when it changes, but not when it first appears. */
function Count({ n }: { n: number }) {
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
  }, []);
  return (
    <span key={n} class={mounted.current ? "segment-count is-new" : "segment-count"}>
      {n}
    </span>
  );
}

/** A 24px stroke icon, colored by the surrounding text. */
export function Icon({ d, size = 20, weight }: { d: string; size?: number; weight?: number }) {
  return (
    <svg class="icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d={d} stroke-width={weight} />
    </svg>
  );
}

export const ICONS = {
  settings:
    "M4 7h9M17 7h3M4 17h3M11 17h9M15 5a2 2 0 1 1 0 4 2 2 0 0 1 0-4ZM9 15a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z",
  back: "M15 5l-7 7 7 7",
  eye: "M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12ZM12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z",
  eyeOff:
    "M9.9 5.7A9 9 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-2 2.8M6.6 6.6C3.9 8.3 2.5 12 2.5 12s3.5 6.5 9.5 6.5a9 9 0 0 0 5.4-1.9M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18",
  close: "M7 7l10 10M17 7 7 17",
  check: "M5 12.5l4.5 4.5L19 7.5",
  // A person with a plus: added to the accounts that are always shown.
  trust:
    "M15 19.5c0-3-2.7-5.5-6-5.5s-6 2.5-6 5.5M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM19 8v6M16 11h6",
};
