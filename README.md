# Slop Goblin

A Chrome extension that hides AI slop, ragebait, clickbait, engagement bait, reply spam, NSFW posts, grifts and ads from your X feed. Each post is judged by Google's [Gemini Decisions API](https://aistudio.google.com/docs/decisions-api) with your own API key.

Hidden posts collapse into a slim bar that says why. Click it to see the post. The side panel lists what's hidden in the current tab and shows how many posts each strictness would hide there. **Peek** (<kbd>Alt+Shift+P</kbd>) shows hidden posts in place with a label, so you can check the goblin's work.

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

- **One multiple-choice question per post.** The model is asked which label fits best: one of the junk categories, or `fine`. It answers with a probability for every option. A post is hidden when the categories you have switched on add up to more than your strictness asks for (85%, 60% or 40%), and the bar names the likeliest one. Asking once, with `fine` spelled out as an option, is what keeps real posts in: separate yes/no questions per category each found something to object to in ordinary fan posts and replies.
- **Community notes count as evidence.** When X shows a note under a post, or under the post it quotes, the note goes to the model too, along with whether other readers have rated it yet. A post that passes along something its note calls fake or bait is judged as junk of the same kind, unless it corrects it. A note that only adds context changes nothing. A note that turns up later changes the cache key, so the post is asked about again.
- **About 8¢ per 1,000 posts.** A text post is about 630 input tokens and each image adds 280 (up to two are sent, at low resolution), which averages 840 on a real feed. Output is free. The free tier's 50,000 tokens a minute covers about 60 posts a minute; when it runs out, the posts on screen are checked first once it's back. The side panel's settings show the month's running total.
- **Nothing is sent that couldn't be hidden.** Not your own posts, not posts from accounts you've marked "Always show", not the post a page is about, not ads (X marks those itself), and not posts you scrolled past before they finished loading.
- **Answers are cached, verdicts aren't.** IndexedDB keeps the probabilities for 30 days. Whether a post is hidden is decided locally by `core/policy.ts` from those and your settings, so changing strictness or categories applies instantly with no new requests.
- **Rewording the question re-asks it.** Cached answers are stored under a hash of the question, its options and the input format (`core/decisions.ts`), so an edit to `core/taxonomy.ts` can't leave stale answers behind.
- **Posts Google won't read count as NSFW.** Google's safety filters refuse some posts outright, and what they refuse is explicit or worse.

## Tuning the filter

The question, the description of each option and the probability each strictness needs live in `src/core/taxonomy.ts`. The eval sends labeled posts through the same code the extension runs and reports, per strictness, how many real posts were hidden by mistake and how much junk was caught:

```sh
echo "GEMINI_API_KEY=…" > .env.local
vp run eval                    # the tables
vp run eval --misses           # also list every mistake at "balanced"
vp run eval --misses strict    # …or at another strictness
```

Answers are cached in `eval/.cache.json`, so a rerun only pays for posts whose question changed. The model is deterministic: the same request gets the same probabilities.

There are two kinds of test post, in the same format (`eval/LABELING.md`):

- `eval/posts.jsonl` has 324 written to order, among them hard negatives (strong opinions, real breaking news, people sharing their own work, real posts under a community note) and prompt-injection attempts.
- `eval/real/*.jsonl` holds posts collected from a real timeline, reply threads, spam-prone searches and X's list of posts with community notes, with their images. Those are other people's posts, so the folder is gitignored; put your own there. Real posts are what the wording should be tuned on. The written ones are easier than a real feed and flatter every design.

With the current wording, on 918 real posts and the 324 written ones. Each cell is real posts hidden by mistake / junk caught, counting only posts with a firm label:

| posts from                 | real | junk | Relaxed | Balanced | Strict  |
| -------------------------- | ---- | ---- | ------- | -------- | ------- |
| a timeline                 | 207  | 26   | 0 / 18  | 1 / 25   | 5 / 26  |
| a later timeline, held out | 100  | 15   | 0 / 7   | 1 / 13   | 5 / 14  |
| reply threads              | 221  | 12   | 0 / 2   | 0 / 9    | 7 / 11  |
| spam-prone searches        | 16   | 69   | 0 / 60  | 1 / 69   | 3 / 69  |
| posts with a note          | 4    | 13   | 0 / 11  | 1 / 13   | 2 / 13  |
| posts quoting those        | 17   | 41   | 0 / 8   | 0 / 24   | 0 / 32  |
| written to order           | 170  | 150  | 0 / 122 | 1 / 142  | 1 / 146 |

The held-out timeline was collected after the wording was frozen and labeled in one pass, so it's a sanity check rather than a benchmark; it agrees with the first. On the three sets that look like everyday reading (both timelines and the replies), Balanced hides 2 of 528 real posts and catches 47 of 53 junk ones, Strict hides 17 and catches 51, and Relaxed hides none and catches 27. What gets through at Balanced is mostly borderline: clips behind a vague caption that might be a fan's, and generic-sounding replies.

The notes are what the last two real sets measure. With the notes left out of the input, Balanced catches 8 of those 13 noted posts instead of all 13, and 5 of the 41 posts quoting them instead of 24. Both sets are small and were labeled in one pass, and 36 of the 94 quoting posts were too short or ambiguous to label at all.

Two things learned the hard way, before changing the wording:

- The long descriptions earn their tokens. The examples inside `fine` (fans reacting to a team or artist, short replies that react to their parent) are what stopped real fan posts being read as clickbait. Terser options were measurably worse.
- The first line of the input, which says a post follows to be judged, also keeps Google's word filter from refusing posts over a slur they contain.

After moving a threshold, update `TRADEOFF` in `taxonomy.ts`, which is what the side panel tells people each strictness costs.

## Adding a site

1. Implement `SiteAdapter` (`src/sites/site.ts`): find post elements, read one into a `Post`, and name the element to collapse. `src/sites/x.ts` is the reference.
2. Add it to `SITES` in `src/content/index.ts`.
3. Add the site to `content_scripts.matches` and `host_permissions` in `public/manifest.json`.
4. Generalize the X-specific copy: `QUESTION` in `src/core/taxonomy.ts`, the first line of `describePost` and the wording of `describeNote` in `src/core/decisions.ts`, and a few strings in the side panel.

If most posts on a page can't be read, usually because the site changed its markup, the side panel says so instead of failing silently.

## Privacy

The text of posts you scroll past (plus the post it replies to or quotes, any community note shown on either, link card text and up to two images) is sent to Google with your key. Nothing else leaves the browser. The key is kept in `chrome.storage.local`, and settings sync through your Chrome profile. Google may use what a free-tier key sends to improve its products.
