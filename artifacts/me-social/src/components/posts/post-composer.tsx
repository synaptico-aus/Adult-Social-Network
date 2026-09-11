import { useState, useEffect } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Globe, Users, Lock, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useCreatePost, useUpdatePost, usePublishPost, Post, PostAudience, PostInputResponseLabel, MediaAttachment } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { invalidatePhase6 } from "@/lib/invalidation";
import { useMediaUploads } from "@/hooks/use-media-upload";
import { MediaUploader } from "@/components/media/media-uploader";
import { v4 as uuidv4 } from "uuid";

const formSchema = z.object({
  body: z.string().min(1, "Post cannot be empty").max(20000, "Post is too long"),
  audience: z.enum(["only_me", "friends", "my_circle", "public"]),
  circleId: z.string().optional(),
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
  circleId?: string;
}

export function PostComposer({ post, onSuccess, isStandalone = false, circleId }: PostComposerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      body: post?.body || "",
      audience: circleId ? "my_circle" : (post?.audience || "friends"),
      circleId: circleId ?? post?.circleId ?? undefined,
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

  const { items: mediaItems, setItems: setMediaItems, addPhoto, addAudio, updateItem, startUpload, cancel, remove, saveTranscript } = useMediaUploads();

  useEffect(() => {
    if (post?.mediaAssets && post.mediaAssets.length > 0) {
      setMediaItems(post.mediaAssets.map(asset => ({
        clientId: uuidv4(),
        file: new Blob(), // Dummy blob for existing asset
        kind: asset.kind,
        altText: asset.altText || asset.transcript || '',
        status: asset.status as any,
        progress: 100,
        asset,
        clientIdempotencyKey: uuidv4(),
        previewUrl: `/api/media/${asset.id}` // the actual GET url for media, or mock it.
      })));
    }
  }, [post, setMediaItems]);

  const onSubmit = async (values: FormValues) => {
    const unreadyMedia = mediaItems.some(i => i.status !== 'ready');
    if (unreadyMedia) {
      toast({ title: "Media not ready", description: "Please wait for all media to finish uploading or resolve any issues.", variant: "destructive" });
      return;
    }

    setIsPublishing(true);
    try {
      const payload = {
        body: values.body,
        audience: values.audience as PostAudience,
        responseLabel: (values.responseLabel === "none" || !values.responseLabel) ? undefined : (values.responseLabel as PostInputResponseLabel),
        commentsOpen: values.commentsOpen,
        visibleReactionCounts: values.visibleReactionCounts,
        mediaAssetIds: mediaItems.map(i => i.asset?.id).filter(Boolean) as string[],
        circleId: values.audience === "my_circle" ? values.circleId : null,
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
      setMediaItems([]);
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
    if (!values.body.trim() && mediaItems.length === 0) return;

    const unreadyMedia = mediaItems.some(i => i.status !== 'ready');
    if (unreadyMedia) {
      toast({ title: "Media not ready", description: "Please wait for all media to finish uploading or resolve any issues.", variant: "destructive" });
      return;
    }
    
    setIsSavingDraft(true);
    try {
      const payload = {
        body: values.body,
        audience: values.audience as PostAudience,
        responseLabel: (values.responseLabel === "none" || !values.responseLabel) ? undefined : (values.responseLabel as PostInputResponseLabel),
        commentsOpen: values.commentsOpen,
        visibleReactionCounts: values.visibleReactionCounts,
        mediaAssetIds: mediaItems.map(i => i.asset?.id).filter(Boolean) as string[],
        circleId: values.audience === "my_circle" ? values.circleId : null,
      };

      if (post) {
        await updatePost.mutateAsync({ id: post.id, data: payload });
      } else {
        await createPost.mutateAsync({ data: payload });
      }
      toast({ title: "Draft saved" });
      form.reset();
      setMediaItems([]);
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

          <MediaUploader
            items={mediaItems}
            setItems={setMediaItems}
            addPhoto={addPhoto}
            addAudio={addAudio}
            updateItem={updateItem}
            startUpload={startUpload}
            cancel={cancel}
            remove={remove}
            saveTranscript={saveTranscript}
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
                        {circleId ? <SelectItem value="my_circle"><div className="flex items-center gap-2"><Users className="w-4 h-4"/>This circle</div></SelectItem> : <>
                          <SelectItem value="public"><div className="flex items-center gap-2"><Globe className="w-4 h-4"/>Public</div></SelectItem>
                          <SelectItem value="friends"><div className="flex items-center gap-2"><Users className="w-4 h-4"/>Friends</div></SelectItem>
                          <SelectItem value="only_me"><div className="flex items-center gap-2"><Lock className="w-4 h-4"/>Only Me</div></SelectItem>
                        </>}
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
                  disabled={isSaving || (!form.watch("body").trim() && mediaItems.length === 0) || mediaItems.some(i => i.status !== 'ready')}
                  data-testid="button-save-draft"
                >
                  {isSavingDraft ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Save Draft'}
                </Button>
              )}
              <Button 
                type="submit" 
                className="rounded-xl font-semibold flex-1 sm:flex-none"
                disabled={isSaving || (!form.watch("body").trim() && mediaItems.length === 0) || mediaItems.some(i => i.status !== 'ready')}
                data-testid={isPublished ? "button-update-post" : "button-publish-post"}
              >
                {isPublishing ? <Loader2 className="w-5 h-5 animate-spin" /> : (isPublished ? 'Update' : 'Publish')}
              </Button>
            </div>
          </div>
          <div className="text-xs text-muted-foreground flex items-start gap-1.5 px-1 pt-1">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
            <p>
              Shared links can be revoked within five minutes. Keep in mind that screenshots or downloaded copies made by others cannot be recalled.
            </p>
          </div>
        </form>
      </Form>
    </div>
  );
}
