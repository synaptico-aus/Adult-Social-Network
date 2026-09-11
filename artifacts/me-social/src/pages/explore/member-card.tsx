import { ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { ShieldAlert, UserPlus, UserMinus, UserCheck, Check, X, Clock, EyeOff } from "lucide-react";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  useCreateSafetyRelationship,
  useSendFriendRequest,
  useAcceptFriendRequest,
  useDeclineFriendRequest,
  useCancelFriendRequest,
  useUnfriend,
  useFollowMember,
  useUnfollowMember,
  useHideSuggestion,
  getSearchProfilesQueryKey,
  getListSuggestionsQueryKey,
  getListFriendRequestsQueryKey,
  getListFriendsQueryKey,
  getListFollowsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

export interface MemberCardProps {
  memberId: string;
  preferredName: string;
  subtitle?: ReactNode;
  
  isFriend?: boolean;
  isFollowing?: boolean;
  incomingRequestId?: string | null;
  outgoingRequestId?: string | null;
  
  suggestionReason?: string | null;
  
  onActionComplete?: () => void;
}

export function MemberCard({
  memberId,
  preferredName,
  subtitle,
  isFriend,
  isFollowing,
  incomingRequestId,
  outgoingRequestId,
  suggestionReason,
  onActionComplete
}: MemberCardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isBlockDialogOpen, setIsBlockDialogOpen] = useState(false);

  const sendRequest = useSendFriendRequest();
  const acceptRequest = useAcceptFriendRequest();
  const declineRequest = useDeclineFriendRequest();
  const cancelRequest = useCancelFriendRequest();
  const removeFriend = useUnfriend();
  const follow = useFollowMember();
  const unfollow = useUnfollowMember();
  const hideSuggestion = useHideSuggestion();
  const safety = useCreateSafetyRelationship();

  const isPending = 
    sendRequest.isPending || 
    acceptRequest.isPending || 
    declineRequest.isPending || 
    cancelRequest.isPending || 
    removeFriend.isPending || 
    follow.isPending || 
    unfollow.isPending ||
    hideSuggestion.isPending ||
    safety.isPending;

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: getSearchProfilesQueryKey() });
    queryClient.invalidateQueries({ queryKey: ['searchProfiles'] });
    queryClient.invalidateQueries({ queryKey: getListSuggestionsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListFriendRequestsQueryKey() });
    queryClient.invalidateQueries({ queryKey: ['listFriendRequestsPaginated'] });
    queryClient.invalidateQueries({ queryKey: getListFriendsQueryKey() });
    queryClient.invalidateQueries({ queryKey: ['listFriendsPaginated'] });
    queryClient.invalidateQueries({ queryKey: getListFollowsQueryKey() });
    queryClient.invalidateQueries({ queryKey: ['listFollowsPaginated'] });
    if (onActionComplete) onActionComplete();
  };

  const handleSendRequest = async () => {
    try {
      await sendRequest.mutateAsync({ data: { targetMemberId: memberId } });
      toast({ title: "Friend request sent" });
      invalidateAll();
    } catch (e: any) {
      toast({ title: "Failed to send request", description: e.message, variant: "destructive" });
    }
  };

  const handleAcceptRequest = async () => {
    if (!incomingRequestId) return;
    try {
      await acceptRequest.mutateAsync({ requestId: incomingRequestId });
      toast({ title: "Request accepted" });
      invalidateAll();
    } catch (e: any) {
      toast({ title: "Failed to accept request", description: e.message, variant: "destructive" });
    }
  };

  const handleDeclineRequest = async () => {
    if (!incomingRequestId) return;
    try {
      await declineRequest.mutateAsync({ requestId: incomingRequestId });
      toast({ title: "Request declined" });
      invalidateAll();
    } catch (e: any) {
      toast({ title: "Failed to decline request", description: e.message, variant: "destructive" });
    }
  };

  const handleCancelRequest = async () => {
    if (!outgoingRequestId) return;
    try {
      await cancelRequest.mutateAsync({ requestId: outgoingRequestId });
      toast({ title: "Request cancelled" });
      invalidateAll();
    } catch (e: any) {
      toast({ title: "Failed to cancel request", description: e.message, variant: "destructive" });
    }
  };

  const handleUnfriend = async () => {
    try {
      await removeFriend.mutateAsync({ memberId });
      toast({ title: "Removed from friends" });
      invalidateAll();
    } catch (e: any) {
      toast({ title: "Failed to unfriend", description: e.message, variant: "destructive" });
    }
  };

  const handleFollow = async () => {
    try {
      await follow.mutateAsync({ memberId });
      toast({ title: "Following member" });
      invalidateAll();
    } catch (e: any) {
      toast({ title: "Failed to follow", description: e.message, variant: "destructive" });
    }
  };

  const handleUnfollow = async () => {
    try {
      await unfollow.mutateAsync({ memberId });
      toast({ title: "Unfollowed member" });
      invalidateAll();
    } catch (e: any) {
      toast({ title: "Failed to unfollow", description: e.message, variant: "destructive" });
    }
  };

  const handleHideSuggestion = async () => {
    try {
      await hideSuggestion.mutateAsync({ memberId });
      toast({ title: "Suggestion hidden" });
      invalidateAll();
    } catch (e: any) {
      toast({ title: "Failed to hide suggestion", description: e.message, variant: "destructive" });
    }
  };

  const handleBlock = async () => {
    try {
      await safety.mutateAsync({ kind: "block", data: { targetMemberId: memberId } });
      toast({ title: "Member blocked" });
      setIsBlockDialogOpen(false);
      invalidateAll();
    } catch (e: any) {
      toast({ title: "Failed to block", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="bg-card border border-border p-5 md:p-6 rounded-[1.5rem] shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-5 transition-all">
      <div className="flex items-center gap-4 flex-1 min-w-0">
        <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center shrink-0 border border-secondary-border shadow-sm">
          <span className="font-display font-semibold text-2xl text-secondary-foreground">
            {preferredName.charAt(0).toUpperCase()}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="font-display font-semibold text-xl text-card-foreground truncate">{preferredName}</h4>
          {subtitle && (
            <p className="text-muted-foreground text-sm mt-1 line-clamp-2 leading-relaxed">{subtitle}</p>
          )}
          {suggestionReason && (
            <p className="text-primary/80 text-sm mt-1.5 font-medium">{suggestionReason}</p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 shrink-0">
        {incomingRequestId ? (
          <>
            <Button size="default" variant="default" onClick={handleAcceptRequest} disabled={isPending} className="rounded-xl h-11 px-5" data-testid={`button-accept-${memberId}`}>
              <Check className="w-4 h-4 mr-2" /> Accept
            </Button>
            <Button size="default" variant="outline" onClick={handleDeclineRequest} disabled={isPending} className="rounded-xl h-11 px-5" data-testid={`button-decline-${memberId}`}>
              <X className="w-4 h-4 mr-2" /> Decline
            </Button>
          </>
        ) : outgoingRequestId ? (
          <Button size="default" variant="secondary" onClick={handleCancelRequest} disabled={isPending} className="rounded-xl h-11 px-5" data-testid={`button-cancel-request-${memberId}`}>
            <Clock className="w-4 h-4 mr-2" /> Cancel Request
          </Button>
        ) : isFriend ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="default" variant="outline" disabled={isPending} className="rounded-xl h-11 px-5" data-testid={`button-friends-${memberId}`}>
                <UserCheck className="w-4 h-4 mr-2" /> Friends
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 p-2 rounded-xl">
              <DropdownMenuItem onClick={handleUnfriend} className="text-destructive focus:bg-destructive/10 rounded-lg cursor-pointer py-2.5" data-testid={`button-unfriend-${memberId}`}>
                <UserMinus className="w-4 h-4 mr-2" /> Unfriend
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button size="default" variant="default" onClick={handleSendRequest} disabled={isPending} className="rounded-xl h-11 px-5" data-testid={`button-add-friend-${memberId}`}>
            <UserPlus className="w-4 h-4 mr-2" /> Add Friend
          </Button>
        )}

        {isFollowing ? (
          <Button size="default" variant="outline" onClick={handleUnfollow} disabled={isPending} className="rounded-xl h-11 px-5" data-testid={`button-unfollow-${memberId}`}>
            Unfollow
          </Button>
        ) : (
          <Button size="default" variant="outline" onClick={handleFollow} disabled={isPending} className="rounded-xl h-11 px-5" data-testid={`button-follow-${memberId}`}>
            Follow
          </Button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="w-11 h-11 rounded-xl" disabled={isPending} data-testid={`button-more-${memberId}`}>
              <span className="sr-only">More options</span>
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-muted-foreground"><path d="M3.625 7.5C3.625 8.12132 3.12132 8.625 2.5 8.625C1.87868 8.625 1.375 8.12132 1.375 7.5C1.375 6.87868 1.87868 6.375 2.5 6.375C3.12132 6.375 3.625 6.87868 3.625 7.5ZM8.625 7.5C8.625 8.12132 8.12132 8.625 7.5 8.625C6.87868 8.625 6.375 8.12132 6.375 7.5C6.375 6.87868 6.87868 6.375 7.5 6.375C8.12132 6.375 8.625 6.87868 8.625 7.5ZM13.625 7.5C13.625 8.12132 13.1213 8.625 12.5 8.625C11.8787 8.625 11.375 8.12132 11.375 7.5C11.375 6.87868 11.8787 6.375 12.5 6.375C13.1213 6.375 13.625 6.87868 13.625 7.5Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"></path></svg>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 p-2 rounded-xl">
            {suggestionReason && (
              <DropdownMenuItem onClick={handleHideSuggestion} className="rounded-lg cursor-pointer py-2.5" data-testid={`button-hide-suggestion-${memberId}`}>
                <EyeOff className="w-4 h-4 mr-2" /> Hide Suggestion
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => setIsBlockDialogOpen(true)} className="text-destructive focus:bg-destructive/10 rounded-lg cursor-pointer py-2.5" data-testid={`button-block-${memberId}`}>
              <ShieldAlert className="w-4 h-4 mr-2" /> Block Member
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AlertDialog open={isBlockDialogOpen} onOpenChange={setIsBlockDialogOpen}>
        <AlertDialogContent className="rounded-[2rem]">
          <AlertDialogHeader>
            <AlertDialogTitle>Block {preferredName}?</AlertDialogTitle>
            <AlertDialogDescription className="text-base">
              Blocking someone removes all active connections and prevents them from finding or interacting with you. You can manage blocked members in your safety settings.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl h-11 px-6">Cancel</AlertDialogCancel>
            <Button variant="destructive" className="rounded-xl h-11 px-6" onClick={handleBlock} disabled={isPending} data-testid={`button-confirm-block-${memberId}`}>
              {isPending ? "Blocking..." : "Block Member"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}