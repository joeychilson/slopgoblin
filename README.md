# Slop Goblin

A Chrome extension that hides AI slop, ragebait, clickbait, engagement bait, reply spam, NSFW posts, grifts and ads from your X feed. Each post is judged by Google's [Gemini Decisions API](https://ai.google.dev/gemini-api/docs/decisions) with your own API key.

Hidden posts collapse into a slim bar that says why. Click it to see the post. The side panel lists what's hidden in the current tab by category and shows how many posts each strictness would hide there. **Peek** (<kbd>Alt+Shift+P</kbd>) shows hidden posts in place with a label, so you can check the goblin's work.

## Setup

```sh
pnpm install
vp build
```

Open `chrome://extensions`, turn on Developer mode, click **Load unpacked** and pick `dist/`. Click the toolbar icon to open the side panel and paste a key from [Google AI Studio](https://aistudio.google.com/apikey).

## Development

```sh
vp run dev     # rebuild on change, then hit reload on chrome://extensions
vp check       # format, lint and type check
```

The toolchain is [Vite+](https://vite.plus): `vp` wraps Vite (build), Oxlint (lint, type-aware), Oxfmt (format) and TypeScript.

## How it works

```
content script (x.com)            service worker                    Gemini
 sites/x.ts  reads posts   ──►    classifier.ts  cache + queue  ──►  Decisions API
 feed.ts     tracks them   ◄──    cache.ts       IndexedDB
 bar.ts      hides them
        ▲
        └── settings (chrome.storage.sync) ──► side panel (Preact)
```

- **One request per post.** Every category you have on is a yes/no question asked in a single Decisions call. With all of them on, a text post is about 1,300 input tokens, so 10,000 posts cost about $1.30, and the free tier covers roughly 35 posts a minute. Each category you turn off saves 10–20%; turning it back on asks just that question about posts already checked.
- **Scores are cached, verdicts aren't.** IndexedDB keeps the model's probability for each question for 30 days. Whether a post is hidden is decided locally by `core/policy.ts` from those scores and your settings, so changing strictness or categories applies instantly with no new requests.
- **Rewording a question re-asks only that question.** Cache keys include a hash of the question's wording (`core/decisions.ts`), so edits to `core/taxonomy.ts` invalidate exactly the answers they affect.
- **Ads are a rule, not a question.** X marks promoted posts in its markup.
- **Posts Google won't read count as NSFW.** Google's safety filters refuse some posts outright, and what they refuse is explicit or worse.
- **Your own posts are left alone.** They're never sent or hidden.

## Tuning the filter

The categories, their prompts and the score each strictness needs to hide a post live in `src/core/taxonomy.ts`. `eval/posts.jsonl` holds 303 labeled posts, including hard negatives (strong opinions, real breaking news, people sharing their own work, health, fitness and art) and prompt-injection attempts. To see how a prompt change performs:

```sh
echo "GEMINI_API_KEY=…" > .env.local
vp run eval            # precision and recall per category and strictness
vp run eval --misses   # also list the posts it gets wrong at "balanced"
```

Answers are cached in `eval/.cache.json`, so reruns only pay for questions you changed. With the current prompts, no clean post is hidden at any strictness, and Relaxed, Balanced and Strict catch 87%, 96% and 99% of the slop.

## Adding a site

1. Implement `SiteAdapter` (`src/sites/site.ts`): find post elements, read one into a `Post`, and name the element to collapse. `src/sites/x.ts` is the reference.
2. Add it to `SITES` in `src/content/index.ts`.
3. Add the site to `content_scripts.matches` and `host_permissions` in `public/manifest.json`.
4. Generalize the X-specific copy: the first line of `describePost` in `src/core/decisions.ts` and a few strings in the side panel.

If most posts on a page can't be read, usually because the site changed its markup, the side panel says so instead of failing silently.

## Privacy

The text of posts you scroll past (plus the post it replies to or quotes, link card text and up to two images) is sent to Google with your key. Nothing else leaves the browser. The key is kept in `chrome.storage.local`, and settings sync through your Chrome profile.
