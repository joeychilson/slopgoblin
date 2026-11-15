import { useEffect, useState } from "preact/hooks";
import type { TabState } from "../core/messages.ts";
import { updateSettings, type Settings } from "../core/settings.ts";
import { STRICTNESS, TRADEOFF, type Strictness } from "../core/taxonomy.ts";
import { Switch } from "./controls.tsx";
import type { ActiveTab } from "./hooks.ts";

/** What the goblin is doing in this tab, and a strictness control that shows what switching would do. */
export function Summary({ tab, settings }: { tab?: ActiveTab; settings: Settings }) {
  const state = settings.enabled ? tab?.state : undefined;
  return (
    <section class="summary" aria-label="This tab">
      {!settings.enabled ? (
        <>
          <p class="headline">Filtering is off</p>
          <p class="sub">Nothing is hidden, and no posts are sent to Google.</p>
        </>
      ) : state ? (
        <Tally state={state} />
      ) : (
        <StartHere tab={tab} />
      )}
      <StrictnessPicker
        value={settings.strictness}
        counts={state?.checked ? state.hiddenAt : undefined}
      />
    </section>
  );
}

function Tally({ state: { checked, pending, hidden } }: { state: TabState }) {
  return (
    <>
      <p class="headline">
        {!checked
          ? "Posts get checked as you scroll"
          : hidden.length
            ? `Hiding ${hidden.length} of ${plural(checked, "post")}`
            : `Checked ${plural(checked, "post")}, nothing to hide`}
      </p>
      <p class="sub">{pending ? `Checking ${pending} more` : ""}</p>
    </>
  );
}

/** Shown when Slop Goblin isn't running in the active tab. */
function StartHere({ tab }: { tab?: ActiveTab }) {
  // Tabs opened before the extension was installed don't have the content script yet.
  const reloadId = tab?.url?.startsWith("https://x.com/") ? tab.id : undefined;
  return (
    <>
      <p class="headline">
        {reloadId === undefined
          ? "Open X to start filtering"
          : "Reload this tab to start filtering"}
      </p>
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
    </>
  );
}

function StrictnessPicker(props: { value: Strictness; counts?: Record<Strictness, number> }) {
  return (
    <>
      <div class="levels" role="radiogroup" aria-label="Strictness">
        {STRICTNESS.map((level) => (
          <label key={level}>
            <input
              type="radio"
              name="strictness"
              checked={level === props.value}
              onChange={() => void updateSettings(() => ({ strictness: level }))}
            />
            <span class="level-name">{level[0]!.toUpperCase() + level.slice(1)}</span>
            {props.counts && <span class="level-count">hides {props.counts[level]}</span>}
          </label>
        ))}
      </div>
      <p class="hint">{TRADEOFF[props.value]}</p>
    </>
  );
}

export function Peek({ settings }: { settings: Settings }) {
  const shortcut = useShortcut("toggle-peek");
  return (
    <div class="peek">
      <span class="row-text">
        <strong>Peek at hidden posts</strong>
        <span class="row-desc">Show them in the feed with a label</span>
      </span>
      {shortcut && <kbd>{shortcut}</kbd>}
      <Switch
        label="Peek at hidden posts"
        checked={settings.peek}
        onChange={(peek) => updateSettings(() => ({ peek }))}
      />
    </div>
  );
}

function useShortcut(name: string) {
  const [shortcut, setShortcut] = useState<string>();
  useEffect(() => {
    void chrome.commands.getAll().then((commands) => {
      setShortcut(commands.find((c) => c.name === name)?.shortcut || undefined);
    });
  }, [name]);
  return shortcut;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
