import { useState, useEffect, useRef } from "react";
import { Search, Loader2, Sparkles, AlertCircle, SearchX } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { MemberCard } from "./member-card";
import { 
  searchProfiles,
  useListSuggestions, getListSuggestionsQueryKey,
  useGetAccountSettings, getGetAccountSettingsQueryKey,
  useListFriends, useListFollows, useListFriendRequests
} from "@workspace/api-client-react";
import { useInfiniteQuery } from "@tanstack/react-query";

export function DiscoverTab() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (query.trim().length >= 2) {
      timerRef.current = setTimeout(() => {
        setDebouncedQuery(query.trim());
      }, 500);
    } else {
      setDebouncedQuery("");
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query]);

  const { data: settings } = useGetAccountSettings({
    query: { queryKey: getGetAccountSettingsQueryKey() }
  });

  const { data: suggestions, isLoading: isLoadingSuggestions } = useListSuggestions({
    query: { 
      queryKey: getListSuggestionsQueryKey(),
      enabled: !!settings?.suggestionsEnabled
    }
  });

  const {
    data: infiniteSearchData,
    isLoading: isLoadingSearch,
    isError: isSearchError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage
  } = useInfiniteQuery({
    queryKey: ['searchProfiles', debouncedQuery],
    queryFn: ({ pageParam }) => searchProfiles({ q: debouncedQuery, limit: 20, cursor: pageParam as string | undefined }),
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
    initialPageParam: undefined as string | undefined,
    enabled: debouncedQuery.length >= 2
  });

  const searchItems = infiniteSearchData?.pages.flatMap(page => page.items) || [];

  const { data: friends } = useListFriends();
  const { data: follows } = useListFollows();
  const { data: friendRequests } = useListFriendRequests();

  const isFriend = (id: string) => friends?.items.some(f => f.memberId === id) || false;
  const isFollowing = (id: string) => follows?.items.some(f => f.memberId === id && f.direction === "outgoing") || false;
  
  const getIncomingRequest = (id: string) => friendRequests?.incoming.find(r => r.requesterMemberId === id)?.id;
  const getOutgoingRequest = (id: string) => friendRequests?.outgoing.find(r => r.recipientMemberId === id)?.id;

  const showSuggestions = !debouncedQuery && settings?.suggestionsEnabled && suggestions && suggestions.length > 0;
  const showEmptySuggestions = !debouncedQuery && settings?.suggestionsEnabled && suggestions && suggestions.length === 0;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="bg-card border border-border p-6 rounded-[2rem] shadow-sm">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-muted-foreground" />
          <Input 
            type="search"
            placeholder="Search members by name or interests..."
            className="w-full ps-12 pe-4 h-14 text-lg rounded-2xl bg-secondary/30 border-secondary-border focus-visible:ring-primary focus-visible:border-primary"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            data-testid="input-search-members"
          />
        </div>
        <p className="text-sm text-muted-foreground mt-3 ms-2">
          Only members who have chosen to be discoverable will appear in search results.
        </p>
      </div>

      {debouncedQuery.length > 0 ? (
        <div className="space-y-6">
          <h3 className="text-xl font-display font-semibold">Search Results</h3>
          
          {isLoadingSearch ? (
            <div className="flex items-center justify-center p-12 text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : isSearchError ? (
            <EmptyState icon={AlertCircle} title="Search Error" description="There was a problem performing the search. Please try again." />
          ) : searchItems.length === 0 ? (
            <EmptyState icon={SearchX} title="No members found" description="Try adjusting your search terms." />
          ) : (
            <div className="space-y-4">
              {searchItems.map((item) => (
                <MemberCard 
                  key={item.memberId}
                  memberId={item.memberId}
                  preferredName={item.profile.preferredName}
                  subtitle={item.profile.biography}
                  isFriend={item.relationship === 'friends'}
                  isFollowing={item.isFollowing}
                  incomingRequestId={item.request === 'incoming' ? item.pendingRequestId : null}
                  outgoingRequestId={item.request === 'outgoing' ? item.pendingRequestId : null}
                  data-testid={`card-search-${item.memberId}`}
                />
              ))}
              {hasNextPage && (
                <div className="pt-4 flex justify-center">
                  <Button 
                    variant="outline" 
                    onClick={() => fetchNextPage()} 
                    disabled={isFetchingNextPage}
                    className="rounded-xl px-8"
                    data-testid="button-load-more-search"
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
          )}
        </div>
      ) : showSuggestions ? (
        <div className="space-y-6">
          <h3 className="text-xl font-display font-semibold flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" /> Suggested Members
          </h3>
          <div className="space-y-4">
            {suggestions.map((suggestion) => (
              <MemberCard 
                key={suggestion.memberId}
                memberId={suggestion.memberId}
                preferredName={suggestion.preferredName}
                suggestionReason={suggestion.explanation}
                isFriend={isFriend(suggestion.memberId)}
                isFollowing={isFollowing(suggestion.memberId)}
                incomingRequestId={getIncomingRequest(suggestion.memberId)}
                outgoingRequestId={getOutgoingRequest(suggestion.memberId)}
                data-testid={`card-suggestion-${suggestion.memberId}`}
              />
            ))}
          </div>
        </div>
      ) : showEmptySuggestions ? (
         <div className="bg-card border border-border p-8 text-center rounded-[2rem] shadow-sm">
           <Sparkles className="w-10 h-10 text-muted-foreground mx-auto mb-4 opacity-50" />
           <h3 className="text-xl font-semibold mb-2">No suggestions right now</h3>
           <p className="text-muted-foreground">Check back later or try searching for people.</p>
         </div>
      ) : null}

      {!debouncedQuery && !settings?.suggestionsEnabled && (
        <div className="bg-card border border-border p-8 text-center rounded-[2rem] shadow-sm">
           <h3 className="text-xl font-semibold mb-2">Suggestions are turned off</h3>
           <p className="text-muted-foreground">You can enable them in your Connection Settings to see recommended members.</p>
        </div>
      )}
    </div>
  );
}