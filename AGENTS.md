# Working on Slop Goblin

A Chrome extension (Manifest V3) that hides junk posts on X.
[docs/development.md](docs/development.md) has the commands and how it works. Before calling a
change done, run `vp check`, `vp test` and `vp run e2e`, and try it in Chrome on x.com: the
end-to-end tests use a mock X page, so only x.com shows whether X still reads right.

## Rules

- **Reshape, don't bolt on.** Find where a feature's rules belong and move shared logic there.
  Replace the old way rather than running two side by side.
- **One place per rule.** What's hidden, and what Google is never asked about, is decided in
  `core/policy.ts`; how a verdict reads, by `reason` there. What's stored, and where, is in
  `core/storage.ts`. Everything site-specific is in `src/sites/`.
- **Measure before rewording the model's question.** `QUESTION`, `FINE` and the categories'
  ids and `describes` in `core/taxonomy.ts`, and `describePost` in `core/decisions.ts`, are
  tuned with `vp run eval`. Any change to them re-asks every cached post.
- **No real people's posts in the repo.** `eval/real/` is gitignored for that.
- **Plain wording** in everything the reader sees: short sentences, no filler, the same word
  for the same thing.

## When you change X, also update Y

| When you change                              | Also update                                                                                   |
| -------------------------------------------- | --------------------------------------------------------------------------------------------- |
| What's sent to Google, or what's stored      | `PRIVACY.md`; the data usage in `docs/chrome-web-store.md`                                    |
| A permission or host                         | `PRIVACY.md`; the justifications in `docs/chrome-web-store.md`                                |
| `describePost`, or what a `Post` holds       | `INPUT_VERSION` in `core/decisions.ts`, so cached answers are asked again                     |
| A threshold, or the wording in `taxonomy.ts` | `TRADEOFF`; the eval table in `docs/development.md`; the numbers in `README.md`               |
| What the side panel or the bar looks like    | The screenshots in `.github/screenshots/` and `docs/store/`                                   |
| The markup `sites/x.ts` reads                | The mock page in `e2e/x.ts`                                                                   |
| The version, for a release                   | `public/manifest.json` and a section in `CHANGELOG.md` ([how](docs/development.md#releasing)) |
