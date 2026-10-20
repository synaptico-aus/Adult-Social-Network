import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Users } from "lucide-react";
import {
  useUpdatePrivacySettings, getGetOwnProfileQueryKey, getGetFeedQueryKey,
  getListOwnPostsQueryKey, getListSavedPostsQueryKey,
  type Profile, type FriendPermissionMap, type PrivacySettings,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAllFriends } from "@/hooks/use-all-friends";
import { FriendPermissionRows } from "./friend-permission-rows";

const FIELDS: Record<string, string> = {
  preferredName: "Preferred Name", photoPath: "Profile Photo", biography: "Biography", language: "Language",
  broadRegion: "Broad Region", interests: "Interests", dementiaConnection: "Connection to Dementia", roles: "Roles",
};

export function FriendSettingsSection({ profile }: { profile?: Profile }) {
  const visibility = (profile?.visibility ?? {}) as Record<string, string>;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: friends, isLoading, isError, refetch } = useAllFriends();
  const update = useUpdatePrivacySettings();
  const [perms, setPerms] = useState<FriendPermissionMap>({});
  const [selected, setSelected] = useState<Record<string, string[] | null>>({});
  const [saveError, setSaveError] = useState(false);
  const [permsDirty, setPermsDirty] = useState(false);
  const [selDirty, setSelDirty] = useState(false);
  const accountId = profile?.memberId ?? null;

  const savedPerms = profile?.friendPermissions;
  const savedSel = profile?.selectedFriends;
  useEffect(() => { setPermsDirty(false); setSelDirty(false); }, [accountId]);
  useEffect(() => { if (!permsDirty) setPerms({ ...(savedPerms ?? {}) }); }, [savedPerms, permsDirty, accountId]);
  useEffect(() => { if (!selDirty) setSelected({ ...(savedSel ?? {}) }); }, [savedSel, selDirty, accountId]);

  const list = friends ?? [];
  const shownIds = new Set(list.map((f) => f.memberId));

  const toggleFriend = (field: string, id: string, on: boolean) => {
    setSelDirty(true);
    setSelected((s) => {
      const cur = s[field] ?? [];
      return { ...s, [field]: on ? Array.from(new Set([...cur, id])) : cur.filter((x) => x !== id) };
    });
  };

  const save = async () => {
    setSaveError(false);
    try {
      // Full maps are sent so saved entries for friends not shown (e.g. disconnected) are preserved.
      const data: PrivacySettings = {};
      if (permsDirty) data.friendPermissions = perms;
      if (selDirty) {
        data.selectedFriends = selected;
        // Newly enabled selections need connections visibility; send it in the same request.
        const enabling = Object.keys(FIELDS).filter((f) => Array.isArray(selected[f]) && !Array.isArray(savedSel?.[f]) && visibility[f] !== "connections");
        if (enabling.length > 0) {
          data.visibility = { ...visibility, ...Object.fromEntries(enabling.map((f) => [f, "connections"])) } as PrivacySettings["visibility"];
        }
      }
      if (Object.keys(data).length === 0) { toast({ title: "No changes to save" }); return; }
      await update.mutateAsync({ data });
      setPermsDirty(false);
      setSelDirty(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetOwnProfileQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetFeedQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getListOwnPostsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getListSavedPostsQueryKey() }),
      ]);
      toast({ title: "Friend settings saved" });
    } catch {
      setSaveError(true);
      toast({ title: "Friend settings not saved", description: "Nothing was changed. Please try again.", variant: "destructive" });
    }
  };

  return (
    <section className="bg-card border border-border p-8 md:p-10 rounded-[2rem] shadow-sm space-y-8" aria-labelledby="friend-settings-h">
      <div>
        <h3 id="friend-settings-h" className="text-2xl font-display font-semibold flex items-center gap-3 mb-3">
          <Users className="w-6 h-6 text-primary" /> Friend-Specific Settings
        </h3>
        <p className="text-muted-foreground leading-relaxed">
          These apply on top of your existing audience choices. They can only narrow who sees or does something, never widen it.
          Changes also apply to existing posts. Share controls prevent resharing within Me, not screenshots or manually copied content.
        </p>
      </div>

      {isLoading && <div className="flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" aria-label="Loading friends" /></div>}
      {isError && (
        <div role="alert" className="p-4 rounded-xl border border-destructive/40 text-sm flex items-center justify-between gap-4">
          Could not load your friends.
          <Button variant="outline" size="sm" onClick={() => refetch()}>Retry</Button>
        </div>
      )}

      {friends && (
        <>
          <div className="space-y-3">
            <h4 className="text-xl font-semibold">Defaults for each friend</h4>
            <p className="text-sm text-muted-foreground">Choose what each friend can do with your posts. Individual posts can restrict further.</p>
            <FriendPermissionRows friends={list} value={perms} onChange={(n) => { setPermsDirty(true); setPerms(n); }} idPrefix="default" disabled={update.isPending} />
          </div>

          <div className="space-y-4">
            <h4 className="text-xl font-semibold">Profile fields: selected friends</h4>
            <p className="text-sm text-muted-foreground">
              The audience above (Only Me, My Connections, All Members) is the broad audience. Selecting friends is an additional restriction. Enabling it saves that field as My Connections in the same request.
            </p>
            {Object.entries(FIELDS).map(([field, label]) => {
              const sel = selected[field];
              const restricted = Array.isArray(sel);
              const canUse = visibility[field] === "connections";
              const extra = restricted ? sel!.filter((id) => !shownIds.has(id)).length : 0;
              return (
                <fieldset key={field} className="rounded-xl border border-border/50 bg-secondary/10 p-4" data-testid={`fieldset-selected-${field}`}>
                  <legend className="font-medium px-1">{label}</legend>
                  <label className="flex items-center gap-2 text-sm mb-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[hsl(var(--primary))]"
                      checked={restricted}
                      disabled={update.isPending}
                      onChange={(e) => { setSelDirty(true); setSelected((s) => ({ ...s, [field]: e.target.checked ? (s[field] ?? []) : null })); }}
                    />
                    Only selected friends
                  </label>
                  {restricted && !canUse && (
                    <p className="text-xs text-muted-foreground mb-2">Saved audience is {visibility[field] === "members" ? "All Members" : "Only Me"}. Saving will set this field to My Connections so the selection applies.</p>
                  )}
                  {restricted && (
                    <div className="flex flex-wrap gap-x-5 gap-y-2">
                      {list.map((f) => (
                        <label key={f.memberId} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-[hsl(var(--primary))]"
                            checked={sel!.includes(f.memberId)}
                            disabled={update.isPending}
                            onChange={(e) => toggleFriend(field, f.memberId, e.target.checked)}
                          />
                          {f.preferredName}
                        </label>
                      ))}
                      {list.length === 0 && <span className="text-sm text-muted-foreground">No connected friends.</span>}
                      {extra > 0 && <span className="text-xs text-muted-foreground">{extra} saved selection(s) for people no longer shown are kept.</span>}
                    </div>
                  )}
                </fieldset>
              );
            })}
          </div>

          {saveError && <p role="alert" className="text-sm text-destructive">Could not save friend settings. Please try again.</p>}
          <div className="pt-4 border-t border-border flex justify-end">
            <Button onClick={save} disabled={update.isPending} size="lg" className="rounded-xl px-8" data-testid="button-save-friend-settings">
              {update.isPending ? "Saving..." : "Save Friend Settings"}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
