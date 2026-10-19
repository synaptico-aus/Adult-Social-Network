import { useState, useMemo } from "react";
import { Link } from "wouter";
import { PageHeader } from "@/components/shared/page-header";
import { useSimpleView } from "@/lib/simple-view";
import { GroupCard } from "@/components/groups/group-card";
import {
  useListGroups,
  useListGroupSuggestions,
  useListGroupCategories,
  getListGroupsQueryKey,
  getListGroupSuggestionsQueryKey,
  getListGroupCategoriesQueryKey
} from "@workspace/api-client-react";
import { Loader2, Plus, AlertCircle, Info, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function GroupsPage() {
  const { isSimpleView } = useSimpleView();

  const [searchQuery, setSearchQuery] = useState("");
  const [activeSearch, setActiveSearch] = useState("");

  const groupsQuery = useListGroups(
    { q: activeSearch || undefined },
    { query: { queryKey: getListGroupsQueryKey({ q: activeSearch || undefined }) } }
  );

  const suggestionsQuery = useListGroupSuggestions({ query: { queryKey: getListGroupSuggestionsQueryKey() } });
  const categoriesQuery = useListGroupCategories({ query: { queryKey: getListGroupCategoriesQueryKey() } });

  const loading = groupsQuery.isLoading || suggestionsQuery.isLoading;
  const isError = groupsQuery.isError || suggestionsQuery.isError;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setActiveSearch(searchQuery.trim());
  };

  const allGroups = groupsQuery.data?.items || [];
  const myGroups = useMemo(() => allGroups.filter((g: any) => g.myRole != null), [allGroups]);
  const browseGroups = useMemo(() => allGroups.filter((g: any) => g.myRole == null), [allGroups]);

  // Filter out suggestions that are already in myGroups or browseGroups
  const allGroupIds = new Set(allGroups.map(g => g.id));
  const filteredSuggestions = useMemo(() =>
    (suggestionsQuery.data || []).filter(g => !allGroupIds.has(g.id)),
    [suggestionsQuery.data, allGroupIds]
  );

  return (
    <div className="flex flex-col gap-8 md:gap-10 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <PageHeader
          title={isSimpleView ? "Your Groups" : "Groups"}
          description={isSimpleView ? "Find and join spaces for support." : "Private spaces for connection, coordination, and shared experiences."}
        />
        <Button asChild className="rounded-xl font-semibold shrink-0">
          <Link href="/groups/new">
            <Plus className="w-5 h-5 me-2" />
            Create group
          </Link>
        </Button>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1 max-w-md">
          <label htmlFor="group-search" className="sr-only">Search groups</label>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            id="group-search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search groups..."
            className="ps-10 h-12 rounded-xl text-lg"
          />
        </div>
        <Button type="submit" size="lg" className="rounded-xl px-6 font-semibold">Search</Button>
      </form>

      {loading && (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {isError && (
        <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-6 text-destructive flex items-start gap-3">
          <AlertCircle className="w-6 h-6 shrink-0" />
          <div>
            <h3 className="font-semibold text-lg">Unable to load groups</h3>
            <p className="opacity-90">Please try again later.</p>
          </div>
        </div>
      )}

      {!loading && !isError && (
        <div className="space-y-12">
          {myGroups.length > 0 && (
            <section className="space-y-5">
              <h2 className="font-display text-3xl font-bold">Your groups</h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {myGroups.map((group: any) => (
                  <GroupCard key={group.id} group={group} />
                ))}
              </div>
            </section>
          )}

          {browseGroups.length > 0 && (
            <section className="space-y-5">
              <h2 className="font-display text-3xl font-bold">Browse groups</h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {browseGroups.map((group: any) => (
                  <GroupCard key={group.id} group={group} />
                ))}
              </div>
            </section>
          )}

          {/* Suggestions */}
          {!activeSearch && filteredSuggestions.length > 0 && (
            <section className="space-y-5">
              <h2 className="font-display text-3xl font-bold">Suggested for you</h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredSuggestions.map(suggestion => (
                  <GroupCard
                    key={suggestion.id}
                    group={suggestion}
                    suggestedReason={suggestion.matchedChoices?.join(", ")}
                  />
                ))}
              </div>
            </section>
          )}

          {allGroups.length === 0 && (!activeSearch ? filteredSuggestions.length === 0 : true) && (
            <div className="rounded-3xl border border-dashed border-border p-12 text-center text-muted-foreground">
              <p className="text-lg">No groups found. Try searching or creating one!</p>
            </div>
          )}

          {/* Development Categories */}
          {!activeSearch && categoriesQuery.data && categoriesQuery.data.length > 0 && (
            <section className="mt-12 pt-8 border-t border-border">
              <div className="flex items-start gap-3 mb-6">
                <Info className="w-6 h-6 text-muted-foreground shrink-0 mt-1" />
                <div>
                  <h3 className="font-display text-2xl font-semibold">Development categories</h3>
                  <p className="text-muted-foreground">
                    These are taxonomy categories being prepared for future communities. They are not yet populated.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {categoriesQuery.data.map(cat => (
                  <div key={cat.id} className="bg-secondary/50 border border-secondary-border px-4 py-2 rounded-xl text-secondary-foreground font-medium capitalize">
                    {cat.name.replace(/_/g, " ")}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
