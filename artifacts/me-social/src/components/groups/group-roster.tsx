import { formatDate } from "@/lib/locale-format";
import { Shield, UserMinus, Crown, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { 
  useRemoveGroupMember,
  useAssignGroupModerator,
  GroupMember,
  Group
} from "@workspace/api-client-react";

export function GroupRoster({ group, isOwner }: { group: Group, isOwner: boolean }) {
  const { toast } = useToast();
  const removeMember = useRemoveGroupMember();
  const assignModerator = useAssignGroupModerator();

  const members = (group as any).members as GroupMember[] | undefined;

  const handleRemove = async (memberId: string) => {
    if (!window.confirm("Remove this member? They will lose future server access to group posts, but copies already downloaded cannot be recalled.")) return;
    try {
      await removeMember.mutateAsync({ groupId: group.id, memberId });
      toast({ title: "Member removed" });
      // In a real app we'd invalidate the getGroup query here, 
      // but since it's passed as a prop, we assume the parent re-fetches or we force a reload.
      window.location.reload(); 
    } catch (e) {
      toast({ title: "Could not remove member", variant: "destructive" });
    }
  };

  const handleToggleMod = async (memberId: string, currentRole: string) => {
    const newRole = currentRole === "moderator" ? "member" : "moderator";
    try {
      await assignModerator.mutateAsync({ 
        groupId: group.id, 
        memberId, 
        data: { role: newRole as "member" | "moderator" } 
      });
      toast({ title: `Role updated to ${newRole}` });
      window.location.reload();
    } catch (e) {
      toast({ title: "Could not update role", variant: "destructive" });
    }
  };

  if (!members) {
    return <div className="text-center py-10 text-muted-foreground">Roster not available.</div>;
  }

  return (
    <div className="space-y-4">
      {isOwner && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100 mb-6">
          <div className="flex gap-2 font-semibold"><ShieldAlert className="h-5 w-5 shrink-0" />Removing members</div>
          <p className="mt-1">
            Removing someone stops future server access to group content, but cannot recall copies they already downloaded, photographed, or shared outside of Me.
          </p>
        </div>
      )}

      {members.map(member => {
        const isSelf = member.memberId === (group as any).myMemberId; // backend doesn't explicitly return myMemberId on group in the sample, but we can infer from not showing controls for self or owner
        
        return (
          <div key={member.memberId} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-lg flex items-center gap-2">
                {(member as any).preferredName || "Member"} 
                {member.role === "owner" && <Crown className="h-4 w-4 text-primary" aria-label="Owner" />}
                {member.role === "moderator" && <Shield className="h-4 w-4 text-primary" aria-label="Moderator" />}
              </p>
              <p className="text-sm text-muted-foreground capitalize">
                {member.role} · joined {formatDate(member.joinedAt)}
              </p>
            </div>
            
            {isOwner && member.role !== "owner" && (
              <div className="flex flex-wrap gap-2">
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => handleToggleMod(member.memberId, member.role)}
                >
                  {member.role === "moderator" ? "Make member" : "Make moderator"}
                </Button>
                <Button 
                  size="sm" 
                  variant="destructive" 
                  onClick={() => handleRemove(member.memberId)}
                >
                  <UserMinus className="me-1 h-4 w-4" />
                  Remove
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
