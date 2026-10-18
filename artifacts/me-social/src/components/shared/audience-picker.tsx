import { useListCircles, useListGroups } from "@workspace/api-client-react";

export type Aud = "only_me" | "friends" | "my_circle" | "this_group" | "public";
export const audienceLabels: Record<Aud, string> = {
  only_me: "Only me", friends: "Friends", my_circle: "My circle", this_group: "This group", public: "Public",
};
const field = "w-full min-h-[48px] rounded-xl border border-border bg-background px-3 text-lg";

export function AudiencePicker(props: {
  audience: Aud; circleId: string; groupId: string;
  onAudience: (a: Aud) => void; onCircle: (v: string) => void; onGroup: (v: string) => void;
}) {
  const circles = useListCircles();
  const groups = useListGroups();
  const circleList = circles.data ?? [];
  const groupList = (groups.data?.items ?? []).filter((g) => g.myMemberId);
  return (
    <div className="space-y-3">
      <label className="block font-semibold">Who can see this collection
        <select data-testid="select-audience" className={field + " mt-1 font-normal"} value={props.audience} onChange={(e) => props.onAudience(e.target.value as Aud)}>
          {(Object.keys(audienceLabels) as Aud[]).map((a) => <option key={a} value={a}>{audienceLabels[a]}</option>)}
        </select>
      </label>
      {props.audience === "my_circle" && (
        <label className="block font-semibold">Choose a circle
          <select data-testid="select-circle" className={field + " mt-1 font-normal"} value={props.circleId} onChange={(e) => props.onCircle(e.target.value)}>
            <option value="">Select a circle</option>
            {circleList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {circles.isLoading && <span className="text-sm">Loading circles...</span>}
        </label>
      )}
      {props.audience === "this_group" && (
        <label className="block font-semibold">Choose a group
          <select data-testid="select-group" className={field + " mt-1 font-normal"} value={props.groupId} onChange={(e) => props.onGroup(e.target.value)}>
            <option value="">Select a group</option>
            {groupList.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          {groups.isLoading && <span className="text-sm">Loading groups...</span>}
        </label>
      )}
    </div>
  );
}

export function audienceReady(a: Aud, circleId: string, groupId: string) {
  return (a !== "my_circle" || !!circleId) && (a !== "this_group" || !!groupId);
}
