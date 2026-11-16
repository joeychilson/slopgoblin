# Chrome Web Store

What the [developer dashboard](https://chrome.google.com/webstore/devconsole) asks for, ready
to paste. Upload the zip from the GitHub release ([Releasing](development.md#releasing)).

The [listing](https://chromewebstore.google.com/detail/slop-goblin/chfckcjkfehffpammliepgeehalndggk)'s
item ID is `chfckcjkfehffpammliepgeehalndggk`.

## Account

- **Publisher name:** Joey Chilson. It shows under "Offered by" on the listing.
- **Contact email:** support@slopgoblin.app. It shows on the listing. Cloudflare Email Routing
  forwards it; the dashboard's login email stays private.
- **Trader status:** non-trader. A trader's legal name, address and phone show on the listing.
- 2-Step Verification has to be on to publish.

## Store listing

**Summary** comes from the manifest's `description`.

**Description:**

```
Slop Goblin hides the junk from your X feed: AI slop, ragebait, clickbait, engagement bait, reply spam, NSFW posts, grifts and ads.

Each post you scroll past is judged by Google's Gemini Decisions API, with your own API key. A hidden post folds into a slim bar that says why. Click it to see the post, let it through, or always show its author.

• Switch off any kind of junk you don't mind.
• Three strictness levels. Balanced catches most junk and hides about 1 real post in 200 by mistake.
• Your own posts, people you follow and accounts you mark "Always show" are left alone, and Google is never asked about them.
• The side panel lists what's been hidden lately, from every tab, and how many posts each strictness would hide.
• Peek (Alt+Shift+P) shows hidden posts in place, with a label, so you can check its work.
• Community notes count as evidence about a post.

You need a Gemini API key from Google AI Studio. A free key works. A paid one costs about 8¢ per 1,000 posts.

Slop Goblin has no server and collects nothing. Posts are sent only to Google, with your key.

Open source: https://github.com/joeychilson/slopgoblin
```

**Category:** Lifestyle › Social Networking. **Language:** English.

**Graphics:**

- Store icon: `public/icons/128.png`.
- Screenshots, 1280×800: the three in [`store/`](store/), in order. They show the extension
  over a feed of made-up posts, so no real person's post is labeled as junk.

**Additional fields:** homepage URL `https://slopgoblin.app`; support URL
`https://github.com/joeychilson/slopgoblin/issues`.

## Privacy practices

**Single purpose:**

```
Hides junk posts (AI slop, ragebait, clickbait, spam, NSFW, scams and ads) from the user's X feed.
```

**Permission justifications:**

| Permission                                         | Justification                                                                                                                                                          |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `storage`                                          | Keeps the user's settings, their Gemini API key, cached answers so a post isn't judged twice, and the list of hidden posts the side panel shows.                       |
| `sidePanel`                                        | The side panel lists hidden posts and holds the settings.                                                                                                              |
| Host `https://x.com/*`                             | The content scripts read the posts on x.com and hide the ones the user doesn't want. The extension also finds open x.com tabs, to pass on a post the user let through. |
| Host `https://generativelanguage.googleapis.com/*` | Sends each post to Google's Gemini API, with the user's own key, to judge whether it's junk.                                                                           |

**Remote code:** No. All code ships in the package. Posts are sent to Google's API as data;
nothing it returns is run.

**Data usage:** tick

- _Website content_: the text, images and author of posts on x.com are sent to Google's Gemini
  API to be judged.
- _Authentication information_: the user's Gemini API key is stored on the device and sent
  only to Google, with each request.

Then certify all three statements: data isn't sold, isn't used for anything but the single
purpose, and isn't used for creditworthiness or lending.

**Privacy policy URL:** `https://github.com/joeychilson/slopgoblin/blob/main/PRIVACY.md`

## Test instructions

Reviewers need a key and an X account, since X shows no feed signed out:

- **Key:** make one just for review in Google AI Studio, on a project with a low spending
  limit, and paste it below.
- **X account:** make one just for review, follow a few busy accounts so its feed has posts,
  and put its username and password in the test account fields.

```
1. Open the side panel from the toolbar icon and paste this Gemini API key: <key>
2. Open https://x.com/home, signed in with the test account, and scroll. Junk posts fold into a bar that says why; click it to see the post.
3. The side panel lists what was hidden. Settings (the sliders icon) switches categories and strictness.

A script runs in x.com's own page (page.js) to read whether the user follows each post's author from the data X loads, so posts from people they follow are never hidden or sent to Google to be judged. It wraps XMLHttpRequest to read X's API responses after X receives them, changes nothing, and passes on only handles and follow status.
```

Delete the key and the X account once the review is done.
