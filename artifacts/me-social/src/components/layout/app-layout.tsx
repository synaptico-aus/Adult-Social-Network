import { ReactNode } from "react"
import { Link, useLocation } from "wouter"
import { Home, Compass, Users, MessageSquare, UserCircle, Heart, ChevronLeft, Info, Bell, Film, Album } from "lucide-react"
import { useSimpleView } from "@/lib/simple-view"
import { Button } from "@/components/ui/button"
import { useGetNotificationUnreadCount, getGetNotificationUnreadCountQueryKey } from "@workspace/api-client-react"
import { useAuth } from "@clerk/react"

const navItems = [
  { href: "/", label: "Home", icon: Home },
  { href: "/explore", label: "Explore", icon: Compass, advanced: true },
  { href: "/reels", label: "Reels", icon: Film },
  { href: "/memories", label: "Memories", icon: Album },
  { href: "/circle", label: "My Circle", icon: Users },
  { href: "/groups", label: "Groups", icon: Users },
  { href: "/messages", label: "Messages", icon: MessageSquare },
  { href: "/notifications", label: "Alerts", icon: Bell },
  { href: "/me", label: "Me", icon: UserCircle },
]

function DesktopSidebar() {
  const [location] = useLocation()
  const { isSimpleView } = useSimpleView()
  const { isSignedIn } = useAuth()

  const { data: unreadData } = useGetNotificationUnreadCount({
    query: {
      enabled: !!isSignedIn,
      queryKey: getGetNotificationUnreadCountQueryKey(),
      refetchInterval: 30000,
    }
  })

  const items = isSimpleView ? navItems.filter(i => !i.advanced) : navItems

  return (
    <aside className="hidden md:flex flex-col w-72 lg:w-80 border-r border-border bg-card h-[100dvh] sticky top-0 shrink-0">
      <div className="p-6 lg:p-8 flex items-center gap-3">
         <div className="flex items-center justify-center w-14 h-14 rounded-full bg-primary text-primary-foreground font-display font-bold text-2xl leading-none shadow-sm">
           M
         </div>
         <span className="font-display font-semibold text-3xl tracking-tight">Me</span>
      </div>
      
      <nav className="flex-1 px-4 lg:px-6 py-4 space-y-3 overflow-y-auto">
        {items.map(item => {
          const active = location === item.href || (item.href !== "/" && location.startsWith(item.href + "/"))
          const unread = item.href === "/notifications" ? (unreadData?.count || 0) : 0
          return (
            <Link key={item.href} href={item.href} className={`flex items-center gap-4 px-4 py-4 rounded-2xl transition-all font-medium text-xl min-w-0 relative ${active ? 'bg-secondary text-secondary-foreground font-bold shadow-sm' : 'text-foreground/80 hover:bg-secondary/50 hover:text-foreground'}`}>
              <div className="relative">
                <item.icon className={`w-8 h-8 shrink-0 ${active ? 'fill-primary/10 text-primary' : ''}`} aria-hidden="true" />
                {unread > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground shadow-sm ring-2 ring-card">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </div>
              <span className="truncate">{item.label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="p-4 lg:p-6 space-y-4 border-t border-border/50">
        <Link href="/understanding-dementia" className="flex items-center gap-4 px-4 py-5 rounded-2xl bg-muted/60 text-foreground hover:bg-muted transition-colors font-medium border border-border/50 min-w-0">
          <Heart className="w-8 h-8 text-primary shrink-0" aria-hidden="true" />
          <span className="leading-tight text-lg truncate">Understanding<br/>Dementia</span>
        </Link>
      </div>
    </aside>
  )
}

function MobileBottomNav() {
  const [location] = useLocation()
  const { isSimpleView } = useSimpleView()
  const { isSignedIn } = useAuth()

  const { data: unreadData } = useGetNotificationUnreadCount({
    query: {
      enabled: !!isSignedIn,
      queryKey: getGetNotificationUnreadCountQueryKey(),
      refetchInterval: 30000,
    }
  })
  
  const items = isSimpleView ? navItems.filter(i => !i.advanced) : navItems

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 border-t border-border bg-card/95 backdrop-blur-md supports-[backdrop-filter]:bg-card/80 flex flex-row items-center justify-between px-1 py-1 pb-[env(safe-area-inset-bottom)] z-50 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
      {items.map(item => {
        const active = location === item.href || (item.href !== "/" && location.startsWith(item.href + "/"))
        const unread = item.href === "/notifications" ? (unreadData?.count || 0) : 0
        return (
          <Link key={item.href} href={item.href} className={`flex-1 flex flex-col items-center justify-center p-1 min-h-[48px] rounded-xl transition-colors ${active ? 'text-primary' : 'text-muted-foreground'}`}>
            <div className="relative">
              <item.icon className={`w-7 h-7 shrink-0 ${active ? 'fill-primary/20 text-primary' : ''}`} aria-hidden="true" />
              {unread > 0 && (
                <span className="absolute -top-1 -right-1 flex h-3 w-3 items-center justify-center rounded-full bg-primary text-[8px] font-bold text-primary-foreground shadow-sm ring-1 ring-card">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </div>
            <span className={`text-[10px] leading-tight text-center mt-1 ${active ? 'font-bold' : 'font-medium'}`}>{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}

function MobileHeader() {
  const { isSimpleView } = useSimpleView()
  const [location, setLocation] = useLocation()
  const isHome = location === '/'

  return (
    <header className="md:hidden sticky top-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/80 h-20 flex items-center justify-between px-4 pt-[env(safe-area-inset-top)]">
      <Link href="/" className="flex items-center gap-3 min-w-0">
        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary text-primary-foreground font-display font-bold text-xl leading-none shadow-sm shrink-0">
          M
        </div>
        {!isSimpleView && <span className="font-display font-semibold text-2xl tracking-tight truncate">Me</span>}
      </Link>
      
      <div className="flex items-center gap-3 shrink-0">
        {isSimpleView && !isHome && (
          <Button variant="secondary" size="sm" onClick={() => setLocation('/')} className="h-10 rounded-xl px-4 gap-2 text-base font-semibold border border-secondary-border">
            <Home className="w-5 h-5 shrink-0" />
            Home
          </Button>
        )}
        <Link href="/understanding-dementia" className="w-12 h-12 rounded-full flex items-center justify-center text-primary hover:bg-secondary transition-colors border border-transparent hover:border-secondary-border" aria-label="Understanding Dementia">
          <Heart className="w-7 h-7" />
        </Link>
      </div>
    </header>
  )
}

function RightPanel() {
  return (
    <aside className="hidden xl:flex flex-col w-80 lg:w-96 border-l border-border bg-muted/20 h-[100dvh] sticky top-0 p-8 overflow-y-auto shrink-0">
      <div className="space-y-8">
        <div className="bg-card p-6 rounded-3xl border border-border shadow-sm">
          <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center mb-5">
            <Info className="w-7 h-7 text-primary" />
          </div>
          <h3 className="font-display font-semibold text-2xl mb-3 text-foreground">A safe place</h3>
          <p className="text-foreground/80 text-base leading-relaxed">
            Me is built for connection and dignity. You are in control of what you share and who you share it with.
          </p>
        </div>
        
        <div className="space-y-4">
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider ml-2">Getting Support</h3>
          <div className="bg-card border border-border rounded-2xl p-5 flex flex-col gap-3 shadow-sm">
            <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center shrink-0">
              <Users className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h4 className="font-semibold text-foreground text-lg">Communities</h4>
              <p className="text-sm text-muted-foreground mt-1 leading-relaxed">Explore Groups to find others on a similar journey, share practical ideas, and find spaces where you are understood.</p>
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}

export function AppLayout({ children }: { children: ReactNode }) {
  const { isSimpleView } = useSimpleView();
  
  return (
    <div className="min-h-[100dvh] flex bg-background w-full">
      <DesktopSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <MobileHeader />
        <main className="flex-1 overflow-y-auto overflow-x-hidden pb-48 md:pb-8">
           <div className="max-w-3xl mx-auto w-full p-4 md:p-8 lg:p-10 xl:p-12 min-w-0">
             {children}
           </div>
        </main>
      </div>
      {!isSimpleView && <RightPanel />}
      <MobileBottomNav />
    </div>
  )
}
