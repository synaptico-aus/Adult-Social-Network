import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useLocation } from "wouter";
import {
  useGetOwnProfile,
  getGetOwnProfileQueryKey,
  useUpdateOwnProfile,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useProfilePhoto, getPhotoUrl } from "@/hooks/use-profile-photo";
import { ArrowLeft, Loader2, Upload } from "lucide-react";
import { Link } from "wouter";

const profileSchema = z.object({
  preferredName: z.string().min(1, "Preferred name is required"),
  biography: z.string().nullable().optional(),
  language: z.string().nullable().optional(),
  broadRegion: z.string().nullable().optional(),
  interests: z.string().nullable().optional(), // We'll parse this to array
  dementiaConnection: z.string().nullable().optional(),
  roles: z.array(z.string()).default([]),
});

const AVAILABLE_ROLES = [
  "Person living with dementia",
  "Care partner",
  "Family member",
  "Friend",
  "Professional",
  "Advocate",
  "Researcher",
  "Volunteer"
];

export default function ProfileEdit() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { uploadPhoto, isUploading } = useProfilePhoto();

  const { data: profile, isLoading } = useGetOwnProfile({
    query: { queryKey: getGetOwnProfileQueryKey() }
  });

  const updateProfile = useUpdateOwnProfile();

  const form = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      preferredName: "",
      biography: "",
      language: "",
      broadRegion: "",
      interests: "",
      dementiaConnection: "",
      roles: [],
    },
  });

  const initialized = useRef(false);

  useEffect(() => {
    if (profile && !initialized.current) {
      form.reset({
        preferredName: profile.preferredName || "",
        biography: profile.biography || "",
        language: profile.language || "",
        broadRegion: profile.broadRegion || "",
        interests: profile.interests ? profile.interests.join(", ") : "",
        dementiaConnection: profile.dementiaConnection || "",
        roles: profile.roles || [],
      });
      initialized.current = true;
    }
  }, [profile, form]);

  const [photoError, setPhotoError] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoError(null);

    try {
      const { objectPath, reminder } = await uploadPhoto(file);

      const currentValues = form.getValues();
      const interestsArray = currentValues.interests
        ? currentValues.interests.split(',').map(s => s.trim()).filter(Boolean)
        : [];

      await updateProfile.mutateAsync({
        data: {
          preferredName: currentValues.preferredName || profile?.preferredName || "",
          biography: currentValues.biography || null,
          language: currentValues.language || null,
          broadRegion: currentValues.broadRegion || null,
          interests: interestsArray,
          dementiaConnection: currentValues.dementiaConnection || null,
          roles: currentValues.roles,
          photoPath: objectPath,
        }
      });
      queryClient.invalidateQueries({ queryKey: getGetOwnProfileQueryKey() });
      toast({
        title: "Photo updated",
        description: reminder || "Your profile photo has been updated.",
      });
    } catch (err: any) {
      setPhotoError(err.message || "Failed to upload photo");
    }
  };

  const onSubmit = async (values: z.infer<typeof profileSchema>) => {
    try {
      const interestsArray = values.interests
        ? values.interests.split(',').map(s => s.trim()).filter(Boolean)
        : [];

      await updateProfile.mutateAsync({
        data: {
          preferredName: values.preferredName,
          biography: values.biography || null,
          language: values.language || null,
          broadRegion: values.broadRegion || null,
          interests: interestsArray,
          dementiaConnection: values.dementiaConnection || null,
          roles: values.roles,
          photoPath: profile?.photoPath || null,
        }
      });

      queryClient.invalidateQueries({ queryKey: getGetOwnProfileQueryKey() });

      toast({
        title: "Profile saved",
        description: "Your details have been updated successfully.",
      });

      setLocation("/me");
    } catch (error) {
      toast({
        title: "Error saving profile",
        description: "Please try again later.",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-8 md:gap-10 animate-in fade-in duration-500">
        <PageHeader title="Edit Profile" />
        <div className="bg-card p-10 rounded-[2rem] text-center text-muted-foreground border border-border">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 md:gap-10 animate-in fade-in duration-500 max-w-3xl mx-auto">
      <div>
        <Link href="/me" className="inline-flex items-center text-primary font-semibold mb-6 hover:underline">
          <ArrowLeft className="w-5 h-5 mr-2" /> Back to Me
        </Link>
        <PageHeader
          title="Edit Profile"
          description="Update your personal details. Visibility settings can be changed in Privacy."
        />
      </div>

      <div className="bg-card border border-border p-6 md:p-10 rounded-[2rem] shadow-sm">
        <div className="mb-10">
          <h3 className="text-xl font-display font-semibold mb-4 text-foreground">Profile Photo</h3>
          <div className="flex flex-col sm:flex-row items-center gap-6">
            {profile?.photoPath ? (
              <img src={getPhotoUrl(profile.photoPath)} alt="Profile" className="w-24 h-24 rounded-full object-cover shrink-0 border border-border" />
            ) : (
              <div className="w-24 h-24 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center text-3xl font-display font-bold shrink-0">
                {profile?.preferredName?.[0]?.toUpperCase() || 'M'}
              </div>
            )}

            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-4">
                <Button variant="outline" className="relative cursor-pointer" disabled={isUploading}>
                  {isUploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                  {isUploading ? "Uploading..." : "Upload new photo"}
                  <input
                    type="file"
                    accept="image/jpeg, image/png, image/webp"
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    onChange={handleFileChange}
                    disabled={isUploading}
                    aria-label="Upload profile photo"
                  />
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">JPEG, PNG or WebP. Max 5MB.</p>
              {photoError && <p className="text-sm text-destructive font-medium">{photoError}</p>}
            </div>
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <FormField
              control={form.control}
              name="preferredName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-lg">Preferred Name</FormLabel>
                  <FormControl>
                    <Input {...field} className="text-lg py-6 rounded-xl" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="biography"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-lg">Biography</FormLabel>
                  <FormDescription>A little bit about yourself.</FormDescription>
                  <FormControl>
                    <Textarea
                      {...field}
                      value={field.value || ''}
                      className="text-lg min-h-[120px] rounded-xl resize-y"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <FormField
                control={form.control}
                name="language"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-lg">Language (Optional)</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value || ''} className="text-lg py-6 rounded-xl" placeholder="e.g. English, Spanish" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="broadRegion"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-lg">Broad Region (Optional)</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value || ''} className="text-lg py-6 rounded-xl" placeholder="e.g. London, Scotland" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="interests"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-lg">Interests (Optional)</FormLabel>
                  <FormDescription>Comma-separated list (e.g. Gardening, Reading, Music)</FormDescription>
                  <FormControl>
                    <Input {...field} value={field.value || ''} className="text-lg py-6 rounded-xl" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="dementiaConnection"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-lg">Connection to Dementia (Optional)</FormLabel>
                  <FormDescription>Private by default. You can choose to make this discoverable in Privacy settings.</FormDescription>
                  <FormControl>
                    <Input {...field} value={field.value || ''} className="text-lg py-6 rounded-xl" placeholder="e.g. I was diagnosed in 2021" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="roles"
              render={() => (
                <FormItem>
                  <div className="mb-4">
                    <FormLabel className="text-lg">Self-described Roles</FormLabel>
                    <FormDescription>
                      These describe how you identify in the community. They do not provide special access or badges.
                    </FormDescription>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {AVAILABLE_ROLES.map((role) => (
                      <FormField
                        key={role}
                        control={form.control}
                        name="roles"
                        render={({ field }) => {
                          return (
                            <FormItem
                              key={role}
                              className="flex flex-row items-start space-x-3 space-y-0 rounded-xl border p-4 bg-background"
                            >
                              <FormControl>
                                <Checkbox
                                  checked={field.value?.includes(role)}
                                  onCheckedChange={(checked) => {
                                    return checked
                                      ? field.onChange([...field.value, role])
                                      : field.onChange(
                                          field.value?.filter(
                                            (value) => value !== role
                                          )
                                        )
                                  }}
                                />
                              </FormControl>
                              <FormLabel className="font-normal text-base cursor-pointer">
                                {role}
                              </FormLabel>
                            </FormItem>
                          )
                        }}
                      />
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="pt-6 border-t border-border flex justify-end gap-4">
              <Button type="button" variant="outline" size="lg" onClick={() => setLocation("/me")} className="rounded-xl">
                Cancel
              </Button>
              <Button type="submit" size="lg" disabled={updateProfile.isPending} className="rounded-xl px-8">
                {updateProfile.isPending ? "Saving..." : "Save Profile"}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
