import type { ReactNode } from "react";
import type { CheckedPost, HiddenPost } from "../core/checked.ts";
import type { Settings } from "../core/settings.ts";
import { ICONS, Icon, Switch } from "./controls.tsx";
import { HiddenList } from "./HiddenList.tsx";
import { useHost } from "./host.ts";
import { Summary } from "./Summary.tsx";

/** The header over home: the name, Settings when there's a settings view to open, and the switch. */
export function HomeTop(props: { enabled: boolean; onSettings?: () => void }) {
  const host = useHost();
  return (
    <div className="top-row">
      <h1 className="wordmark">Slop Goblin</h1>
      {props.onSettings && (
        <button
          type="button"
          className="icon-button"
          aria-label="Settings"
          onClick={props.onSettings}
        >
          <Icon d={ICONS.settings} />
        </button>
      )}
      <Switch
        label="Filtering"
        checked={props.enabled}
        onChange={(enabled) => host.updateSettings(() => ({ enabled }))}
      />
    </div>
  );
}

/** What it hid lately, and how strict it is. */
export function Home(props: {
  settings: Settings;
  checked: CheckedPost[];
  hidden: HiddenPost[];
  /** The active tab's posts still on the way. */
  pending: number;
  /** Said in place of the counts while the active tab needs something first. */
  message?: ReactNode;
}) {
  const { settings, checked, hidden, pending, message } = props;
  return (
    <>
      <Summary settings={settings} checked={checked} pending={pending} message={message} />
      {settings.enabled && <HiddenList hidden={hidden} peek={settings.peek} />}
    </>
  );
}
