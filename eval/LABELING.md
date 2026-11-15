# Labeling eval posts

Each line of `posts.jsonl` (and of any `real/*.jsonl`) is one post as the extension would read it, plus what a reader would want done with it:

```json
{
  "id": "x:2121767519170269395",
  "author": { "name": "Display name", "handle": "handle" },
  "text": "…",
  "quote": { "handle": "…", "text": "…" },
  "replyTo": { "handle": "…", "text": "…" },
  "link": "example.com · Headline",
  "images": ["https://pbs.twimg.com/media/…?format=jpg&name=small"],
  "labels": ["clickbait"],
  "unsure": true,
  "note": "why it's labeled this way"
}
```

`labels` lists every category the post fits, best first. Empty means it should stay. `unsure` marks a post a thoughtful reader could call either way: it's still scored, and shows up under `--misses` if you want to look, but it counts for nothing in the totals. Only `id`, `author`, `text` and `labels` are required.

The reader wants junk gone, not posts they'd merely skip. Ordinary posts by real people stay, even low-effort, opinionated, crude or boring ones. A real post hidden by mistake is worse than a piece of junk let through, so when in doubt, mark it unsure rather than junk.

## Categories

- `ragebait`: built to provoke outrage for engagement. Sweeping put-downs of a group (a gender, a generation, a nationality, a fandom), gender-war bait, outrage-clip accounts whose framing is the provocation ("X was SHOCKED that…"), invented or trivial outrage. Not a real person's opinion, even a harsh one; not criticism of a named person's conduct, sports banter, a politician's own statement, satire, or upsetting news reported straight.
- `ai_slop`: generic chatbot-voice text (hollow hooks, "It's not X. It's Y.", emoji-bullet platitudes, tool or prompt listicles) or AI-generated images and video posted as filler or passed off as real. Not posts about AI, or people showing what they made with it on purpose.
- `clickbait`: withholds or hypes to make you watch or click. Curiosity gaps ("I didn't know this 😱"), fake BREAKING, celebrity-gossip bait, and content-farm clips: a recycled video behind a vague reaction caption that doesn't say what it shows. Not a fan posting a clip or meme about something they follow, an accurate headline, or a real announcement.
- `engagement_bait`: the point is to farm replies, likes or follows. "Reply YES if…", "Which one?", bait questions over a clip, follow trains, "gm" farming. Not a real question the author wants answered.
- `reply_spam` (replies only): generic praise that fits any post, bot-like or emoji-only filler, AI-written restatements of the parent, "check my bio", unrelated self-promotion, shill replies, off-topic links. Not short genuine replies, jokes about the post, disagreement, or fans cheering under a fan post.
- `nsfw`: nudity, sexual or pornographic images, bodies posed to titillate, porn or OnlyFans promotion, porn bots, explicit sexual descriptions, gore. Not swimwear, fitness, fashion, mild innuendo, art, or news about sex crimes.
- `grift`: manipulative selling or shilling. Get-rich claims, course or "DM me" funnels, memecoin or stock pumps, follow-to-win giveaways, fake airdrops, scam links. Not someone plainly launching their own product, job posts, or honest market talk.

## Calls that came up on a real feed

- A roster meme captioned "Chovy, next, I had an idea, but you need to keep an open mind": stays. Fan meme.
- "I didn't know this 😱 😱" over a clip of a plane: `clickbait`.
- "Her mom's plastic surgery obsession destroyed the entire family.💔🥹" over an animation clip: `clickbait`.
- "Do you think kids have right to do everything?" over a war-zone clip, from a clip-farm account: `engagement_bait`, `ragebait`.
- "Look at how Klopp is celebrating… Alonso is a fraud." with a clip: stays. Sports banter about a named person.
- "Angel Reese was SHOCKED that basketball fans were talking about basketball 🤯" from a drama-clip account: `ragebait`.
- A quote-dunk in a fan war, "HELP, THIS IS SCARY, THEY'VE ALL HAD PLASTIC SURGERY 😭": unsure, leaning `ragebait`.
- A captionless clip from an unknown account, or "🌝🌝👑" over one: unsure.
- "Damn is this what entering heaven sounds like" over a concert clip, small account: unsure.
- A reply that's short but reacts to the actual post: stays.
