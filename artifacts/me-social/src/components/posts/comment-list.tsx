import { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { formatRelative } from "@/lib/locale-format";
import { Trash2, Loader2, MessageCircle, Pencil, Flag } from "lucide-react";
import { invalidatePhase6 } from "@/lib/invalidation";
import { ReportDialog } from "./report-dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  useListPostComments,
  useCreatePostComment,
  useUpdatePostComment,
  useDeletePostComment,
  useGetAccountSummary,
  getGetAccountSummaryQueryKey,
  Comment,
  getListPostCommentsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

export interface CommentListProps {
  postId: string;
  commentsOpen: boolean;
  groupId?: string | null;
}

const formSchema = z.object({
  body: z.string().min(1, "Comment cannot be empty").max(10000, "Comment is too long"),
});

export function CommentList({ postId, commentsOpen, groupId }: CommentListProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: accountSummary } = useGetAccountSummary({
    query: { queryKey: getGetAccountSummaryQueryKey() }
  });
  const currentMemberId = accountSummary?.memberId;
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: comments, isLoading } = useListPostComments(postId);
  const createComment = useCreatePostComment();
  const updateComment = useUpdatePostComment();
  const deleteComment = useDeletePostComment();

  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [reportingCommentId, setReportingCommentId] = useState<string | null>(null);
  const [reportingTargetId, setReportingTargetId] = useState<string | null>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { body: "" },
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setIsSubmitting(true);
    try {
      if (editingCommentId) {
        await updateComment.mutateAsync({ id: editingCommentId, data: { body: values.body } });
        toast({ title: "Comment updated", description: "Your changes have been saved." });
        setEditingCommentId(null);
      } else {
        await createComment.mutateAsync({ id: postId, data: { body: values.body, parentCommentId: replyingToId } });
        toast({ title: "Comment submitted", description: "Your comment will be visible if it passes safety checks." });
        setReplyingToId(null);
      }
      form.reset();
      invalidatePhase6(queryClient, postId);
    } catch (e) {
      toast({ title: editingCommentId ? "Could not update comment" : "Could not add comment", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditClick = (comment: Comment) => {
    setEditingCommentId(comment.id);
    setReplyingToId(null);
    form.setValue("body", comment.body);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleReplyClick = (commentId: string) => {
    setReplyingToId(commentId);
    setEditingCommentId(null);
    form.reset();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => {
    setEditingCommentId(null);
    setReplyingToId(null);
    form.reset();
  };

  const handleDelete = async (commentId: string) => {
    if (!window.confirm("Delete this comment?")) return;
    try {
      await deleteComment.mutateAsync({ id: commentId });
      toast({ title: "Comment deleted" });
      invalidatePhase6(queryClient, postId);
    } catch (e) {
      toast({ title: "Could not delete comment", variant: "destructive" });
    }
  };

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground animate-pulse">Loading comments...</div>;
  }

  const activeComments = (comments || []).filter(c => c.status === "active");
  const topLevelComments = activeComments.filter(c => !c.parentCommentId);
  const getReplies = (parentId: string) => activeComments.filter(c => c.parentCommentId === parentId);

  return (
    <div className="space-y-6 mt-8">
      <h3 className="font-display font-semibold text-2xl flex items-center gap-2">
        <MessageCircle className="w-6 h-6 text-primary" />
        Comments
      </h3>

      {commentsOpen && (
        <div className="bg-card border border-border p-4 md:p-6 rounded-3xl shadow-sm">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="body"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Textarea
                        placeholder={replyingToId ? "Write a reply..." : "Add a comment..."}
                        className="min-h-[100px] resize-none text-base border-0 bg-transparent focus-visible:ring-0 px-0 placeholder:text-muted-foreground/60"
                        {...field}
                        data-testid="textarea-comment-body"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex justify-between items-center pt-4 border-t border-border/50">
                <div>
                  {(editingCommentId || replyingToId) && (
                    <Button type="button" variant="ghost" onClick={cancelEdit}>
                      Cancel
                    </Button>
                  )}
                </div>
                <Button
                  type="submit"
                  className="rounded-xl font-semibold px-6"
                  disabled={isSubmitting || !form.watch("body").trim()}
                  data-testid="button-submit-comment"
                >
                  {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : (editingCommentId ? 'Save Changes' : 'Reply')}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      )}

      {!commentsOpen && (
        <div className="bg-muted/30 border border-border p-6 rounded-3xl text-center shadow-sm">
          <p className="text-muted-foreground italic">Comments are closed for this post.</p>
        </div>
      )}

      <div className="space-y-4">
        {topLevelComments.length === 0 ? (
          <p className="text-muted-foreground py-4 text-center">No comments yet.</p>
        ) : (
          topLevelComments.map(comment => (
            <div key={comment.id} className="bg-card border border-border p-4 md:p-5 rounded-2xl shadow-sm" data-testid={`comment-${comment.id}`}>
              <div className="flex items-start justify-between gap-4 mb-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-primary shrink-0 font-display font-bold">
                    C
                  </div>
                  <div>
                    <div className="font-semibold text-foreground">Member</div>
                    <div className="text-xs text-muted-foreground">{formatRelative(comment.createdAt)}</div>
                  </div>
                </div>
                {currentMemberId && comment.authorMemberId === currentMemberId && (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary"
                      onClick={() => handleEditClick(comment)}
                      aria-label="Edit comment"
                      data-testid={`button-edit-comment-${comment.id}`}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      onClick={() => handleDelete(comment.id)}
                      aria-label="Delete comment"
                      data-testid={`button-delete-comment-${comment.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                )}
                {(!currentMemberId || comment.authorMemberId !== currentMemberId) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    onClick={() => { setReportingCommentId(comment.id); setReportingTargetId(comment.authorMemberId); }}
                    aria-label="Report comment"
                  >
                    <Flag className="w-4 h-4" />
                  </Button>
                )}
              </div>
              <div className="text-foreground mt-3 ps-13 leading-relaxed whitespace-pre-wrap mb-2">
                {comment.body}
              </div>
              
              {commentsOpen && (
                <div className="ps-13">
                  <Button variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground hover:text-foreground" onClick={() => handleReplyClick(comment.id)}>
                    Reply
                  </Button>
                </div>
              )}

              {getReplies(comment.id).length > 0 && (
                <div className="mt-4 ps-13 space-y-4 border-l-2 border-border/50">
                  {getReplies(comment.id).map(reply => (
                    <div key={reply.id} className="ps-4 relative" data-testid={`reply-${reply.id}`}>
                      <div className="flex items-start justify-between gap-4 mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-primary shrink-0 font-display font-bold text-sm">
                            C
                          </div>
                          <div>
                            <div className="font-semibold text-foreground text-sm">Member</div>
                            <div className="text-[10px] text-muted-foreground">{formatRelative(reply.createdAt)}</div>
                          </div>
                        </div>
                        {currentMemberId && reply.authorMemberId === currentMemberId && (
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary"
                              onClick={() => handleEditClick(reply)}
                              aria-label="Edit reply"
                            >
                              <Pencil className="w-3 h-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                              onClick={() => handleDelete(reply.id)}
                              aria-label="Delete reply"
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        )}
                        {(!currentMemberId || reply.authorMemberId !== currentMemberId) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            onClick={() => { setReportingCommentId(reply.id); setReportingTargetId(reply.authorMemberId); }}
                            aria-label="Report reply"
                          >
                            <Flag className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                      <div className="text-foreground text-sm ps-10 leading-relaxed whitespace-pre-wrap">
                        {reply.body}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
      
      <ReportDialog 
        isOpen={!!reportingCommentId} 
        onOpenChange={(open) => { if (!open) setReportingCommentId(null); }} 
        commentId={reportingCommentId || undefined} 
        groupId={groupId}
        targetMemberId={reportingTargetId || undefined} 
      />
    </div>
  );
}
