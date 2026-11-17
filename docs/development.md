# Development

```sh
pnpm install
vp build          # into dist/
vp run dev        # rebuild on change
vp check          # format, lint and type check
vp test           # the rules for what's hidden
```

Load `dist/` with **Load unpacked** on `chrome://extensions` (Developer mode on), and hit
the extension's reload button after each build. A tab that was open before a reload has to be
reloaded too; the side panel offers to.

The toolchain is [Vite+](https://viteplus.dev): `vp` wraps Vite (build), Vitest (test),
Oxlint (lint, type-aware), Oxfmt (format) and TypeScript.

## How it works

```
page script (X's own page)
 sites/x-follows.ts  who you follow
        │ DOM events
        ▼
content script (x.com)            service worker                    Gemini
 sites/x.ts  reads posts   ──►    classifier.ts  cache + queue  ──►  Decisions API
 feed.ts     tracks them   ◄──    cache.ts       IndexedDB
 bar.ts      hides them    ──►    checked.ts     the list ──► side panel (Preact)
        ▲                                                         │
        └────────── settings (chrome.storage.sync) ◄─────────────┘
```

- **One multiple-choice question per post.** The model is asked which label fits best: one
  of the junk categories, or `fine`. It answers with a probability for every option. A post
  is hidden when the categories you have switched on add up to more than your strictness asks
  for (75%, 60% or 50%), and the bar names the likeliest one. Asking once, with `fine` spelled
  out as an option, is what keeps real posts in: separate yes/no questions per category each
  found something to object to in ordinary fan posts and replies. The cost is that a post
  that's several kinds has its chance split between them, so switching a kind off also shows
  posts that are mostly that kind.
- **Community notes count as evidence.** When X shows a note under a post, or under the post
  it quotes, the note goes to the model too, along with whether other readers have rated it
  yet. A post that passes along something its note calls fake or bait is judged as junk of the
  same kind, unless it corrects it. A note that only adds context changes nothing. A note that
  turns up later changes the cache key, so the post is asked about again.
- **About 8¢ per 1,000 posts.** A text post is about 630 input tokens and each image adds 280
  (up to two are sent, at low resolution), which averages 840 on a real feed. Output is free.
  The free tier's 50,000 tokens a minute covers about 60 posts a minute; when it runs out, the
  posts on screen are checked first once it's back.
- **Google is only asked about posts that could be hidden.** Not your own posts, not posts
  from people you follow or have marked "Always show", not the post a page is about, not ads
  (X marks those itself), and not posts you scrolled past before they finished loading. A reply
  or a quote still carries the text of the post it answers, whoever wrote it, because reply
  spam can't be judged without it. The rules for what's never hidden live in `core/policy.ts`,
  next to the ones for what is, and `core/policy.test.ts` holds them to it.
- **Who you follow comes from X's own data.** Posts on the page don't say whether you follow
  their author, but the data X loads for them does. A small script in X's page
  (`sites/x-follows.ts`, loaded from `content/page.ts` before X's own scripts) reads X's API
  responses as they arrive and passes each author's handle and follow status, nothing else, to
  the content script. Ads from people you follow are still hidden, and the setting can be
  switched off.
- **One list, from every tab.** The content script reports each post once it's checked, and
  the service worker keeps them in `chrome.storage.session` (`background/checked.ts`), newest
  3,000. The side panel judges that list against the current settings, so the list, every
  count in the panel and the number on the toolbar icon agree. Letting a post through from the
  panel reaches every tab that has it, even if it was hidden in a tab since reloaded.
- **Answers are cached, verdicts aren't.** IndexedDB keeps the probabilities for 30 days.
  Whether a post is hidden is decided locally by `core/policy.ts` from those and your
  settings, so changing strictness or categories applies instantly with no new requests.
- **Rewording the question re-asks it.** Cached answers are stored under a hash of the
  model, every question exactly as it's sent, and the input format (`core/decisions.ts`), so
  an edit to `core/taxonomy.ts` can't leave stale answers behind.
- **Posts Google won't read count as NSFW.** Google's safety filters refuse some posts
  outright, and what they refuse is explicit or worse.
- **Everything stored is in one place.** `core/storage.ts` lists what's kept in
  `chrome.storage` and where; `PRIVACY.md` says the same in plain words, so change both
  together.

## Tuning the filter

The questions, the description of each option and the probability each strictness needs
live in `src/core/taxonomy.ts`. The eval sends labeled posts through the same code the
extension runs and reports, per strictness, how many real posts were hidden by mistake and
how much junk was caught. It also reports what a reader gets with only one category switched
on, or one switched off:

```sh
echo "GEMINI_API_KEY=…" > .env.local
vp run eval                    # the tables
vp run eval --misses           # also list every mistake at "balanced"
vp run eval --misses strict    # …or at another strictness
```

Answers are cached in `eval/.cache.json`, so a rerun only pays for posts whose question
changed. The model is deterministic: the same request gets the same probabilities. Google
fetches images afresh each time, though, so a few posts with images come back a little
different from one run to the next (8 of 1,244 the last time).

There are two kinds of test post, in the same format (`eval/LABELING.md`):

- `eval/posts.jsonl` has 326 written to order, among them hard negatives (strong opinions,
  real breaking news, people sharing their own work, real posts under a community note) and
  prompt-injection attempts.
- `eval/real/*.jsonl` holds posts collected from a real timeline, reply threads, spam-prone
  searches and X's list of posts with community notes, with their images. Those are other
  people's posts, so the folder is gitignored; put your own there. Real posts are what the
  wording should be tuned on. The written ones are easier than a real feed and flatter every
  design.

With the current wording, on 918 real posts and the 326 written ones. Each cell is real posts
hidden by mistake / junk caught, counting only posts with a firm label:

| posts from                 | real | junk | Relaxed | Balanced | Strict  |
| -------------------------- | ---- | ---- | ------- | -------- | ------- |
| a timeline                 | 207  | 26   | 0 / 22  | 1 / 25   | 3 / 26  |
| a later timeline, held out | 100  | 15   | 0 / 9   | 1 / 12   | 1 / 14  |
| reply threads              | 221  | 12   | 0 / 4   | 0 / 9    | 1 / 10  |
| spam-prone searches        | 16   | 69   | 0 / 68  | 1 / 69   | 2 / 69  |
| posts with a note          | 4    | 13   | 0 / 12  | 1 / 13   | 1 / 13  |
| posts quoting those        | 17   | 41   | 0 / 16  | 0 / 24   | 0 / 28  |
| written to order           | 171  | 151  | 0 / 136 | 1 / 143  | 1 / 147 |

The held-out timeline was collected after the wording was frozen and labeled in one pass, so
it's a sanity check rather than a benchmark; it agrees with the first. On the three sets that
look like everyday reading (both timelines and the replies), Balanced hides 2 of 528 real
posts and catches 46 of 53 junk ones, Strict hides 5 and catches 50, and Relaxed hides none
and catches 35. What gets through at Balanced is mostly borderline: clips behind a vague
caption that might be a fan's, and generic-sounding replies.

The notes are what the last two real sets measure. With the notes left out of the input,
Balanced catches 8 of those 13 noted posts instead of all 13, and 5 of the 41 posts quoting
them instead of 24. Both sets are small and were labeled in one pass, and 36 of the 94
quoting posts were too short or ambiguous to label at all.

Things learned the hard way, before changing the wording:

- The long descriptions earn their tokens. The examples inside `fine` (fans reacting to a team
  or artist, short replies that react to their parent) are what stopped real fan posts being
  read as clickbait. Terser options were measurably worse.
- The first line of the input, which says a post follows to be judged, also keeps Google's
  word filter from refusing posts over a slur they contain.
- Questions in one request sway each other, whatever Google's docs say. Adding a yes/no per
  category beside the main question moved its answer for 529 of 1,244 posts. Asked in a
  request of their own, with each category's description, those yes/no questions did catch
  more junk for a reader with one category on (322 of 480 instead of 229), but also hid 81
  posts that reader wanted to see instead of 4, most of them junk of the kinds switched off.
  The categories overlap too much on content-farm posts for per-category questions to keep
  them apart.
- Telling the model which image is a video's first frame hid 6 more real video posts at
  Balanced, and caught no more junk.

After moving a threshold, update `TRADEOFF` in `taxonomy.ts`, which is what the side panel
tells people each strictness costs, and the numbers in the README.

## Adding a site

1. Implement `SiteAdapter` (`src/sites/site.ts`): find post elements, read one into a `Post`,
   and name the element to collapse. `src/sites/x.ts` is the reference. `watchFollows` is
   optional; it needs a part in the site's own page, listed in `IN_PAGE` in
   `src/content/page.ts`.
2. Add it to `SITES` in `src/content/index.ts`.
3. Add the site to both `content_scripts` entries' `matches` and to `host_permissions` in
   `public/manifest.json`.
4. Generalize the X-specific copy: `QUESTION` in `src/core/taxonomy.ts`, the first line of
   `describePost` and the wording of `describeNote` in `src/core/decisions.ts`, and a few
   strings in the side panel.
5. Say what's read from the site in `PRIVACY.md`.

If most posts on a page can't be read, usually because the site changed its markup, the side
panel says so instead of failing silently.

## Releasing

1. Raise `version` in `public/manifest.json` and add a section for it at the top of
   `CHANGELOG.md`.
2. Merge to `main`, then tag that commit `v<version>` and push the tag.
3. The Release workflow checks the tag, runs the checks, builds, and publishes a GitHub
   release with `slopgoblin-<version>.zip`.
4. In the [Chrome Web Store dashboard](https://chrome.google.com/webstore/devconsole), upload
   that zip as a new package and submit it for review.
   [chrome-web-store.md](chrome-web-store.md) has the listing and its answers.
