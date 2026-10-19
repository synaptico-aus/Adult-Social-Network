import { useState } from "react";
import { Link2, Trash2, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { 
  useListGroupResources, 
  useCreateGroupResource, 
  useDeleteGroupResource,
  getListGroupResourcesQueryKey 
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

export function GroupResources({ groupId, isMod }: { groupId: string, isMod: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const resourcesQuery = useListGroupResources(groupId, { query: { queryKey: getListGroupResourcesQueryKey(groupId) } });
  const createResource = useCreateGroupResource();
  const deleteResource = useDeleteGroupResource();

  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const handleCreate = async () => {
    if (!url || !title) return;
    try {
      await createResource.mutateAsync({
        groupId,
        data: { url, title, description: description || null }
      });
      toast({ title: "Resource added" });
      setUrl("");
      setTitle("");
      setDescription("");
      queryClient.invalidateQueries({ queryKey: getListGroupResourcesQueryKey(groupId) });
    } catch (e) {
      toast({ title: "Could not add resource", variant: "destructive" });
    }
  };

  const handleDelete = async (resourceId: string) => {
    if (!window.confirm("Delete this pinned resource?")) return;
    try {
      await deleteResource.mutateAsync({ groupId, resourceId });
      toast({ title: "Resource removed" });
      queryClient.invalidateQueries({ queryKey: getListGroupResourcesQueryKey(groupId) });
    } catch (e) {
      toast({ title: "Could not remove resource", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      {isMod && (
        <div className="bg-card border border-border rounded-3xl p-6 shadow-sm">
          <h3 className="font-display text-xl font-semibold mb-4">Add Pinned Resource</h3>
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label>Title</Label>
                <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Local Support Hotline" />
              </div>
              <div>
                <Label>URL</Label>
                <Input type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..." />
              </div>
            </div>
            <div>
              <Label>Description (optional)</Label>
              <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Brief description of this resource" />
            </div>
            <div className="flex justify-end pt-2">
              <Button onClick={handleCreate} disabled={!title || !url || createResource.isPending} className="rounded-xl font-semibold">
                {createResource.isPending ? <Loader2 className="w-4 h-4 me-2 animate-spin" /> : <Plus className="w-4 h-4 me-2" />}
                Add Resource
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {resourcesQuery.isLoading && <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}
        
        {resourcesQuery.data?.length === 0 && (
          <div className="text-center py-12 bg-card rounded-3xl border border-dashed border-border text-muted-foreground">
            No pinned resources yet.
          </div>
        )}

        {resourcesQuery.data?.map(resource => (
          <div key={resource.id} className="bg-card border border-border rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 group">
            <div className="flex items-start gap-4 overflow-hidden">
              <div className="w-10 h-10 rounded-full bg-secondary text-primary flex items-center justify-center shrink-0 mt-1">
                <Link2 className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <a href={resource.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-lg hover:underline underline-offset-4 decoration-primary truncate block">
                  {resource.title}
                </a>
                <p className="text-sm text-muted-foreground truncate">{resource.url}</p>
                {resource.description && (
                  <p className="text-sm text-foreground mt-2 line-clamp-2">{resource.description}</p>
                )}
              </div>
            </div>
            {isMod && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity" 
                onClick={() => handleDelete(resource.id)}
              >
                <Trash2 className="w-5 h-5" />
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
