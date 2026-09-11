import { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Globe, Users, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useCreatePost, useUpdatePost, usePublishPost, Post, PostAudience, PostInputResponseLabel } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

import { invalidatePhase6 } from "@/lib/invalidation";

const formSchema = z.object({
  body: z.string().min(1, "Post cannot be empty").max(20000, "Post is too long"),
  audience: z.enum(["only_me", "friends", "public"]),
  responseLabel: z.enum([
    "someone_to_listen", 
    "shared_experiences", 
    "practical_ideas", 
    "something_uplifting",
    "none"
  ]).optional().nullable(),
  commentsOpen: z.boolean(),
  visibleReactionCounts: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

export interface PostComposerProps {
  post?: Post;
  onSuccess?: () => void;
  isStandalone?: boolean;
}

export function PostComposer({ post, onSuccess, isStandalone = false }: PostComposerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      body: post?.body || "",
      audience: post?.audience || "friends",
      responseLabel: (post?.responseLabel as any) || "none",
      commentsOpen: post?.commentsOpen ?? true,
      visibleReactionCounts: post?.visibleReactionCounts ?? true,
    },
  });

  const createPost = useCreatePost();
  const updatePost = useUpdatePost();
  const publishPost = usePublishPost();
  const [isPublishing, setIsPublishing] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);

  const isPublished = post?.status === "published";

  const onSubmit = async (values: FormValues) => {
    setIsPublishing(true);
    try {
      const payload = {
        body: values.body,
        audience: values.audience as PostAudience,
        responseLabel: (values.responseLabel === "none" || !values.responseLabel) ? undefined : (values.responseLabel as PostInputResponseLabel),
        commentsOpen: values.commentsOpen,
        visibleReactionCounts: values.visibleReactionCounts,
      };

      if (post) {
        // Edit existing post
        await updatePost.mutateAsync({ id: post.id, data: payload });
        if (!isPublished) {
           await publishPost.mutateAsync({ id: post.id });
           toast({ title: "Post submitted", description: "Your post will be published if it passes safety checks." });
        } else {
           toast({ title: "Post updated", description: "Your changes have been saved." });
        }
      } else {
        // Create new post
        const result = await createPost.mutateAsync({ data: payload });
        if (result && result.id) {
          await publishPost.mutateAsync({ id: result.id });
          toast({ title: "Post submitted", description: "Your post will be published if it passes safety checks." });
        }
      }

      form.reset();
      invalidatePhase6(queryClient, post?.id);
      if (onSuccess) onSuccess();
    } catch (error) {
      toast({ title: "Error", description: "Could not save post.", variant: "destructive" });
    } finally {
      setIsPublishing(false);
    }
  };

  const handleSaveDraft = async () => {
    const values = form.getValues();
    if (!values.body.trim()) return;
    
    setIsSavingDraft(true);
    try {
      const payload = {
        body: values.body,
        audience: values.audience as PostAudience,
        responseLabel: (values.responseLabel === "none" || !values.responseLabel) ? undefined : (values.responseLabel as PostInputResponseLabel),
        commentsOpen: values.commentsOpen,
        visibleReactionCounts: values.visibleReactionCounts,
      };

      if (post) {
        await updatePost.mutateAsync({ id: post.id, data: payload });
      } else {
        await createPost.mutateAsync({ data: payload });
      }
      toast({ title: "Draft saved" });
      form.reset();
      invalidatePhase6(queryClient, post?.id);
      if (onSuccess) onSuccess();
    } catch (e) {
      toast({ title: "Error", description: "Could not save draft.", variant: "destructive" });
    } finally {
      setIsSavingDraft(false);
    }
  };

  const isSaving = createPost.isPending || updatePost.isPending || isPublishing || isSavingDraft;

  return (
    <div className={`bg-card border border-border p-4 md:p-6 rounded-3xl shadow-sm ${isStandalone ? 'mb-8' : ''}`}>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="body"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Textarea
                    placeholder="Share what's on your mind..."
                    className="min-h-[120px] resize-none text-lg border-0 bg-transparent focus-visible:ring-0 px-0 placeholder:text-muted-foreground/60"
                    {...field}
                    data-testid="textarea-post-body"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid gap-3 rounded-2xl bg-secondary/30 p-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="commentsOpen"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between gap-4">
                  <Label htmlFor="switch-comments-open" className="leading-snug">Allow comments and replies</Label>
                  <FormControl>
                    <Switch
                      id="switch-comments-open"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      data-testid="switch-comments-open"
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="visibleReactionCounts"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between gap-4">
                  <Label htmlFor="switch-reaction-counts" className="leading-snug">Show reaction counts to others</Label>
                  <FormControl>
                    <Switch
                      id="switch-reaction-counts"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      data-testid="switch-reaction-counts"
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-border/50">
            <div className="flex flex-wrap items-center gap-3">
              <FormField
                control={form.control}
                name="audience"
                render={({ field }) => (
                  <FormItem>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-10 rounded-xl bg-secondary/50 border-0 font-medium" data-testid="select-post-audience">
                          <SelectValue placeholder="Audience" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="public"><div className="flex items-center gap-2"><Globe className="w-4 h-4"/>Public</div></SelectItem>
                        <SelectItem value="friends"><div className="flex items-center gap-2"><Users className="w-4 h-4"/>Friends</div></SelectItem>
                        <SelectItem value="only_me"><div className="flex items-center gap-2"><Lock className="w-4 h-4"/>Only Me</div></SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="responseLabel"
                render={({ field }) => (
                  <FormItem>
                    <Select onValueChange={field.onChange} defaultValue={field.value || "none"}>
                      <FormControl>
                        <SelectTrigger className="h-10 rounded-xl bg-secondary/50 border-0 font-medium max-w-[200px]" data-testid="select-post-label">
                          <SelectValue placeholder="Guidance" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">No guidance</SelectItem>
                        <SelectItem value="someone_to_listen">Someone to listen</SelectItem>
                        <SelectItem value="shared_experiences">Shared experiences</SelectItem>
                        <SelectItem value="practical_ideas">Practical ideas</SelectItem>
                        <SelectItem value="something_uplifting">Something uplifting</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              {!isPublished && (
                <Button 
                  type="button" 
                  variant="outline" 
                  className="rounded-xl font-semibold flex-1 sm:flex-none" 
                  onClick={handleSaveDraft}
                  disabled={isSaving || !form.watch("body").trim()}
                  data-testid="button-save-draft"
                >
                  {isSavingDraft ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Save Draft'}
                </Button>
              )}
              <Button 
                type="submit" 
                className="rounded-xl font-semibold flex-1 sm:flex-none"
                disabled={isSaving || !form.watch("body").trim()}
                data-testid={isPublished ? "button-update-post" : "button-publish-post"}
              >
                {isPublishing ? <Loader2 className="w-5 h-5 animate-spin" /> : (isPublished ? 'Update' : 'Publish')}
              </Button>
            </div>
          </div>
        </form>
      </Form>
    </div>
  );
}
