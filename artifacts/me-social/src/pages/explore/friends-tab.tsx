import { Users, Loader2 } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { MemberCard } from "./member-card";
import { Button } from "@/components/ui/button";
import { 
  listFriends,
  useListFollows
} from "@workspace/api-client-react";
import { useInfiniteQuery } from "@tanstack/react-query";

export function FriendsTab() {
  const {
    data: infiniteFriends,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage
  } = useInfiniteQuery({
    queryKey: ['listFriendsPaginated'],
    queryFn: ({ pageParam }) => listFriends({ limit: 20, cursor: pageParam as string | undefined }),
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
    initialPageParam: undefined as string | undefined,
  });

  const { data: follows } = useListFollows();
  const isFollowing = (id: string) => follows?.items.some(f => f.memberId === id && f.direction === "outgoing") || false;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12 text-muted-foreground">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const items = infiniteFriends?.pages.flatMap(page => page.items) || [];
  if (items.length === 0) {
    return (
      <EmptyState 
        icon={Users}
        title="No friends yet"
        description="When you connect with other members, they will appear here."
      />
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="space-y-4">
        {items.map((friend) => (
          <MemberCard 
            key={friend.memberId}
            memberId={friend.memberId}
            preferredName={friend.preferredName}
            subtitle={`Friends since ${new Date(friend.createdAt).toLocaleDateString()}`}
            isFriend={true}
            isFollowing={isFollowing(friend.memberId)}
            data-testid={`card-friend-${friend.memberId}`}
          />
        ))}
        {hasNextPage && (
          <div className="pt-4 flex justify-center">
            <Button 
              variant="outline" 
              onClick={() => fetchNextPage()} 
              disabled={isFetchingNextPage}
              className="rounded-xl px-8"
              data-testid="button-load-more-friends"
            >
              {isFetchingNextPage ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading...</>
              ) : (
                "Load More"
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}