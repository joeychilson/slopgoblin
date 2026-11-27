/**
 * Shapes drawn both in the feed and in the side panel. The side panel's other icons are in
 * `sidepanel/controls.tsx`.
 */

/**
 * The goblin's head in one color, eyes cut out (fill-rule: evenodd), for drawing at text size
 * next to a reason: in the feed and in the side panel's settings sketch.
 */
export const GOBLIN_GLYPH = {
  viewBox: "0 4 32 24",
  d: "M16 4.8c3.3 0 6.2 1.4 7.8 4.1 2.5-2.1 5.2-3.3 7.4-3.4.6 0 .8.5.5 1.1-1.5 2.4-3.3 6.1-5.8 8.9.8 2.3.5 5.1-1.2 7.8-1.9 3-5.1 4.2-8.7 4.2s-6.8-1.2-8.7-4.2c-1.7-2.7-2-5.5-1.2-7.8C3.6 12.7 1.8 9 .3 6.6c-.3-.6-.1-1.1.5-1.1 1.4.1 2.8.5 4.2 1.2l.5 1.8 1.2-.9c.6.4 1.1.8 1.5 1.3 1.6-2.7 4.5-4.1 7.8-4.1ZM7.8 13.4c2.2-1.7 5.6-.9 7.2 1.8-1.5 3.1-5.6 3-7.2-1.8ZM24.2 13.4c-2.2-1.7-5.6-.9-7.2 1.8 1.5 3.1 5.6 3 7.2-1.8Z",
};

/** A crossed-out eye, as a 24px stroke icon. It stands in for an NSFW post's author. */
export const EYE_OFF =
  "M9.9 5.7A9 9 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-2 2.8M6.6 6.6C3.9 8.3 2.5 12 2.5 12s3.5 6.5 9.5 6.5a9 9 0 0 0 5.4-1.9M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18";
