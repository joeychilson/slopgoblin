import { useState, type FormEvent } from "react";
import { DecisionError, decide } from "../core/decisions.ts";
import { store } from "../core/storage.ts";
import { Den } from "./Den.tsx";
import { Lurker } from "./Lurker.tsx";

export function Setup() {
  const [key, setKey] = useState("");
  const [error, setError] = useState<string>();
  const [checking, setChecking] = useState(false);
  // The goblin looks away while a key is typed in.
  const [typing, setTyping] = useState(false);

  async function connect(event: FormEvent) {
    event.preventDefault();
    const candidate = key.trim();
    setChecking(true);
    setError(undefined);
    try {
      await decide(candidate, { author: { name: "Test", handle: "test" }, text: "Hello" });
      await store.apiKey.set(candidate);
    } catch (err) {
      // A rate-limited key is still a working key.
      if (err instanceof DecisionError && err.kind === "rate") await store.apiKey.set(candidate);
      else setError(describe(err));
    } finally {
      setChecking(false);
    }
  }

  return (
    <Den
      header={
        <div className="top-row">
          <h1 className="wordmark">Slop Goblin</h1>
        </div>
      }
      goblin={<Lurker awake shy={typing} />}
    >
      <div className="sheet-body setup">
        <p className="lede">Hides AI slop, ragebait, clickbait and other junk from your X feed.</p>

        <form onSubmit={connect}>
          <label htmlFor="key">Gemini API key</label>
          <input
            id="key"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="Paste your key"
            value={key}
            onChange={(e) => setKey(e.currentTarget.value)}
            onFocus={() => setTyping(true)}
            onBlur={() => setTyping(false)}
          />
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="button primary wide" disabled={!key.trim() || checking}>
            {checking ? "Checking key…" : "Connect"}
          </button>
        </form>

        <p className="hint">
          Get a key from{" "}
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
            Google AI Studio
          </a>
          . A free one works; a paid one costs about 10¢ per 1,000 posts checked.
        </p>
        <p className="hint">
          Posts you scroll past are sent to Google’s Gemini Decisions API to be judged. Your key and
          the answers stay in this browser.
        </p>
      </div>
    </Den>
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
