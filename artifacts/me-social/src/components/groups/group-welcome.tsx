import { useState } from "react";
import { HandHeart, Loader2, Check, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { 
  useGetMyGroupWelcomeRequest,
  useCreateGroupWelcomeRequest,
  getGetMyGroupWelcomeRequestQueryKey,
  useListGroupWelcomeQueue,
  useAcknowledgeGroupWelcome,
  useCloseGroupWelcome,
  getListGroupWelcomeQueueQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";

export function GroupWelcomeMember({ groupId, availabilityText }: { groupId: string, availabilityText?: string | null }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const statusQuery = useGetMyGroupWelcomeRequest(groupId, { 
    query: { 
      queryKey: getGetMyGroupWelcomeRequestQueryKey(groupId),
      retry: false 
    } 
  });
  const createRequest = useCreateGroupWelcomeRequest();
  const [intro, setIntro] = useState("");

  const handleRequest = async () => {
    try {
      await createRequest.mutateAsync({ 
        groupId, 
        data: { introductionText: intro || undefined } 
      });
      toast({ title: "Welcome request sent" });
      queryClient.invalidateQueries({ queryKey: getGetMyGroupWelcomeRequestQueryKey(groupId) });
    } catch (e: any) {
      toast({ 
        title: "Could not send request", 
        description: e.status === 409 ? e.message || "Welcome workflow is unavailable" : "An error occurred.", 
        variant: "destructive" 
      });
    }
  };

  if (statusQuery.isLoading) {
    return <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }

  const req = statusQuery.data;

  if (req && req.status !== 'none') {
    return (
      <div className="bg-secondary/30 border border-secondary-border rounded-3xl p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center shrink-0">
            <HandHeart className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h3 className="font-display text-xl font-semibold mb-1">Your welcome request</h3>
            <p className="text-muted-foreground mb-4">
              Status: <span className="font-semibold text-foreground capitalize">{req.status}</span>
              <br />
              Requested on {new Date(req.requestedAt!).toLocaleDateString()}
            </p>
            <div className="bg-card border border-border rounded-xl p-4 text-sm text-foreground/90 italic">
              "Trained hosts volunteer to welcome new members. Replies depend on host availability and are not guaranteed. Your request remains pending until a host is available to acknowledge it."
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-3xl p-6 shadow-sm">
      <div className="flex items-start gap-4 mb-6">
        <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center shrink-0">
          <HandHeart className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h3 className="font-display text-xl font-semibold mb-2">Request a Welcome</h3>
          <p className="text-foreground/90 text-sm leading-relaxed mb-3">
            Trained hosts volunteer to help new members get settled. You can request a personalized welcome to ask questions or just say hello.
          </p>
          <div className="bg-secondary/50 rounded-xl p-3 text-sm text-secondary-foreground font-medium border border-secondary-border">
            {availabilityText || "Hosts volunteer their time. This is a community effort, and response times vary based on host availability."}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <Label>Introduction (optional)</Label>
          <Textarea 
            value={intro} 
            onChange={e => setIntro(e.target.value)} 
            placeholder="Share a little about yourself or what you're looking for..."
            className="mt-2 resize-none h-24"
          />
        </div>
        <div className="flex justify-end">
          <Button onClick={handleRequest} disabled={createRequest.isPending} className="rounded-xl font-semibold">
            {createRequest.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Send Request
          </Button>
        </div>
      </div>
    </div>
  );
}

export function GroupWelcomeQueue({ groupId }: { groupId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const queueQuery = useListGroupWelcomeQueue(groupId, { 
    query: { 
      queryKey: getListGroupWelcomeQueueQueryKey(groupId),
      retry: false
    } 
  });
  
  const ackWelcome = useAcknowledgeGroupWelcome();
  const closeWelcome = useCloseGroupWelcome();

  const handleAction = async (requestId: string, action: 'acknowledge' | 'close') => {
    try {
      if (action === 'acknowledge') {
        await ackWelcome.mutateAsync({ groupId, requestId });
        toast({ title: "Request acknowledged" });
      } else {
        await closeWelcome.mutateAsync({ groupId, requestId });
        toast({ title: "Request closed" });
      }
      queryClient.invalidateQueries({ queryKey: getListGroupWelcomeQueueQueryKey(groupId) });
    } catch (e) {
      toast({ title: "Could not update request", variant: "destructive" });
    }
  };

  // If the user gets a 403, we just don't render the queue at all (they aren't a host).
  // This should be handled by the parent component, but we can return null if we get a 403.
  if (queueQuery.isError && (queueQuery.error as any)?.status === 403) {
    return null;
  }

  if (queueQuery.isLoading) {
    return <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }

  if (queueQuery.data?.length === 0) {
    return (
      <div className="text-center py-12 bg-card rounded-3xl border border-dashed border-border text-muted-foreground">
        No pending welcome requests.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="font-display text-2xl font-bold mb-4">Welcome Queue</h3>
      {queueQuery.data?.map((req: any) => (
        <div key={req.id} className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <div className="flex justify-between items-start gap-4">
            <div>
              <p className="font-semibold text-lg">{req.requesterPreferredName}</p>
              <p className="text-sm text-muted-foreground">
                Requested on {new Date(req.requestedAt).toLocaleDateString()} · Status: <span className="font-medium text-foreground capitalize">{req.status}</span>
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 shrink-0">
              {req.status === "open" && (
                <Button 
                  size="sm" 
                  className="rounded-full"
                  onClick={() => handleAction(req.id, 'acknowledge')}
                  disabled={ackWelcome.isPending || closeWelcome.isPending}
                >
                  <Check className="w-4 h-4 mr-1" />
                  Acknowledge
                </Button>
              )}
              <Button 
                size="sm" 
                variant="outline"
                className="rounded-full"
                onClick={() => handleAction(req.id, 'close')}
                disabled={ackWelcome.isPending || closeWelcome.isPending}
              >
                <CheckCircle2 className="w-4 h-4 mr-1" />
                Close
              </Button>
            </div>
          </div>
          {req.introductionText && (
            <div className="bg-secondary/30 p-4 rounded-xl text-sm italic border border-secondary-border">
              "{req.introductionText}"
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
