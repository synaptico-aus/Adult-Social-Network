import { useMemo, useState } from "react";
import { CalendarClock, Crown, DoorOpen, History, Loader2, Plus, Send, ShieldAlert, UserMinus, Users } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PostComposer } from "@/components/posts/post-composer";
import { PostCard } from "@/components/posts/post-card";
import {
  getListCircleInvitationsQueryKey, getListCirclePostsQueryKey, getListCirclesQueryKey, useAcceptCircleInvitation, useCloseCircle,
  useCreateCircle, useCreateCircleInvitation, useDeclineCircleInvitation, useGrantCircleHistoryAccess, useLeaveCircle,
  useListCircleInvitations, useListCirclePosts, useListCircles, useListFriends, useRemoveCircleMember, useRevokeCircleHistoryAccess,
  useUpdateCircleMember,
} from "@workspace/api-client-react";

const nextWeek = () => new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 16);

export default function MyCircle() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const circles = useListCircles();
  const invitations = useListCircleInvitations();
  const friends = useListFriends();
  const create = useCreateCircle();
  const invite = useCreateCircleInvitation();
  const accept = useAcceptCircleInvitation();
  const decline = useDeclineCircleInvitation();
  const updateMember = useUpdateCircleMember();
  const removeMember = useRemoveCircleMember();
  const grantHistory = useGrantCircleHistoryAccess();
  const revokeHistory = useRevokeCircleHistoryAccess();
  const leave = useLeaveCircle();
  const close = useCloseCircle();
  const [circleId, setCircleId] = useState<string>("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [recipient, setRecipient] = useState("");
  const [expiresAt, setExpiresAt] = useState(nextWeek);

  const selected = useMemo(() => (circles.data ?? []).find((circle) => circle.id === circleId) ?? circles.data?.[0], [circles.data, circleId]);
  const selectedId = selected?.id ?? "";
  const circlePosts = useListCirclePosts(selectedId, { query: { queryKey: getListCirclePostsQueryKey(selectedId), enabled: Boolean(selectedId) } });
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListCirclesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListCircleInvitationsQueryKey() });
    if (selectedId) queryClient.invalidateQueries({ queryKey: getListCirclePostsQueryKey(selectedId) });
  };
  const run = async (work: () => Promise<unknown>, success: string) => {
    try { await work(); invalidate(); toast({ title: success }); } catch { toast({ title: "That change could not be completed", variant: "destructive" }); }
  };
  const confirmAndRun = (message: string, work: () => Promise<unknown>, success: string) => {
    if (window.confirm(message)) void run(work, success);
  };
  const createCircle = () => run(async () => {
    const newCircle = await create.mutateAsync({ data: { name, description: description || undefined } });
    setCircleId(newCircle.id); setName(""); setDescription("");
  }, "Circle created");
  const sendInvite = () => run(() => invite.mutateAsync({ circleId: selectedId, data: { recipientMemberId: recipient, expiresAt: new Date(expiresAt).toISOString() } }), "Invitation sent");

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="space-y-2">
        <div className="flex items-center gap-3"><span className="rounded-2xl bg-primary/10 p-3 text-primary"><Users className="h-7 w-7" /></span><h1 className="font-display text-4xl font-bold">My Circle</h1></div>
        <p className="max-w-2xl text-muted-foreground">Create a private space for people you choose. Being family or friends never adds anyone automatically.</p>
      </header>

      <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
        <h2 className="font-display text-2xl font-semibold">Create a circle</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div><Label htmlFor="circle-name">Circle name</Label><Input id="circle-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="For example, Family check-ins" /></div>
          <div><Label htmlFor="circle-description">A short description (optional)</Label><Input id="circle-description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} placeholder="What this space is for" /></div>
        </div>
        <Button className="mt-4 rounded-xl" onClick={createCircle} disabled={!name.trim() || create.isPending}>{create.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}Create private circle</Button>
      </section>

      {invitations.data?.length ? <section className="rounded-3xl border border-primary/25 bg-primary/5 p-5">
        <h2 className="font-display text-2xl font-semibold">Your invitations</h2>
        <div className="mt-3 space-y-3">{invitations.data.map((item) => <div key={item.id} className="flex flex-col gap-3 rounded-2xl bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="font-semibold">{item.inviterName} invited you to {item.circleName}</p><p className="text-sm text-muted-foreground">Expires {new Date(item.expiresAt).toLocaleString()}</p></div>
          <div className="flex gap-2"><Button onClick={() => run(() => accept.mutateAsync({ invitationId: item.id }), "You joined the circle")}>Accept</Button><Button variant="outline" onClick={() => run(() => decline.mutateAsync({ invitationId: item.id }), "Invitation declined")}>Decline</Button></div>
        </div>)}</div>
      </section> : null}

      {circles.isLoading ? <div className="flex justify-center py-10"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div> : !circles.data?.length ? <section className="rounded-3xl border border-dashed border-border p-8 text-center text-muted-foreground">Your circle will appear here after you create one or accept an invitation.</section> : <section className="space-y-5">
        <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Your circles">{circles.data.map((circle) => <Button key={circle.id} variant={selectedId === circle.id ? "default" : "outline"} className="rounded-full whitespace-nowrap" onClick={() => setCircleId(circle.id)}>{circle.name}</Button>)}</div>
        {selected ? <div className="space-y-6 rounded-3xl border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="font-display text-3xl font-bold">{selected.name}</h2>{selected.description ? <p className="mt-1 text-muted-foreground">{selected.description}</p> : null}</div><span className="w-fit rounded-full bg-secondary px-3 py-1 text-sm font-semibold capitalize">{selected.myRole}</span></div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100"><div className="flex gap-2 font-semibold"><ShieldAlert className="h-5 w-5 shrink-0" />History stays private by default</div><p className="mt-1">New members see posts shared after they join. Choose “Share earlier posts” only when you want to grant older circle-post access. Removing someone stops future server access, but cannot recall copies they already downloaded, photographed, or shared.</p></div>

          {(selected.myRole === "owner" || selected.myRole === "admin") ? <div className="rounded-2xl bg-secondary/35 p-4">
            <h3 className="font-semibold">Invite a selected friend</h3><p className="mt-1 text-sm text-muted-foreground">Review the recipient and invitation expiry before sending. Invitations are single-use.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3"><div><Label>Recipient</Label><Select value={recipient} onValueChange={setRecipient}><SelectTrigger><SelectValue placeholder="Choose a friend" /></SelectTrigger><SelectContent>{friends.data?.items?.map((friend) => <SelectItem key={friend.memberId} value={friend.memberId}>{friend.preferredName}</SelectItem>)}</SelectContent></Select></div><div><Label htmlFor="invite-expiry">Invitation expires</Label><Input id="invite-expiry" type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} /></div><div className="flex items-end"><Button className="w-full" disabled={!recipient || invite.isPending} onClick={sendInvite}><Send className="mr-2 h-4 w-4" />Send invitation</Button></div></div>
          </div> : null}

          <div><div className="flex items-center justify-between"><h3 className="font-display text-2xl font-semibold">Members</h3><span className="text-sm text-muted-foreground">{selected.members.length} people</span></div><div className="mt-3 space-y-2">{selected.members.map((circleMember) => <div key={circleMember.memberId} className="flex flex-col gap-3 rounded-2xl border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="font-semibold">{circleMember.preferredName} {circleMember.role === "owner" ? <Crown className="ml-1 inline h-4 w-4 text-primary" aria-label="Owner" /> : null}</p><p className="text-sm text-muted-foreground capitalize">{circleMember.role} · joined {new Date(circleMember.joinedAt).toLocaleDateString()}</p></div>
            {(selected.myRole === "owner" || selected.myRole === "admin") && circleMember.role !== "owner" ? <div className="flex flex-wrap gap-2">
              {circleMember.historyAccess ? <Button size="sm" variant="outline" onClick={() => confirmAndRun(`Stop sharing earlier circle posts with ${circleMember.preferredName}? They will lose future server access to those posts, but copies already downloaded cannot be recalled.`, () => revokeHistory.mutateAsync({ circleId: selectedId, memberId: circleMember.memberId }), "Earlier-post access revoked")}>Revoke earlier-post access</Button> : <Button size="sm" variant="outline" onClick={() => confirmAndRun(`Share all earlier circle posts with ${circleMember.preferredName}? This gives them server access to older updates.`, () => grantHistory.mutateAsync({ circleId: selectedId, data: { memberId: circleMember.memberId } }), "Earlier circle posts shared")}> <History className="mr-1 h-4 w-4" />Share earlier posts</Button>}
              {selected.myRole === "owner" ? <Button size="sm" variant="outline" onClick={() => run(() => updateMember.mutateAsync({ circleId: selectedId, memberId: circleMember.memberId, data: { role: circleMember.role === "admin" ? "member" : "admin" } }), "Member role updated")}>{circleMember.role === "admin" ? "Make member" : "Make admin"}</Button> : null}
              <Button size="sm" variant="destructive" onClick={() => confirmAndRun(`Remove ${circleMember.preferredName} from this circle? This immediately revokes future server access, but cannot recall copies they already downloaded.`, () => removeMember.mutateAsync({ circleId: selectedId, memberId: circleMember.memberId }), "Member removed")}> <UserMinus className="mr-1 h-4 w-4" />Remove</Button>
            </div> : null}
          </div>)}</div></div>
          <div className="flex flex-wrap gap-2 border-t border-border pt-5">{selected.myRole === "owner" ? <Button variant="destructive" onClick={() => confirmAndRun("Close this circle? All members will lose future server access to its posts. Previously downloaded copies cannot be recalled.", () => close.mutateAsync({ circleId: selectedId }), "Circle closed")}>Close circle</Button> : <Button variant="outline" onClick={() => confirmAndRun("Leave this circle? You will no longer have server access to its posts, though downloaded copies cannot be recalled.", () => leave.mutateAsync({ circleId: selectedId }), "You left the circle")}><DoorOpen className="mr-2 h-4 w-4" />Leave circle</Button>}</div>
          <div className="border-t border-border pt-5"><h3 className="font-display text-2xl font-semibold">Share with {selected.name}</h3><p className="mt-1 text-sm text-muted-foreground">This update will be shared with: {selected.members.map((member) => member.preferredName).join(", ")}. Only current circle members can access it. Existing photo, audio, transcript, and moderation protections still apply.</p><div className="mt-4"><PostComposer circleId={selectedId} onSuccess={() => queryClient.invalidateQueries({ queryKey: getListCirclePostsQueryKey(selectedId) })} /></div>
            <div className="mt-5 space-y-4">{circlePosts.data?.items?.map((post) => <PostCard key={post.id} post={post} />) ?? <p className="text-muted-foreground">No circle posts yet.</p>}</div>
          </div>
        </div> : null}
      </section>}
    </div>
  );
}