# Working on Slop Goblin

A Chrome extension (Manifest V3) that hides junk posts on X, in `extension/`, and its website,
slopgoblin.app, in `site/`. [docs/development.md](docs/development.md) has the commands and how
it works. Before calling a change done, run `vp check`, `vp test` and `vp run e2e`, and try it in
Chrome on x.com: the end-to-end tests use a mock X page, so only x.com shows whether X still reads
right. For a change the website shows, look at it with `vp -C site dev`.

## Rules

- **Reshape, don't bolt on.** Find where a feature's rules belong and move shared logic there.
  Replace the old way rather than running two side by side.
- **One place per rule.** What's hidden, and what Google is never asked about, is decided in
  `core/policy.ts`; how a verdict reads, by `reason` there. How a post shows in a feed and what its
  bar actions do is in `content/view.ts`. What's stored, and where, is in `core/storage.ts`.
  Everything specific to X is in `sites/`. These are in `extension/src/`.
- **The website draws the extension's own parts.** Its side panel is the real one, what its feed
  hides comes from `core/policy.ts`, and how each post shows and acts comes from `content/view.ts`.
  Only the bar's markup in its feed is a copy, since `bar.ts` is plain DOM.
- **Measure before rewording the model's question.** `QUESTION`, `FINE` and the categories'
  ids and `describes` in `core/taxonomy.ts`, and `describePost` in `core/decisions.ts`, are
  tuned with `vp run eval`. Any change to them re-asks every cached post.
- **No real people's posts in the repo.** `extension/eval/real/` is gitignored for that.
- **Plain wording** in everything the reader sees: short sentences, no filler, the same word
  for the same thing.

## When you change X, also update Y

| When you change                              | Also update                                                                                                                         |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| What's sent to Google, or what's stored      | `PRIVACY.md`; the data usage in `docs/chrome-web-store.md`; "What it sends" in `site/src/routes/index.tsx`                          |
| A permission or host                         | `PRIVACY.md`; the justifications in `docs/chrome-web-store.md`                                                                      |
| `describePost`, or what a `Post` holds       | `INPUT_VERSION` in `core/decisions.ts`, so cached answers are asked again                                                           |
| A threshold, or the wording in `taxonomy.ts` | `TRADEOFF`; the eval table in `docs/development.md`; the numbers in `README.md`                                                     |
| What the side panel or the bar looks like    | The screenshots in `.github/screenshots/` and `docs/store/`; for the bar, the website's copy in `site/src/components/demo/feed.tsx` |
| The cost per 1,000 posts                     | `README.md`; `docs/development.md`; "What it costs" in `site/src/routes/index.tsx`                                                  |
| The markup `sites/x.ts` reads                | The mock page in `extension/e2e/x.ts`                                                                                               |
| The version, for a release                   | `extension/public/manifest.json` and a section in `CHANGELOG.md` ([how](docs/development.md#releasing))                             |
