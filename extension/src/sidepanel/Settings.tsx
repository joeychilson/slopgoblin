import { useId, useMemo } from "react";
import type { HiddenPost } from "../core/checked.ts";
import { USD_PER_MILLION_TOKENS } from "../core/decisions.ts";
import { GOBLIN_GLYPH } from "../core/glyphs.ts";
import { trusting, type Settings as SettingsData } from "../core/settings.ts";
import { store, type Usage } from "../core/storage.ts";
import { CATEGORIES } from "../core/taxonomy.ts";
import { ICONS, Icon, Segments, Switch } from "./controls.tsx";
import { useUsage } from "./hooks.ts";
import { useHost } from "./host.ts";

type HideMode = SettingsData["hideMode"];

const HIDE_MODES: Record<HideMode, { label: string; hint: string }> = {
  collapse: {
    label: "Slim bar",
    hint: "Leaves a slim bar that says why. Click it to see the post.",
  },
  remove: {
    label: "Remove",
    hint: "Takes the post out completely. It’s only listed in this panel.",
  },
};

export function Settings(props: { settings: SettingsData; apiKey: string; hidden: HiddenPost[] }) {
  const { settings, apiKey, hidden } = props;
  const usage = useUsage();
  const host = useHost();
  const byKind = useMemo(() => Map.groupBy(hidden, ({ verdict }) => verdict.category), [hidden]);

  return (
    <div className="settings">
      <section aria-labelledby="what-title">
        <h2 id="what-title" className="section-title">
          What to hide
        </h2>
        <ul className="rows">
          {CATEGORIES.map((category) => (
            <SwitchRow
              key={category.id}
              title={category.label}
              desc={category.blurb}
              on={settings.categories[category.id]}
              hidden={byKind.get(category.id)?.length}
              onChange={(on) =>
                host.updateSettings((s) => ({ categories: { ...s.categories, [category.id]: on } }))
              }
            />
          ))}
        </ul>
      </section>

      <section aria-labelledby="mode-title">
        <h2 id="mode-title" className="section-title">
          When a post is hidden
        </h2>
        <FeedSketch mode={settings.hideMode} />
        <Segments<HideMode>
          name="hide-mode"
          label="When a post is hidden"
          value={settings.hideMode}
          options={(Object.keys(HIDE_MODES) as HideMode[]).map((mode) => ({
            value: mode,
            label: HIDE_MODES[mode].label,
          }))}
          onChange={(hideMode) => host.updateSettings(() => ({ hideMode }))}
        />
        <p className="hint" key={settings.hideMode}>
          {HIDE_MODES[settings.hideMode].hint}
        </p>
      </section>

      <section aria-labelledby="trusted-title">
        <h2 id="trusted-title" className="section-title">
          Always show
        </h2>
        <ul className="rows">
          <SwitchRow
            title="People you follow"
            desc="Never hidden or checked"
            on={settings.trustFollowing}
            onChange={(trustFollowing) => host.updateSettings(() => ({ trustFollowing }))}
          />
        </ul>
        {settings.trusted.length ? (
          <ul className="chips">
            {settings.trusted.map((handle) => (
              <li key={handle} className="chip">
                @{handle}
                <button
                  type="button"
                  aria-label={`Stop always showing @${handle}`}
                  onClick={() => host.updateSettings(trusting(handle, false))}
                >
                  <Icon d={ICONS.close} size={14} weight={2.2} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="hint">
            Accounts you mark with “Always show” are never hidden or checked. They’ll be listed
            here.
          </p>
        )}
      </section>

      <section aria-labelledby="key-title">
        <h2 id="key-title" className="section-title">
          Gemini API key
        </h2>
        <div className="key">
          <span>
            Key ending in <code>{apiKey.slice(-4)}</code>
          </span>
          <button type="button" className="button small" onClick={() => void store.apiKey.remove()}>
            Replace
          </button>
        </div>
        {usage && <p className="hint">{describeUsage(usage)}</p>}
        <p className="hint">
          Posts you scroll past are sent to Google’s Gemini Decisions API with your key. Answers are
          kept on this device for 30 days, so a post is only sent once. Checked posts are kept in
          memory for this panel until Chrome quits.
        </p>
      </section>
    </div>
  );
}

/** A setting that's on or off: its name, what it does, and a switch. Off, the words fade. */
function SwitchRow(props: {
  title: string;
  desc: string;
  on: boolean;
  /** How many posts it hides right now. */
  hidden?: number;
  onChange: (on: boolean) => void;
}) {
  const id = useId();
  return (
    <li>
      <label className={props.on ? "row" : "row is-off"} htmlFor={id}>
        <span className="row-text">
          <span className="row-title">{props.title}</span>
          <span className="row-desc">{props.desc}</span>
        </span>
        {props.on && props.hidden ? <span className="row-count">{props.hidden} hidden</span> : null}
        <Switch id={id} label={props.title} checked={props.on} onChange={props.onChange} />
      </label>
    </li>
  );
}

function FeedSketch({ mode }: { mode: HideMode }) {
  return (
    <div className="sketch" data-mode={mode} aria-hidden="true">
      <i className="sketch-post" />
      <i className="sketch-bar">
        <svg viewBox={GOBLIN_GLYPH.viewBox}>
          <path d={GOBLIN_GLYPH.d} />
        </svg>
      </i>
      <i className="sketch-post" />
    </div>
  );
}

function describeUsage({ posts, tokens }: Usage) {
  const usd = (tokens / 1e6) * USD_PER_MILLION_TOKENS;
  const cost = usd < 0.01 ? "under 1¢" : `about $${usd.toFixed(2)}`;
  return `${posts.toLocaleString()} ${posts === 1 ? "post" : "posts"} checked this month: ${cost} on a paid key, nothing on a free one.`;
}
