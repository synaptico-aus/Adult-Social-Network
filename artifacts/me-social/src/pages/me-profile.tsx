import { PageHeader } from "@/components/shared/page-header"
import { useSimpleView } from "@/lib/simple-view"
import { useTheme } from "@/components/theme-provider"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { ArrowRight, Info, Heart, Layers, User, Edit, FileText, Shield, Eye, Settings } from "lucide-react"
import { Link } from "wouter"
import { useGetOwnProfile, getGetOwnProfileQueryKey } from "@workspace/api-client-react"
import { getPhotoUrl } from "@/hooks/use-profile-photo"

export default function MePage() {
  const { isSimpleView, toggleSimpleView } = useSimpleView()
  const { theme, setTheme } = useTheme()
  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  
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
        
        <div className="p-8 border-b border-border flex flex-col md:flex-row md:items-start justify-between gap-6">
          <div className="max-w-md text-left">
            <h3 className="text-2xl font-semibold text-foreground">Your Data</h3>
            <p className="text-muted-foreground mt-2 text-lg leading-relaxed">Manage your account information and history.</p>
          </div>
          <div className="flex flex-col gap-4 max-w-md">
            <div className="border border-border bg-secondary/30 rounded-xl p-5 shadow-sm">
              <h4 className="font-semibold text-foreground flex items-center gap-2 mb-2">
                <Info className="w-5 h-5 text-primary" aria-hidden="true" /> Your data controls
              </h4>
              <p className="text-muted-foreground text-base leading-relaxed">
                Download your profile information from Privacy and manage account deletion from Security and recovery.
              </p>
            </div>
          </div>
        </div>
        
        <div className="p-4 md:p-6 text-left grid grid-cols-1 divide-y divide-border/50">
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
          <Link href="/about" className="flex items-center justify-between group p-4 rounded-xl hover:bg-secondary/30 transition-colors">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center text-primary shrink-0">
                <Heart className="w-6 h-6" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-2xl font-semibold text-foreground group-hover:text-primary transition-colors">Our Privacy Baseline (Phase 0)</h3>
                <p className="text-muted-foreground mt-1 text-lg">Read the commitments that shape this space.</p>
              </div>
            </div>
            <ArrowRight className="w-8 h-8 text-muted-foreground group-hover:text-primary transition-colors hidden sm:block" aria-hidden="true" />
          </Link>
          
          <Link href="/components-preview" className="flex items-center justify-between group p-4 rounded-xl hover:bg-secondary/30 transition-colors">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center text-primary shrink-0">
                <Layers className="w-6 h-6" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-2xl font-semibold text-foreground group-hover:text-primary transition-colors">Components Preview</h3>
                <p className="text-muted-foreground mt-1 text-lg">View reusable product components and states.</p>
              </div>
            </div>
            <ArrowRight className="w-8 h-8 text-muted-foreground group-hover:text-primary transition-colors hidden sm:block" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </div>
  )
}
