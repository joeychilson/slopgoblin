import type { ComponentChildren } from "preact";
import type { TabState } from "../core/messages.ts";
import { updateSettings, type Settings } from "../core/settings.ts";
import { STRICTNESS, TRADEOFF, type Strictness } from "../core/taxonomy.ts";
import { Segments } from "./controls.tsx";
import type { ActiveTab } from "./hooks.ts";

/**
 * What the goblin is doing in this tab. Once posts have been checked, the strictness levels
 * are the count: each one shows how many posts it would hide here, and the chosen one is what's
 * hidden now.
 */
export function Summary({ tab, settings }: { tab?: ActiveTab; settings: Settings }) {
  const state = settings.enabled ? tab?.state : undefined;
  return (
    <section class="summary" aria-label="This tab">
      {!settings.enabled ? (
        <Message title="Filtering is off">
          Nothing is hidden, and no posts are sent to Google.
        </Message>
      ) : state?.checked ? (
        <Caption state={state} />
      ) : state ? (
        <Message title="Nothing checked yet">Posts get checked as you scroll.</Message>
      ) : (
        <StartHere tab={tab} />
      )}
      <Segments<Strictness>
        name="strictness"
        label="Strictness"
        value={settings.strictness}
        options={STRICTNESS.map((level) => ({
          value: level,
          label: level[0]!.toUpperCase() + level.slice(1),
          count: state?.checked ? state.hiddenAt[level] : undefined,
        }))}
        onChange={(strictness) => void updateSettings(() => ({ strictness }))}
      />
      <p class="trade" key={settings.strictness}>
        {TRADEOFF[settings.strictness]}
      </p>
    </section>
  );
}

function Caption({ state: { checked, pending } }: { state: TabState }) {
  return (
    <div class="caption">
      <h2>Hidden on this page</h2>
      <span>
        {checked} checked{pending > 0 && `, ${pending} on the way`}
      </span>
    </div>
  );
}

function Message(props: {
  title: string;
  children?: ComponentChildren;
  action?: ComponentChildren;
}) {
  return (
    <div class="message">
      <h2>{props.title}</h2>
      <p>{props.children}</p>
      {props.action}
    </div>
  );
}

/** Shown when Slop Goblin isn't running in the active tab. */
function StartHere({ tab }: { tab?: ActiveTab }) {
  // Tabs opened before the extension was installed don't have the content script yet.
  const reloadId = tab?.url?.startsWith("https://x.com/") ? tab.id : undefined;
  return (
    <Message
      title={reloadId === undefined ? "Not on X" : "Reload to start"}
      action={
        <button
          type="button"
          class="button primary"
          onClick={() =>
            reloadId === undefined
              ? chrome.tabs.create({ url: "https://x.com/home" })
              : chrome.tabs.reload(reloadId)
          }
        >
          {reloadId === undefined ? "Open x.com" : "Reload tab"}
        </button>
      }
    >
      {reloadId === undefined
        ? "Open X and the goblin starts checking posts."
        : "This tab was open before Slop Goblin was."}
    </Message>
  );
}
