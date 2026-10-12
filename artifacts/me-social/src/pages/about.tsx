import { Link } from 'wouter';
import {
  ShieldCheck,
  EyeOff,
  Users,
  HeartHandshake,
  Home as HomeIcon,
  Stethoscope,
  TextSelect,
  MousePointerClick,
  LayoutTemplate,
  Info,
  ArrowDown,
  Menu,
  Heart,
  Lock
} from 'lucide-react';

export default function About() {
  return (
    <div className="min-h-[100dvh] flex flex-col w-full selection:bg-secondary selection:text-secondary-foreground">

      {/* Navigation Shell */}
      <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 md:px-8 h-20 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary text-primary-foreground font-display font-bold text-xl leading-none">
              M
            </div>
            <span className="font-display font-semibold text-xl text-foreground tracking-tight">Me</span>
          </Link>

          <nav className="hidden md:flex items-center gap-8 font-medium text-muted-foreground">
            <a href="#purpose" className="hover:text-foreground transition-colors py-2 px-3 min-h-[48px] flex items-center">Purpose</a>
            <a href="#audiences" className="hover:text-foreground transition-colors py-2 px-3 min-h-[48px] flex items-center">Who it's for</a>
            <a href="#privacy" className="hover:text-foreground transition-colors py-2 px-3 min-h-[48px] flex items-center">Privacy</a>
            <a href="#accessibility" className="hover:text-foreground transition-colors py-2 px-3 min-h-[48px] flex items-center">Accessibility</a>
            <Link href="/" className="text-primary font-semibold hover:text-primary/80 transition-colors py-2 px-3 min-h-[48px] flex items-center">Return to App</Link>
          </nav>

          <Link href="/" className="md:hidden flex items-center justify-center h-12 px-4 rounded-md text-primary font-medium hover:bg-secondary transition-colors" aria-label="Return to App">
            Back
          </Link>
        </div>
      </header>

      <main className="flex-1 flex flex-col">

        {/* Hero Section */}
        <section className="relative px-4 py-24 md:py-32 lg:py-48 flex flex-col items-center justify-center text-center overflow-hidden">
          {/* Subtle background decoration */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-secondary/50 via-background to-background -z-10" />

          <div className="container max-w-4xl mx-auto flex flex-col items-center gap-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-medium shadow-sm">
              <Info className="w-4 h-4" />
              <span>Development Preview Phase</span>
            </div>

            <h1 className="font-display text-5xl md:text-6xl lg:text-7xl font-bold text-foreground text-balance leading-[1.1]">
              Connection, <br className="hidden md:block" />
              <span className="text-primary">respectfully designed.</span>
            </h1>

            <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl text-balance leading-relaxed">
              A private, calm social space being thoughtfully built for individuals and families navigating dementia globally.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
              <a
                href="#purpose"
                className="inline-flex items-center justify-center gap-2 h-14 px-8 rounded-full bg-primary text-primary-foreground font-medium text-lg hover:bg-accent transition-colors shadow-sm min-w-[200px]"
              >
                Understand our approach
                <ArrowDown className="w-5 h-5" />
              </a>
            </div>
          </div>
        </section>

        {/* Purpose / Mission Section */}
        <section id="purpose" className="px-4 py-24 bg-secondary/30 border-y border-border scroll-mt-20">
          <div className="container max-w-5xl mx-auto">
            <div className="max-w-3xl">
              <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-6">
                Why we are building Me
              </h2>
              <p className="text-lg md:text-xl text-foreground/80 leading-relaxed mb-6">
                Navigating dementia is complex and deeply personal. Standard social networks are often noisy, highly commercialized, and lacking in privacy controls necessary for sensitive health experiences.
              </p>
              <p className="text-lg md:text-xl text-foreground/80 leading-relaxed">
                Me is being designed from the ground up to be a quiet, dignified space. It exists to foster genuine connection, share practical support, and reduce isolation without the pressure of typical social media metrics.
              </p>
            </div>
          </div>
        </section>

        {/* Planned Audiences Section */}
        <section id="audiences" className="px-4 py-24 md:py-32 scroll-mt-20">
          <div className="container max-w-6xl mx-auto">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <h2 className="font-display text-3xl md:text-5xl font-bold text-foreground mb-6">
                Designed for your reality
              </h2>
              <p className="text-xl text-muted-foreground">
                We are building distinct spaces and tools tailored to the specific needs of everyone impacted by dementia.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
              {/* Audience 1 */}
              <div className="bg-card border border-border rounded-2xl p-8 shadow-sm hover:shadow-md transition-shadow flex flex-col gap-4">
                <div className="w-14 h-14 rounded-xl bg-secondary flex items-center justify-center text-primary mb-2">
                  <Users className="w-7 h-7" aria-hidden="true" />
                </div>
                <h3 className="font-display text-2xl font-semibold text-foreground">
                  Individuals Living with Dementia
                </h3>
                <p className="text-muted-foreground text-lg leading-relaxed flex-1">
                  A dignified, highly accessible environment to maintain connections, document daily thoughts, and share experiences at your own pace.
                </p>
              </div>

              {/* Audience 2 */}
              <div className="bg-card border border-border rounded-2xl p-8 shadow-sm hover:shadow-md transition-shadow flex flex-col gap-4">
                <div className="w-14 h-14 rounded-xl bg-secondary flex items-center justify-center text-primary mb-2">
                  <HeartHandshake className="w-7 h-7" aria-hidden="true" />
                </div>
                <h3 className="font-display text-2xl font-semibold text-foreground">
                  Caregivers
                </h3>
                <p className="text-muted-foreground text-lg leading-relaxed flex-1">
                  Practical support structures, emotional grounding, and a community that understands the day-to-day realities without judgment.
                </p>
              </div>

              {/* Audience 3 */}
              <div className="bg-card border border-border rounded-2xl p-8 shadow-sm hover:shadow-md transition-shadow flex flex-col gap-4">
                <div className="w-14 h-14 rounded-xl bg-secondary flex items-center justify-center text-primary mb-2">
                  <HomeIcon className="w-7 h-7" aria-hidden="true" />
                </div>
                <h3 className="font-display text-2xl font-semibold text-foreground">
                  Family & Friends
                </h3>
                <p className="text-muted-foreground text-lg leading-relaxed flex-1">
                  Tools to coordinate care, understand the progression of the journey, and stay meaningfully connected to loved ones.
                </p>
              </div>

              {/* Audience 4 */}
              <div className="bg-card border border-border rounded-2xl p-8 shadow-sm hover:shadow-md transition-shadow flex flex-col gap-4">
                <div className="w-14 h-14 rounded-xl bg-secondary flex items-center justify-center text-primary mb-2">
                  <Stethoscope className="w-7 h-7" aria-hidden="true" />
                </div>
                <h3 className="font-display text-2xl font-semibold text-foreground">
                  Professionals
                </h3>
                <p className="text-muted-foreground text-lg leading-relaxed flex-1">
                  A secure channel for specialized care providers and researchers to share verified resources and contextual insights.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Privacy Principles */}
        <section id="privacy" className="px-4 py-24 md:py-32 bg-secondary border-y border-border scroll-mt-20">
          <div className="container max-w-6xl mx-auto">
            <div className="flex flex-col lg:flex-row gap-16 items-start">
              <div className="lg:w-1/3 flex flex-col gap-6">
                <h2 className="font-display text-3xl md:text-5xl font-bold text-foreground">
                  Your privacy is our baseline.
                </h2>
                <p className="text-lg text-muted-foreground leading-relaxed">
                  Health journeys are deeply sensitive. We are architecting this platform with data protection as the foundational requirement, not an afterthought.
                </p>
              </div>

              <div className="lg:w-2/3 grid grid-cols-1 sm:grid-cols-2 gap-8">
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <ShieldCheck className="w-6 h-6 text-primary" aria-hidden="true" />
                    <h3 className="font-display text-xl font-semibold text-foreground">Never Sold</h3>
                  </div>
                  <p className="text-foreground/70 leading-relaxed pl-9">
                    Your personal health information, interactions, and connections will never be monetized or sold to third parties.
                  </p>
                </div>

                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <EyeOff className="w-6 h-6 text-primary" aria-hidden="true" />
                    <h3 className="font-display text-xl font-semibold text-foreground">Ad-Free Space</h3>
                  </div>
                  <p className="text-foreground/70 leading-relaxed pl-9">
                    A strictly ad-free environment. No manipulative algorithms, no tracking pixels, and no distracting sponsored content.
                  </p>
                </div>

                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <Lock className="w-6 h-6 text-primary" aria-hidden="true" />
                    <h3 className="font-display text-xl font-semibold text-foreground">Controlled Visibility</h3>
                  </div>
                  <p className="text-foreground/70 leading-relaxed pl-9">
                    Granular, easy-to-understand controls allowing you to choose exactly who sees your updates, from a single caregiver to a trusted group.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Accessibility Commitments */}
        <section id="accessibility" className="px-4 py-24 md:py-32 scroll-mt-20">
          <div className="container max-w-4xl mx-auto text-center">
            <h2 className="font-display text-3xl md:text-5xl font-bold text-foreground mb-6">
              Built for clarity and ease.
            </h2>
            <p className="text-xl text-muted-foreground mb-16 max-w-2xl mx-auto text-balance">
              Cognitive accessibility is at the core of our design language. The interface must adapt to the user, not the other way around.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="flex flex-col items-center text-center gap-4">
                <div className="w-16 h-16 rounded-full bg-secondary text-primary flex items-center justify-center mb-2">
                  <MousePointerClick className="w-8 h-8" aria-hidden="true" />
                </div>
                <h3 className="font-display text-xl font-semibold text-foreground">
                  Generous Touch Targets
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  Every button, link, and action is large enough to be easily tapped, reducing frustration and accidental clicks.
                </p>
              </div>

              <div className="flex flex-col items-center text-center gap-4">
                <div className="w-16 h-16 rounded-full bg-secondary text-primary flex items-center justify-center mb-2">
                  <TextSelect className="w-8 h-8" aria-hidden="true" />
                </div>
                <h3 className="font-display text-xl font-semibold text-foreground">
                  Readable Contrast
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  Carefully selected colors and adult-appropriate typography ensure high legibility in various lighting conditions.
                </p>
              </div>

              <div className="flex flex-col items-center text-center gap-4">
                <div className="w-16 h-16 rounded-full bg-secondary text-primary flex items-center justify-center mb-2">
                  <LayoutTemplate className="w-8 h-8" aria-hidden="true" />
                </div>
                <h3 className="font-display text-xl font-semibold text-foreground">
                  Predictable Layouts
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  Consistent navigation patterns without surprising shifts, pop-ups, or disappearing menus.
                </p>
              </div>
            </div>
          </div>
        </section>

      </main>

      {/* Footer */}
      <footer className="w-full bg-background text-foreground py-12 md:py-16">
        <div className="container mx-auto px-4 md:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-12 border-b border-white/10 pb-12">
            <div className="flex flex-col gap-4 lg:col-span-2">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground font-display font-bold leading-none">
                  M
                </div>
                <span className="font-display font-semibold text-xl tracking-tight">Me</span>
              </div>
              <p className="text-muted-foreground max-w-sm mt-2 leading-relaxed">
                A social connection space respectfully designed for people affected by dementia globally. Currently in phased development.
              </p>
            </div>

            <div className="flex flex-col gap-4">
              <h4 className="font-display font-semibold text-lg">Product</h4>
              <nav className="flex flex-col gap-3">
                <a href="#purpose" className="text-muted-foreground hover:text-foreground transition-colors min-h-[44px] flex items-center">Purpose</a>
                <a href="#audiences" className="text-muted-foreground hover:text-foreground transition-colors min-h-[44px] flex items-center">Who it's for</a>
                <a href="#privacy" className="text-muted-foreground hover:text-foreground transition-colors min-h-[44px] flex items-center">Privacy</a>
              </nav>
            </div>

            <div className="flex flex-col gap-4">
              <h4 className="font-display font-semibold text-lg">Legal</h4>
              <nav className="flex flex-col gap-3">
                <span className="text-muted-foreground cursor-not-allowed min-h-[44px] flex items-center" aria-label="Privacy Policy - Coming soon">Privacy Policy (Soon)</span>
                <span className="text-muted-foreground cursor-not-allowed min-h-[44px] flex items-center" aria-label="Terms of Service - Coming soon">Terms of Service (Soon)</span>
              </nav>
            </div>
          </div>

          <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
            <p>&copy; {new Date().getFullYear()} Me Social Space. All rights reserved.</p>
            <p className="flex items-center gap-1">
              Designed with <Heart className="w-4 h-4 text-foreground" aria-label="care" /> for the community.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
