import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { Link } from "wouter";
import {
  useGetGroup,
  useListGroupPosts,
  useJoinGroup,
  useLeaveGroup,
  useCloseGroup,
  useMuteGroup,
  useUnmuteGroup,
  useListOwnGroupMembershipRequests,
  getGetGroupQueryKey,
  getListGroupPostsQueryKey,
  getListOwnGroupMembershipRequestsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Loader2, Users, Shield, ShieldCheck, Lock, Globe, Share2, FileText, AlertCircle, EyeOff, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { PostCard } from "@/components/posts/post-card";
import { PostComposer } from "@/components/posts/post-composer";
import { PageHeader } from "@/components/shared/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GroupResources } from "@/components/groups/group-resources";
import { GroupRoster } from "@/components/groups/group-roster";
import { GroupRequests } from "@/components/groups/group-requests";
import { GroupWelcomeMember, GroupWelcomeQueue } from "@/components/groups/group-welcome";
import { GroupHosts } from "@/components/groups/group-hosts";
import { ReportGroupDialog } from "@/components/groups/report-group-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Flag } from "lucide-react";

export default function GroupDetailPage() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const groupQuery = useGetGroup(id!, { query: { queryKey: getGetGroupQueryKey(id!) } });
  const postsQuery = useListGroupPosts(id!, { query: { queryKey: getListGroupPostsQueryKey(id!), enabled: !!id } });

  const joinGroup = useJoinGroup();
  const leaveGroup = useLeaveGroup();
  const closeGroupMutation = useCloseGroup();
  const muteGroup = useMuteGroup();
  const unmuteGroup = useUnmuteGroup();

  const ownRequestsQuery = useListOwnGroupMembershipRequests({
    query: { queryKey: getListOwnGroupMembershipRequestsQueryKey() }
  });

  const group = groupQuery.data;
  const myRole = group ? (group as any).myRole : null;
  const isMember = !!myRole;
  const isMod = myRole === "owner" || myRole === "moderator";
  const isOwner = myRole === "owner";

  const pendingRequest = ownRequestsQuery.data?.find(r => r.groupId === id && r.status === "pending");

  const [reportOpen, setReportOpen] = useState(false);

  const handleMute = async (mute: boolean) => {
    try {
      if (mute) {
        await muteGroup.mutateAsync({ groupId: id! });
        toast({ title: "Group muted" });
      } else {
        await unmuteGroup.mutateAsync({ groupId: id! });
        toast({ title: "Group unmuted" });
      }
      queryClient.invalidateQueries({ queryKey: getGetGroupQueryKey(id!) });
    } catch (e) {
      toast({ title: "Could not change mute status", variant: "destructive" });
    }
  };

  const handleClose = async () => {
    if (!window.confirm("Are you sure you want to close this group? New members will not be able to join, and no new posts can be made.")) return;
    try {
      await closeGroupMutation.mutateAsync({ groupId: id! });
      toast({ title: "Group closed" });
      queryClient.invalidateQueries({ queryKey: getGetGroupQueryKey(id!) });
    } catch (e) {
      toast({ title: "Could not close group", variant: "destructive" });
    }
  };

  const handleJoin = async () => {
    try {
      const res = await joinGroup.mutateAsync({ groupId: id! });
      if ('status' in res && res.status === 'pending') {
        toast({ title: "Request sent", description: "Your request to join is pending approval." });
        queryClient.invalidateQueries({ queryKey: getListOwnGroupMembershipRequestsQueryKey() });
      } else {
        toast({ title: "Joined group" });
        queryClient.invalidateQueries({ queryKey: getGetGroupQueryKey(id!) });
        queryClient.invalidateQueries({ queryKey: getListGroupPostsQueryKey(id!) });
      }
    } catch (e: any) {
      toast({ title: "Could not join group", description: e.message, variant: "destructive" });
    }
  };

  const handleLeave = async () => {
    if (!window.confirm("Are you sure you want to leave this group?")) return;
    try {
      await leaveGroup.mutateAsync({ groupId: id! });
      toast({ title: "Left group" });
      queryClient.invalidateQueries({ queryKey: getGetGroupQueryKey(id!) });
    } catch (e) {
      toast({ title: "Could not leave group", variant: "destructive" });
    }
  };

  if (groupQuery.isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  if (groupQuery.isError || !group) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertCircle className="w-12 h-12 text-destructive mb-4" />
        <h2 className="font-display text-2xl font-bold">Group not found</h2>
        <p className="text-muted-foreground mt-2 mb-6">This group may be private, closed, or deleted.</p>
        <Button onClick={() => setLocation("/groups")}>Back to Groups</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 animate-in fade-in duration-500">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-4 mb-4 text-muted-foreground hover:text-foreground">
          <Link href="/groups">
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back to Groups
          </Link>
        </Button>

        <div className="bg-card border border-border rounded-3xl p-6 md:p-10 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="bg-secondary text-secondary-foreground text-xs font-semibold px-3 py-1 rounded-full uppercase tracking-wider">
                  {group.category}
                </span>
                {group.status === "closed" && (
                  <span className="bg-destructive/10 text-destructive text-xs font-semibold px-3 py-1 rounded-full uppercase tracking-wider">
                    Closed
                  </span>
                )}
              </div>
              <h1 className="font-display text-3xl md:text-5xl font-bold break-words">{group.name}</h1>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 shrink-0">
              {isMember ? (
                <>
                  {isOwner && group.status !== "closed" ? (
                    <Button variant="outline" className="rounded-xl font-semibold text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/20" onClick={handleClose} disabled={closeGroupMutation.isPending}>
                      {closeGroupMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                      Close Group
                    </Button>
                  ) : !isOwner ? (
                    <Button variant="outline" className="rounded-xl font-semibold text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/20" onClick={handleLeave}>
                      Leave Group
                    </Button>
                  ) : null}
                </>
              ) : group.status === "active" && group.joinPolicy !== "closed" ? (
                pendingRequest ? (
                  <div className="bg-secondary/50 text-secondary-foreground font-semibold px-5 py-2.5 rounded-xl border border-secondary-border">
                    Request pending
                  </div>
                ) : (
                  <Button className="rounded-xl font-semibold" size="lg" onClick={handleJoin} disabled={joinGroup.isPending}>
                    {joinGroup.isPending && <Loader2 className="w-5 h-5 mr-2 animate-spin" />}
                    {group.joinPolicy === "approval" ? "Request to Join" : "Join Group"}
                  </Button>
                )
              ) : null}

              {!isOwner && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="shrink-0 rounded-xl">
                      <MoreHorizontal className="w-5 h-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48 rounded-xl">
                    {isMember && (
                      <>
                        {!(group as any).myMuted ? (
                          <DropdownMenuItem onClick={() => handleMute(true)} className="cursor-pointer py-3">
                            Mute Group
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => handleMute(false)} className="cursor-pointer py-3">
                            Unmute Group
                          </DropdownMenuItem>
                        )}
                      </>
                    )}
                    <DropdownMenuItem onClick={() => setReportOpen(true)} className="text-destructive focus:bg-destructive/10 cursor-pointer py-3">
                      <Flag className="w-4 h-4 mr-2" />
                      Report Group
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>

          {group.description && (
            <p className="text-lg text-foreground/80 leading-relaxed max-w-3xl mb-8">
              {group.description}
            </p>
          )}

          <div className="grid grid-cols-2 md:flex md:flex-wrap gap-x-8 gap-y-4 text-sm text-muted-foreground pt-6 border-t border-border/50">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary/60" />
              <span className="font-medium text-foreground">{group.memberCount} members</span>
            </div>
            <div className="flex items-center gap-2">
              {group.discoverability === "public" ? <Globe className="w-5 h-5 text-primary/60" /> : <EyeOff className="w-5 h-5 text-primary/60" />}
              <span>{group.discoverability === "public" ? "Publicly discoverable" : "Private discovery"}</span>
            </div>
            <div className="flex items-center gap-2">
              {group.contentVisibility === "public" ? <Globe className="w-5 h-5 text-primary/60" /> : <Lock className="w-5 h-5 text-primary/60" />}
              <span>{group.contentVisibility === "public" ? "Public content" : "Members-only content"}</span>
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-primary/60" />
              <span>
                {group.joinPolicy === "open" ? "Open to join" : group.joinPolicy === "approval" ? "Requires approval" : "Closed to joining"}
              </span>
            </div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="posts" className="w-full">
        <TabsList className="w-full justify-start h-auto p-1 bg-secondary/20 rounded-2xl overflow-x-auto flex-nowrap mb-6 hide-scrollbar">
          <TabsTrigger value="posts" className="rounded-xl px-5 py-2.5 text-base data-[state=active]:bg-card data-[state=active]:shadow-sm">Posts</TabsTrigger>
          <TabsTrigger value="resources" className="rounded-xl px-5 py-2.5 text-base data-[state=active]:bg-card data-[state=active]:shadow-sm">Resources</TabsTrigger>
          {isMember && group.welcomeEnabled && (
            <TabsTrigger value="welcome" className="rounded-xl px-5 py-2.5 text-base data-[state=active]:bg-card data-[state=active]:shadow-sm">Welcome</TabsTrigger>
          )}
          {isMod && (
            <TabsTrigger value="members" className="rounded-xl px-5 py-2.5 text-base data-[state=active]:bg-card data-[state=active]:shadow-sm">Members & Requests</TabsTrigger>
          )}
        </TabsList>

        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <TabsContent value="posts" className="m-0 space-y-6">
              {(isMember || group.contentVisibility === "public") ? (
                <>
                  {isMember && (
                    <div className="mb-8">
                      <PostComposer groupId={group.id} onSuccess={() => queryClient.invalidateQueries({ queryKey: getListGroupPostsQueryKey(id!) })} />
                    </div>
                  )}

                  <div className="space-y-6">
                    <h3 className="font-display text-2xl font-bold mb-4">Latest Updates</h3>
                    {postsQuery.isLoading ? (
                      <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
                    ) : postsQuery.data?.items?.length ? (
                      postsQuery.data.items.map(post => (
                        <PostCard key={post.id} post={post} />
                      ))
                    ) : (
                      <div className="text-center py-12 bg-card rounded-3xl border border-dashed border-border text-muted-foreground">
                        No posts yet. Be the first to start the conversation!
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-center py-16 bg-card rounded-3xl border border-border shadow-sm text-muted-foreground flex flex-col items-center">
                  <Lock className="w-12 h-12 mb-4 opacity-50" />
                  <h3 className="font-display text-xl font-bold text-foreground mb-2">Members-only content</h3>
                  <p>Join this group to see and participate in the conversation.</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="resources" className="m-0">
              <GroupResources groupId={group.id} isMod={isMod} />
            </TabsContent>

            {isMember && group.welcomeEnabled && (
              <TabsContent value="welcome" className="m-0 space-y-8">
                <GroupWelcomeMember groupId={group.id} availabilityText={group.welcomeAvailabilityText} />
                <div className="pt-8 border-t border-border">
                  <GroupWelcomeQueue groupId={group.id} />
                </div>
              </TabsContent>
            )}

            {isMod && (
              <TabsContent value="members" className="m-0 space-y-10">
                {group.joinPolicy === "approval" && (
                  <div>
                    <h3 className="font-display text-2xl font-bold mb-4">Pending Requests</h3>
                    <GroupRequests groupId={group.id} />
                  </div>
                )}
                {group.welcomeEnabled && (
                  <div className="pt-2 border-t border-border/50">
                    <h3 className="font-display text-2xl font-bold mb-4">Host Management</h3>
                    <GroupHosts groupId={group.id} members={(group as any).members} />
                  </div>
                )}
                <div className="pt-2 border-t border-border/50">
                  <h3 className="font-display text-2xl font-bold mb-4">Group Roster</h3>
                  <GroupRoster group={group} isOwner={isOwner} />
                </div>
              </TabsContent>
            )}
          </div>

          <div className="space-y-6">
            {group.rules && (
              <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 p-6 rounded-3xl">
                <h3 className="font-display text-xl font-bold text-amber-900 dark:text-amber-100 mb-3 flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  Group Rules
                </h3>
                <div className="text-amber-800 dark:text-amber-200/80 whitespace-pre-wrap leading-relaxed text-sm">
                  {group.rules}
                </div>
              </div>
            )}
          </div>
        </div>
      </Tabs>

      <ReportGroupDialog
        isOpen={reportOpen}
        onOpenChange={setReportOpen}
        groupId={group.id}
      />
    </div>
  );
}
