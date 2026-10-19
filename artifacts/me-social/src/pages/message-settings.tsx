import { useState, useEffect } from "react"
import { useLocation } from "wouter"
import { PageHeader } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"
import { 
  useGetMessageContactSettings, useUpdateMessageContactSettings, getGetMessageContactSettingsQueryKey
} from "@workspace/api-client-react"
import { ChevronLeft, Loader2, ShieldCheck } from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"

export default function MessageSettings() {
  const [, setLocation] = useLocation()
  const queryClient = useQueryClient()
  
  const { data: settings, isLoading } = useGetMessageContactSettings({
    query: { queryKey: getGetMessageContactSettingsQueryKey() }
  })
  
  const updateSettings = useUpdateMessageContactSettings()
  
  const [selected, setSelected] = useState<string>("friends_only")

  useEffect(() => {
    if (settings) {
      setSelected(settings.setting)
    }
  }, [settings])

  const handleSave = async () => {
    try {
      await updateSettings.mutateAsync({
        data: {
          // @ts-ignore - Setting enum matches what we use
          setting: selected 
        }
      })
      queryClient.invalidateQueries({ queryKey: getGetMessageContactSettingsQueryKey() })
      toast.success("Settings saved")
      setLocation("/messages")
    } catch {
      toast.error("Failed to save settings")
    }
  }

  return (
    <div className="flex flex-col gap-6 md:gap-8 animate-in fade-in duration-500 min-h-full">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation('/messages')} className="rounded-xl" aria-label="Go back">
          <ChevronLeft className="rtl:-scale-x-100 w-6 h-6" />
        </Button>
        <PageHeader title="Message Settings" description="Control who can send you direct messages." className="mb-0" />
      </div>

      {isLoading ? (
        <div className="p-8 text-center animate-pulse text-muted-foreground">Loading settings...</div>
      ) : (
        <div className="bg-card border border-border rounded-3xl p-6 shadow-sm max-w-2xl mx-auto w-full">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
              <ShieldCheck className="w-6 h-6 text-primary" />
            </div>
            <h2 className="text-xl font-semibold font-display">Who can message you?</h2>
          </div>
          
          <RadioGroup value={selected} onValueChange={setSelected} className="space-y-4">
            <div className="flex items-start space-x-3 p-4 rounded-xl border border-border bg-background hover:bg-secondary/20 transition-colors cursor-pointer" onClick={() => setSelected("friends_only")}>
              <RadioGroupItem value="friends_only" id="r1" className="mt-1" />
              <div>
                <label htmlFor="r1" className="font-semibold text-base cursor-pointer">Friends Only</label>
                <p className="text-sm text-muted-foreground mt-1">Only people you are mutually connected with can message you.</p>
              </div>
            </div>
            
            <div className="flex items-start space-x-3 p-4 rounded-xl border border-border bg-background hover:bg-secondary/20 transition-colors cursor-pointer" onClick={() => setSelected("friends_and_group_members")}>
              <RadioGroupItem value="friends_and_group_members" id="r2" className="mt-1" />
              <div>
                <label htmlFor="r2" className="font-semibold text-base cursor-pointer">Friends and Group Members</label>
                <p className="text-sm text-muted-foreground mt-1">Friends and people who share a group with you can message you.</p>
              </div>
            </div>

            <div className="flex items-start space-x-3 p-4 rounded-xl border border-border bg-background hover:bg-secondary/20 transition-colors cursor-pointer" onClick={() => setSelected("any_member_requests")}>
              <RadioGroupItem value="any_member_requests" id="r3" className="mt-1" />
              <div>
                <label htmlFor="r3" className="font-semibold text-base cursor-pointer">Anyone (via Request)</label>
                <p className="text-sm text-muted-foreground mt-1">Anyone on Me can send you a message request. You must accept it before they can message you.</p>
              </div>
            </div>
          </RadioGroup>

          <div className="mt-8 flex justify-end">
            <Button 
              className="rounded-xl px-8 h-12 text-base font-semibold" 
              onClick={handleSave}
              disabled={updateSettings.isPending || selected === settings?.setting}
            >
              {updateSettings.isPending && <Loader2 className="w-5 h-5 me-2 animate-spin" />}
              Save Changes
            </Button>
          </div>
        </div>
      )}
      
      <div className="max-w-2xl mx-auto w-full p-4 rounded-2xl bg-secondary/30 text-sm text-muted-foreground text-center">
        Messages are protected by authenticated access, but are not end-to-end encrypted. The server processes content for safety checks, permissions, and moderation review.
      </div>
    </div>
  )
}
