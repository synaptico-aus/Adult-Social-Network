import { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { useReportGroup } from "@workspace/api-client-react";
import { Loader2, Flag } from "lucide-react";

const formSchema = z.object({
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
  ], {
    required_error: "Please select a reason for reporting",
  }),
  details: z.string().max(5000, "Details must be under 5000 characters").optional(),
});

type FormValues = z.infer<typeof formSchema>;

export function ReportGroupDialog({ isOpen, onOpenChange, groupId }: { isOpen: boolean, onOpenChange: (open: boolean) => void, groupId: string }) {
  const { toast } = useToast();
  const reportGroup = useReportGroup();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      details: "",
    }
  });

  const onSubmit = async (values: FormValues) => {
    try {
      await reportGroup.mutateAsync({
        groupId,
        data: {
          category: values.category as any, // category enum
          details: values.details || undefined,
        }
      });
      toast({ title: "Report submitted", description: "Our safety team will review this group." });
      onOpenChange(false);
      form.reset();
    } catch (e) {
      toast({ title: "Could not submit report", variant: "destructive" });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] p-6 max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl font-display text-destructive">
            <Flag className="w-6 h-6" />
            Report Group
          </DialogTitle>
          <DialogDescription className="text-base text-foreground/80 mt-3">
            Please let us know what's wrong with this group. Our safety team reviews all reports. Reporting does not automatically punish the group owner, but helps us keep the community safe.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 mt-4">
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem className="space-y-3">
                  <FormLabel className="text-base">Reason for reporting</FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      className="flex flex-col space-y-1"
                    >
                      <FormItem className="flex items-center space-x-3 space-y-0">
                        <FormControl><RadioGroupItem value="harassment" /></FormControl>
                        <FormLabel className="font-normal">Harassment or bullying</FormLabel>
                      </FormItem>
                      <FormItem className="flex items-center space-x-3 space-y-0">
                        <FormControl><RadioGroupItem value="hateful_content" /></FormControl>
                        <FormLabel className="font-normal">Hate speech or hateful content</FormLabel>
                      </FormItem>
                      <FormItem className="flex items-center space-x-3 space-y-0">
                        <FormControl><RadioGroupItem value="dangerous_medical_claims" /></FormControl>
                        <FormLabel className="font-normal">Dangerous medical claims</FormLabel>
                      </FormItem>
                      <FormItem className="flex items-center space-x-3 space-y-0">
                        <FormControl><RadioGroupItem value="scams" /></FormControl>
                        <FormLabel className="font-normal">Scam or fraud</FormLabel>
                      </FormItem>
                      <FormItem className="flex items-center space-x-3 space-y-0">
                        <FormControl><RadioGroupItem value="threats" /></FormControl>
                        <FormLabel className="font-normal">Threats of violence</FormLabel>
                      </FormItem>
                      <FormItem className="flex items-center space-x-3 space-y-0">
                        <FormControl><RadioGroupItem value="distress_disclosure" /></FormControl>
                        <FormLabel className="font-normal">Self-harm or distress disclosure</FormLabel>
                      </FormItem>
                      <FormItem className="flex items-center space-x-3 space-y-0 text-muted-foreground mt-4 pt-4 border-t border-border">
                        <FormControl><RadioGroupItem value="respectful_disagreement" /></FormControl>
                        <FormLabel className="font-normal">I just disagree with it (no action will be taken)</FormLabel>
                      </FormItem>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="details"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-base">Additional details (optional)</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Please provide any helpful context..." 
                      className="resize-none" 
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={reportGroup.isPending}>
                {reportGroup.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Submit Report
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
