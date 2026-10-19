import { formatDate } from "@/lib/locale-format";
import { useState } from "react";
import { ShieldCheck, UserMinus, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { 
  useListGroupHosts,
  useAssignGroupHost,
  useDeactivateGroupHost,
  getListGroupHostsQueryKey,
  GroupMember
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

export function GroupHosts({ groupId, members }: { groupId: string, members?: GroupMember[] }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const hostsQuery = useListGroupHosts(groupId, { query: { queryKey: getListGroupHostsQueryKey(groupId) } });
  const assignHost = useAssignGroupHost();
  const deactivateHost = useDeactivateGroupHost();

  const [selectedMember, setSelectedMember] = useState("");

  const handleAssign = async () => {
    if (!selectedMember) return;
    try {
      await assignHost.mutateAsync({ groupId, data: { hostMemberId: selectedMember } });
      toast({ title: "Host assigned" });
      setSelectedMember("");
      queryClient.invalidateQueries({ queryKey: getListGroupHostsQueryKey(groupId) });
    } catch (e: any) {
      toast({ 
        title: "Could not assign host", 
        description: e.status === 409 ? "Member is not trained" : "An error occurred.",
        variant: "destructive" 
      });
    }
  };

  const handleDeactivate = async (hostMemberId: string) => {
    if (!window.confirm("Deactivate this host assignment?")) return;
    try {
      await deactivateHost.mutateAsync({ groupId, hostMemberId });
      toast({ title: "Host deactivated" });
      queryClient.invalidateQueries({ queryKey: getListGroupHostsQueryKey(groupId) });
    } catch (e) {
      toast({ title: "Could not deactivate host", variant: "destructive" });
    }
  };

  if (hostsQuery.isLoading) {
    return <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }

  // Active members only for the dropdown
  const activeMembers = members?.filter(m => m.status === "active") || [];

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-3xl p-6 shadow-sm">
        <h3 className="font-display text-xl font-semibold mb-2">Assign Welcome Host</h3>
        <p className="text-muted-foreground text-sm mb-4">
          Only independently trained members can be assigned as welcome hosts.
        </p>
        <div className="flex flex-col sm:flex-row items-end gap-4">
          <div className="flex-1 w-full">
            <Label className="mb-2 block">Select Member</Label>
            <Select value={selectedMember} onValueChange={setSelectedMember}>
              <SelectTrigger>
                <SelectValue placeholder="Choose an active member" />
              </SelectTrigger>
              <SelectContent>
                {activeMembers.map(m => (
                  <SelectItem key={m.memberId} value={m.memberId}>
                    {(m as any).preferredName || "Member"}
                  </SelectItem>
                ))}
                {activeMembers.length === 0 && (
                  <SelectItem value="none" disabled>No active members available</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleAssign} disabled={!selectedMember || assignHost.isPending} className="w-full sm:w-auto rounded-xl">
            {assignHost.isPending ? <Loader2 className="w-4 h-4 me-2 animate-spin" /> : <Plus className="w-4 h-4 me-2" />}
            Assign Host
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {hostsQuery.data?.length === 0 && (
          <div className="text-center py-8 bg-card rounded-3xl border border-dashed border-border text-muted-foreground">
            No active hosts assigned.
          </div>
        )}

        {hostsQuery.data?.map(host => (
          <div key={host.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-lg flex items-center gap-2">
                {(host as any).hostPreferredName || `Member ${host.hostMemberId.slice(-6)}`}
                <ShieldCheck className="w-4 h-4 text-primary" />
              </p>
              <p className="text-sm text-muted-foreground">
                Assigned {formatDate(host.createdAt)}
              </p>
            </div>
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => handleDeactivate(host.hostMemberId)}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <UserMinus className="w-4 h-4 me-1" />
              Deactivate
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
