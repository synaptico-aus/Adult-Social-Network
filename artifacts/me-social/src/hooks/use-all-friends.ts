import { useQuery } from "@tanstack/react-query";
import { listFriends, FriendListItem } from "@workspace/api-client-react";

export const ALL_FRIENDS_KEY = ["all-friends"] as const;

export async function fetchAllFriends(): Promise<FriendListItem[]> {
  const all: FriendListItem[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 200; i++) {
    const page = await listFriends({ limit: 50, ...(cursor ? { cursor } : {}) });
    all.push(...page.items);
    if (!page.nextCursor) return all;
    cursor = page.nextCursor;
  }
  throw new Error("Too many friend pages");
}

export function useAllFriends() {
  return useQuery({ queryKey: ALL_FRIENDS_KEY, queryFn: fetchAllFriends, staleTime: 30_000, refetchOnMount: "always" });
}
