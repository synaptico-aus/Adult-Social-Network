import type { FriendListItem, FriendPermissionMap, InteractionPermissions } from "@workspace/api-client-react";

export const ABILITIES: { key: keyof InteractionPermissions; label: string }[] = [
  { key: "view", label: "View" },
  { key: "react", label: "React" },
  { key: "comment", label: "Comment" },
  { key: "share", label: "Share" },
];

export const ALL_ALLOWED: InteractionPermissions = { view: true, react: true, comment: true, share: true };

interface Props {
  friends: FriendListItem[];
  value: FriendPermissionMap;
  onChange: (next: FriendPermissionMap) => void;
  /** Restrict-only mode: abilities denied here cannot be enabled. */
  caps?: FriendPermissionMap;
  idPrefix: string;
  disabled?: boolean;
}

export function FriendPermissionRows({ friends, value, onChange, caps, idPrefix, disabled }: Props) {
  if (friends.length === 0) {
    return <p className="text-sm text-muted-foreground p-3 rounded-xl border border-border/50">You have no connected friends yet.</p>;
  }
  return (
    <ul className="space-y-2 max-h-80 overflow-y-auto">
      {friends.map((f) => {
        const current = { ...ALL_ALLOWED, ...(value[f.memberId] ?? {}) };
        const cap = { ...ALL_ALLOWED, ...(caps?.[f.memberId] ?? {}) };
        const viewDenied = !current.view || !cap.view;
        return (
          <li key={f.memberId} className="rounded-xl border border-border/50 bg-secondary/10 p-3" data-testid={`row-friend-perm-${f.memberId}`}>
            <fieldset>
              <legend className="font-medium mb-2">{f.preferredName}</legend>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {ABILITIES.map((a) => {
                  const id = `${idPrefix}-${f.memberId}-${a.key}`;
                  const capped = !cap[a.key] || (a.key !== "view" && viewDenied);
                  return (
                    <label key={a.key} htmlFor={id} className={`flex items-center gap-2 text-sm ${capped ? "opacity-60" : ""}`}>
                      <input
                        id={id}
                        type="checkbox"
                        className="h-4 w-4 accent-[hsl(var(--primary))]"
                        checked={current[a.key] && !capped && (a.key === "view" || !viewDenied)}
                        disabled={disabled || capped}
                        onChange={(e) => onChange({
                          ...value,
                          [f.memberId]: a.key === "view" && !e.target.checked
                            ? { view: false, react: false, comment: false, share: false }
                            : { ...current, [a.key]: e.target.checked },
                        })}
                      />
                      {a.label}
                      {capped && <span className="text-xs text-muted-foreground">{a.key !== "view" && viewDenied ? "(needs View)" : "(off in your defaults)"}</span>}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          </li>
        );
      })}
    </ul>
  );
}
