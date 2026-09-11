import { useState } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { Compass, Users, Inbox, Link as LinkIcon } from "lucide-react";
import { DiscoverTab } from "./discover-tab";
import { FriendsTab } from "./friends-tab";
import { RequestsTab } from "./requests-tab";
import { FollowingTab } from "./following-tab";
import { 
  useListFriendRequests, 
  useListFriends, 
  useListFollows 
} from "@workspace/api-client-react";

export default function ExplorePage() {
  const [activeTab, setActiveTab] = useState<"discover" | "friends" | "requests" | "following">("discover");

  const { data: requests } = useListFriendRequests();
  const { data: friends } = useListFriends();
  const { data: follows } = useListFollows();

  const incomingCount = requests?.incoming?.length || 0;
  const friendsCount = friends?.items.length || 0;
  const followingCount = follows?.items.filter(f => f.direction === "outgoing").length || 0;

  const tabs = [
    { id: "discover", label: "Discover", icon: Compass },
    { id: "friends", label: `Friends (${friendsCount})`, icon: Users },
    { id: "requests", label: `Requests ${incomingCount > 0 ? `(${incomingCount})` : ""}`, icon: Inbox },
    { id: "following", label: `Following (${followingCount})`, icon: LinkIcon },
  ] as const;

  return (
    <div className="flex flex-col gap-8 md:gap-10 animate-in fade-in duration-500">
      <PageHeader 
        title="Discover" 
        description="Find supportive connections and explore the community."
      />
      
      <div className="bg-card border border-border p-2 rounded-2xl flex overflow-x-auto hide-scrollbar shadow-sm">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              data-testid={`tab-${tab.id}`}
              className={`flex items-center gap-2 px-5 py-3 rounded-xl font-medium text-sm md:text-base whitespace-nowrap transition-colors flex-1 justify-center min-w-max ${
                isActive 
                  ? "bg-primary text-primary-foreground shadow-sm" 
                  : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
              }`}
            >
              <tab.icon className={`w-5 h-5 ${isActive ? "text-primary-foreground" : ""}`} />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="min-h-[50vh]">
        {activeTab === "discover" && <DiscoverTab />}
        {activeTab === "friends" && <FriendsTab />}
        {activeTab === "requests" && <RequestsTab />}
        {activeTab === "following" && <FollowingTab />}
      </div>
    </div>
  );
}