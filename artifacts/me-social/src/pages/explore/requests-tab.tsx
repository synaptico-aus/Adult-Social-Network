import { Clock, Inbox, Loader2 } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { MemberCard } from "./member-card";
import { Button } from "@/components/ui/button";
import { 
  listFriendRequests,
  useListFriends, 
  useListFollows 
} from "@workspace/api-client-react";
import { useInfiniteQuery } from "@tanstack/react-query";

export function RequestsTab() {
  const {
    data: infiniteRequests,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage
  } = useInfiniteQuery({
    queryKey: ['listFriendRequestsPaginated'],
    queryFn: ({ pageParam }) => listFriendRequests({ limit: 20, cursor: pageParam as string | undefined }),
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
    initialPageParam: undefined as string | undefined,
  });

  const { data: follows } = useListFollows();
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12 text-muted-foreground">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const incoming = infiniteRequests?.pages.flatMap(page => page.incoming || []) || [];
  const outgoing = infiniteRequests?.pages.flatMap(page => page.outgoing || []) || [];

  const isFollowing = (id: string) => follows?.items.some(f => f.memberId === id && f.direction === "outgoing") || false;

  if (incoming.length === 0 && outgoing.length === 0) {
    return (
      <EmptyState 
        icon={Inbox}
        title="No pending requests"
        description="You have no incoming or outgoing friend requests."
      />
    );
  }

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      {incoming.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-xl font-display font-semibold flex items-center gap-2">
            Incoming Requests
          </h3>
          <div className="space-y-4">
            {incoming.map((req) => (
              <MemberCard 
                key={req.id}
                memberId={req.requesterMemberId}
                preferredName={req.profile?.preferredName || "Unknown Member"}
                subtitle="Sent you a friend request"
                incomingRequestId={req.id}
                isFriend={false}
                isFollowing={isFollowing(req.requesterMemberId)}
                data-testid={`card-request-in-${req.requesterMemberId}`}
              />
            ))}
          </div>
        </div>
      )}

      {outgoing.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-xl font-display font-semibold flex items-center gap-2">
            <Clock className="w-5 h-5 text-muted-foreground" /> Sent Requests
          </h3>
          <div className="space-y-4">
            {outgoing.map((req) => (
              <MemberCard 
                key={req.id}
                memberId={req.recipientMemberId}
                preferredName={req.profile?.preferredName || "Unknown Member"}
                subtitle="Request pending"
                outgoingRequestId={req.id}
                isFriend={false}
                isFollowing={isFollowing(req.recipientMemberId)}
                data-testid={`card-request-out-${req.recipientMemberId}`}
              />
            ))}
          </div>
        </div>
      )}
      
      {hasNextPage && (
        <div className="pt-4 flex justify-center">
          <Button 
            variant="outline" 
            onClick={() => fetchNextPage()} 
            disabled={isFetchingNextPage}
            className="rounded-xl px-8"
            data-testid="button-load-more-requests"
          >
            {isFetchingNextPage ? (
              <><Loader2 className="w-4 h-4 me-2 animate-spin" /> Loading...</>
            ) : (
              "Load More"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}