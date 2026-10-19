import { useState, useRef, useEffect } from "react"
import { useRoute, useLocation, Link } from "wouter"
import { PageHeader } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { 
  useGetConversation, useListMessages, useSendMessage, useLeaveConversation, useCloseConversation, 
  useRemoveConversationParticipant, useDeleteMessageForEveryone, useRemoveMessageForMe, useReportMessage,
  getGetConversationQueryKey, getListMessagesQueryKey, getListConversationsQueryKey, useGetAccountSummary, getGetAccountSummaryQueryKey
} from "@workspace/api-client-react"
import { ChevronLeft, MoreVertical, Send, ShieldAlert, LogOut, Loader2, Trash2, Users, AlertCircle, UserCircle } from "lucide-react"
import { formatRelative } from "@/lib/locale-format";
import { useQueryClient } from "@tanstack/react-query"
import { v4 as uuidv4 } from "uuid"
import { toast } from "sonner"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { MediaUploader } from "@/components/media/media-uploader"
import { MediaAttachmentRenderer } from "@/components/media/media-renderer"
import { useMediaUploads } from "@/hooks/use-media-upload"

export default function MessageDetail() {
  const [, params] = useRoute("/messages/:id")
  const id = params?.id
  const [, setLocation] = useLocation()
  const queryClient = useQueryClient()
  const scrollRef = useRef<HTMLDivElement>(null)

  const { data: summary } = useGetAccountSummary({
    query: {
      queryKey: getGetAccountSummaryQueryKey(),
      staleTime: Infinity,
    }
  })
  
  const myMemberId = summary?.memberId

  const { data: conversation, isLoading: isConvLoading, isError: isConvError } = useGetConversation(id || "", {
    query: {
      enabled: !!id,
      queryKey: getGetConversationQueryKey(id || ""),
      refetchInterval: 60000,
    }
  })

  const { data: messagesData, isLoading: isMsgsLoading, isError: isMsgsError } = useListMessages(id || "", {
    query: {
      enabled: !!id,
      queryKey: getListMessagesQueryKey(id || ""),
      refetchInterval: 10000, // frequent polling
    }
  })

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messagesData?.items])

  const leaveMutation = useLeaveConversation()
  const closeMutation = useCloseConversation()
  const removeParticipantMut = useRemoveConversationParticipant()
  
  const handleLeave = async () => {
    if (!id || !confirm("Are you sure you want to leave this conversation?")) return
    try {
      await leaveMutation.mutateAsync({ conversationId: id })
      queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() })
      setLocation("/messages")
    } catch {
      toast.error("Failed to leave conversation")
    }
  }

  const handleClose = async () => {
    if (!id || !confirm("Close this conversation for everyone?")) return
    try {
      await closeMutation.mutateAsync({ conversationId: id })
      queryClient.invalidateQueries({ queryKey: getGetConversationQueryKey(id) })
      toast.success("Conversation closed")
    } catch {
      toast.error("Failed to close conversation")
    }
  }

  if (isConvLoading || isMsgsLoading) {
    return <div className="p-8 text-center animate-pulse text-muted-foreground">Loading conversation...</div>
  }

  if (isConvError || isMsgsError || !conversation) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center border border-border rounded-3xl bg-card shadow-sm mt-8 max-w-xl mx-auto">
        <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-4">
          <AlertCircle className="w-8 h-8 text-destructive" />
        </div>
        <h3 className="font-display text-2xl font-semibold mb-2">Conversation unavailable</h3>
        <p className="text-muted-foreground text-lg mb-6">This conversation may have been closed, or you do not have permission to view it.</p>
        <Button onClick={() => setLocation("/messages")} className="rounded-xl h-12 px-8 font-semibold">
          Return to Messages
        </Button>
      </div>
    )
  }

  const messages = [...(messagesData?.items || [])].reverse() // chronological order
  const myParticipant = conversation.participants.find(p => p.memberId === myMemberId)
  const canManage = myParticipant?.role === 'owner' || myParticipant?.role === 'admin'

  return (
    <div className="flex flex-col h-[calc(100dvh-12rem)] md:h-[calc(100dvh-6rem)] animate-in fade-in duration-500">
      <div className="flex items-center justify-between gap-4 pb-4 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation('/messages')} className="rounded-xl shrink-0" aria-label="Go back">
            <ChevronLeft className="rtl:-scale-x-100 w-6 h-6" />
          </Button>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center shrink-0 border border-border/50">
              {conversation.kind === 'group' ? <Users className="w-5 h-5 text-primary/80" /> : <div className="font-semibold text-primary/80">{conversation.displayTitle.charAt(0)}</div>}
            </div>
            <div className="min-w-0">
              <h2 className="font-display font-semibold text-xl truncate">{conversation.displayTitle}</h2>
              <div className="text-xs text-muted-foreground">
                {conversation.kind === 'group' ? `${conversation.participantCount} members` : "Direct Message"}
              </div>
            </div>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-xl shrink-0">
              <MoreVertical className="w-5 h-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 rounded-xl">
             <Dialog>
               <DialogTrigger asChild>
                 <DropdownMenuItem className="py-3 cursor-pointer" onSelect={(e) => e.preventDefault()}>
                    <Users className="w-4 h-4 me-2" /> View Participants
                 </DropdownMenuItem>
               </DialogTrigger>
               <DialogContent className="rounded-3xl max-w-md">
                 <DialogHeader>
                   <DialogTitle className="font-display text-2xl">Participants</DialogTitle>
                 </DialogHeader>
                 <div className="space-y-3 mt-4">
                   {conversation.participants.map(p => (
                     <div key={p.memberId} className="flex items-center justify-between p-3 rounded-2xl border border-border bg-card">
                       <div className="flex items-center gap-3">
                         <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center shrink-0">
                           <UserCircle className="w-5 h-5 text-primary/80" />
                         </div>
                         <div>
                           <div className="font-medium text-foreground">{p.displayName} {p.memberId === myMemberId && "(You)"}</div>
                           <div className="text-xs text-muted-foreground capitalize">{p.role}</div>
                         </div>
                       </div>
                       
                       {conversation.kind === 'group' && p.memberId !== myMemberId && canManage && (
                         <DropdownMenu>
                           <DropdownMenuTrigger asChild>
                             <Button variant="ghost" size="icon" className="w-8 h-8 rounded-full">
                               <MoreVertical className="w-4 h-4 text-muted-foreground" />
                             </Button>
                           </DropdownMenuTrigger>
                           <DropdownMenuContent align="end" className="rounded-xl">
                             <DropdownMenuItem className="text-destructive focus:bg-destructive/10" onClick={async () => {
                               if(!confirm(`Remove ${p.displayName}?`)) return
                               try {
                                 await removeParticipantMut.mutateAsync({ conversationId: conversation.id, memberId: p.memberId })
                                 queryClient.invalidateQueries({ queryKey: getGetConversationQueryKey(conversation.id) })
                                 toast.success("Participant removed")
                               } catch {
                                 toast.error("Could not remove participant")
                               }
                             }}>
                               Remove Participant
                             </DropdownMenuItem>
                           </DropdownMenuContent>
                         </DropdownMenu>
                       )}
                     </div>
                   ))}
                 </div>
               </DialogContent>
             </Dialog>
             <DropdownMenuSeparator />
             {conversation.kind === 'group' && (
               <>
                 <DropdownMenuItem className="py-3 text-destructive focus:bg-destructive/10 focus:text-destructive cursor-pointer" onClick={handleLeave}>
                    <LogOut className="w-4 h-4 me-2" /> Leave Conversation
                 </DropdownMenuItem>
               </>
             )}
             {(conversation.kind === 'direct' || canManage) && (
               <DropdownMenuItem className="py-3 text-destructive focus:bg-destructive/10 focus:text-destructive cursor-pointer" onClick={handleClose}>
                  <ShieldAlert className="w-4 h-4 me-2" /> Close Conversation
               </DropdownMenuItem>
             )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-muted-foreground italic">
            No messages yet. Say hello!
          </div>
        ) : (
          messages.map(msg => (
            <MessageBubble key={msg.id} msg={msg} isMe={msg.senderMemberId === myMemberId} conversationId={conversation.id} />
          ))
        )}
      </div>

      <div className="shrink-0 pt-4 border-t border-border">
        {conversation.status === 'closed' ? (
          <div className="p-4 text-center bg-secondary/30 rounded-xl text-muted-foreground">
            This conversation is closed.
          </div>
        ) : (
          <Composer conversationId={conversation.id} />
        )}
      </div>
    </div>
  )
}

