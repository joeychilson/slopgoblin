import { USD_PER_MILLION_TOKENS } from "../core/decisions.ts";
import type { HiddenPost, Usage } from "../core/messages.ts";
import { saveApiKey, updateSettings, type Settings as SettingsData } from "../core/settings.ts";
import { CATEGORIES } from "../core/taxonomy.ts";
import { Switch } from "./controls.tsx";
import { useUsage } from "./hooks.ts";

export function Settings(props: { settings: SettingsData; apiKey: string; hidden?: HiddenPost[] }) {
  const { settings, apiKey } = props;
  const usage = useUsage();
  const set = (patch: Partial<SettingsData>) => void updateSettings(() => patch);

  return (
    <div class="settings">
      <section aria-labelledby="what-title">
        <h2 id="what-title">What to hide</h2>
        <ul>
          {CATEGORIES.map((category) => {
            const on = settings.categories[category.id];
            const here = props.hidden?.filter((p) => p.category === category.id).length;
            return (
              <li class="row">
                <span class="row-text">
                  <strong>{category.label}</strong>
                  <span class="row-desc">{category.blurb}</span>
                </span>
                {on && here ? <span class="row-count">{here} here</span> : null}
                <Switch
                  label={category.label}
                  checked={on}
                  onChange={(next) =>
                    void updateSettings((s) => ({
                      categories: { ...s.categories, [category.id]: next },
                    }))
                  }
                />
              </li>
            );
          })}
        </ul>
      </section>

      <section role="radiogroup" aria-labelledby="mode-title">
        <h2 id="mode-title">When a post is hidden</h2>
        <label class="row is-radio">
          <input
            type="radio"
            name="hide-mode"
            checked={settings.hideMode === "collapse"}
            onChange={() => set({ hideMode: "collapse" })}
          />
          <span class="row-text">
            <strong>Leave a slim bar</strong>
            <span class="row-desc">Says why. Click it to see the post.</span>
          </span>
        </label>
        <label class="row is-radio">
          <input
            type="radio"
            name="hide-mode"
            checked={settings.hideMode === "remove"}
            onChange={() => set({ hideMode: "remove" })}
          />
          <span class="row-text">
            <strong>Remove it completely</strong>
            <span class="row-desc">It’s only listed in this panel.</span>
          </span>
        </label>
      </section>

      <section aria-labelledby="trusted-title">
        <h2 id="trusted-title">Always show</h2>
        {settings.trusted.length ? (
          <ul>
            {settings.trusted.map((handle) => (
              <li class="row">
                <span class="row-text">@{handle}</span>
                <button
                  type="button"
                  class="link"
                  aria-label={`Stop always showing @${handle}`}
                  onClick={() =>
                    void updateSettings((s) => ({ trusted: s.trusted.filter((h) => h !== handle) }))
                  }
                >
                  Remove
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
        <h2 id="key-title">Gemini API key</h2>
        <div class="row">
          <span class="row-text">
            Key ending in <code>{apiKey.slice(-4)}</code>
          </span>
          <button type="button" class="link" onClick={() => void saveApiKey(null)}>
            Replace
          </button>
        </div>
        {usage && <p class="hint">{describeUsage(usage)}</p>}
        <p class="hint">
          Posts you scroll past are sent to Google’s Gemini Decisions API with your key. Answers are
          kept on this device for 30 days, so a post is only sent once.
        </p>
      </section>
    </div>
  );
}

function describeUsage({ posts, tokens }: Usage) {
  const usd = (tokens / 1e6) * USD_PER_MILLION_TOKENS;
  const cost = usd < 0.01 ? "under 1¢" : `about $${usd.toFixed(2)}`;
  return `${posts.toLocaleString()} ${posts === 1 ? "post" : "posts"} checked this month: ${cost} on a paid key, nothing on a free one.`;
}
