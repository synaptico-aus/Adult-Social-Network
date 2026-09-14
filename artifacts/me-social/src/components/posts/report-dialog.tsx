import { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Flag, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useCreateReport, ReportInputCategory } from "@workspace/api-client-react";

import { invalidatePhase6 } from "@/lib/invalidation";
import { useQueryClient } from "@tanstack/react-query";

const reportSchema = z.object({
  category: z.enum([
    "harassment",
    "threats",
    "exploitation",
    "scams",
    "impersonation",
    "hateful_content",
    "dangerous_medical_claims",
    "distress_disclosure",
    "respectful_disagreement"
  ]),
  details: z.string().max(5000, "Details too long").optional(),
});

export interface ReportDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  postId?: string;
  commentId?: string;
  groupId?: string | null;
  targetMemberId?: string;
}

export function ReportDialog({ isOpen, onOpenChange, postId, commentId, groupId, targetMemberId }: ReportDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createReport = useCreateReport();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof reportSchema>>({
    resolver: zodResolver(reportSchema),
    defaultValues: {
      category: "harassment",
      details: "",
    },
  });

  const onSubmit = async (values: z.infer<typeof reportSchema>) => {
    setIsSubmitting(true);
    try {
      await createReport.mutateAsync({
        data: {
          category: values.category as ReportInputCategory,
          details: values.details || undefined,
          ...(groupId ? { groupId } : {}),
          targetMemberId,
          contentTargetType: commentId ? 'comment' : (postId ? 'post' : undefined),
          contentTargetId: commentId || postId,
        }
      });
      toast({ title: "Report submitted", description: "Thank you for helping keep our community safe." });
      form.reset();
      invalidatePhase6(queryClient, postId);
      onOpenChange(false);
    } catch (e) {
      toast({ title: "Could not submit report", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] rounded-[2rem] p-6 sm:p-8 border border-border shadow-lg">
        <DialogHeader className="mb-4 text-left">
          <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center text-primary mb-4">
            <Flag className="w-6 h-6" aria-hidden="true" />
          </div>
          <DialogTitle className="text-2xl font-display font-semibold">Report Content</DialogTitle>
          <DialogDescription className="text-base text-muted-foreground mt-2">
            Please let us know what's wrong. Your report is private and handled securely.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-base font-semibold">Reason for report</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger className="h-12 rounded-xl text-base" data-testid="select-report-category">
                        <SelectValue placeholder="Select a reason" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="harassment">Harassment or bullying</SelectItem>
                      <SelectItem value="hateful_content">Hateful content</SelectItem>
                      <SelectItem value="dangerous_medical_claims">Dangerous medical claims</SelectItem>
                      <SelectItem value="distress_disclosure">Severe distress or self-harm</SelectItem>
                      <SelectItem value="threats">Threats of violence</SelectItem>
                      <SelectItem value="scams">Spam or scams</SelectItem>
                      <SelectItem value="respectful_disagreement">Respectful disagreement (Safety team review)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="details"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-base font-semibold">Additional details (optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Please provide any helpful context..."
                      className="min-h-[100px] resize-none rounded-xl text-base"
                      {...field}
                      data-testid="textarea-report-details"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="gap-3 sm:gap-0 mt-8 border-t border-border/50 pt-6">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl h-12 px-6 font-semibold" data-testid="button-cancel-report">
                Cancel
              </Button>
              <Button type="submit" className="rounded-xl h-12 px-8 font-semibold" disabled={isSubmitting} data-testid="button-submit-report">
                {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Submit Report'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
