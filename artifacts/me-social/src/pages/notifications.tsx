import { useLocation } from "wouter"
import { PageHeader } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"
import { 
  useListNotifications, useMarkNotificationRead, useMarkAllNotificationsRead, getListNotificationsQueryKey, getGetNotificationUnreadCountQueryKey
} from "@workspace/api-client-react"
import { Bell, Settings, CheckCheck, MessageSquare, Users, ShieldAlert, FileText, ChevronRight } from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import { formatRelative } from "@/lib/locale-format";
import { Link } from "wouter"

function getIconForKind(kind: string) {
  switch(kind) {
    case 'message':
    case 'request': return <MessageSquare className="w-5 h-5 text-primary" />
    case 'group_activity': return <Users className="w-5 h-5 text-blue-600" />
    case 'safety': return <ShieldAlert className="w-5 h-5 text-destructive" />
    case 'post': return <FileText className="w-5 h-5 text-green-600" />
    default: return <Bell className="w-5 h-5 text-foreground/80" />
  }
}

export default function NotificationsPage() {
  const [, setLocation] = useLocation()
  const queryClient = useQueryClient()

  const { data: notificationsData, isLoading } = useListNotifications({}, {
    query: {
      queryKey: getListNotificationsQueryKey(),
      refetchInterval: 30000,
    }
  })

  const markRead = useMarkNotificationRead()
  const markAllRead = useMarkAllNotificationsRead()

  const handleMarkAllRead = async () => {
    try {
      await markAllRead.mutateAsync()
      queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() })
      queryClient.invalidateQueries({ queryKey: getGetNotificationUnreadCountQueryKey() })
    } catch (err) {
      console.error(err)
    }
  }

  const handleNotificationClick = async (notif: any) => {
    if (!notif.readAt) {
      try {
        await markRead.mutateAsync({ id: notif.id })
        queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() })
        queryClient.invalidateQueries({ queryKey: getGetNotificationUnreadCountQueryKey() })
      } catch (err) {
        console.error(err)
      }
    }
    
    // Safely route
    if (notif.deepLink) {
      setLocation(notif.deepLink)
    } else if (notif.conversationId) {
      setLocation(`/messages/${notif.conversationId}`)
    } else if (notif.postId) {
      setLocation(`/posts/${notif.postId}`)
    }
  }

  return (
    <div className="flex flex-col gap-6 md:gap-8 animate-in fade-in duration-500 min-h-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <PageHeader
          title="Alerts"
          description="Updates from your communities and connections."
          className="mb-0"
        />
        <div className="flex gap-3">
          <Button variant="outline" className="rounded-xl h-12" onClick={handleMarkAllRead} disabled={markAllRead.isPending}>
            <CheckCheck className="w-5 h-5 me-2" /> Mark all read
          </Button>
          <Link href="/notifications/settings" className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors shadow-sm shrink-0" aria-label="Notification settings">
            <Settings className="w-5 h-5" />
          </Link>
        </div>
      </div>

      {isLoading ? (
        <div className="p-8 text-center animate-pulse text-muted-foreground">Loading alerts...</div>
      ) : !notificationsData?.items || notificationsData.items.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center border border-border rounded-3xl bg-card shadow-sm">
          <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-4">
            <Bell className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="font-display text-2xl font-semibold mb-2">No alerts right now</h3>
          <p className="text-muted-foreground text-lg">You're all caught up.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {notificationsData.items.map(notif => {
            const isUnread = !notif.readAt
            return (
              <div 
                key={notif.id}
                onClick={() => handleNotificationClick(notif)}
                className={`group flex items-start gap-4 p-5 rounded-2xl border transition-all cursor-pointer shadow-sm
                  ${isUnread ? 'bg-card border-primary/30 hover:border-primary/50' : 'bg-background border-border hover:bg-secondary/30'}
                `}
              >
                <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${isUnread ? 'bg-primary/10' : 'bg-secondary'}`}>
                  {getIconForKind(notif.kind)}
                </div>
                
                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="flex justify-between items-baseline gap-2 mb-1">
                    <h3 className={`font-semibold text-base truncate ${isUnread ? 'text-foreground' : 'text-foreground/80'}`}>
                      {notif.title}
                    </h3>
                    <span className={`text-xs whitespace-nowrap shrink-0 ${isUnread ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                      {formatRelative(notif.createdAt)}
                    </span>
                  </div>
                  <p className={`text-sm ${isUnread ? 'text-foreground/90 font-medium' : 'text-muted-foreground'}`}>
                    {notif.body}
                  </p>
                </div>
                
                <div className="self-center ps-2">
                  <ChevronRight className={`w-5 h-5 transition-transform group-hover:translate-x-1 ${isUnread ? 'text-primary' : 'text-muted-foreground opacity-0 group-hover:opacity-100'}`} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
