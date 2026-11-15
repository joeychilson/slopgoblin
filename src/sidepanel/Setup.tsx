import { useState } from "preact/hooks";
import { DecisionError, QUESTIONS, decide } from "../core/decisions.ts";
import { saveApiKey } from "../core/settings.ts";
import markUrl from "./mark.svg";

export function Setup() {
  const [key, setKey] = useState("");
  const [error, setError] = useState<string>();
  const [checking, setChecking] = useState(false);

  async function connect(event: Event) {
    event.preventDefault();
    const candidate = key.trim();
    setChecking(true);
    setError(undefined);
    try {
      await decide(
        candidate,
        { author: { name: "Test", handle: "test" }, text: "Hello" },
        QUESTIONS.slice(0, 1),
      );
      await saveApiKey(candidate);
    } catch (err) {
      // A rate-limited key is still a working key.
      if (err instanceof DecisionError && err.kind === "rate") await saveApiKey(candidate);
      else setError(describe(err));
    } finally {
      setChecking(false);
    }
  }

  return (
    <main class="setup">
      <img class="setup-mark" src={markUrl} alt="" width="72" height="72" />
      <h1>Slop Goblin</h1>
      <p class="lede">Hides AI slop, ragebait, clickbait and other junk from your X feed.</p>

      <form onSubmit={connect}>
        <label for="key">Gemini API key</label>
        <input
          id="key"
          type="password"
          autocomplete="off"
          spellcheck={false}
          placeholder="Paste your key"
          value={key}
          onInput={(e) => setKey(e.currentTarget.value)}
        />
        {error && (
          <p class="error" role="alert">
            {error}
          </p>
        )}
        <button class="button primary wide" disabled={!key.trim() || checking}>
          {checking ? "Checking key…" : "Connect"}
        </button>
      </form>

      <p class="hint">
        Get a free key from{" "}
        <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
          Google AI Studio
        </a>
        . It's stored only in this browser.
      </p>
      <p class="fineprint">
        Posts you scroll past are sent to Google's Gemini Decisions API to be judged. Your key and
        the results stay in this browser.
      </p>
    </main>
  );
}

function describe(error: unknown) {
  if (!(error instanceof DecisionError)) return "Something went wrong. Try again.";
  switch (error.kind) {
    case "auth":
      return "Google rejected this key. Check that you copied all of it.";
    case "transient":
      return "Couldn't reach Google. Check your connection and try again.";
    default:
      return `Google returned an error: ${error.message}`;
  }
}
