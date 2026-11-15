import type { HiddenPost } from "../core/checked.ts";
import { USD_PER_MILLION_TOKENS } from "../core/decisions.ts";
import { GOBLIN_GLYPH } from "../core/goblin.ts";
import type { Usage } from "../core/messages.ts";
import { saveApiKey, updateSettings, type Settings as SettingsData } from "../core/settings.ts";
import { CATEGORIES } from "../core/taxonomy.ts";
import { ICONS, Icon, Segments, Switch } from "./controls.tsx";
import { useUsage } from "./hooks.ts";

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

  return (
    <div class="settings">
      <section aria-labelledby="what-title">
        <h2 id="what-title" class="section-title">
          What to hide
        </h2>
        <ul class="rows">
          {CATEGORIES.map((category) => {
            const on = settings.categories[category.id];
            const count = hidden.filter(({ verdict }) => verdict.category === category.id).length;
            const id = `category-${category.id}`;
            return (
              <li key={category.id}>
                <label class={on ? "row" : "row is-off"} for={id}>
                  <span class="row-text">
                    <span class="row-title">{category.label}</span>
                    <span class="row-desc">{category.blurb}</span>
                  </span>
                  {on && count ? <span class="row-count">{count} hidden</span> : null}
                  <Switch
                    id={id}
                    label={category.label}
                    checked={on}
                    onChange={(next) =>
                      void updateSettings((s) => ({
                        categories: { ...s.categories, [category.id]: next },
                      }))
                    }
                  />
                </label>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="mode-title">
        <h2 id="mode-title" class="section-title">
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
          onChange={(hideMode) => void updateSettings(() => ({ hideMode }))}
        />
        <p class="hint" key={settings.hideMode}>
          {HIDE_MODES[settings.hideMode].hint}
        </p>
      </section>

      <section aria-labelledby="trusted-title">
        <h2 id="trusted-title" class="section-title">
          Always show
        </h2>
        <ul class="rows">
          <li>
            <label class={settings.trustFollowing ? "row" : "row is-off"} for="trust-following">
              <span class="row-text">
                <span class="row-title">People you follow</span>
                <span class="row-desc">Never hidden or sent to Google</span>
              </span>
              <Switch
                id="trust-following"
                label="People you follow"
                checked={settings.trustFollowing}
                onChange={(trustFollowing) => void updateSettings(() => ({ trustFollowing }))}
              />
            </label>
          </li>
        </ul>
        {settings.trusted.length ? (
          <ul class="chips">
            {settings.trusted.map((handle) => (
              <li key={handle} class="chip">
                @{handle}
                <button
                  type="button"
                  aria-label={`Stop always showing @${handle}`}
                  onClick={() =>
                    void updateSettings((s) => ({ trusted: s.trusted.filter((h) => h !== handle) }))
                  }
                >
                  <Icon d={ICONS.close} size={14} weight={2.2} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p class="hint">
            Accounts you mark with “Always show” are never hidden or sent to Google. They’ll be
            listed here.
          </p>
        )}
      </section>

      <section aria-labelledby="key-title">
        <h2 id="key-title" class="section-title">
          Gemini API key
        </h2>
        <div class="key">
          <span>
            Key ending in <code>{apiKey.slice(-4)}</code>
          </span>
          <button type="button" class="button small" onClick={() => void saveApiKey(null)}>
            Replace
          </button>
        </div>
        {usage && <p class="hint">{describeUsage(usage)}</p>}
        <p class="hint">
          Posts you scroll past are sent to Google’s Gemini Decisions API with your key. Answers are
          kept on this device for 30 days, so a post is only sent once. Checked posts are kept in
          memory for this panel until Chrome quits.
        </p>
      </section>
    </div>
  );
}

/** Three posts in a feed; the middle one is hidden, and folds away entirely on Remove. */
function FeedSketch({ mode }: { mode: HideMode }) {
  return (
    <div class="sketch" data-mode={mode} aria-hidden="true">
      <i class="sketch-post" />
      <i class="sketch-bar">
        <svg viewBox={GOBLIN_GLYPH.viewBox}>
          <path d={GOBLIN_GLYPH.d} />
        </svg>
      </i>
      <i class="sketch-post" />
    </div>
  );
}

function describeUsage({ posts, tokens }: Usage) {
  const usd = (tokens / 1e6) * USD_PER_MILLION_TOKENS;
  const cost = usd < 0.01 ? "under 1¢" : `about $${usd.toFixed(2)}`;
  return `${posts.toLocaleString()} ${posts === 1 ? "post" : "posts"} checked this month: ${cost} on a paid key, nothing on a free one.`;
}
