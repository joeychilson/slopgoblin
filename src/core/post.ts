/** What the classifier sees. Site adapters produce this; the eval set is made of it. */
export interface PostContent {
  author: { name: string; handle: string };
  text: string;
  quote?: { handle: string; text: string };
  /** Link card summary, e.g. "nytimes.com · Headline". */
  link?: string;
  replyTo?: { handle: string; text: string };
  images?: string[];
}

export interface Post extends PostContent {
  /** Site-scoped stable id, e.g. "x:1857304412". */
  id: string;
  url: string;
  isAd: boolean;
}
