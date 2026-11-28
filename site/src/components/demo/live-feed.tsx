import { useRef } from "react";

import { FeedPost } from "@/components/demo/feed";
import type { Demo } from "@/hooks/use-demo";
import { useInView } from "@/hooks/use-in-view";
import { posts } from "@/lib/demo";

/**
 * A feed that folds the junk away one post after another once it's in view. It keeps one height
 * and scrolls inside it, so nothing under it moves as posts fold and open.
 */
export function LiveFeed({ demo }: { demo: Demo }) {
  const feed = useRef<HTMLOListElement>(null);
  useInView(feed, demo.start);
  return (
    <div className="feed-edge">
      <ol ref={feed} className="feed" aria-label="A feed, with Slop Goblin on it">
        {posts.map((post) => (
          <FeedPost
            key={post.id}
            post={post}
            view={demo.viewOf(post)}
            onAction={(action) => demo.act(post, action)}
          />
        ))}
      </ol>
    </div>
  );
}
