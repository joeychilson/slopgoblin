import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { ServiceStatus, TabState } from "../core/messages.ts";
import { saveApiKey, updateSettings, type Settings as SettingsData } from "../core/settings.ts";
import { ICONS, Icon, Switch } from "./controls.tsx";
import { HiddenList } from "./HiddenList.tsx";
import { useActiveTab, useApiKey, useSettings, useStatus, useTicker } from "./hooks.ts";
import markUrl from "./mark.svg";
import { Settings } from "./Settings.tsx";
import { Setup } from "./Setup.tsx";
import { Peek, Summary } from "./Summary.tsx";

export function App() {
  const settings = useSettings();
  const apiKey = useApiKey();
  if (!settings || apiKey === undefined) return null;
  if (!apiKey) return <Setup />;
  return <Main settings={settings} apiKey={apiKey} />;
}

function Main({ settings, apiKey }: { settings: SettingsData; apiKey: string }) {
  const status = useStatus();
  const tab = useActiveTab();
  const [view, setView] = useState<"tab" | "settings">("tab");
  const state = settings.enabled ? tab?.state : undefined;

  // Switching views lands keyboard focus on the button that switches back.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    window.scrollTo(0, 0);
    document.querySelector<HTMLElement>(".top .icon-button")?.focus();
  }, [view]);

  if (view === "settings") {
    return (
      <>
        <header class="top">
          <button
            type="button"
            class="icon-button"
            aria-label="Back"
            onClick={() => setView("tab")}
          >
            <Icon d={ICONS.back} />
          </button>
          <h1>Settings</h1>
        </header>
        <Settings settings={settings} apiKey={apiKey} hidden={state?.hidden} />
      </>
    );
  }

  return (
    <>
      <header class="top">
        <img src={markUrl} alt="" width="24" height="24" />
        <h1>Slop Goblin</h1>
        <button
          type="button"
          class="icon-button"
          aria-label="Settings"
          onClick={() => setView("settings")}
        >
          <Icon d={ICONS.settings} />
        </button>
        <Switch
          label="Filtering"
          checked={settings.enabled}
          onChange={(enabled) => updateSettings(() => ({ enabled }))}
        />
      </header>
      <Notice status={status} state={tab?.state} enabled={settings.enabled} />
      <Summary tab={tab} settings={settings} />
      <Peek settings={settings} />
      {state && tab && state.hidden.length > 0 && (
        <HiddenList key={tab.id} tabId={tab.id} hidden={state.hidden} />
      )}
    </>
  );
}

interface NoticeContent {
  title: string;
  body: string;
  error?: boolean;
  action?: ComponentChildren;
}

function Notice(props: { status: ServiceStatus; state?: TabState | null; enabled: boolean }) {
  const { status, state, enabled } = props;
  const now = useTicker(status.kind === "rate-limited");
  const notice = noticeFor(status, state, enabled, now);
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
  state: TabState | null | undefined,
  enabled: boolean,
  now: number,
): NoticeContent | null {
  if (status.kind === "bad-key") {
    return {
      title: "Google rejected your API key",
      body: status.message,
      error: true,
      action: (
        <button type="button" class="button" onClick={() => void saveApiKey(null)}>
          Replace key
        </button>
      ),
    };
  }
  if (state?.broken) {
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
