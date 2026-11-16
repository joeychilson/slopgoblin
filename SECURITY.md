# Security

## Report a vulnerability

Report it privately on
[GitHub](https://github.com/joeychilson/slopgoblin/security/advisories/new),
not in a public issue or pull request.

Include what someone could do with it and what they need first (another
extension, a script on x.com, a crafted post), how to reproduce it, and the
version chrome://extensions shows. Use a made-up API key, never a real one.

## What's covered

- The extension: its content scripts on x.com, the script it runs in X's
  page, the service worker and the side panel.
- What it stores: the API key, settings, cached answers and the list of
  checked posts.
- Releases: the workflows that build them.

A bug in X, Chrome or Google's API belongs to that project.

## What to expect

One person maintains Slop Goblin, as time allows, so there's no set time for
an answer or a fix. A fix ships in a new release. Only the latest release
gets fixes.
