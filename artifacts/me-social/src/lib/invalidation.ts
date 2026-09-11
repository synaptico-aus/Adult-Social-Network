import { QueryClient } from "@tanstack/react-query";
import { 
  getGetFeedQueryKey,
  getListOwnPostsQueryKey,
  getListSavedPostsQueryKey,
  getListNotificationEventsQueryKey,
  getGetPostQueryKey,
  getListPostCommentsQueryKey
} from "@workspace/api-client-react";

export function invalidatePhase6(queryClient: QueryClient, postId?: string) {
  // Invalidate all feed variants
  queryClient.invalidateQueries({ queryKey: getGetFeedQueryKey() });
  
  // Invalidate all own-post variants
  queryClient.invalidateQueries({ queryKey: getListOwnPostsQueryKey() });
  
  // Invalidate all saved variants
  queryClient.invalidateQueries({ queryKey: getListSavedPostsQueryKey() });
  
  // Invalidate notifications
  queryClient.invalidateQueries({ queryKey: getListNotificationEventsQueryKey() });

  if (postId) {
    // Invalidate detail view
    queryClient.invalidateQueries({ queryKey: getGetPostQueryKey(postId) });
    // Invalidate comments
    queryClient.invalidateQueries({ queryKey: getListPostCommentsQueryKey(postId) });
  }
}
