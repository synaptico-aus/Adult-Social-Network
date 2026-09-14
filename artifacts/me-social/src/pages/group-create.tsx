import { useState } from "react";
import { useLocation, Link } from "wouter";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCreateGroup, useListGroupCategories, getListGroupCategoriesQueryKey, GroupInputDiscoverability, GroupInputContentVisibility, GroupInputJoinPolicy, WelcomeAvailabilityText } from "@workspace/api-client-react";
import { ChevronLeft, Loader2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Form, FormControl, FormField, FormItem, FormMessage, FormDescription } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/shared/page-header";

const availabilityTexts = [
  'Welcome requests are open when a trained host is available.',
  'Trained hosts are limited; response timing is not provided.',
  'No trained active welcome host is currently available.'
] as const;

const formSchema = z.object({
  name: z.string().min(1, "Name is required").max(120),
  description: z.string().max(1000).optional(),
  category: z.string().min(1, "Category is required"),
  rules: z.string().max(5000).optional(),
  discoverability: z.enum(["public", "private"]),
  contentVisibility: z.enum(["public", "members"]),
  joinPolicy: z.enum(["open", "approval", "closed"]),
  welcomeEnabled: z.boolean(),
  welcomeAvailabilityText: z.enum(availabilityTexts).optional(),
});

type FormValues = z.infer<typeof formSchema>;

export default function GroupCreatePage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const createGroup = useCreateGroup();
  const categoriesQuery = useListGroupCategories({ query: { queryKey: getListGroupCategoriesQueryKey() } });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      category: "",
      rules: "",
      discoverability: "public",
      contentVisibility: "members",
      joinPolicy: "approval",
      welcomeEnabled: false,
      welcomeAvailabilityText: availabilityTexts[0],
    },
  });

  const onSubmit = async (values: FormValues) => {
    try {
      const result = await createGroup.mutateAsync({
        data: {
          ...values,
          description: values.description || null,
          rules: values.rules || null,
          welcomeAvailabilityText: values.welcomeAvailabilityText || null,
        }
      });
      toast({ title: "Group created successfully" });
      setLocation(`/groups/${result.id}`);
    } catch (e) {
      toast({ title: "Failed to create group", variant: "destructive" });
    }
  };

  return (
    <div className="flex flex-col gap-8 md:gap-10 animate-in fade-in duration-500 max-w-2xl mx-auto">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-4 mb-4 text-muted-foreground hover:text-foreground">
          <Link href="/groups">
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back to Groups
          </Link>
        </Button>
        <PageHeader
          title="Create a Group"
          description="Build a space for connection."
        />
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 bg-card border border-border rounded-3xl p-6 md:p-8 shadow-sm">
          
          <div className="space-y-4">
            <h3 className="font-display text-xl font-semibold">Basics</h3>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <Label>Group Name</Label>
                  <FormControl>
                    <Input placeholder="e.g. Caregivers of Seattle" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <Label>Description</Label>
                  <FormControl>
                    <Textarea placeholder="What is this group about?" className="resize-none" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <Label>Category</Label>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a category" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {categoriesQuery.data?.map(cat => (
                        <SelectItem key={cat.id} value={cat.name}>{cat.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="space-y-4 pt-6 border-t border-border">
            <h3 className="font-display text-xl font-semibold">Privacy & Access</h3>
            
            <FormField
              control={form.control}
              name="discoverability"
              render={({ field }) => (
                <FormItem>
                  <Label>Discoverability</Label>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="public">Public (Anyone can find this group)</SelectItem>
                      <SelectItem value="private">Private (Hidden from search)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="contentVisibility"
              render={({ field }) => (
                <FormItem>
                  <Label>Content Visibility</Label>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="members">Members Only (Posts are hidden to non-members)</SelectItem>
                      <SelectItem value="public">Public (Anyone can read posts)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="joinPolicy"
              render={({ field }) => (
                <FormItem>
                  <Label>Join Policy</Label>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="approval">Requires Approval (Moderators must approve)</SelectItem>
                      <SelectItem value="open">Open to Join (Anyone can join instantly)</SelectItem>
                      <SelectItem value="closed">Closed (No new members)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="space-y-4 pt-6 border-t border-border">
            <h3 className="font-display text-xl font-semibold">Rules & Welcoming</h3>
            
            <FormField
              control={form.control}
              name="rules"
              render={({ field }) => (
                <FormItem>
                  <Label>Group Rules</Label>
                  <FormControl>
                    <Textarea placeholder="Define expectations for members..." className="resize-none h-24" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="bg-secondary/30 p-5 rounded-2xl border border-secondary-border space-y-4">
              <FormField
                control={form.control}
                name="welcomeEnabled"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between gap-4">
                    <div>
                      <Label className="text-base">Enable Welcome Hosts</Label>
                      <FormDescription className="mt-1">
                        Allow trained members to personally welcome new arrivals.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />

              {form.watch("welcomeEnabled") && (
                <FormField
                  control={form.control}
                  name="welcomeAvailabilityText"
                  render={({ field }) => (
                    <FormItem>
                      <Label>Availability Message</Label>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {availabilityTexts.map((text, i) => (
                            <SelectItem key={i} value={text}>{text}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>Honest expectation setting for new members. Do not promise specific response times.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>
          </div>

          <div className="pt-6 flex justify-end">
            <Button type="submit" size="lg" className="rounded-xl font-semibold w-full sm:w-auto" disabled={createGroup.isPending}>
              {createGroup.isPending && <Loader2 className="w-5 h-5 mr-2 animate-spin" />}
              Create Group
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
