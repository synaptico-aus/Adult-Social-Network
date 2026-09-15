import { PageHeader } from "@/components/shared/page-header"
import { useSimpleView } from "@/lib/simple-view"
import { useTheme } from "@/components/theme-provider"
import { Switch } from "@/components/ui/switch"
import { ArrowRight, Info, Heart, Layers, Edit, FileText, Shield, Eye, Settings, FileBox, Bookmark, LogOut, BookOpen } from "lucide-react"
import { Link, useLocation } from "wouter"
import { useGetOwnProfile, getGetOwnProfileQueryKey, useRevokeCurrentNotificationDevice, getListNotificationsQueryKey } from "@workspace/api-client-react"
import { getPhotoUrl } from "@/hooks/use-profile-photo"
import { useClerk } from "@clerk/react"
import { useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"

export default function MePage() {
  const { isSimpleView, toggleSimpleView } = useSimpleView()
  const { theme, setTheme } = useTheme()
  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  const { signOut } = useClerk()
  const [, setLocation] = useLocation()
  const queryClient = useQueryClient()
  const revokeMut = useRevokeCurrentNotificationDevice()

  const handleSignOut = async () => {
    // Best-effort revoke before sign out
    try {
      await revokeMut.mutateAsync()
    } catch {
      // Ignore failure
    }

    // Clear cache immediately to prevent stale private data
    queryClient.clear()

    await signOut()
    setLocation("/")
  }

  const { data: profile, isLoading } = useGetOwnProfile({
    query: { queryKey: getGetOwnProfileQueryKey() }
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-8 md:gap-10 animate-in fade-in duration-500">
        <PageHeader title="Me" description="Your profile and preferences." />
        <div className="bg-card border border-border p-10 rounded-[2rem] text-center text-muted-foreground">
          Loading profile...
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 md:gap-10 animate-in fade-in duration-500">
      <PageHeader
        title="Me"
        description="Your profile and preferences."
      />

      <div className="bg-card border border-border p-8 md:p-10 rounded-[2rem] flex flex-col sm:flex-row items-center sm:items-start gap-8 shadow-sm text-center sm:text-left">
        {profile?.photoPath ? (
          <img src={getPhotoUrl(profile.photoPath)} alt="Profile" className="w-32 h-32 rounded-full object-cover shadow-md shrink-0 border-4 border-card" />
        ) : (
          <div className="w-32 h-32 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-6xl font-display font-bold shadow-md shrink-0">
            {profile?.preferredName?.[0]?.toUpperCase() || 'M'}
          </div>
        )}
        <div className="flex-1 flex flex-col justify-center sm:pt-4">
          <h2 className="text-4xl font-display font-bold text-foreground">{profile?.preferredName || 'My Account'}</h2>
          <p className="text-xl text-muted-foreground mt-2">Manage your presentation and data.</p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-[2rem] overflow-hidden shadow-sm flex flex-col">
        <div className="p-8 border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="max-w-md text-left">
            <h3 className="text-2xl font-semibold text-foreground">Simple View</h3>
            <p className="text-muted-foreground mt-2 text-lg leading-relaxed">Increase text size, reduce options, and emphasize clarity across the app.</p>
          </div>
          <div className="flex items-center justify-center sm:justify-start">
            <Switch checked={isSimpleView} onCheckedChange={toggleSimpleView} aria-label="Toggle Simple View" />
          </div>
        </div>

        <div className="p-8 border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="max-w-md text-left">
            <h3 className="text-2xl font-semibold text-foreground">Dark Theme</h3>
            <p className="text-muted-foreground mt-2 text-lg leading-relaxed">Switch to a darker appearance for easier reading in low light.</p>
          </div>
          <div className="flex items-center justify-center sm:justify-start">
            <Switch
              checked={isDark}
              onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
              aria-label="Toggle Dark Theme"
            />
          </div>
        </div>

        <div className="p-4 md:p-6 text-left grid grid-cols-1 divide-y divide-border/50">
          <Link href="/me/learning" className="flex items-center justify-between group p-4 rounded-xl hover:bg-secondary/30 transition-colors" data-testid="link-my-learning">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center text-primary shrink-0">
                <BookOpen className="w-6 h-6" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-2xl font-semibold text-foreground group-hover:text-primary transition-colors">My Learning</h3>
                <p className="text-muted-foreground mt-1 text-lg">Your saved modules and progress.</p>
              </div>
            </div>
            <ArrowRight className="w-8 h-8 text-muted-foreground group-hover:text-primary transition-colors hidden sm:block" aria-hidden="true" />
          </Link>

          <Link href="/me/posts" className="flex items-center justify-between group p-4 rounded-xl hover:bg-secondary/30 transition-colors" data-testid="link-my-posts">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center text-primary shrink-0">
                <FileBox className="w-6 h-6" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-2xl font-semibold text-foreground group-hover:text-primary transition-colors">My Posts</h3>
                <p className="text-muted-foreground mt-1 text-lg">Manage your drafts and published posts.</p>
              </div>
            </div>
            <ArrowRight className="w-8 h-8 text-muted-foreground group-hover:text-primary transition-colors hidden sm:block" aria-hidden="true" />
          </Link>

          <Link href="/saved" className="flex items-center justify-between group p-4 rounded-xl hover:bg-secondary/30 transition-colors" data-testid="link-saved-posts">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center text-primary shrink-0">
                <Bookmark className="w-6 h-6" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-2xl font-semibold text-foreground group-hover:text-primary transition-colors">Saved Posts</h3>
                <p className="text-muted-foreground mt-1 text-lg">Review posts you've saved for later.</p>
              </div>
            </div>
            <ArrowRight className="w-8 h-8 text-muted-foreground group-hover:text-primary transition-colors hidden sm:block" aria-hidden="true" />
          </Link>

          <Link href="/profile/edit" className="flex items-center justify-between group p-4 rounded-xl hover:bg-secondary/30 transition-colors">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center text-primary shrink-0">
                <Edit className="w-6 h-6" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-2xl font-semibold text-foreground group-hover:text-primary transition-colors">Edit Profile</h3>
                <p className="text-muted-foreground mt-1 text-lg">Update your name, bio, and details.</p>
              </div>
            </div>
            <ArrowRight className="w-8 h-8 text-muted-foreground group-hover:text-primary transition-colors hidden sm:block" aria-hidden="true" />
          </Link>

          <Link href="/profile/preview" className="flex items-center justify-between group p-4 rounded-xl hover:bg-secondary/30 transition-colors">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center text-primary shrink-0">
                <Eye className="w-6 h-6" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-2xl font-semibold text-foreground group-hover:text-primary transition-colors">Preview Profile</h3>
                <p className="text-muted-foreground mt-1 text-lg">See how others view your profile.</p>
              </div>
            </div>
            <ArrowRight className="w-8 h-8 text-muted-foreground group-hover:text-primary transition-colors hidden sm:block" aria-hidden="true" />
          </Link>

          <Link href="/this-is-me" className="flex items-center justify-between group p-4 rounded-xl hover:bg-secondary/30 transition-colors">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center text-primary shrink-0">
                <FileText className="w-6 h-6" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-2xl font-semibold text-foreground group-hover:text-primary transition-colors">This is Me</h3>
                <p className="text-muted-foreground mt-1 text-lg">Manage your personal introduction cards.</p>
              </div>
            </div>
            <ArrowRight className="w-8 h-8 text-muted-foreground group-hover:text-primary transition-colors hidden sm:block" aria-hidden="true" />
          </Link>

          <Link href="/profile/privacy" className="flex items-center justify-between group p-4 rounded-xl hover:bg-secondary/30 transition-colors">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center text-primary shrink-0">
                <Shield className="w-6 h-6" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-2xl font-semibold text-foreground group-hover:text-primary transition-colors">Privacy and visibility</h3>
                <p className="text-muted-foreground mt-1 text-lg">Control what others can see and access your data.</p>
              </div>
            </div>
            <ArrowRight className="w-8 h-8 text-muted-foreground group-hover:text-primary transition-colors hidden sm:block" aria-hidden="true" />
          </Link>

          <Link href="/safety" className="flex items-center justify-between group p-4 rounded-xl hover:bg-secondary/30 transition-colors">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center text-primary shrink-0">
                <Shield className="w-6 h-6" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-2xl font-semibold text-foreground group-hover:text-primary transition-colors">Safety and Support</h3>
                <p className="text-muted-foreground mt-1 text-lg">Manage blocked accounts, reports, and appeals.</p>
              </div>
            </div>
            <ArrowRight className="w-8 h-8 text-muted-foreground group-hover:text-primary transition-colors hidden sm:block" aria-hidden="true" />
          </Link>

          <Link href="/account/security" className="flex items-center justify-between group p-4 rounded-xl hover:bg-secondary/30 transition-colors">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center text-primary shrink-0">
                <Settings className="w-6 h-6" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-2xl font-semibold text-foreground group-hover:text-primary transition-colors">Security and recovery</h3>
                <p className="text-muted-foreground mt-1 text-lg">Manage MFA and account access.</p>
              </div>
            </div>
            <ArrowRight className="w-8 h-8 text-muted-foreground hidden sm:block" aria-hidden="true" />
          </Link>

          <button onClick={handleSignOut} className="w-full flex items-center justify-between group p-4 rounded-xl hover:bg-destructive/10 transition-colors text-left">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center text-destructive shrink-0">
                <LogOut className="w-6 h-6" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-2xl font-semibold text-destructive group-hover:text-destructive transition-colors">Sign Out</h3>
                <p className="text-muted-foreground mt-1 text-lg">Log out securely.</p>
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}
