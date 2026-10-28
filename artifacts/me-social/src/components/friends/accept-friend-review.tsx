import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getOwnProfile, useAcceptFriendRequest, getGetOwnProfileQueryKey,
  getGetFeedQueryKey, getListOwnPostsQueryKey, getListSavedPostsQueryKey,
  type InteractionPermissions,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { FriendPermissionRows, ALL_ALLOWED } from "./friend-permission-rows";
import { ALL_FRIENDS_KEY } from "@/hooks/use-all-friends";
import { useToast } from "@/hooks/use-toast";

interface Props {
  requestId: string;
  memberId: string;
  preferredName: string;
  onClose: () => void;
  onAccepted: () => void;
}

// Mounted afresh for each review; never initialize from a stale profile cache.
export function AcceptFriendReview({ requestId, memberId, preferredName, onClose, onAccepted }: Props) {
  const [initial, setInitial] = useState<InteractionPermissions>();
  const [choices, setChoices] = useState<InteractionPermissions>();
  const [loadError, setLoadError] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [reload, setReload] = useState(0);
  const accept = useAcceptFriendRequest();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    let active = true;
    setInitial(undefined);
    setChoices(undefined);
    setLoadError(false);
    setSaveError(false);
    getOwnProfile().then((profile) => {
      if (!active) return;
      const saved = profile.friendPermissions?.[memberId] ?? ALL_ALLOWED;
      setInitial({ ...saved });
      setChoices({ ...saved });
    }).catch(() => { if (active) setLoadError(true); });
    return () => { active = false; };
  }, [memberId, reload]);

  async function confirm() {
    if (!initial || !choices) return;
    setSaveError(false);
    try {
      await accept.mutateAsync({ requestId, data: { permissions: choices, expectedPermissions: initial } });
    } catch {
      setSaveError(true);
      return;
    }
    // Do not report a failed cache refresh as a failed acceptance.
    for (const queryKey of [
      ALL_FRIENDS_KEY, getGetOwnProfileQueryKey(), getGetFeedQueryKey(),
      getListOwnPostsQueryKey(), getListSavedPostsQueryKey(),
    ]) void queryClient.invalidateQueries({ queryKey });
    toast({ title: "Friend accepted and privacy choices saved" });
    onAccepted();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !accept.isPending) onClose(); }}>
      <DialogContent className="rounded-[2rem] max-h-[90dvh] overflow-y-auto" data-testid="dialog-accept-friend-review">
        <DialogHeader>
          <DialogTitle>Review privacy before accepting {preferredName}</DialogTitle>
          <DialogDescription>
            Accepting makes you friends. Review what this person can see and do before you connect.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm leading-relaxed">
          <p>
            With View on, this friend can see your existing and future published Friends-audience posts,
            pictures and videos, unless a post has an additional restriction for them.
            This does not give access to private posts or posts limited to a circle or group.
          </p>
          <p>
            These saved defaults are caps on each post: a post cannot turn on View, React, Comment or Share
            when it is off here. Turning an ability on here does not override a post’s restrictions.
            View off also prevents reacting, commenting and sharing.
          </p>
          <p>
            Your current defaults are shown below; nothing changes until you confirm.
            Profile-field sharing stays as set in your privacy settings.
            Share controls resharing within Me, not screenshots or copied content.
            You can change these choices later in Friend-Specific Settings.
          </p>
          {loadError ? (
            <div role="alert">
              <p>Could not load your saved choices. You have not accepted this request.</p>
              <Button variant="outline" onClick={() => setReload((n) => n + 1)} data-testid="button-retry-accept-privacy">Try loading again</Button>
            </div>
          ) : !choices ? <p role="status">Loading your saved privacy choices…</p> : (
            <>
              <FriendPermissionRows
                friends={[{ memberId, preferredName }]}
                value={{ [memberId]: choices }}
                onChange={(next) => setChoices(next[memberId])}
                idPrefix="accept-friend" disabled={accept.isPending}
              />
              <p className="font-medium" role="status">
                {choices.view
                  ? "View is on: eligible older Friends posts will be visible when you accept."
                  : "View is off: your posts and their media will not be visible to this friend."}
              </p>
            </>
          )}
          {saveError && (
            <div role="alert" className="text-destructive space-y-2">
              <p>
                We could not confirm acceptance and saving. Do not assume these choices were applied.
                Settings may have changed elsewhere. Reload the current choices before trying again.
              </p>
              <Button variant="outline" onClick={() => setReload((n) => n + 1)} data-testid="button-reload-accept-privacy">Reload current choices</Button>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={accept.isPending} onClick={onClose} data-testid="button-cancel-accept-review">Not now</Button>
          <Button disabled={!choices || loadError || saveError || accept.isPending} onClick={confirm} data-testid="button-confirm-accept-friend">
            {accept.isPending ? "Saving and accepting…" : "Save choices and accept"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
