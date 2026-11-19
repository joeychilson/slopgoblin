# Changelog

## 0.1.2

- **More junk is caught with some kinds switched off.** A post is hidden when it's junk and
  mostly kinds you have switched on. With only one kind on, nearly 6 in 10 posts of that kind
  are hidden now, up from about half. With every kind on, nothing changes.
- **A reply is checked as a reply once the post it answers shows**, so reply spam first seen on
  its own is caught in its thread.
- **A display name or link card can't pose as a community note either**, as a post's text
  already couldn't.
- **Small fixes:** the side panel's rate-limit countdown, a "Reload to start" that could stick
  on pages without posts, and the goblin chomping every time the panel opens.

## 0.1.1

- **Relaxed and Strict are better trades.** Relaxed now catches about 2 in 3 junk posts, up
  from about half, and still hid no real post in testing. Strict hides about 1 real post in
  100 by mistake, down from 1 in 30, and still catches nearly all junk. Balanced is unchanged.
- **A post can't dress its own text up as a community note** to talk its way past the goblin.
- **Posts already checked are checked once more** after updating, since saved answers are now
  tied to the exact question and model they came from.

## 0.1.0

The first release.

- **Hides junk from your X feed:** AI slop, ragebait, clickbait, engagement bait, reply spam,
  NSFW posts, grifts and ads, each of which can be switched off. Google's Gemini Decisions API
  judges each post, with your own API key.
- **Three strictness levels.** Balanced hides most junk and about 1 real post in 200 by
  mistake. Changing strictness or categories applies at once, without asking again.
- **A slim bar in place of each hidden post** says why it went. Click it to see the post, let
  it through, or always show its author. Or have hidden posts removed entirely.
- **The side panel** lists what's been hidden lately, in every tab, and how many posts each
  strictness would hide. Peek (Alt+Shift+P) shows hidden posts in place, with a label.
- **Left alone:** your own posts, people you follow, accounts you mark "Always show", and the
  post a page is about. Google is never asked about them.
- **Community notes count as evidence,** on a post and on the post it quotes.
