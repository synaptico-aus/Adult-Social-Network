import { useState, useEffect } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { PostCard } from "@/components/posts/post-card";
import { PostComposer } from "@/components/posts/post-composer";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, PenSquare } from "lucide-react";
import { useListOwnPosts, getListOwnPostsQueryKey, Post } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";

import { invalidatePhase6 } from "@/lib/invalidation";

export default function MePosts() {
  const queryClient = useQueryClient();
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [allPosts, setAllPosts] = useState<Post[]>([]);
  const [editingPost, setEditingPost] = useState<Post | null>(null);

  const { data: postsData, isLoading, isFetching, refetch } = useListOwnPosts(
    { cursor },
    {
      query: {
        queryKey: getListOwnPostsQueryKey({ cursor }),
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

  const handleRefresh = async () => {
    setCursor(undefined);
    invalidatePhase6(queryClient);
    refetch();
  };

  const handleLoadMore = () => {
    if (postsData?.nextCursor) {
      setCursor(postsData.nextCursor);
    }
  };

  const handleEditSuccess = () => {
    setEditingPost(null);
    handleRefresh();
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
          title="My Posts"
          description="Manage your drafts and published posts."
        />
      </div>

      {editingPost ? (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold flex items-center gap-2">
              <PenSquare className="w-5 h-5 text-primary" /> Edit Post
            </h3>
            <Button variant="ghost" onClick={() => setEditingPost(null)}>Cancel</Button>
          </div>
          <PostComposer
            post={editingPost}
            onSuccess={handleEditSuccess}
          />
        </div>
      ) : (
        <div className="space-y-6">
          {isLoading && !allPosts.length ? (
            <div className="py-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
          ) : !allPosts.length ? (
            <div className="py-12 text-center text-muted-foreground bg-card border border-border rounded-3xl p-8 shadow-sm">
              You haven't created any posts yet.
            </div>
          ) : (
            allPosts.map((post: Post) => (
              <PostCard
                key={post.id}
                post={post}
                onEdit={setEditingPost}
                onDeleted={() => setAllPosts(prev => prev.filter(p => p.id !== post.id))}
              />
            ))
          )}
        </div>
      )}

      {!editingPost && postsData?.nextCursor && (
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
