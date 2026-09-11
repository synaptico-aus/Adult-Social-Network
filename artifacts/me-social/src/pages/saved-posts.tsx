import { useState, useEffect } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { PostCard } from "@/components/posts/post-card";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft } from "lucide-react";
import { useListSavedPosts, getListSavedPostsQueryKey, Post } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";

export default function SavedPosts() {
  const queryClient = useQueryClient();
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [allPosts, setAllPosts] = useState<Post[]>([]);

  const { data: postsData, isLoading, isFetching, refetch } = useListSavedPosts(
    { cursor },
    {
      query: {
        queryKey: getListSavedPostsQueryKey({ cursor }),
      }
    }
  );

  useEffect(() => {
    if (postsData?.items) {
      if (!cursor) {
        setAllPosts(postsData.items);
      } else {
        setAllPosts(prev => {
          const newPosts = postsData.items.filter(p => !prev.some(existing => existing.id === p.id));
          return [...prev, ...newPosts];
        });
      }
    }
  }, [postsData, cursor]);

  const handleLoadMore = () => {
    if (postsData?.nextCursor) {
      setCursor(postsData.nextCursor);
    }
  };

  return (
    <div className="flex flex-col gap-8 md:gap-10 animate-in fade-in duration-500">
      <div>
        <Button variant="ghost" className="mb-6 -ml-4 text-muted-foreground hover:text-foreground" asChild>
          <Link href="/me">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Me
          </Link>
        </Button>
        <PageHeader
          title="Saved Posts"
          description="Posts you've saved for later."
        />
      </div>

      <div className="space-y-6">
        {isLoading && !allPosts.length ? (
          <div className="py-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
        ) : !allPosts.length ? (
          <div className="py-12 text-center text-muted-foreground bg-card border border-border rounded-3xl p-8 shadow-sm">
            You don't have any saved posts yet.
          </div>
        ) : (
          allPosts.map((post: Post) => (
            <PostCard
              key={post.id}
              post={post}
              onHidden={() => setAllPosts(prev => prev.filter(p => p.id !== post.id))}
            />
          ))
        )}
      </div>

      {postsData?.nextCursor && (
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
