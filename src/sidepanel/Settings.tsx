import type { HiddenPost } from "../core/messages.ts";
import { saveApiKey, updateSettings, type Settings as SettingsData } from "../core/settings.ts";
import { CATEGORIES } from "../core/taxonomy.ts";
import { Switch } from "./controls.tsx";

export function Settings(props: { settings: SettingsData; apiKey: string; hidden?: HiddenPost[] }) {
  const { settings, apiKey } = props;
  const set = (patch: Partial<SettingsData>) => void updateSettings(() => patch);

  return (
    <div class="settings">
      <section aria-labelledby="what-title">
        <h2 id="what-title">What to hide</h2>
        <ul class="box">
          {CATEGORIES.map((category) => {
            const on = settings.categories[category.id];
            const here = props.hidden?.filter((p) => p.category === category.id).length;
            return (
              <li class="row">
                <span class="row-text">
                  <span class="row-title">
                    <strong>{category.label}</strong>
                    {on && here ? <span>{here} hidden here</span> : null}
                  </span>
                  <span class="row-desc">{category.blurb}</span>
                </span>
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
        <p class="hint">
          Categories you turn off aren’t sent to Google, so each one you turn off makes checking
          cheaper.
        </p>
      </section>

      <section role="radiogroup" aria-labelledby="mode-title">
        <h2 id="mode-title">Hidden posts</h2>
        <div class="box">
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
              <strong>Remove completely</strong>
              <span class="row-desc">They’re only listed in this panel.</span>
            </span>
          </label>
        </div>
      </section>

      <section aria-labelledby="trusted-title">
        <h2 id="trusted-title">Always show</h2>
        {settings.trusted.length ? (
          <ul class="box">
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
            Accounts you mark with “Always show” are never hidden. They’ll be listed here.
          </p>
        )}
      </section>

      <section aria-labelledby="key-title">
        <h2 id="key-title">Gemini API key</h2>
        <div class="box">
          <div class="row">
            <span class="row-text">
              Key ending in <code>{apiKey.slice(-4)}</code>
            </span>
            <button type="button" class="link" onClick={() => void saveApiKey(null)}>
              Replace
            </button>
          </div>
        </div>
        <p class="hint">
          Posts you scroll past are sent to Google’s Gemini Decisions API with your key. Results
          stay on this device for 30 days, so a post is only sent once.
        </p>
      </section>
    </div>
  );
}
