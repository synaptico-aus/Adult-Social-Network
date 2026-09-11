import { Users, Loader2 } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { MemberCard } from "./member-card";
import { Button } from "@/components/ui/button";
import { 
  listFollows, 
  useListFriends 
} from "@workspace/api-client-react";
import { useInfiniteQuery } from "@tanstack/react-query";

export function FollowingTab() {
  const {
    data: infiniteFollows,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage
  } = useInfiniteQuery({
    queryKey: ['listFollowsPaginated'],
    queryFn: ({ pageParam }) => listFollows({ limit: 20, cursor: pageParam as string | undefined }),
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
    initialPageParam: undefined as string | undefined,
  });

  const { data: friends } = useListFriends();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12 text-muted-foreground">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const followItems = infiniteFollows?.pages.flatMap(page => page.items) || [];
  const friendItems = friends?.items ?? [];
  const following = followItems.filter(f => f.direction === "outgoing");
  const followers = followItems.filter(f => f.direction === "incoming");

  const isFriend = (id: string) => friendItems.some(f => f.memberId === id);

  if (following.length === 0 && followers.length === 0) {
    return (
      <EmptyState 
        icon={Users}
        title="No follows yet"
        description="People you follow and people who follow you will appear here."
      />
    );
  }

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      {following.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-xl font-display font-semibold">Following</h3>
          <div className="space-y-4">
            {following.map((follow) => (
              <MemberCard 
                key={follow.memberId}
                memberId={follow.memberId}
                preferredName={follow.preferredName}
                isFriend={isFriend(follow.memberId)}
                isFollowing={true}
                data-testid={`card-following-${follow.memberId}`}
              />
            ))}
          </div>
        </div>
      )}

      {followers.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-xl font-display font-semibold">Followers</h3>
          <div className="space-y-4">
            {followers.map((follower) => (
              <MemberCard 
                key={follower.memberId}
                memberId={follower.memberId}
                preferredName={follower.preferredName}
                isFriend={isFriend(follower.memberId)}
                isFollowing={following.some(f => f.memberId === follower.memberId)}
                data-testid={`card-follower-${follower.memberId}`}
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
            data-testid="button-load-more-follows"
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
  );
}