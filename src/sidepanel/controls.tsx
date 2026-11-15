export function Switch(props: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      class="switch"
      aria-checked={props.checked}
      aria-label={props.label}
      onClick={() => props.onChange(!props.checked)}
    />
  );
}

/** A 24px stroke icon, colored by the surrounding text. */
export function Icon({ d, size = 18 }: { d: string; size?: number }) {
  return (
    <svg class="icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export const ICONS = {
  settings:
    "M4 7h9M17 7h3M4 17h3M11 17h9M15 5a2 2 0 1 1 0 4 2 2 0 0 1 0-4ZM9 15a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z",
  back: "M15 5l-7 7 7 7",
};
