import { useState } from "react";
import { getPreviewProfileAsFriendQueryKey, usePreviewProfileAsFriend } from "@workspace/api-client-react";
import { useAllFriends } from "@/hooks/use-all-friends";
import { Button } from "@/components/ui/button";

const LABELS: Record<string, string> = {
  preferredName: "Preferred name", photoPath: "Profile photo", biography: "Biography",
  language: "Language", broadRegion: "Broad region", interests: "Interests",
  dementiaConnection: "Connection to dementia", roles: "Roles",
};

export function FriendPrivacyPreview({ unsaved = false }: { unsaved?: boolean }) {
  const friends = useAllFriends();
  const [friendId, setFriendId] = useState("");
  const [offset, setOffset] = useState(0);
  const connected = !friends.isError && friends.data?.some((f) => f.memberId === friendId);
  const preview = usePreviewProfileAsFriend(friendId, { offset }, {
    query: {
      queryKey: getPreviewProfileAsFriendQueryKey(friendId, { offset }),
      enabled: !!connected, staleTime: 0, gcTime: 0, retry: false,
      refetchOnMount: "always", refetchOnWindowFocus: "always", refetchInterval: 15_000,
    },
  });
  // Never display a previous friend's/page's results, failed reads, or stale
  // success data while checking a connection that another session may revoke.
  const data = connected && !preview.isError && !preview.isFetching ? preview.data : undefined;
  const friend = friends.data?.find((f) => f.memberId === friendId);

  return (
    <section id="friend-preview" aria-labelledby="friend-preview-heading" className="rounded-2xl border border-border p-5 space-y-4">
      <h4 id="friend-preview-heading" className="text-xl font-semibold">Preview for a connected friend</h4>
      <p className="text-sm text-muted-foreground">
        This owner-only preview checks your saved settings, not unsaved edits. It does not sign in as your friend
        or show their content. Hidden posts are listed here only because they are yours.
      </p>
      {unsaved && <p role="status" className="font-medium">You have unsaved friend settings. Save them before checking the result.</p>}
      <label className="block space-y-2">
        <span>Choose a connected friend</span>
        <select className="block w-full rounded-lg border border-border bg-background p-3" value={friendId}
          disabled={friends.isLoading || friends.isError}
          onChange={(e) => { setFriendId(e.target.value); setOffset(0); }}>
          <option value="">Select a friend</option>
          {(friends.data ?? []).map((f) => <option key={f.memberId} value={f.memberId}>{f.preferredName}</option>)}
        </select>
      </label>
      {friends.isLoading && <p role="status">Loading friends…</p>}
      {friends.isError && <div role="alert">Could not load friends. <Button variant="outline" onClick={() => friends.refetch()}>Retry friends</Button></div>}
      {!friends.isLoading && !friends.isError && friends.data?.length === 0 && <p>No connected friends to preview yet.</p>}
      {friendId && !connected && !friends.isLoading && !friends.isError && <p role="alert">This person is no longer available as a connected friend. Choose another friend.</p>}
      {connected && <Button variant="outline" disabled={preview.isFetching} onClick={() => { friends.refetch(); preview.refetch(); }}>Refresh saved preview</Button>}
      {connected && preview.isFetching && <p role="status">Checking current visibility…</p>}
      {connected && preview.isError && <p role="alert">Preview unavailable. The connection may have been removed or blocked. Refresh your friends or try again.</p>}
      {data && (
        <div className="space-y-5" aria-live="polite">
          <p className="font-medium">What {friend?.preferredName ?? "this friend"} can access now</p>
          <p className="text-sm text-muted-foreground">Checked {new Date(data.checkedAt).toLocaleTimeString()}. Refreshes every 15 seconds while open. Later changes can change access.</p>
          <dl className="space-y-3">
            {data.fields.map((field) => (
              <div key={field.field}>
                <dt className="font-medium">{LABELS[field.field] ?? field.field}: {field.visible ? "Visible" : "Hidden"}</dt>
                {field.visible && <dd className="text-sm whitespace-pre-wrap break-words">
                  {field.field === "photoPath"
                    ? (field.value ? "Photo field is visible. Photo delivery is separately protected; this preview does not fetch media as your friend." : "No photo set")
                    : (Array.isArray(field.value) ? field.value.join(", ") : String(field.value ?? "Not set"))}
                </dd>}
              </div>
            ))}
          </dl>
          <h5 className="font-semibold">Your posts — visible and hidden</h5>
          <p className="text-sm text-muted-foreground">These are access permissions, not a copy of their feed. Feed preferences can hide otherwise visible posts. Attached media still requires its own safety and access checks.</p>
          {data.posts.length === 0 && <p>No posts on this page.</p>}
          {data.posts.map((post) => (
            <article key={post.id} className="border border-border rounded-xl p-4 space-y-2">
              <p className="font-medium">{post.visible ? "Visible" : "Hidden"} · {post.status} · {post.audience.replaceAll("_", " ")}</p>
              <p className="whitespace-pre-wrap break-words">{post.body ?? "Post text unavailable"}</p>
              {post.mediaCount > 0 && <p>{post.mediaCount} attached media item(s) — not loaded in this preview</p>}
              <ul className="text-sm flex flex-wrap gap-3">
                {(["view", "react", "comment", "share"] as const).map((action) => (
                  <li key={action}>{action === "share" ? "Share within Me" : action[0].toUpperCase() + action.slice(1)}: {post.permissions[action] ? "Allowed" : "Not allowed"}</li>
                ))}
              </ul>
            </article>
          ))}
          <div className="flex gap-3">
            <Button variant="outline" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 20))}>Previous posts</Button>
            <Button variant="outline" disabled={data.nextOffset == null} onClick={() => setOffset(data.nextOffset!)}>Next posts</Button>
          </div>
        </div>
      )}
      <p className="text-sm text-muted-foreground">
        Changing permissions cannot erase screenshots, downloads, manually copied content or copies already shared outside Me.
        In-app access and resharing use the current rules; this preview cannot guarantee what someone has previously kept.
      </p>
    </section>
  );
}
