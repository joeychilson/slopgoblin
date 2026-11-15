import type { ComponentChildren } from "preact";
import { hiddenAtEach, type CheckedPost } from "../core/checked.ts";
import { updateSettings, type Settings } from "../core/settings.ts";
import { STRICTNESS, TRADEOFF, type Strictness } from "../core/taxonomy.ts";
import { Segments } from "./controls.tsx";
import type { ActiveTab } from "./hooks.ts";

/**
 * What the goblin has been up to since Chrome started. Once posts have been checked, the
 * strictness levels are the count: each one shows how many of them it would hide, and the
 * chosen one is what's hidden now.
 */
export function Summary(props: { tab?: ActiveTab; settings: Settings; checked: CheckedPost[] }) {
  const { tab, settings, checked } = props;
  // Strictness changes nothing while filtering is off, so it isn't offered.
  if (!settings.enabled) {
    return (
      <section class="summary" aria-label="Summary">
        <Message title="Filtering is off">
          Nothing is hidden, and no posts are sent to Google.
        </Message>
      </section>
    );
  }
  const counts = checked.length ? hiddenAtEach(checked, settings) : undefined;
  // Tabs opened before the extension was installed don't have the content script yet.
  const reloadId = tab?.url?.startsWith("https://x.com/") && !tab.state ? tab.id : undefined;
  return (
    <section class="summary" aria-label="Summary">
      {reloadId !== undefined ? (
        <Message
          title="Reload to start"
          action={<Button onClick={() => chrome.tabs.reload(reloadId)}>Reload tab</Button>}
        >
          This tab was open before Slop Goblin was.
        </Message>
      ) : checked.length ? (
        <Caption checked={checked.length} pending={tab?.state?.pending ?? 0} />
      ) : tab?.state ? (
        <Message title="Nothing checked yet">Posts get checked as you scroll.</Message>
      ) : (
        <Message
          title="Not on X"
          action={
            <Button onClick={() => chrome.tabs.create({ url: "https://x.com/home" })}>
              Open x.com
            </Button>
          }
        >
          Open X and the goblin starts checking posts.
        </Message>
      )}
      <Segments<Strictness>
        name="strictness"
        label="Strictness"
        value={settings.strictness}
        options={STRICTNESS.map((level) => ({
          value: level,
          label: level[0]!.toUpperCase() + level.slice(1),
          count: counts?.[level],
        }))}
        onChange={(strictness) => void updateSettings(() => ({ strictness }))}
      />
      <p class="trade" key={settings.strictness}>
        {TRADEOFF[settings.strictness]}
      </p>
    </section>
  );
}

function Caption(props: { checked: number; pending: number }) {
  return (
    <div class="caption">
      <h2>Hidden lately</h2>
      <span>
        {props.checked.toLocaleString()} checked
        {props.pending > 0 && `, ${props.pending} on the way`}
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

function Button(props: { onClick: () => void; children: ComponentChildren }) {
  return (
    <button type="button" class="button primary" onClick={props.onClick}>
      {props.children}
    </button>
  );
}