function MessageBubble({ msg, isMe, conversationId }: { msg: any, isMe: boolean, conversationId: string }) {
  const delForEveryone = useDeleteMessageForEveryone()
  const delForMe = useRemoveMessageForMe()
  const reportMut = useReportMessage()
  const queryClient = useQueryClient()
  
  const handleDeleteEveryone = async () => {
    if (!confirm("Delete message for everyone? This cannot be undone.")) return
    try {
      await delForEveryone.mutateAsync({ messageId: msg.id })
      queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey(conversationId) })
    } catch {
      toast.error("Could not delete message")
    }
  }

  const handleDeleteMe = async () => {
    if (!confirm("Remove this message for yourself?")) return
    try {
      await delForMe.mutateAsync({ messageId: msg.id })
      queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey(conversationId) })
    } catch {
      toast.error("Could not remove message")
    }
  }

  const handleReport = async () => {
    if (!confirm("Report this message? Moderation team will review the content.")) return
    try {
      await reportMut.mutateAsync({ 
        messageId: msg.id,
        data: {
          category: 'harassment'
        }
      })
      toast.success("Message reported")
    } catch {
      toast.error("Could not report message")
    }
  }

  if (msg.deletedForEveryone) {
    return (
      <div className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
        <div className="max-w-[85%] rounded-2xl p-3 bg-secondary/50 border border-border/50 text-muted-foreground italic text-sm">
          This message was deleted.
        </div>
      </div>
    )
  }

  return (
    <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} group`}>
      <div className={`flex items-baseline gap-2 mb-1 px-1 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
        <span className="text-xs font-semibold text-foreground/80">{msg.senderDisplayName}</span>
        <span className="text-[10px] text-muted-foreground">{formatRelative(msg.createdAt)}</span>
      </div>
      
      <div className="flex items-start gap-2 max-w-[85%] relative">
        {isMe && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="w-8 h-8 rounded-full opacity-0 group-hover:opacity-100 transition-opacity absolute right-full me-1 top-1">
                <MoreVertical className="w-4 h-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-xl">
              <DropdownMenuItem onClick={handleDeleteEveryone} className="text-destructive focus:bg-destructive/10">
                <Trash2 className="w-4 h-4 me-2" /> Delete for everyone
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDeleteMe}>
                <Trash2 className="w-4 h-4 me-2" /> Remove for me
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <div className={`rounded-2xl p-3.5 shadow-sm border ${isMe ? 'bg-primary text-primary-foreground border-primary-border rounded-tr-sm' : 'bg-card border-border rounded-tl-sm'}`}>
          {msg.body && <div className="whitespace-pre-wrap leading-relaxed">{msg.body}</div>}
          {msg.mediaAssets?.length > 0 && (
            <div className="mt-2 space-y-2">
              {msg.mediaAssets.map((asset: any) => (
                <MediaAttachmentRenderer key={asset.id} asset={asset} isDetail={false} />
              ))}
            </div>
          )}
        </div>

        {!isMe && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="w-8 h-8 rounded-full opacity-0 group-hover:opacity-100 transition-opacity absolute left-full ms-1 top-1">
                <MoreVertical className="w-4 h-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="rounded-xl">
              <DropdownMenuItem onClick={handleDeleteMe}>
                <Trash2 className="w-4 h-4 me-2" /> Remove for me
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleReport} className="text-destructive focus:bg-destructive/10">
                <ShieldAlert className="w-4 h-4 me-2" /> Report Message
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  )
}

