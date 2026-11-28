import { useEffect, useMemo, useState, type ReactNode } from "react";
import { hiddenAmong } from "../core/checked.ts";
import type { Settings as SettingsData } from "../core/settings.ts";
import { store, type ServiceStatus } from "../core/storage.ts";
import { ICONS, Icon } from "./controls.tsx";
import { Den } from "./Den.tsx";
import { Home, HomeTop } from "./Home.tsx";
import {
  type ActiveTab,
  useActiveTab,
  useApiKey,
  useChecked,
  useChromeHost,
  useSettings,
  useSiteTheme,
  useStatus,
} from "./hooks.ts";
import { HostContext } from "./host.ts";
import { Lurker } from "./Lurker.tsx";
import { Settings } from "./Settings.tsx";
import { Setup } from "./Setup.tsx";
import { Message } from "./Summary.tsx";

export function App() {
  const settings = useSettings();
  const apiKey = useApiKey();
  useSiteTheme();
  if (!settings || apiKey === undefined) return null;
  if (!apiKey) return <Setup />;
  return <Main settings={settings} apiKey={apiKey} />;
}

/** Which view is showing, and the side it came in from when the reader switched to it. */
interface View {
  name: "home" | "settings";
  from?: "left" | "right";
}

function Main({ settings, apiKey }: { settings: SettingsData; apiKey: string }) {
  const status = useStatus();
  const tab = useActiveTab();
  const checked = useChecked();
  const host = useChromeHost(tab);
  const hidden = useMemo(() => hiddenAmong(checked ?? [], settings), [checked, settings]);
  const [view, setView] = useState<View>({ name: "home" });

  // Settings slides in from the right, and home comes back from the left. Switching
  // also lands keyboard focus on the button that switches back.
  useEffect(() => {
    if (!view.from) return;
    window.scrollTo(0, 0);
    document.querySelector<HTMLElement>(".top .icon-button")?.focus();
  }, [view]);

  const header =
    view.name === "settings" ? (
      <div className="top-row" key="settings">
        <button
          type="button"
          className="icon-button"
          aria-label="Back"
          onClick={() => setView({ name: "home", from: "left" })}
        >
          <Icon d={ICONS.back} />
        </button>
        <h1 className="top-title">Settings</h1>
      </div>
    ) : (
      <HomeTop
        key="home"
        enabled={settings.enabled}
        onSettings={() => setView({ name: "settings", from: "right" })}
      />
    );

  return (
    <HostContext value={host}>
      <Den
        header={header}
        goblin={<Lurker awake={settings.enabled} fed={checked && hidden.length} />}
      >
        <div className="sheet-body" key={view.name} data-from={view.from}>
          {view.name === "settings" ? (
            <Settings settings={settings} apiKey={apiKey} hidden={hidden} />
          ) : (
            // Nothing until the list and active tab have loaded, so empty states don't flash.
            checked &&
            tab !== undefined && (
              <>
                <Notice status={status} broken={tab?.state?.broken} enabled={settings.enabled} />
                <Home
                  settings={settings}
                  checked={checked}
                  hidden={hidden}
                  pending={tab?.state?.pending ?? 0}
                  message={tabMessage(tab, checked.length)}
                />
              </>
            )
          )}
        </div>
      </Den>
    </HostContext>
  );
}

/** What the summary says in place of the counts when the active tab can't have posts checked yet. */
function tabMessage(tab: ActiveTab | null, checked: number) {
  const onX = Boolean(tab?.url?.startsWith("https://x.com/"));
  // Tabs opened before the extension was installed don't have the content script yet.
  if (onX && tab && !tab.state && !tab.loading) {
    const { id } = tab;
    return (
      <Message
        title="Reload to start"
        action={
          <button
            type="button"
            className="button primary"
            onClick={() => void chrome.tabs.reload(id)}
          >
            Reload tab
          </button>
        }
      >
        This tab was open before Slop Goblin was.
      </Message>
    );
  }
  if (!onX && !checked) {
    return (
      <Message
        title="Not on X"
        action={
          <button
            type="button"
            className="button primary"
            onClick={() => void chrome.tabs.create({ url: "https://x.com/home" })}
          >
            Open x.com
          </button>
        }
      >
        Open X and the goblin starts checking posts.
      </Message>
    );
  }
}

function Notice(props: { status: ServiceStatus; broken?: boolean; enabled: boolean }) {
  const { status, broken = false, enabled } = props;
  if (status.kind === "bad-key") {
    return (
      <NoticeBox
        title="Google rejected your API key"
        body={status.message}
        error
        action={
          <button type="button" className="button small" onClick={() => void store.apiKey.remove()}>
            Replace key
          </button>
        }
      />
    );
  }
  if (broken) {
    return (
      <NoticeBox
        title="Can't read posts on this page"
        body="X probably changed its layout. Posts stay visible until Slop Goblin is updated."
        error
      />
    );
  }
  // Nothing is being checked, so connection trouble doesn't matter.
  if (!enabled) return null;
  switch (status.kind) {
    case "rate-limited":
      return <RateLimitNotice key={status.until} until={status.until} />;
    case "offline":
      return (
        <NoticeBox
          title="Can't reach Gemini"
          body="Posts will be checked when the connection is back."
        />
      );
    case "error":
      return <NoticeBox title="Gemini returned an error" body={status.message} error />;
    default:
      return null;
  }
}

function RateLimitNotice({ until }: { until: number }) {
  const [seconds, setSeconds] = useState(() => Math.ceil((until - Date.now()) / 1000));
  const active = seconds > 0;
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setSeconds(Math.ceil((until - Date.now()) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [until, active]);
  if (!active) return null;
  return (
    <NoticeBox
      title="Gemini rate limit reached"
      body={`Checking resumes in ${seconds}s. Free API keys have tight per-minute limits.`}
    />
  );
}

function NoticeBox(props: { title: string; body: string; error?: boolean; action?: ReactNode }) {
  return (
    <div
      className={props.error ? "notice is-error" : "notice"}
      role={props.error ? "alert" : undefined}
    >
      <p>
        <strong>{props.title}</strong>
        {props.body}
      </p>
      {props.action}
    </div>
  );
}
