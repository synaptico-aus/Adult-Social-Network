import { PageHeader } from "@/components/shared/page-header"
import { useSimpleView } from "@/lib/simple-view"
import { useTheme } from "@/components/theme-provider"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { ArrowRight, Info, Heart, Layers } from "lucide-react"
import { Link } from "wouter"

export default function MePage() {
  const { isSimpleView, toggleSimpleView } = useSimpleView()
  const { theme, setTheme } = useTheme()
  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  
  return (
    <div className="flex flex-col gap-8 md:gap-10 animate-in fade-in duration-500">
      <PageHeader 
        title="Me" 
        description="Your profile and preferences."
      />
      
      <div className="bg-card border border-border p-8 md:p-10 rounded-[2rem] flex flex-col sm:flex-row items-center sm:items-start gap-8 shadow-sm text-center sm:text-left">
        <div className="w-32 h-32 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-6xl font-display font-bold shadow-md shrink-0">
          M
        </div>
        <div className="flex-1 flex flex-col justify-center sm:pt-4">
          <h2 className="text-4xl font-display font-bold text-foreground">My Account</h2>
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
                <Info className="w-5 h-5 text-primary" aria-hidden="true" /> Data Options Planned
              </h4>
              <p className="text-muted-foreground text-base leading-relaxed">
                We are building secure tools for you to easily download a full copy of your data or permanently delete your account at any time.
              </p>
            </div>
          </div>
        </div>
        
        <div className="p-4 md:p-6 text-left grid grid-cols-1 divide-y divide-border/50">
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