function Composer({ conversationId }: { conversationId: string }) {
  const [body, setBody] = useState("")
  const sendMutation = useSendMessage()
  const queryClient = useQueryClient()
  const mediaUploader = useMediaUploads()
  
  const handleSend = async () => {
    // Determine if any media is still uploading or holding
    const hasPendingMedia = mediaUploader.items.some(item => 
      ['requesting', 'uploading', 'completing', 'held'].includes(item.status)
    )
    if (hasPendingMedia) {
      toast.error("Please wait for media to finish checks before sending.")
      return
    }

    const readyMediaIds = mediaUploader.items
      .filter(item => item.status === 'ready' && item.asset?.id)
      .map(item => item.asset!.id)

    if (!body.trim() && readyMediaIds.length === 0) return

    try {
      await sendMutation.mutateAsync({
        conversationId,
        data: {
          idempotencyKey: uuidv4(),
          body: body.trim() || undefined,
          mediaAssetIds: readyMediaIds
        }
      })
      setBody("")
      mediaUploader.setItems([])
      queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey(conversationId) })
    } catch {
      toast.error("Could not send message")
    }
  }

  return (
    <div className="bg-card border border-border p-4 rounded-2xl shadow-sm space-y-3">
      {mediaUploader.items.length > 0 && (
        <div className="mb-4">
          <MediaUploader {...mediaUploader} />
        </div>
      )}
      
      <div className="flex gap-2 items-end">
        <div className="flex-1 bg-background border border-border rounded-xl focus-within:ring-2 focus-within:ring-primary/20 transition-all">
          <textarea 
            className="w-full max-h-32 p-3 bg-transparent resize-none focus:outline-none placeholder:text-muted-foreground"
            placeholder="Type your message..."
            value={body}
            onChange={e => setBody(e.target.value)}
            rows={2}
          />
        </div>
        <Button 
          size="icon" 
          className="h-12 w-12 rounded-xl shrink-0" 
          onClick={handleSend}
          disabled={sendMutation.isPending || (!body.trim() && mediaUploader.items.length === 0)}
        >
          {sendMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
        </Button>
      </div>
      <div className="pt-2">
         <MediaUploader {...mediaUploader} />
      </div>
    </div>
  )
}
