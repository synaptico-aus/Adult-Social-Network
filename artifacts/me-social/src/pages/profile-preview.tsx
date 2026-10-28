import { ControlledAvatarImage } from "@/components/media/controlled-media";
import { usePreviewProfileAsMember, getPreviewProfileAsMemberQueryKey } from "@workspace/api-client-react";
import { PageHeader } from "@/components/shared/page-header";
import { ArrowLeft, Loader2, MapPin, Globe, Activity, Heart, ShieldAlert } from "lucide-react";
import { Link } from "wouter";
import { getPhotoUrl } from "@/hooks/use-profile-photo";
import { FriendPrivacyPreview } from "@/components/friends/friend-privacy-preview";

export default function ProfilePreview() {
  const { data: profile, isLoading, error } = usePreviewProfileAsMember({
    query: { queryKey: getPreviewProfileAsMemberQueryKey() }
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-8 md:gap-10 animate-in fade-in duration-500 max-w-3xl mx-auto">
        <PageHeader title="Profile Preview" />
        <div className="bg-card p-10 rounded-[2rem] text-center text-muted-foreground border border-border">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="flex flex-col gap-8 md:gap-10 animate-in fade-in duration-500 max-w-3xl mx-auto">
        <PageHeader title="Profile Preview" />
        <div className="bg-destructive/10 text-destructive p-8 rounded-[2rem] text-center border border-destructive/20">
          Failed to load profile preview.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 md:gap-10 animate-in fade-in duration-500 max-w-3xl mx-auto">
      <div>
        <Link href="/me" className="inline-flex items-center text-primary font-semibold mb-6 hover:underline">
          <ArrowLeft className="rtl:-scale-x-100 w-5 h-5 me-2" /> Back to Me
        </Link>
        <PageHeader
          title="Profile Preview"
          description="This is how other signed-in members see your profile based on your privacy settings."
        />
      </div>

      <FriendPrivacyPreview />
      <div className="bg-card border border-border rounded-[2rem] overflow-hidden shadow-sm">
        {/* Banner area */}
        <div className="h-32 bg-primary/10 w-full" />

        <div className="px-8 pb-10">
          <div className="flex flex-col sm:flex-row gap-6 items-start -mt-16 mb-6">
            {profile.photoPath ? (
              <ControlledAvatarImage
                src={getPhotoUrl(profile.photoPath) ?? ""}
                alt="profile photo"
                className="w-32 h-32 rounded-full object-cover shadow-md border-4 border-card bg-card"
                fallback={<div className="w-32 h-32 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-6xl font-display font-bold shadow-md border-4 border-card">{profile.preferredName?.[0]?.toUpperCase() || 'M'}</div>}
              />
            ) : (
              <div className="w-32 h-32 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-6xl font-display font-bold shadow-md border-4 border-card">
                {profile.preferredName?.[0]?.toUpperCase() || 'M'}
              </div>
            )}

            <div className="pt-16 sm:pt-16">
              <h2 className="text-3xl font-display font-bold text-foreground">{profile.preferredName}</h2>
              {profile.roles && profile.roles.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {profile.roles.map(role => (
                    <span key={role} className="inline-flex items-center px-3 py-1 rounded-full bg-secondary text-secondary-foreground text-sm font-medium">
                      {role}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 mt-8">
            <div className="md:col-span-2 space-y-8">
              {profile.biography ? (
                <div>
                  <h3 className="text-xl font-display font-semibold mb-3 text-foreground">About</h3>
                  <p className="text-lg text-muted-foreground whitespace-pre-wrap leading-relaxed">{profile.biography}</p>
                </div>
              ) : (
                <div className="text-muted-foreground italic bg-secondary/20 p-6 rounded-xl border border-border/50 text-center">
                  No biography provided or hidden by privacy settings.
                </div>
              )}

              {profile.dementiaConnection && (
                <div className="bg-primary/5 border border-primary/10 rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-primary flex items-center gap-2 mb-2">
                    <Heart className="w-5 h-5" /> Connection to Dementia
                  </h3>
                  <p className="text-foreground">{profile.dementiaConnection}</p>
                </div>
              )}
            </div>

            <div className="space-y-6 bg-secondary/10 p-6 rounded-2xl border border-border/50 h-fit">
              <h3 className="text-lg font-display font-semibold text-foreground">Details</h3>

              <ul className="space-y-4">
                {profile.broadRegion && (
                  <li className="flex items-start gap-3">
                    <MapPin className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
                    <div>
                      <span className="block text-sm text-muted-foreground font-medium uppercase tracking-wider">Region</span>
                      <span className="text-foreground">{profile.broadRegion}</span>
                    </div>
                  </li>
                )}

                {profile.language && (
                  <li className="flex items-start gap-3">
                    <Globe className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
                    <div>
                      <span className="block text-sm text-muted-foreground font-medium uppercase tracking-wider">Language</span>
                      <span className="text-foreground">{profile.language}</span>
                    </div>
                  </li>
                )}

                {profile.interests && profile.interests.length > 0 && (
                  <li className="flex items-start gap-3">
                    <Activity className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
                    <div>
                      <span className="block text-sm text-muted-foreground font-medium uppercase tracking-wider">Interests</span>
                      <span className="text-foreground">{profile.interests.join(", ")}</span>
                    </div>
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-secondary/30 p-6 rounded-[2rem] border border-border flex items-start gap-4">
        <ShieldAlert className="w-6 h-6 text-muted-foreground shrink-0 mt-1" />
        <p className="text-muted-foreground leading-relaxed">
          This preview uses the same server privacy rules as another ordinary signed-in member. Missing fields are hidden by your visibility choices.
        </p>
      </div>
    </div>
  );
}
