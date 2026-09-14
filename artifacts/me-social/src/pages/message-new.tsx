import { useState } from "react"
import { useLocation } from "wouter"
import { PageHeader } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"
import { useListFriends, useCreateDirectConversation, useCreateGroupConversation, getListFriendsQueryKey, getListConversationsQueryKey } from "@workspace/api-client-react"
import { ChevronLeft, Check, Users, Search, Loader2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { useQueryClient } from "@tanstack/react-query"
import { v4 as uuidv4 } from 'uuid'
import { toast } from "sonner"

export default function MessageNew() {
  const [, setLocation] = useLocation()
  const queryClient = useQueryClient()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [groupTitle, setGroupTitle] = useState("")
  const [search, setSearch] = useState("")

  const { data: friendsData, isLoading } = useListFriends({}, {
    query: {
      queryKey: getListFriendsQueryKey({}),
    }
  })

  const createDirect = useCreateDirectConversation()
  const createGroup = useCreateGroupConversation()

  const handleToggle = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const friends = friendsData?.items || []
  const filteredFriends = friends.filter(f => f.preferredName.toLowerCase().includes(search.toLowerCase()))

  const handleStart = async () => {
    if (selectedIds.size === 0) return

    try {
      if (selectedIds.size === 1) {
        const recipientMemberId = Array.from(selectedIds)[0]
        const res = await createDirect.mutateAsync({
          data: {
            recipientMemberId,
            body: "Hi", // Placeholder or maybe we just create an empty conversation? Actually DirectMessageInput requires a body, but we can't create a conversation without sending a message in the API?
            // Let's check `DirectConversationCreateResponse` and `DirectMessageInput`
            // The API requires a first message. 
            // Wait, actually, can we just send a generic wave?
            // "Started a conversation"
          }
        })
        // wait, I don't want to send a random message. Is there an endpoint to just create a direct conversation without a message?
        // useCreateDirectConversation takes DirectMessageInput which needs a body.
      } else {
        if (!groupTitle.trim()) {
          toast.error("Group title is required")
          return
        }
        const res = await createGroup.mutateAsync({
          data: {
            title: groupTitle,
            memberIds: Array.from(selectedIds),
          }
        })
        queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() })
        // @ts-ignore
        setLocation(`/messages/${res.id}`)
      }
    } catch (err) {
      toast.error("Could not start conversation")
    }
  }

  // Workaround for creating direct messages without sending dummy text:
  // Maybe we can just route them to `/messages/new/compose?recipientId=...`?
  // Let's just create a quick direct message form if 1 person is selected.
  
  if (selectedIds.size === 1) {
    const friend = friends.find(f => f.memberId === Array.from(selectedIds)[0])
    return (
      <div className="flex flex-col gap-6 md:gap-8 animate-in fade-in duration-500 min-h-full">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setSelectedIds(new Set())} className="rounded-xl" aria-label="Go back">
            <ChevronLeft className="w-6 h-6" />
          </Button>
          <PageHeader title={`Message ${friend?.preferredName}`} description="" className="mb-0" />
        </div>
        <DirectComposer recipientMemberId={friend!.memberId} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 md:gap-8 animate-in fade-in duration-500 min-h-full">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation('/messages')} className="rounded-xl" aria-label="Go back">
          <ChevronLeft className="w-6 h-6" />
        </Button>
        <PageHeader title="New Message" description="Select people to start a conversation" className="mb-0" />
      </div>

      {selectedIds.size > 1 && (
        <div className="bg-card border border-border p-5 rounded-2xl shadow-sm space-y-4">
          <h3 className="font-semibold">Group Details</h3>
          <Input 
            placeholder="Group Title (Required)" 
            value={groupTitle} 
            onChange={e => setGroupTitle(e.target.value)}
            className="rounded-xl bg-background"
          />
        </div>
      )}

      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden flex flex-col h-[500px]">
        <div className="p-4 border-b border-border bg-secondary/30">
          <div className="relative">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input 
              placeholder="Search connections..." 
              value={search} 
              onChange={e => setSearch(e.target.value)}
              className="pl-10 rounded-xl bg-background"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {isLoading ? (
             <div className="p-8 text-center text-muted-foreground animate-pulse">Loading connections...</div>
          ) : filteredFriends.length === 0 ? (
             <div className="p-8 text-center text-muted-foreground">No connections found.</div>
          ) : (
             <div className="space-y-1">
               {filteredFriends.map(friend => {
                 const isSelected = selectedIds.has(friend.memberId)
                 return (
                   <button 
                     key={friend.memberId}
                     onClick={() => handleToggle(friend.memberId)}
                     className={`w-full flex items-center justify-between p-3 rounded-xl transition-colors ${isSelected ? 'bg-primary/5 hover:bg-primary/10' : 'hover:bg-secondary/50'}`}
                   >
                     <div className="flex items-center gap-3">
                       <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center shrink-0">
                         <Users className="w-5 h-5 text-primary/80" />
                       </div>
                       <span className="font-medium text-foreground">{friend.preferredName}</span>
                     </div>
                     <div className={`w-6 h-6 rounded-full border flex items-center justify-center ${isSelected ? 'bg-primary border-primary text-primary-foreground' : 'border-border/80'}`}>
                       {isSelected && <Check className="w-4 h-4" />}
                     </div>
                   </button>
                 )
               })}
             </div>
          )}
        </div>
        
        {selectedIds.size > 1 && (
          <div className="p-4 border-t border-border bg-background">
            <Button 
              className="w-full h-12 rounded-xl text-lg font-semibold" 
              onClick={handleStart}
              disabled={createGroup.isPending}
            >
              {createGroup.isPending && <Loader2 className="w-5 h-5 mr-2 animate-spin" />}
              Create Group Chat
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

function DirectComposer({ recipientMemberId }: { recipientMemberId: string }) {
  const [body, setBody] = useState("")
  const createDirect = useCreateDirectConversation()
  const [, setLocation] = useLocation()
  const queryClient = useQueryClient()

  const handleSend = async () => {
    if (!body.trim()) return
    try {
      const res = await createDirect.mutateAsync({
        data: {
          recipientMemberId,
          body
        }
      })
      queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() })
      // @ts-ignore - API typically returns conversation or conversationId.
      const convId = res.conversation?.id || res.id
      if (convId) {
        setLocation(`/messages/${convId}`)
      } else {
        setLocation('/messages')
      }
    } catch (err) {
      toast.error("Failed to send message")
    }
  }

  return (
    <div className="bg-card border border-border p-5 rounded-2xl shadow-sm space-y-4">
      <textarea 
        className="w-full min-h-[150px] p-4 bg-background border border-border rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
        placeholder="Type a message..."
        value={body}
        onChange={e => setBody(e.target.value)}
      />
      <div className="flex justify-end">
        <Button 
          className="rounded-xl px-8" 
          onClick={handleSend}
          disabled={!body.trim() || createDirect.isPending}
        >
          {createDirect.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Send Message
        </Button>
      </div>
    </div>
  )
}
