import { useState } from "react";
import { 
  useListThisIsMeCards, getListThisIsMeCardsQueryKey,
  useCreateThisIsMeCard, 
  useUpdateThisIsMeCard, 
  useDeleteThisIsMeCard,
  ThisIsMeCardKind,
  ThisIsMeCard
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/shared/page-header";
import { ArrowLeft, Loader2, Plus, Edit2, Trash2 } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";

const CARD_KIND_LABELS: Record<ThisIsMeCardKind, string> = {
  things_i_enjoy: "Things I Enjoy",
  music_i_love: "Music I Love",
  experiences_i_want_to_share: "Experiences I Want to Share",
  how_i_like_to_communicate: "How I Like to Communicate",
};

export default function ThisIsMe() {
  const { data: cards, isLoading } = useListThisIsMeCards({
    query: { queryKey: getListThisIsMeCardsQueryKey() }
  });

  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const createCard = useCreateThisIsMeCard();
  const updateCard = useUpdateThisIsMeCard();
  const deleteCard = useDeleteThisIsMeCard();

  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editPermission, setEditPermission] = useState(false);

  const [creatingKind, setCreatingKind] = useState<ThisIsMeCardKind | null>(null);

  const handleEdit = (card: ThisIsMeCard) => {
    setEditingCardId(card.id);
    setEditText(card.text);
    setEditPermission(card.permissionAcknowledged || false);
    setCreatingKind(null);
  };

  const handleCancelEdit = () => {
    setEditingCardId(null);
    setCreatingKind(null);
  };

  const handleSaveUpdate = async (id: string) => {
    if (!editText.trim()) {
      toast({ title: "Error", description: "Card text cannot be empty.", variant: "destructive" });
      return;
    }
    try {
      await updateCard.mutateAsync({
        id,
        data: { text: editText, permissionAcknowledged: editPermission }
      });
      queryClient.invalidateQueries({ queryKey: getListThisIsMeCardsQueryKey() });
      setEditingCardId(null);
      toast({ title: "Card updated" });
    } catch (err) {
      toast({ title: "Error updating card", variant: "destructive" });
    }
  };

  const handleCreate = async (kind: ThisIsMeCardKind) => {
    if (!editText.trim()) {
      toast({ title: "Error", description: "Card text cannot be empty.", variant: "destructive" });
      return;
    }
    try {
      await createCard.mutateAsync({
        data: { kind, text: editText, permissionAcknowledged: editPermission }
      });
      queryClient.invalidateQueries({ queryKey: getListThisIsMeCardsQueryKey() });
      setCreatingKind(null);
      toast({ title: "Card created" });
    } catch (err) {
      toast({ title: "Error creating card", variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this card?")) return;
    try {
      await deleteCard.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: getListThisIsMeCardsQueryKey() });
      toast({ title: "Card deleted" });
    } catch (err) {
      toast({ title: "Error deleting card", variant: "destructive" });
    }
  };

  const startCreate = (kind: ThisIsMeCardKind) => {
    setCreatingKind(kind);
    setEditingCardId(null);
    setEditText("");
    setEditPermission(false);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-8 md:gap-10 animate-in fade-in duration-500 max-w-3xl mx-auto">
        <PageHeader title="This is Me" />
        <div className="bg-card p-10 rounded-[2rem] text-center text-muted-foreground border border-border">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
        </div>
      </div>
    );
  }

  const existingCardsByKind = cards?.reduce((acc, card) => {
    acc[card.kind] = card;
    return acc;
  }, {} as Record<string, ThisIsMeCard>) || {};

  return (
    <div className="flex flex-col gap-8 md:gap-10 animate-in fade-in duration-500 max-w-3xl mx-auto">
      <div>
        <Link href="/me" className="inline-flex items-center text-primary font-semibold mb-6 hover:underline">
          <ArrowLeft className="w-5 h-5 mr-2" /> Back to Me
        </Link>
        <PageHeader 
          title="This is Me" 
          description="Create personal introduction cards to share who you are with the community."
        />
      </div>

      <div className="space-y-8">
        {(Object.entries(CARD_KIND_LABELS) as [ThisIsMeCardKind, string][]).map(([kind, label]) => {
          const card = existingCardsByKind[kind];
          const isEditing = editingCardId === card?.id;
          const isCreating = creatingKind === kind;

          if (isEditing || isCreating) {
            return (
              <div key={kind} className="bg-card border-2 border-primary/20 p-6 md:p-8 rounded-[2rem] shadow-sm">
                <h3 className="text-2xl font-display font-semibold mb-4 text-foreground">{label}</h3>
                
                <Textarea 
                  value={editText}
                  onChange={e => setEditText(e.target.value)}
                  placeholder={`Write about ${label.toLowerCase()}...`}
                  className="min-h-[150px] text-lg rounded-xl mb-6"
                />
                
                <div className="flex items-start space-x-3 bg-secondary/30 p-4 rounded-xl mb-6 border border-border/50">
                  <Checkbox 
                    id={`perm-${kind}`} 
                    checked={editPermission} 
                    onCheckedChange={c => setEditPermission(!!c)} 
                    className="mt-1"
                  />
                  <label htmlFor={`perm-${kind}`} className="text-muted-foreground cursor-pointer leading-relaxed">
                    If this story or information is about another person, I confirm I have their permission to share it.
                  </label>
                </div>

                <div className="flex gap-4 justify-end border-t border-border pt-6">
                  <Button variant="outline" onClick={handleCancelEdit} size="lg" className="rounded-xl">Cancel</Button>
                  <Button 
                    onClick={() => isEditing ? handleSaveUpdate(card.id) : handleCreate(kind)} 
                    disabled={updateCard.isPending || createCard.isPending}
                    size="lg"
                    className="rounded-xl px-8"
                  >
                    {(updateCard.isPending || createCard.isPending) ? "Saving..." : "Save Card"}
                  </Button>
                </div>
              </div>
            );
          }

          if (card) {
            return (
              <div key={kind} className="bg-card border border-border p-6 md:p-8 rounded-[2rem] shadow-sm group">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-2xl font-display font-semibold text-foreground">{label}</h3>
                  <div className="flex gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    <Button variant="outline" size="sm" onClick={() => handleEdit(card)} className="rounded-lg h-9">
                      <Edit2 className="w-4 h-4 mr-2" /> Edit
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleDelete(card.id)} className="rounded-lg h-9 text-destructive border-destructive/30 hover:bg-destructive/10">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <p className="text-lg text-muted-foreground whitespace-pre-wrap leading-relaxed">{card.text}</p>
              </div>
            );
          }

          return (
            <div key={kind} className="bg-secondary/10 border border-dashed border-border/60 p-6 md:p-8 rounded-[2rem] text-center flex flex-col items-center justify-center gap-4">
              <h3 className="text-xl font-display font-medium text-muted-foreground">{label}</h3>
              <Button onClick={() => startCreate(kind)} variant="outline" className="rounded-xl bg-card">
                <Plus className="w-4 h-4 mr-2" /> Add this card
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
