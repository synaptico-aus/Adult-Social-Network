import { useState, useEffect } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { PostComposer } from "@/components/posts/post-composer";
import { PostCard } from "@/components/posts/post-card";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, Users, BookOpen } from "lucide-react";
import { useGetFeed, getGetFeedQueryKey, Post } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

import { invalidatePhase6 } from "@/lib/invalidation";

export default function HomeFeed() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [filter, setFilter] = useState<"all" | "friends">("all");
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [allPosts, setAllPosts] = useState<Post[]>([]);

  const { data: feedData, isLoading, isFetching, refetch } = useGetFeed(
    { filter, cursor },
    {
      query: {
        queryKey: getGetFeedQueryKey({ filter, cursor }),
      }
    }
  );

  useEffect(() => {
    if (feedData?.items) {
      if (!cursor) {
        setAllPosts(feedData.items);
      } else {
        setAllPosts(prev => {
          const newPosts = feedData.items.filter(p => !prev.some(existing => existing.id === p.id));
          return [...prev, ...newPosts];
        });
      }
    }
  }, [feedData, cursor]);

  const handleRefresh = async () => {
    setCursor(undefined);
    invalidatePhase6(queryClient);
    refetch();
  };

  const handleLoadMore = () => {
    if (feedData?.nextCursor) {
      setCursor(feedData.nextCursor);
    }
  };

  return (
    <div className="flex flex-col gap-8 md:gap-10 animate-in fade-in duration-500">
      <div className="flex items-end justify-between">
        <PageHeader
          title="Home"
          description="Your space for connection."
        />
        <Button variant="ghost" size="icon" onClick={handleRefresh} aria-label="Refresh feed" className="mb-2">
          <RefreshCw className={`w-5 h-5 ${isFetching ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <PostComposer onSuccess={handleRefresh} isStandalone />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
        <div className="flex items-center gap-2">
          <Button
            variant={filter === "all" ? "default" : "outline"}
            className="rounded-full px-6"
            onClick={() => { setFilter("all"); setCursor(undefined); }}
            data-testid="filter-all"
          >
            All
          </Button>
          <Button
            variant={filter === "friends" ? "default" : "outline"}
            className="rounded-full px-6"
            onClick={() => { setFilter("friends"); setCursor(undefined); }}
            data-testid="filter-friends"
          >
            Friends
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" className="rounded-full px-4 h-10 opacity-60 cursor-not-allowed" title="Groups (Coming Soon)">
            <Users className="w-4 h-4 mr-2" />
            Groups <span className="ml-1 text-[10px] uppercase tracking-wider">(Soon)</span>
          </Button>
          <Button variant="secondary" className="rounded-full px-4 h-10 opacity-60 cursor-not-allowed" title="Education (Coming Soon)">
            <BookOpen className="w-4 h-4 mr-2" />
            Education <span className="ml-1 text-[10px] uppercase tracking-wider">(Soon)</span>
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        {isLoading && !allPosts.length ? (
          <div className="py-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
        ) : !allPosts.length ? (
          <div className="py-12 text-center text-muted-foreground bg-card border border-border rounded-3xl p-8">
            No posts to show right now.
          </div>
        ) : (
          allPosts.map((post: Post) => (
            <PostCard
              key={post.id}
              post={post}
              onDeleted={() => setAllPosts(prev => prev.filter(p => p.id !== post.id))}
              onHidden={() => setAllPosts(prev => prev.filter(p => p.id !== post.id))}
            />
          ))
        )}
      </div>

      {feedData?.nextCursor && (
        <div className="flex justify-center pt-4">
          <Button
            variant="outline"
            className="rounded-xl px-8"
            onClick={handleLoadMore}
            disabled={isFetching}
            data-testid="button-load-more"
          >
            {isFetching ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}
