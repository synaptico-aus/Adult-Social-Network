import { useState, useEffect } from "react"
import { useLocation } from "wouter"
import { PageHeader } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"
import { 
  useGetNotificationPreferences, useUpdateNotificationPreferences, useGetNotificationDeliveryStatus,
  useRevokeCurrentNotificationDevice, useRevokeAllNotificationDevices,
  getGetNotificationPreferencesQueryKey, getGetNotificationDeliveryStatusQueryKey
} from "@workspace/api-client-react"
import { ChevronLeft, Bell, BellOff, Settings, ShieldAlert, MonitorSmartphone, Smartphone, Clock, Loader2, Info } from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Link } from "wouter"
import { useExperience } from "@/lib/experience"
import { notificationPreferenceInput } from "@/lib/notification-preference-input"
import { formatTime } from "@/lib/locale-format"

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
const normTime = (v: unknown, fallback: string) => (typeof v === "string" && v.length >= 5 && HHMM.test(v.slice(0, 5)) ? v.slice(0, 5) : fallback)
const sampleAt = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); const d = new Date(); d.setUTCHours(h, m, 0, 0); return formatTime(d, "UTC") }

export default function NotificationSettings() {
  const [, setLocation] = useLocation()
  const queryClient = useQueryClient()

  const { data: prefs, isLoading: isPrefsLoading } = useGetNotificationPreferences({
    query: { queryKey: getGetNotificationPreferencesQueryKey() }
  })
  
  const { data: status, isLoading: isStatusLoading } = useGetNotificationDeliveryStatus({
    query: { queryKey: getGetNotificationDeliveryStatusQueryKey() }
  })

  const updatePrefs = useUpdateNotificationPreferences()
  const revokeCurrent = useRevokeCurrentNotificationDevice()
  const revokeAll = useRevokeAllNotificationDevices()

  const { prefs: exp } = useExperience()
  const [localPrefs, setLocalPrefs] = useState<any>(null)
  const [browserPerm, setBrowserPerm] = useState(Notification.permission)

  useEffect(() => {
    if (prefs) {
      setLocalPrefs({ ...prefs, quietHoursStart: normTime((prefs as any).quietHoursStart, "22:00"), quietHoursEnd: normTime((prefs as any).quietHoursEnd, "08:00") })
    }
  }, [prefs])

  const handleToggle = (key: string, value: boolean) => {
    setLocalPrefs((prev: any) => ({ ...prev, [key]: value }))
  }
  
  const handleChange = (key: string, value: string) => {
    setLocalPrefs((prev: any) => ({ ...prev, [key]: value }))
  }

  const handleSave = async () => {
    if (localPrefs.quietHoursEnabled && (!HHMM.test(localPrefs.quietHoursStart ?? "") || !HHMM.test(localPrefs.quietHoursEnd ?? ""))) {
      toast.error("Enter quiet hours as a valid time, for example 22:00")
      return
    }
    try {
      await updatePrefs.mutateAsync({
        data: { ...notificationPreferenceInput(localPrefs), quietHoursTimezone: localPrefs.quietHoursTimezone || exp.timeZone }
      })
      queryClient.invalidateQueries({ queryKey: getGetNotificationPreferencesQueryKey() })
      toast.success("Settings saved")
    } catch {
      toast.error("Failed to save settings")
    }
  }

  const requestBrowserPermission = async () => {
    const perm = await Notification.requestPermission()
    setBrowserPerm(perm)
    if (perm === 'granted') {
      toast.success("Browser notifications allowed")
      new Notification("Me", { body: "You have new activity", icon: "/favicon.ico" })
    } else {
      toast.error("Browser notifications blocked")
    }
  }

  if (isPrefsLoading || !localPrefs) {
    return <div className="p-8 text-center animate-pulse text-muted-foreground">Loading settings...</div>
  }

  return (
    <div className="flex flex-col gap-6 md:gap-8 animate-in fade-in duration-500 min-h-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation('/notifications')} className="rounded-xl" aria-label="Go back">
            <ChevronLeft className="rtl:-scale-x-100 w-6 h-6" />
          </Button>
          <PageHeader title="Notification Settings" description="Control how and when you are alerted." className="mb-0" />
        </div>
        <Button 
          className="rounded-xl px-8 h-12 text-base font-semibold w-full sm:w-auto" 
          onClick={handleSave}
          disabled={updatePrefs.isPending}
        >
          {updatePrefs.isPending && <Loader2 className="w-5 h-5 me-2 animate-spin" />}
          Save Changes
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-card border border-border rounded-3xl p-6 shadow-sm">
             <div className="flex items-center gap-3 mb-6">
                <Bell className="w-6 h-6 text-primary" />
                <h3 className="text-xl font-semibold font-display">In-App Notifications</h3>
             </div>
             
             <div className="space-y-4">
               <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-background">
                 <div>
                   <div className="font-semibold text-foreground">Messages</div>
                   <div className="text-sm text-muted-foreground">Alerts for new direct or group messages</div>
                 </div>
                 <Switch checked={localPrefs.inAppMessages} onCheckedChange={(c) => handleToggle('inAppMessages', c)} />
               </div>
               
               <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-background">
                 <div>
                   <div className="font-semibold text-foreground">Message Requests</div>
                   <div className="text-sm text-muted-foreground">Alerts when someone wants to message you</div>
                 </div>
                 <Switch checked={localPrefs.inAppRequests} onCheckedChange={(c) => handleToggle('inAppRequests', c)} />
               </div>

               <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-background">
                 <div>
                   <div className="font-semibold text-foreground">Group Activity</div>
                   <div className="text-sm text-muted-foreground">Alerts for group posts and events</div>
                 </div>
                 <Switch checked={localPrefs.inAppGroupActivity} onCheckedChange={(c) => handleToggle('inAppGroupActivity', c)} />
               </div>

               <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-background">
                 <div>
                   <div className="font-semibold text-foreground">Safety Alerts</div>
                   <div className="text-sm text-muted-foreground">Important moderation and account updates</div>
                 </div>
                 <Switch checked={localPrefs.inAppSafety} onCheckedChange={(c) => handleToggle('inAppSafety', c)} />
               </div>
             </div>
          </div>

          <div className="bg-card border border-border rounded-3xl p-6 shadow-sm">
             <div className="flex items-center gap-3 mb-6">
                <Clock className="w-6 h-6 text-primary" />
                <h3 className="text-xl font-semibold font-display">Quiet Hours</h3>
             </div>
             
             <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-background mb-4">
                <div>
                  <div className="font-semibold text-foreground">Enable Quiet Hours</div>
                  <div className="text-sm text-muted-foreground">Mute alerts during a specific time</div>
                </div>
                <Switch checked={localPrefs.quietHoursEnabled} onCheckedChange={(c) => handleToggle('quietHoursEnabled', c)} />
             </div>

             {localPrefs.quietHoursEnabled && (
                <div className="grid grid-cols-2 gap-4 p-4 rounded-xl bg-secondary/30 border border-border/50">
                  <div>
                    <label className="text-sm font-semibold mb-1.5 block">Start time (24-hour HH:mm)</label>
                    <Input 
                       type="time" 
                       value={localPrefs.quietHoursStart || "22:00"} step={60} required data-testid="input-quiet-start"
                       onChange={e => handleChange("quietHoursStart", e.target.value.slice(0, 5))}
                       className="bg-background rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-semibold mb-1.5 block">End time (24-hour HH:mm)</label>
                    <Input 
                       type="time" 
                       value={localPrefs.quietHoursEnd || "08:00"} step={60} required data-testid="input-quiet-end"
                       onChange={e => handleChange("quietHoursEnd", e.target.value.slice(0, 5))}
                       className="bg-background rounded-xl"
                    />
                  </div>
                  <p className="col-span-2 text-sm text-muted-foreground" data-testid="text-quiet-tz">
                    Quiet from {sampleAt(localPrefs.quietHoursStart || "22:00")} to {sampleAt(localPrefs.quietHoursEnd || "08:00")}, in time zone {localPrefs.quietHoursTimezone || exp.timeZone}. <Link href="/settings/experience" className="underline">Change time zones</Link>
                  </p>
                </div>
             )}
          </div>

          <div className="bg-card border border-border rounded-3xl p-6 shadow-sm">
             <div className="flex items-center gap-3 mb-6">
                <Smartphone className="w-6 h-6 text-primary" />
                <h3 className="text-xl font-semibold font-display">Lock Screen Preview</h3>
             </div>
             
             <RadioGroup value={localPrefs.lockScreenPreview} onValueChange={(v) => handleChange("lockScreenPreview", v)} className="space-y-3">
               <div className="flex items-start space-x-3 p-4 rounded-xl border border-border bg-background hover:bg-secondary/20 cursor-pointer" onClick={() => handleChange("lockScreenPreview", "private")}>
                 <RadioGroupItem value="private" id="l1" className="mt-1" />
                 <div>
                   <label htmlFor="l1" className="font-semibold text-base cursor-pointer">Private</label>
                   <p className="text-sm text-muted-foreground mt-1">Show sender names but hide message content on the lock screen.</p>
                 </div>
               </div>
               <div className="flex items-start space-x-3 p-4 rounded-xl border border-border bg-background hover:bg-secondary/20 cursor-pointer" onClick={() => handleChange("lockScreenPreview", "generic")}>
                 <RadioGroupItem value="generic" id="l2" className="mt-1" />
                 <div>
                   <label htmlFor="l2" className="font-semibold text-base cursor-pointer">Generic</label>
                   <p className="text-sm text-muted-foreground mt-1">Show "You have new activity" without names or content.</p>
                 </div>
               </div>
               <div className="flex items-start space-x-3 p-4 rounded-xl border border-border bg-background hover:bg-secondary/20 cursor-pointer" onClick={() => handleChange("lockScreenPreview", "off")}>
                 <RadioGroupItem value="off" id="l3" className="mt-1" />
                 <div>
                   <label htmlFor="l3" className="font-semibold text-base cursor-pointer">Off</label>
                   <p className="text-sm text-muted-foreground mt-1">Do not show any push notifications on the lock screen.</p>
                 </div>
               </div>
             </RadioGroup>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-card border border-border rounded-3xl p-6 shadow-sm">
             <div className="flex items-center gap-3 mb-4">
                <MonitorSmartphone className="w-6 h-6 text-foreground/80" />
                <h3 className="text-xl font-semibold font-display">Push Delivery</h3>
             </div>
             
             <div className="space-y-4">
               <div className="p-4 rounded-xl border border-border bg-background">
                 <div className="font-semibold mb-2">Browser Push</div>
                 <div className="text-sm text-muted-foreground mb-4">Allow alerts while you are using the app in this browser.</div>
                 
                 {browserPerm === 'granted' ? (
                   <div className="text-sm font-semibold text-green-600 flex items-center">
                     <Settings className="w-4 h-4 me-2" /> Allowed (Manage in browser settings)
                   </div>
                 ) : browserPerm === 'denied' ? (
                   <div className="text-sm font-semibold text-destructive flex items-center">
                     <BellOff className="w-4 h-4 me-2" /> Blocked by browser
                   </div>
                 ) : (
                   <Button onClick={requestBrowserPermission} variant="outline" className="w-full rounded-xl">
                     Enable Browser Alerts
                   </Button>
                 )}
               </div>

               <div className="p-4 rounded-xl bg-secondary/30 border border-border/50 text-sm">
                 <div className="flex items-start gap-2 text-muted-foreground mb-2">
                   <Info className="w-4 h-4 mt-0.5 shrink-0" />
                   <p>Background browser push and native device push are currently <strong>not configured or verified</strong> for this environment.</p>
                 </div>
                 {((status as any)?.realDeliveryVerified === false) && (
                   <p className="text-xs italic text-foreground/60 mt-2">Delivery status endpoint reports 'realDeliveryVerified: false'.</p>
                 )}
               </div>
             </div>
          </div>

          <div className="bg-card border border-border rounded-3xl p-6 shadow-sm">
             <div className="flex items-center gap-3 mb-4">
                <ShieldAlert className="w-6 h-6 text-destructive/80" />
                <h3 className="text-xl font-semibold font-display text-destructive">Device Access</h3>
             </div>
             <p className="text-sm text-muted-foreground mb-5">Revoke push tokens if you lost a device or are using a shared computer.</p>
             
             <div className="space-y-3">
               <Button 
                 variant="outline" 
                 className="w-full rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive"
                 onClick={async () => {
                   if(confirm("Revoke this device?")) {
                     await revokeCurrent.mutateAsync()
                     toast.success("Device revoked")
                   }
                 }}
               >
                 Revoke This Device
               </Button>
               <Button 
                 variant="outline" 
                 className="w-full rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive"
                 onClick={async () => {
                   if(confirm("Revoke all devices?")) {
                     await revokeAll.mutateAsync()
                     toast.success("All devices revoked")
                   }
                 }}
               >
                 Revoke All Devices
               </Button>
             </div>
          </div>
        </div>
      </div>
    </div>
  )
}
