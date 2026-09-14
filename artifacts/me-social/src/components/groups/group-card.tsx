import { Link } from "wouter";
import { Users, Lock, Shield, EyeOff, Search } from "lucide-react";
import { Group } from "@workspace/api-client-react";

export function GroupCard({ group, suggestedReason }: { group: Group, suggestedReason?: string }) {
  const memberRole = (group as any).myRole;

  return (
    <Link href={`/groups/${group.id}`} className="block">
      <div className="bg-card hover:bg-secondary/30 transition-colors border border-border p-5 md:p-6 rounded-3xl shadow-sm h-full flex flex-col">
        <div className="flex items-start justify-between gap-4 mb-2">
          <h3 className="font-display text-2xl font-bold text-foreground break-words">{group.name}</h3>
          {memberRole && (
            <span className="shrink-0 bg-primary/10 text-primary px-3 py-1 rounded-full text-sm font-semibold capitalize">
              {memberRole}
            </span>
          )}
        </div>
        
        {suggestedReason && (
          <div className="mb-4 inline-flex items-start bg-secondary/50 rounded-xl p-3 border border-secondary-border">
            <Search className="w-4 h-4 text-primary shrink-0 mt-0.5 mr-2" />
            <span className="text-sm font-medium text-secondary-foreground leading-snug">
              Suggested because you share: {suggestedReason}
            </span>
          </div>
        )}

        <p className="text-muted-foreground line-clamp-3 mb-6 flex-1">
          {group.description || "No description provided."}
        </p>

        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground mt-auto pt-4 border-t border-border/50">
          <div className="flex items-center gap-1.5" title="Member count">
            <Users className="w-4 h-4" />
            {group.memberCount} member{group.memberCount !== 1 ? 's' : ''}
          </div>
          
          <div className="flex items-center gap-1.5" title="Discovery">
            {group.discoverability === "public" ? <Search className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            <span className="capitalize">{group.discoverability} discovery</span>
          </div>

          <div className="flex items-center gap-1.5" title="Content Visibility">
            {group.contentVisibility === "public" ? <Globe className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
            <span className="capitalize">{group.contentVisibility} content</span>
          </div>

          <div className="flex items-center gap-1.5" title="Join Policy">
            <Shield className="w-4 h-4" />
            {group.joinPolicy === "open" ? "Open to join" : group.joinPolicy === "approval" ? "Requires approval" : "Closed to joining"}
          </div>
        </div>
      </div>
    </Link>
  );
}

// Needed to avoid typescript error on Globe
import { Globe } from "lucide-react";
