# Changelog

## 0.3.3

- **One Undo bar in the side panel.** After you let a post through, Undo waits at the top of the
  hidden list. It stays while your pointer or keyboard is on it.
- **Picking one kind of hidden post** uses Chrome's own menu on the list's title, drawn like the
  panel's rows.
- **Fewer paid requests.** A post you let through isn't sent to Google again when more of it
  loads, such as a community note. When Chrome restarts the extension in the background, it no
  longer retries a key Google rejected, or asks again before a rate limit is over.
- **Keyboard focus stays in place** after Show, Hide, Not ragebait and the like, Undo, or
  removing an Always show account, in the feed and the side panel.
- **Always show accounts are easier to read**, with more room above them.
- **No posts are checked again** after updating: nothing sent to Google changed.

## 0.3.2

- **The side panel is rebuilt on React**, the same as slopgoblin.app. It looks and works the same.
- **The side panel stays where you scrolled it** when a post you let through folds away.
- **No posts are checked again** after updating: nothing sent to Google changed.

## 0.3.1

- **Fewer real headlines hidden.** A post is now hidden only when one kind of junk stands out, at
  30% or more. Dramatic finance headlines that the model can't place as one kind now stay up. On
  everyday feeds, Balanced hides about 1 real post in 300 by mistake (down from 1 in 200), and
  Strict about 1 in 90 (down from 1 in 70).
- **Replies keep the post they answer.** On a conversation page, a reply is no longer judged
  against the main post after X unloads the post it answers.
- **No posts are checked again** after updating: what Google already answered still counts.

## 0.3.0

- **Better detection with fewer mistakes.** Catches more ragebait and posts quoting fakes under a
  community note, with fewer false positives on news. On everyday feeds, Balanced now hides about
  1 real post in 200 by mistake (down from 1 in 170) and catches over 3 in 4 junk posts.
- **Switching one kind on catches more of it.** A post is now hidden when its likeliest kind is
  switched on, as well as when at least half of its junk score is. With every kind on, nothing
  changes.
- **Faster, smarter feed checking.** Posts on screen are checked ahead of posts below the fold;
  posts with empty media slots wait briefly for images or video posters to load and wake as soon
  as they arrive; posts whose text or media arrives late are judged once it loads.
- **Live follows and unfollows take effect right away.** Following or unfollowing an account on X
  updates your feed without reloading the page.
- **Side panel improvements:** click the "Hidden posts" title to show one kind at a time, undo a
  let-through post in place before it folds away (synced with undos from the feed or Settings),
  and scroll to load older hidden posts.
- **Every post is checked once more** after updating, since the question changed. Checking still
  costs about 10¢ per 1,000 posts on a paid key.

## 0.2.1

- **Replacing an API key takes effect right away.** Swapping keys during a rate limit no longer
  waits out the old key's pause, and tabs opened without a working key stop retrying in the
  background and check posts as soon as a key is saved.
- **Let-through posts and filtering switches stay consistent.** Posts you let through aren't sent
  to Google again if new context turns up, labeled posts aren't recorded while filtering is off,
  and letting a post through in one tab won't be undone by another.
- **Replies checked while loading** are checked again if the post they answer shows up mid-flight.
- **Side panel fixes:** the rate-limit timer stops once the countdown ends, strictness counts
  only animate when their numbers change, leaving X clears stale tab state without flashing
  "Not on X" on reloads, and rapid settings toggles don't overwrite each other.

## 0.2.0

- **News stays.** News the model hadn't heard of read to it as made up, so it was hidden as AI
  slop or clickbait. Now the model judges how a post is made, not whether it's true. On news
  accounts, Balanced hides 7 real posts in 214 by mistake, down from 28. On everyday feeds it
  hides about 1 in 170, down from 1 in 90, and still catches about 3 in 4 junk posts.
- **X's own labels hide posts without asking Google.** A paid partnership is hidden as an ad,
  even from people you follow. A new "Made with AI" switch hides posts X labels as made with AI,
  unless you follow their author.
- **Sales pitches count as ads**, such as an account's plug for its own paid service. Someone
  showing what they built doesn't.
- **A post that continues its author's thread** is read as part of it, so it's never called
  reply spam.
- **Every post is checked once more** after updating, since the question changed. Checking
  costs about 10¢ per 1,000 posts on a paid key, up from 9¢.

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
