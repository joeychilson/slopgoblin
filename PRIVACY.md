# Privacy policy

_Last updated November 21, 2026_

Slop Goblin is a Chrome extension that hides junk posts from your X feed. It has no server
and collects nothing for its developer: no accounts, analytics or telemetry. To judge posts it
sends them to Google, with an API key you provide. This page says exactly what goes where.

## What's sent to Google

While filtering is on, each post you scroll past on x.com is sent to Google's
[Gemini API](https://ai.google.dev/gemini-api/docs) to be judged, with your API key:

- the author's display name and handle, and the post's text;
- the text and handle of the post it replies to or quotes, if any;
- any community note X shows on it or on the post it quotes;
- the text of a link card, if it has one;
- the addresses of up to two of its images, which Google fetches from X.

A post is sent once, and again only if the post it replies to or a community note turns up later. These are never
sent to be judged: your own posts, posts from people you follow (unless you switch that
setting off), posts from accounts you've marked "Always show", ads, posts X labels "Made with
AI" (unless you switch that category off), and the post a page is about. When someone else replies to or quotes one of them, its text and handle still go along
with their post, as above. Nothing is sent while filtering is off.

When you add a key, one test request with the word "Hello" checks that it works.

What Google does with what it receives is governed by the
[Gemini API terms](https://ai.google.dev/gemini-api/terms). On the free tier, Google may use
it to improve its products.

## What's kept in your browser

- **Your API key**, in the extension's local storage. It's sent only to Google.
- **Your settings**, including the handles you've marked "Always show", in Chrome's synced
  storage. If you use Chrome Sync, Chrome syncs them to your other devices.
- **Answers**: for each post judged, its ID and the model's scores, without its text, so a
  post isn't sent twice. They're deleted 30 days after the post was last seen.
- **The side panel's list**: name, handle, avatar address and the first 600 characters of
  each post checked since Chrome started. It's kept in memory and cleared when Chrome quits.
- **This month's usage**: how many posts were checked and how many tokens that took.
- **X's theme** (light, dim or dark), so the side panel can match it.

To read whether you follow a post's author, and which posts X labels as a paid partnership or
"Made with AI", a script in X's page reads the data X loads for its own use. It passes on only
handles and whether you follow each, and the IDs of labeled posts with their labels. The
content script keeps them in memory until the tab closes. Nothing else from that data is read
or kept.

Removing the extension deletes everything it stored.

## Permissions

- **Access to x.com**: to read the posts on the page and hide the ones you don't want.
- **Access to generativelanguage.googleapis.com**: to send posts to the Gemini API.
- **Storage**: for the settings and data above.
- **Side panel**: for the panel that lists hidden posts and holds the settings.

## Contact

Questions go to [GitHub issues](https://github.com/joeychilson/slopgoblin/issues), or to
support@slopgoblin.app. Changes to this policy are made in this file, and its history is public.
