import { useState } from "react"
import { PageHeader } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useListConversations, useListMessageRequests, getListConversationsQueryKey, getListMessageRequestsQueryKey } from "@workspace/api-client-react"
import { Link } from "wouter"
import { MessageSquare, Plus, MailQuestion, Settings, Users, ArrowRight, UserCircle } from "lucide-react"
import { formatDistanceToNow } from "date-fns"

function ConversationList() {
  const { data: conversations, isLoading } = useListConversations({
    query: {
      queryKey: getListConversationsQueryKey(),
      refetchInterval: 30000,
    }
  })

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground animate-pulse">Loading conversations...</div>
  }

  if (!conversations?.items || conversations.items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center border border-border rounded-3xl bg-card shadow-sm">
        <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-4">
          <MessageSquare className="w-8 h-8 text-primary" />
        </div>
        <h3 className="font-display text-2xl font-semibold mb-2">No messages yet</h3>
        <p className="text-muted-foreground mb-6 max-w-sm text-lg">Start a conversation with a connection or create a group chat.</p>
        <Link href="/messages/new" className="inline-flex h-12 items-center justify-center rounded-xl bg-primary px-6 font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm">
          <Plus className="w-5 h-5 mr-2" />
          New Message
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {conversations.items.map(conv => (
        <Link key={conv.id} href={`/messages/${conv.id}`} className="group flex items-center gap-4 p-4 rounded-2xl border border-border bg-card hover:bg-secondary/30 transition-all shadow-sm">
          <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center shrink-0 border border-border/50">
            {conv.kind === 'group' ? (
              <Users className="w-6 h-6 text-primary/80" />
            ) : (
              <UserCircle className="w-6 h-6 text-primary/80" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-baseline mb-1">
              <h3 className="font-semibold text-lg text-foreground truncate pr-2">{conv.displayTitle}</h3>
              {conv.lastMessage && (
                <span className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">
                  {formatDistanceToNow(new Date(conv.lastMessage.createdAt), { addSuffix: true })}
                </span>
              )}
            </div>
            {conv.lastMessage ? (
              <p className="text-muted-foreground text-sm truncate">
                <span className="font-medium text-foreground/80">{conv.lastMessage.senderDisplayName}:</span> {conv.lastMessage.preview}
              </p>
            ) : (
              <p className="text-muted-foreground text-sm italic">No messages yet</p>
            )}
          </div>
          <ArrowRight className="w-5 h-5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
        </Link>
      ))}
    </div>
  )
}

function RequestList() {
  const { data: requests, isLoading } = useListMessageRequests({
    query: {
      queryKey: getListMessageRequestsQueryKey(),
      refetchInterval: 30000,
    }
  })

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground animate-pulse">Loading requests...</div>
  }

  if (!requests || requests.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center border border-border rounded-3xl bg-card shadow-sm">
        <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-4">
          <MailQuestion className="w-8 h-8 text-primary" />
        </div>
        <h3 className="font-display text-2xl font-semibold mb-2">No message requests</h3>
        <p className="text-muted-foreground text-lg">When someone you aren't connected to sends a message, it will appear here.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {requests.map((req: any) => (
        <Link key={req.id} href={`/messages/requests/${req.id}`} className="flex items-center gap-4 p-5 rounded-2xl border border-border bg-card hover:bg-secondary/30 transition-all shadow-sm">
          <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center shrink-0">
            <UserCircle className="w-6 h-6 text-primary/80" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-lg text-foreground truncate">{req.senderDisplayName}</h3>
            <p className="text-muted-foreground text-sm truncate mt-1">
              Wants to send you a message
            </p>
          </div>
          <Button variant="secondary" size="sm" className="rounded-xl">View</Button>
        </Link>
      ))}
    </div>
  )
}

export default function MessagesPage() {
  return (
    <div className="flex flex-col gap-6 md:gap-8 animate-in fade-in duration-500 min-h-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <PageHeader
          title="Messages"
          description="Private conversations with your connections."
        />
        <div className="flex gap-3">
          <Link href="/messages/settings" className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors shadow-sm shrink-0" aria-label="Message settings">
            <Settings className="w-5 h-5" />
          </Link>
          <Link href="/messages/new" className="inline-flex h-12 flex-1 sm:flex-none items-center justify-center rounded-xl bg-primary px-6 font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm">
            <Plus className="w-5 h-5 mr-2" />
            New Message
          </Link>
        </div>
      </div>

      <Tabs defaultValue="conversations" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-6 h-14 bg-secondary/50 rounded-2xl p-1.5">
          <TabsTrigger value="conversations" className="rounded-xl text-base font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-foreground">Conversations</TabsTrigger>
          <TabsTrigger value="requests" className="rounded-xl text-base font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-foreground">Requests</TabsTrigger>
        </TabsList>
        <TabsContent value="conversations" className="mt-0 focus-visible:outline-none">
          <ConversationList />
        </TabsContent>
        <TabsContent value="requests" className="mt-0 focus-visible:outline-none">
          <RequestList />
        </TabsContent>
      </Tabs>
    </div>
  )
}
