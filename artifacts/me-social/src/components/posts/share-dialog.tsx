import { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Share2, Globe, Users, Lock, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Post, PostAudience, useCreatePost, usePublishPost } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  getListOwnPostsQueryKey, 
  getGetFeedQueryKey 
} from "@workspace/api-client-react";

import { invalidatePhase6 } from "@/lib/invalidation";

const shareSchema = z.object({
  audience: z.enum(["only_me", "friends", "public"]),
  commentary: z.string().max(20000, "Commentary is too long").optional(),
});

export interface ShareDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  originalPost: Post;
}

export function ShareDialog({ isOpen, onOpenChange, originalPost }: ShareDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createPost = useCreatePost();
  const publishPost = usePublishPost();
  const [isPublishing, setIsPublishing] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);

  const form = useForm<z.infer<typeof shareSchema>>({
    resolver: zodResolver(shareSchema),
    defaultValues: {
      audience: originalPost.audience === "public" ? "public" : originalPost.audience === "friends" ? "friends" : "only_me",
      commentary: "",
    },
  });

  const onSubmit = async (values: z.infer<typeof shareSchema>) => {
    setIsPublishing(true);
    try {
      const result = await createPost.mutateAsync({
        data: {
          // 'body' is required by schema, but when originalPostId is present, we provide empty or something valid
          body: values.commentary || "Shared post",
          originalPostId: originalPost.id,
          commentary: values.commentary || undefined,
          audience: values.audience as PostAudience,
          commentsOpen: true,
        }
      });

      if (result && result.id) {
        await publishPost.mutateAsync({ id: result.id });
      }

      toast({ title: "Post submitted", description: "Your post will be published if it passes safety checks." });
      form.reset();
      invalidatePhase6(queryClient);
      onOpenChange(false);
    } catch (e) {
      toast({ title: "Could not share post", variant: "destructive" });
    } finally {
      setIsPublishing(false);
    }
  };

  const handleSaveDraft = async () => {
    setIsSavingDraft(true);
    try {
      const values = form.getValues();
      await createPost.mutateAsync({
        data: {
          body: values.commentary || "Shared post",
          originalPostId: originalPost.id,
          commentary: values.commentary || undefined,
          audience: values.audience as PostAudience,
          commentsOpen: true,
        }
      });
      
      toast({ title: "Draft saved" });
      form.reset();
      invalidatePhase6(queryClient);
      onOpenChange(false);
    } catch (e) {
      toast({ title: "Could not save draft", variant: "destructive" });
    } finally {
      setIsSavingDraft(false);
    }
  };

  const copyPrivateLink = async () => {
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const url = new URL(`${base}/posts/${encodeURIComponent(originalPost.id)}`, window.location.origin);
      // Share only an authenticated route, never a body, media URL or bearer token.
      await navigator.clipboard.writeText(url.href);
      toast({ title: "Link copied", description: "Recipients must sign in and already have permission to see the original post." });
    } catch {
      toast({ title: "Could not copy link", variant: "destructive" });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] rounded-[2rem] p-6 sm:p-8 border border-border shadow-lg">
        <DialogHeader className="mb-4 text-left">
          <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center text-primary mb-4">
            <Share2 className="w-6 h-6" aria-hidden="true" />
          </div>
          <DialogTitle className="text-2xl font-display font-semibold">Share Post</DialogTitle>
          <DialogDescription className="text-base text-muted-foreground mt-2">
            Share this post with your own connections. The original content won't be copied, only referenced.
          </DialogDescription>
        </DialogHeader>

        <section className="rounded-xl border border-border p-4 mb-4 space-y-2">
          <h2 className="font-semibold">Share a link outside Me</h2>
          <p className="text-sm text-muted-foreground">This does not make a private post public. Recipients must sign in and have the original permissions. Access can end if membership, friendship or sharing settings change.</p>
          <Button type="button" variant="outline" onClick={copyPrivateLink} data-testid="button-copy-private-link">Copy protected link</Button>
        </section>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="audience"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-base font-semibold">Audience (Equal or narrower)</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger className="h-12 rounded-xl text-base" data-testid="select-share-audience">
                        <SelectValue placeholder="Select audience" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {originalPost.audience === "public" && (
                        <SelectItem value="public"><div className="flex items-center gap-2"><Globe className="w-4 h-4"/>Public</div></SelectItem>
                      )}
                      {(originalPost.audience === "public" || originalPost.audience === "friends") && (
                        <SelectItem value="friends"><div className="flex items-center gap-2"><Users className="w-4 h-4"/>Friends</div></SelectItem>
                      )}
                      <SelectItem value="only_me"><div className="flex items-center gap-2"><Lock className="w-4 h-4"/>Only Me</div></SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="commentary"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-base font-semibold">Commentary (optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Add your thoughts..."
                      className="min-h-[100px] resize-none rounded-xl text-base"
                      {...field}
                      data-testid="textarea-share-commentary"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="gap-3 sm:gap-0 mt-8 border-t border-border/50 pt-6">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl h-12 px-6 font-semibold flex-1 sm:flex-none" data-testid="button-cancel-share">
                Cancel
              </Button>
              <div className="flex gap-3 w-full sm:w-auto">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={handleSaveDraft} 
                  disabled={isSavingDraft || isPublishing} 
                  className="rounded-xl h-12 px-6 font-semibold flex-1 sm:flex-none" 
                  data-testid="button-save-draft-share"
                >
                  {isSavingDraft ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Save Draft'}
                </Button>
                <Button 
                  type="submit" 
                  className="rounded-xl h-12 px-8 font-semibold flex-1 sm:flex-none" 
                  disabled={isSavingDraft || isPublishing} 
                  data-testid="button-submit-share"
                >
                  {isPublishing ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Share'}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
