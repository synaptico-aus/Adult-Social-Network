import { useParams, Link as WouterLink, useLocation } from "wouter";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PostCard } from "@/components/posts/post-card";
import { CommentList } from "@/components/posts/comment-list";
import { useGetPost, getGetPostQueryKey } from "@workspace/api-client-react";

export default function PostDetail() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const postId = params.id as string;

  const { data: post, isLoading, isError } = useGetPost(postId, {
    query: {
      queryKey: getGetPostQueryKey(postId),
      enabled: !!postId,
      retry: false,
    }
  });

  if (isLoading) {
    return <div className="py-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  if (isError || !post) {
    return (
      <div className="flex flex-col gap-6 items-center justify-center min-h-[50vh] text-center px-4 animate-in fade-in">
        <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-2">
          <ArrowLeft className="rtl:-scale-x-100 w-8 h-8 text-muted-foreground" />
        </div>
        <h2 className="text-2xl font-display font-semibold" data-testid="status-post-unavailable">Post unavailable</h2>
        <p className="text-muted-foreground max-w-md">This post may have been deleted, hidden, or is no longer shared with you.</p>
        <Button variant="outline" className="mt-4 rounded-xl px-8" asChild>
          <WouterLink href="/">Return home</WouterLink>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 animate-in fade-in duration-500">
      <div>
        <Button variant="ghost" className="mb-6 -ms-4 text-muted-foreground hover:text-foreground" onClick={() => window.history.back()}>
          <ArrowLeft className="rtl:-scale-x-100 w-4 h-4 me-2" />
          Back
        </Button>
      </div>

      <PostCard
        post={post}
        isDetail
        onDeleted={() => setLocation("/")}
        onHidden={() => setLocation("/")}
      />

      <div className="border-t border-border/50 pt-2">
        <CommentList postId={post.id} commentsOpen={post.commentsOpen} groupId={post.groupId} />
      </div>
    </div>
  );
}
