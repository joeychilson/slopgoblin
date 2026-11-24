# Development

```sh
pnpm install
vp build          # into dist/
vp run dev        # rebuild on change
vp check          # format, lint and type check
vp test           # unit tests: what's hidden, and what's sent to Google
vp run e2e        # the extension in Chromium, on a mock X page
```

Load `dist/` with **Load unpacked** on `chrome://extensions` (Developer mode on), and hit
the extension's reload button after each build. A tab that was open before a reload has to be
reloaded too; the side panel offers to.

`vp run e2e` builds, then loads `dist/` into headless Chromium with Playwright and runs it on a
mock X timeline, with X's API and the Decisions API mocked (`e2e/`). That's the content script,
the service worker and the side panel together, which the unit tests can't reach. The first
time, install the browser: `vp exec playwright install chromium`. The mock page is X as
`sites/x.ts` reads it, so only x.com shows whether X has changed its markup.

The toolchain is [Vite+](https://viteplus.dev): `vp` wraps Vite (build), Vitest (test),
Oxlint (lint, type-aware), Oxfmt (format) and TypeScript.

## How it works

```
page script (X's own page)
 sites/x-data.ts  who you follow, X's labels
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
  is hidden when its chance of being junk is more than your strictness asks for (75%, 60% or
  50%), its likeliest kind is at least 30% likely, and either that kind or at least half of
  the junk chance is kinds you have switched on; the bar names the likeliest of those. Asking once, with `fine` spelled out as
  an option, is what keeps real posts in: separate yes/no questions per category each found
  something to object to in ordinary fan posts and replies. The kinds overlap, so a post
  that's several kinds has its chance split between them. That's why the switches go by the
  winning kind or share: switching a kind off still shows the posts that are mostly that
  kind.
- **Community notes count as evidence.** When X shows a note under a post, or under the post
  it quotes, the note goes to the model too, along with whether other readers have rated it
  yet. A post that passes along something its note calls fake or bait is judged as junk of the
  same kind, unless it corrects it. A note that only adds context changes nothing. A note that
  turns up later changes the cache key, so the post is asked about again.
- **About 10¢ per 1,000 posts.** A text post is about 825 input tokens and each image adds 280
  (up to two are sent, at low resolution), which averages 1,030 on a real feed. Output is free.
  The free tier's 50,000 tokens a minute covers about 50 posts a minute; when it runs out, the
  posts on screen are checked first once it's back.
- **Google is only asked about posts that could be hidden.** Not your own posts, not posts
  from people you follow or have marked "Always show", not the post a page is about, not what
  X labels an ad or, while that category is on, "Made with AI", and not posts you scrolled past
  before they finished loading. A reply
  or a quote still carries the text of the post it answers, whoever wrote it, because reply
  spam can't be judged without it. The rules for what's never hidden live in `core/policy.ts`,
  next to the ones for what is, and `core/policy.test.ts` holds them to it.
- **Who you follow, and X's labels, come from X's own data.** Posts on the page don't say
  whether you follow their author, and the labels X puts under them ("Paid partnership", "Made
  with AI") have no stable markup, but the data X loads for them has both. A small script in
  X's page (`sites/x-data.ts`, loaded from `content/page.ts` before X's own scripts) reads X's
  API responses as they arrive and passes each author's handle and follow status, and each
  labeled post's id and labels, nothing else, to the content script. What X labels is hidden
  without asking Google: a paid partnership as an ad, even from people you follow, and a post
  with media X detects as AI-made as "Made with AI", unless you follow its author or switch
  that off. X finds AI media from the provenance data AI tools embed, so most AI images carry
  no label, and AI slop still judges them.
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
- `eval/real/*.jsonl` holds posts collected from real timelines, reply threads, news accounts,
  searches and X's list of posts with community notes, with their images. Those are other
  people's posts, so the folder is gitignored; put your own there. Real posts are what the
  wording should be tuned on. The written ones are easier than a real feed and flatter every
  design.

With the current wording, on 1,989 real posts and the 326 written ones. Each cell is real
posts hidden by mistake / junk caught, counting only posts with a firm label:

| posts from                      | real | junk | Relaxed | Balanced | Strict  |
| ------------------------------- | ---- | ---- | ------- | -------- | ------- |
| a timeline                      | 207  | 26   | 0 / 22  | 0 / 25   | 2 / 25  |
| a later timeline, held out      | 100  | 15   | 0 / 8   | 0 / 11   | 1 / 12  |
| reply threads                   | 221  | 12   | 0 / 7   | 1 / 10   | 2 / 11  |
| spam-prone searches             | 16   | 69   | 0 / 67  | 1 / 69   | 2 / 69  |
| posts with a note               | 4    | 13   | 0 / 11  | 0 / 13   | 0 / 13  |
| posts quoting those             | 17   | 41   | 0 / 29  | 0 / 36   | 0 / 36  |
| a tech-heavy timeline           | 153  | 7    | 1 / 5   | 2 / 6    | 4 / 6   |
| news accounts and news searches | 214  | 16   | 1 / 15  | 4 / 16   | 7 / 16  |
| AI searches                     | 33   | 34   | 0 / 34  | 0 / 34   | 0 / 34  |
| opinion and hype searches       | 48   | 3    | 0 / 3   | 0 / 3    | 0 / 3   |
| replies under viral news        | 163  | 10   | 0 / 2   | 0 / 2    | 0 / 3   |
| the last five, 3 in 10 held out | 249  | 31   | 0 / 24  | 2 / 25   | 5 / 25  |
| written to order                | 171  | 151  | 0 / 131 | 1 / 141  | 1 / 145 |

The later timeline was collected after the wording of the time was frozen and labeled in one
pass, so it's a sanity check rather than a benchmark; it agrees with the first. The last six
sets were collected together in November 2026, and 3 in 10 of them, picked by id before any
were read, were held out of the tuning. They were labeled before the model's answers were
looked at, and the posts where labels and model disagreed were checked again.

On the five sets that look like everyday reading (the three timelines and both sets of
replies, the eval's `everyday` row), Balanced hides 3 of 844 real posts and catches 54 of 70
junk ones, Strict hides 9 and catches 57, and Relaxed hides 1 and catches 44. What gets through at Balanced is mostly
borderline: clips behind a vague caption that might be a fan's, generic-sounding replies, and
brand accounts replying to a viral post with a meme. News accounts are the hardest real posts
to keep: the 4 Balanced still hides there all have pictures the model takes for AI images (a
gallery of Bond actors with one it hasn't heard of, a film poster, odd medical news).

The notes are what the last two real sets measure. With the notes left out of the input,
Balanced catches 8 of those 13 noted posts instead of all 13, and at most 5 of the 41 posts
quoting them instead of 36. Both sets are small and were labeled in one pass, and 36 of the 94
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
  more junk for a reader with one category on (322 of about 480 instead of 274), but also hid
  81 posts that reader wanted to see instead of 8, most of them junk of the kinds switched off.
  The categories overlap too much on content-farm posts for per-category questions to keep
  them apart.
- Adding up only the kinds switched on, as 0.1.1 did, let most junk through for a reader who
  kept one kind: 229 of 481 caught, against 274 by share, for 4 posts hidden that the reader
  wanted to see instead of 8. With every kind on, the two rules hide exactly the same posts.
- Also hiding a post when its likeliest kind is switched on, even if the other kinds together
  outweigh it, only changes things for a reader with one kind on (with every kind on, or one
  switched off, both rules hide the same posts). Across the current sets, that catches 382 of
  634 junk posts instead of 351, for 26 posts hidden that the reader wanted to see instead of 19
  (clickbait alone: 8 instead of 4).
- A post can reach the threshold with no kind standing out: dramatic finance and gaming
  headlines got 20–30% each of clickbait, grift and AI slop. Hiding only when the likeliest kind
  has at least 30% left alone 4 of the 15 real posts Balanced hid across every set (12 of 36 at
  Strict), and missed 2 more junk posts (5 at Strict), mostly posts quoting a noted fake. On the
  held-out sets it hid 1 fewer real post at Balanced and 3 fewer at Strict, where it caught 1
  less junk post.
- Telling the model which image is a video's first frame hid 6 more real video posts at
  Balanced, and caught no more junk.
- The rule for a post quoting a noted post works in the input, right after the note. Moved
  into the question, for those posts only, it caught 12 of the 41 junk ones at Balanced
  instead of 24, and lowered the junk score of 30 of them.
- The model judges news against what it knows, and what it knows is older than the feed.
  Headlines about things it hadn't heard of (a game's release, an IPO, a CEO leaving) read as
  made up, so AI slop or fake BREAKING, and the old wording asked for exactly that judgment.
  Saying in the question that posts are recent and that whether a claim is true isn't its call,
  saying in `fine` that a headline that says what happened is news even with BREAKING, and
  calling only melodramatic all-caps BREAKING clickbait: across every set, Balanced hid 19 real
  posts instead of 49 (8 of 214 from news accounts instead of 28) and caught 376 junk posts
  instead of 378. Notes are still how a post is shown to be fake.
- That line about recent posts works in the question. Left only in `fine`, Balanced hid 31.
- Telling the AI slop option to judge images by how they look, not by whether it knows what
  they show, hid 34 instead of 19. Naming pictures in the question's line hid 17, but caught
  10 fewer at Strict and fewer posts quoting a noted fake (20 of 41 instead of 22).
- Naming brands that answer a viral post with a meme under reply spam changed almost nothing:
  from a name and a quip, the model can't tell a brand from a person.
- A reply to the author's own post, such as the next part of a thread or a source link, was
  judged as a reply and called reply spam. Saying it continues the author's thread, and not
  offering reply spam for it, hid 3 fewer real posts.
- Ads used to be only what X marks as promoted, so a news account's pitch for its own paid
  service got through. Described as "an ad … or a paid partnership", the ads option caught all
  7 but called 6 startups' launch posts ads too, and hid 33 real posts instead of 19. As a sales
  pitch that isn't a maker announcing what they built, it caught all 7 and hid 17.

After moving a threshold, update `TRADEOFF` in `taxonomy.ts`, which is what the side panel
tells people each strictness costs, and the numbers in the README.

## Adding a site

1. Implement `SiteAdapter` (`src/sites/site.ts`): find post elements, read one into a `Post`,
   and name the element to collapse. `src/sites/x.ts` is the reference. `watchData` is
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
