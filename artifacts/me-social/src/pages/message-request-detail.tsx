import { useRoute, useLocation } from "wouter"
import { PageHeader } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"
import { 
  useListMessageRequests, useAcceptMessageRequest, useDeclineMessageRequest, getListMessageRequestsQueryKey, getListConversationsQueryKey
} from "@workspace/api-client-react"
import { ChevronLeft, UserCircle, Loader2, Check, X } from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

export default function MessageRequestDetail() {
  const [, params] = useRoute("/messages/requests/:id")
  const id = params?.id
  const [, setLocation] = useLocation()
  const queryClient = useQueryClient()

  const { data: requestsData, isLoading } = useListMessageRequests({
    query: {
      queryKey: getListMessageRequestsQueryKey(),
    }
  })

  const acceptMutation = useAcceptMessageRequest()
  const declineMutation = useDeclineMessageRequest()

  if (isLoading) {
    return <div className="p-8 text-center animate-pulse text-muted-foreground">Loading request...</div>
  }

  const request = requestsData?.find((r: any) => r.id === id)

  if (!request) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Request not found or already handled.
        <div className="mt-4"><Button onClick={() => setLocation("/messages")} variant="outline">Go Back</Button></div>
      </div>
    )
  }

  const handleAccept = async () => {
    try {
      const res = await acceptMutation.mutateAsync({ id: request.id })
      queryClient.invalidateQueries({ queryKey: getListMessageRequestsQueryKey() })
      queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() })
      toast.success("Request accepted")
      if (res.conversation?.id) {
        setLocation(`/messages/${res.conversation.id}`)
      } else {
        toast.error("Conversation ID missing in response")
        setLocation("/messages")
      }
    } catch {
      toast.error("Could not accept request")
    }
  }

  const handleDecline = async () => {
    try {
      await declineMutation.mutateAsync({ id: request.id })
      queryClient.invalidateQueries({ queryKey: getListMessageRequestsQueryKey() })
      toast.success("Request declined")
      setLocation("/messages")
    } catch {
      toast.error("Could not decline request")
    }
  }

  return (
    <div className="flex flex-col gap-6 md:gap-8 animate-in fade-in duration-500 min-h-full">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation('/messages')} className="rounded-xl" aria-label="Go back">
          <ChevronLeft className="rtl:-scale-x-100 w-6 h-6" />
        </Button>
        <PageHeader title="Message Request" description="" className="mb-0" />
      </div>

      <div className="max-w-xl mx-auto w-full bg-card border border-border rounded-3xl p-6 shadow-sm flex flex-col items-center text-center mt-8">
        <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center mb-4 border-4 border-background shadow-sm">
          <UserCircle className="w-10 h-10 text-primary/80" />
        </div>
        <h2 className="font-display text-2xl font-semibold mb-2">{request.senderDisplayName}</h2>
        <p className="text-muted-foreground mb-6">Wants to send you a direct message.</p>

        {request.body && (
          <div className="w-full bg-secondary/30 border border-border/50 rounded-2xl p-4 text-start mb-6 italic text-foreground/80">
            "{request.body}"
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 w-full">
          <Button 
            className="flex-1 rounded-xl h-12 text-base font-semibold" 
            onClick={handleAccept}
            disabled={acceptMutation.isPending || declineMutation.isPending}
          >
            {acceptMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin me-2" /> : <Check className="w-5 h-5 me-2" />}
            Accept
          </Button>
          <Button 
            variant="outline"
            className="flex-1 rounded-xl h-12 text-base font-semibold text-destructive hover:bg-destructive/10 hover:text-destructive" 
            onClick={handleDecline}
            disabled={acceptMutation.isPending || declineMutation.isPending}
          >
            {declineMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin me-2" /> : <X className="w-5 h-5 me-2" />}
            Decline
          </Button>
        </div>
      </div>
    </div>
  )
}
