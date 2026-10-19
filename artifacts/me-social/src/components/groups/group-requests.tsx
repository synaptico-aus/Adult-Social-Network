import { formatDate } from "@/lib/locale-format";
import { Check, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { 
  useListGroupMembershipRequests,
  useApproveGroupMembershipRequest,
  useDeclineGroupMembershipRequest,
  getListGroupMembershipRequestsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

export function GroupRequests({ groupId }: { groupId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const requestsQuery = useListGroupMembershipRequests(groupId, { query: { queryKey: getListGroupMembershipRequestsQueryKey(groupId) } });
  const approveReq = useApproveGroupMembershipRequest();
  const declineReq = useDeclineGroupMembershipRequest();

  const handleApprove = async (requestId: string) => {
    try {
      await approveReq.mutateAsync({ groupId, requestId });
      toast({ title: "Request approved" });
      queryClient.invalidateQueries({ queryKey: getListGroupMembershipRequestsQueryKey(groupId) });
    } catch (e) {
      toast({ title: "Could not approve request", variant: "destructive" });
    }
  };

  const handleDecline = async (requestId: string) => {
    try {
      await declineReq.mutateAsync({ groupId, requestId });
      toast({ title: "Request declined" });
      queryClient.invalidateQueries({ queryKey: getListGroupMembershipRequestsQueryKey(groupId) });
    } catch (e) {
      toast({ title: "Could not decline request", variant: "destructive" });
    }
  };

  if (requestsQuery.isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  if (requestsQuery.data?.length === 0) {
    return (
      <div className="text-center py-12 bg-card rounded-3xl border border-dashed border-border text-muted-foreground">
        No pending membership requests.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {requestsQuery.data?.map(req => (
        <div key={req.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold text-lg">
              {(req as any).requesterPreferredName || `Member ${req.memberId.slice(-6)}`}
            </p>
            <p className="text-sm text-muted-foreground">
              Requested on {formatDate(req.requestedAt)}
            </p>
          </div>
          <div className="flex gap-2">
            <Button 
              size="sm" 
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
              onClick={() => handleApprove(req.id)}
              disabled={approveReq.isPending || declineReq.isPending}
            >
              <Check className="w-4 h-4 me-1" />
              Approve
            </Button>
            <Button 
              size="sm" 
              variant="outline" 
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => handleDecline(req.id)}
              disabled={approveReq.isPending || declineReq.isPending}
            >
              <X className="w-4 h-4 me-1" />
              Decline
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
