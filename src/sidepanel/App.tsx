import type { ComponentChildren } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { hiddenAmong } from "../core/checked.ts";
import type { ServiceStatus } from "../core/messages.ts";
import { saveApiKey, updateSettings, type Settings as SettingsData } from "../core/settings.ts";
import { ICONS, Icon, Switch } from "./controls.tsx";
import { Den } from "./Den.tsx";
import { HiddenList } from "./HiddenList.tsx";
import {
  useActiveTab,
  useApiKey,
  useChecked,
  useSettings,
  useSiteTheme,
  useStatus,
  useTicker,
} from "./hooks.ts";
import { Lurker } from "./Lurker.tsx";
import { Settings } from "./Settings.tsx";
import { Setup } from "./Setup.tsx";
import { Summary } from "./Summary.tsx";

export function App() {
  const settings = useSettings();
  const apiKey = useApiKey();
  useSiteTheme();
  if (!settings || apiKey === undefined) return null;
  if (!apiKey) return <Setup />;
  return <Main settings={settings} apiKey={apiKey} />;
}

type View = "home" | "settings";

function Main({ settings, apiKey }: { settings: SettingsData; apiKey: string }) {
  const status = useStatus();
  const tab = useActiveTab();
  const checked = useChecked();
  const hidden = useMemo(() => hiddenAmong(checked ?? [], settings), [checked, settings]);
  const [view, setView] = useState<View>("home");

  // Settings slides in from the right, and home comes back from the left. Switching
  // also lands keyboard focus on the button that switches back.
  const switched = useRef(false);
  useEffect(() => {
    if (!switched.current) return;
    window.scrollTo(0, 0);
    document.querySelector<HTMLElement>(".top .icon-button")?.focus();
  }, [view]);
  const go = (next: View) => {
    switched.current = true;
    setView(next);
  };
  const from = switched.current ? (view === "settings" ? "right" : "left") : undefined;

  const header =
    view === "settings" ? (
      <div class="top-row" key="settings">
        <button type="button" class="icon-button" aria-label="Back" onClick={() => go("home")}>
          <Icon d={ICONS.back} />
        </button>
        <h1 class="top-title">Settings</h1>
      </div>
    ) : (
      <div class="top-row" key="home">
        <h1 class="wordmark">Slop Goblin</h1>
        <button
          type="button"
          class="icon-button"
          aria-label="Settings"
          onClick={() => go("settings")}
        >
          <Icon d={ICONS.settings} />
        </button>
        <Switch
          label="Filtering"
          checked={settings.enabled}
          onChange={(enabled) => updateSettings(() => ({ enabled }))}
        />
      </div>
    );

  return (
    <Den header={header} goblin={<Lurker awake={settings.enabled} fed={hidden.length} />}>
      <div class="sheet-body" key={view} data-from={from}>
        {view === "settings" ? (
          <Settings settings={settings} apiKey={apiKey} hidden={hidden} />
        ) : (
          // Nothing until the list has loaded, so it doesn't flash "Nothing checked yet".
          checked && (
            <>
              <Notice status={status} broken={tab?.state?.broken} enabled={settings.enabled} />
              <Summary tab={tab} settings={settings} checked={checked} />
              {hidden.length > 0 && (
                <HiddenList
                  hidden={hidden}
                  tabId={tab?.state ? tab.id : undefined}
                  peek={settings.peek}
                />
              )}
            </>
          )
        )}
      </div>
    </Den>
  );
}

interface NoticeContent {
  title: string;
  body: string;
  error?: boolean;
  action?: ComponentChildren;
}

function Notice(props: { status: ServiceStatus; broken?: boolean; enabled: boolean }) {
  const { status, broken = false, enabled } = props;
  const now = useTicker(status.kind === "rate-limited");
  const notice = noticeFor(status, broken, enabled, now);
  if (!notice) return null;
  return (
    <div
      class={notice.error ? "notice is-error" : "notice"}
      role={notice.error ? "alert" : undefined}
    >
      <p>
        <strong>{notice.title}</strong>
        {notice.body}
      </p>
      {notice.action}
    </div>
  );
}

function noticeFor(
  status: ServiceStatus,
  /** The active tab's posts can't be read. */
  broken: boolean,
  enabled: boolean,
  now: number,
): NoticeContent | null {
  if (status.kind === "bad-key") {
    return {
      title: "Google rejected your API key",
      body: status.message,
      error: true,
      action: (
        <button type="button" class="button small" onClick={() => void saveApiKey(null)}>
          Replace key
        </button>
      ),
    };
  }
  if (broken) {
    return {
      title: "Can't read posts on this page",
      body: "X probably changed its layout. Posts stay visible until Slop Goblin is updated.",
      error: true,
    };
  }
  // Nothing is being checked, so connection trouble doesn't matter.
  if (!enabled) return null;
  switch (status.kind) {
    case "rate-limited": {
      const seconds = Math.ceil((status.until - now) / 1000);
      if (seconds <= 0) return null;
      return {
        title: "Gemini rate limit reached",
        body: `Checking resumes in ${seconds}s. Free API keys have tight per-minute limits.`,
      };
    }
    case "offline":
      return {
        title: "Can't reach Gemini",
        body: "Posts will be checked when the connection is back.",
      };
    case "error":
      return { title: "Gemini returned an error", body: status.message, error: true };
  }
  return null;
}
