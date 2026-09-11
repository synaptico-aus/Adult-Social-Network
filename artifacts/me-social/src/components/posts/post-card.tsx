import { useState } from "react";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";
import {
  Heart,
  MessageCircle,
  MoreHorizontal,
  Bookmark,
  EyeOff,
  Flag,
  Share2,
  Pencil,
  Trash2,
  Globe,
  Users,
  Lock,
  MessageSquare
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { Post, useTogglePostReaction, useSavePost, useUnsavePost, useHidePost, useDeletePost, useGetAccountSummary, getGetAccountSummaryQueryKey, getGetFeedQueryKey, getListOwnPostsQueryKey, getListSavedPostsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { invalidatePhase6 } from "@/lib/invalidation";
import { ReportDialog } from "./report-dialog";
import { ShareDialog } from "./share-dialog";

export interface PostCardProps {
  post: Post;
  isDetail?: boolean;
  onEdit?: (post: Post) => void;
  onDeleted?: (postId: string) => void;
  onHidden?: (postId: string) => void;
  onReport?: (postId: string) => void;
}

const AudienceIcon = ({ audience }: { audience: string }) => {
  if (audience === "public") return <Globe className="w-4 h-4" aria-label="Public" />;
  if (audience === "only_me") return <Lock className="w-4 h-4" aria-label="Only me" />;
  return <Users className="w-4 h-4" aria-label="Friends" />;
};

const formatGuidanceLabel = (label?: string | null) => {
  if (!label) return null;
  const labels: Record<string, string> = {
    someone_to_listen: "Someone to listen",
    shared_experiences: "Shared experiences",
    practical_ideas: "Practical ideas",
    something_uplifting: "Something uplifting",
  };
  return labels[label] || label.replace(/_/g, ' ');
};

export function PostCard({ post, isDetail = false, onEdit, onDeleted, onHidden, onReport }: PostCardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: accountSummary } = useGetAccountSummary({
    query: { queryKey: getGetAccountSummaryQueryKey() }
  });
  const currentMemberId = accountSummary?.memberId;
  const isOwner = post.authorMemberId === currentMemberId;

  const [localSaved, setLocalSaved] = useState(post.saved || false);
  const [localReactions, setLocalReactions] = useState<string[]>(post.myReactions || []);
  const [localCounts, setLocalCounts] = useState<Record<string, number>>((post.reactionCounts as Record<string, number>) || {});

  const toggleReaction = useTogglePostReaction();
  const savePost = useSavePost();
  const unsavePost = useUnsavePost();
  const hidePost = useHidePost();
  const deletePost = useDeletePost();

  const [reportOpen, setReportOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const handleToggleReaction = async (kind: "hear_you" | "thank_you_for_sharing") => {
    const isReacted = localReactions.includes(kind);
    // Optimistic
    setLocalReactions(prev => isReacted ? prev.filter(k => k !== kind) : [...prev, kind]);
    setLocalCounts(prev => ({
      ...prev,
      [kind]: Math.max(0, (prev[kind] || 0) + (isReacted ? -1 : 1))
    }));
    try {
      await toggleReaction.mutateAsync({ id: post.id, data: { kind } });
      invalidatePhase6(queryClient, post.id);
    } catch (error) {
      // Revert
      setLocalReactions(post.myReactions || []);
      setLocalCounts((post.reactionCounts as Record<string, number>) || {});
      toast({ title: "Could not record reaction", variant: "destructive" });
    }
  };

  const handleToggleSave = async () => {
    const currentlySaved = localSaved;
    setLocalSaved(!currentlySaved);
    try {
      if (currentlySaved) {
        await unsavePost.mutateAsync({ id: post.id });
      } else {
        await savePost.mutateAsync({ id: post.id });
      }
      toast({ title: currentlySaved ? "Post unsaved" : "Post saved" });
      invalidatePhase6(queryClient, post.id);
    } catch (e) {
      setLocalSaved(currentlySaved);
      toast({ title: "Could not save post", variant: "destructive" });
    }
  };

  const handleHide = async () => {
    try {
      await hidePost.mutateAsync({ id: post.id });
      toast({ title: "Post hidden" });
      invalidatePhase6(queryClient, post.id);
      if (onHidden) onHidden(post.id);
    } catch (e) {
      toast({ title: "Could not hide post", variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("Are you sure you want to delete this post?")) return;
    try {
      await deletePost.mutateAsync({ id: post.id });
      toast({ title: "Post deleted" });
      invalidatePhase6(queryClient, post.id);
      if (onDeleted) onDeleted(post.id);
    } catch (e) {
      toast({ title: "Could not delete post", variant: "destructive" });
    }
  };

  const guidanceLabel = formatGuidanceLabel(post.responseLabel);

  return (
    <div className={`bg-card border border-border p-5 md:p-6 rounded-3xl shadow-sm ${!isDetail ? 'hover:border-border/80 transition-colors' : ''}`} data-testid={`post-card-${post.id}`}>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center text-primary shrink-0 font-display font-bold text-xl">
            {post.authorDisplayName?.[0]?.toUpperCase() || 'A'}
          </div>
          <div>
            <div className="font-semibold text-foreground text-lg flex items-center gap-2">
              {post.authorDisplayName || 'Anonymous'}
              {isOwner && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground font-medium uppercase tracking-wider">
                  {post.status}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mt-0.5">
              <span>{formatDistanceToNow(new Date(post.createdAt))} ago</span>
              <span>&middot;</span>
              <AudienceIcon audience={post.audience} />
            </div>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full h-10 w-10 shrink-0" aria-label="Post options">
              <MoreHorizontal className="w-5 h-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 rounded-xl">
            {isOwner ? (
              <>
                {onEdit && (
                  <DropdownMenuItem onClick={() => onEdit(post)} className="cursor-pointer py-3" data-testid="menu-edit-post">
                    <Pencil className="w-4 h-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={handleDelete} className="text-destructive focus:bg-destructive/10 cursor-pointer py-3" data-testid="menu-delete-post">
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </>
            ) : (
              <>
                <DropdownMenuItem onClick={handleToggleSave} className="cursor-pointer py-3" data-testid="menu-save-post">
                  <Bookmark className={`w-4 h-4 mr-2 ${localSaved ? "fill-current" : ""}`} />
                  {localSaved ? "Unsave" : "Save"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleHide} className="cursor-pointer py-3" data-testid="menu-hide-post">
                  <EyeOff className="w-4 h-4 mr-2" />
                  Hide
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setReportOpen(true)} className="text-destructive focus:bg-destructive/10 cursor-pointer py-3" data-testid="menu-report-post">
                  <Flag className="w-4 h-4 mr-2" />
                  Report
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {guidanceLabel && (
        <div className="mb-4 inline-flex items-center px-3 py-1.5 rounded-full bg-secondary/60 text-secondary-foreground text-sm font-medium border border-secondary-border">
          <MessageSquare className="w-4 h-4 mr-2 opacity-70" />
          {guidanceLabel}
        </div>
      )}

      {post.originalAvailable === false && (
        <div className="mb-4 p-3 rounded-xl bg-muted/30 border border-border text-muted-foreground text-sm italic">
          The original post this was shared from is no longer available.
        </div>
      )}

      <div className="text-foreground text-lg leading-relaxed whitespace-pre-wrap mb-6">
        {post.body}
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-4 border-t border-border/50">
        <Button
          variant="ghost"
          size="sm"
          className={`rounded-full px-4 h-10 ${localReactions.includes('hear_you') ? 'bg-primary/10 text-primary hover:bg-primary/20' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`}
          onClick={() => handleToggleReaction('hear_you')}
          data-testid="button-react-hear"
        >
          <Heart className={`w-4 h-4 mr-2 ${localReactions.includes('hear_you') ? 'fill-current' : ''}`} />
          I hear you {(localCounts['hear_you'] || 0) > 0 && <span className="ml-1 opacity-70">({localCounts['hear_you']})</span>}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={`rounded-full px-4 h-10 ${localReactions.includes('thank_you_for_sharing') ? 'bg-primary/10 text-primary hover:bg-primary/20' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`}
          onClick={() => handleToggleReaction('thank_you_for_sharing')}
          data-testid="button-react-thanks"
        >
          <Heart className={`w-4 h-4 mr-2 ${localReactions.includes('thank_you_for_sharing') ? 'fill-current' : ''}`} />
          Thank you {(localCounts['thank_you_for_sharing'] || 0) > 0 && <span className="ml-1 opacity-70">({localCounts['thank_you_for_sharing']})</span>}
        </Button>

        {!isDetail && post.commentsOpen && (
          <Button variant="ghost" size="sm" asChild className="rounded-full px-4 h-10 text-muted-foreground hover:bg-secondary hover:text-foreground" data-testid="link-post-comments">
            <Link href={`/posts/${post.id}`}>
              <MessageCircle className="w-4 h-4 mr-2" />
              Reply
            </Link>
          </Button>
        )}

        {!post.commentsOpen && (
          <div className="ml-auto text-sm text-muted-foreground italic flex items-center px-2">
            Comments closed
          </div>
        )}

        <Button
          variant="ghost"
          size="sm"
          className="rounded-full px-4 h-10 ml-auto text-muted-foreground hover:bg-secondary hover:text-foreground"
          aria-label="Share options"
          onClick={() => setShareOpen(true)}
          data-testid="button-share-post"
        >
          <Share2 className="w-4 h-4 mr-2" />
          Share
        </Button>
      </div>

      <ReportDialog
        isOpen={reportOpen}
        onOpenChange={setReportOpen}
        postId={post.id}
        targetMemberId={post.authorMemberId}
      />
      <ShareDialog
        isOpen={shareOpen}
        onOpenChange={setShareOpen}
        originalPost={post}
      />
    </div>
  );
}
