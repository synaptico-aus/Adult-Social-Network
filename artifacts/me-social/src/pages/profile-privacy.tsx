import { formatDate } from "@/lib/locale-format";
import { useEffect, useState } from "react";
import {
  useGetOwnProfile, getGetOwnProfileQueryKey,
  useUpdatePrivacySettings,
  useGetOwnVerificationRequests, getGetOwnVerificationRequestsQueryKey,
  useSubmitVerificationRequest,
  useGetConsentHistory, getGetConsentHistoryQueryKey,
  useGetAccountSettings, getGetAccountSettingsQueryKey,
  useUpdateAccountSettings,
  exportOwnProfile
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/shared/page-header";
import { ArrowLeft, Loader2, Download, Shield, Eye, Lock, CheckCircle, FileText, Globe } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

export default function ProfilePrivacy() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: profile, isLoading: isProfileLoading } = useGetOwnProfile({
    query: { queryKey: getGetOwnProfileQueryKey() }
  });

  const { data: verificationRequests, isLoading: isVerificationLoading } = useGetOwnVerificationRequests({
    query: { queryKey: getGetOwnVerificationRequestsQueryKey() }
  });

  const { data: consentHistory, isLoading: isConsentLoading } = useGetConsentHistory({
    query: { queryKey: getGetConsentHistoryQueryKey() }
  });

  const { data: accountSettings, isLoading: isAccountSettingsLoading } = useGetAccountSettings({
    query: { queryKey: getGetAccountSettingsQueryKey() }
  });

  const updatePrivacy = useUpdatePrivacySettings();
  const submitVerification = useSubmitVerificationRequest();
  const updateAccountSettings = useUpdateAccountSettings();

  // Verification request state
  const [verificationScope, setVerificationScope] = useState("");
  const [verificationNotes, setVerificationNotes] = useState("");
  const [verificationEvidence, setVerificationEvidence] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);

  // Field visibility mapping state
  const [visibility, setVisibility] = useState<Record<string, string>>({
    preferredName: "members",
    photoPath: "private",
    biography: "private",
    language: "private",
    broadRegion: "private",
    interests: "private",
    dementiaConnection: "private",
    roles: "private",
  });

  // Account Settings state
  const [settings, setSettings] = useState({
    inboundFriendRequests: true,
    inboundFollows: true,
    suggestionsEnabled: true,
  });

  useEffect(() => {
    if (profile?.visibility) {
      setVisibility((current) => ({ ...current, ...profile.visibility }));
    }
  }, [profile?.visibility]);

  useEffect(() => {
    if (accountSettings) {
      setSettings((current) => ({ ...current, ...accountSettings }));
    }
  }, [accountSettings]);

  const handleDiscoverabilityChange = async (checked: boolean) => {
    try {
      await updatePrivacy.mutateAsync({
        data: {
          discoverable: checked
        }
      });
      queryClient.invalidateQueries({ queryKey: getGetOwnProfileQueryKey() });
      toast({ title: "Discoverability updated" });
    } catch (e) {
      toast({ title: "Error updating discoverability", variant: "destructive" });
    }
  };

  const handleSaveVisibility = async () => {
    try {
      await updatePrivacy.mutateAsync({
        data: {
          visibility: visibility as any
        }
      });
      toast({ title: "Visibility settings saved" });
    } catch (e) {
      toast({ title: "Error saving visibility", variant: "destructive" });
    }
  };

  const handleSettingsChange = async (key: keyof typeof settings, value: boolean) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    try {
      await updateAccountSettings.mutateAsync({
        data: {
          [key]: value
        }
      });
      queryClient.setQueryData(getGetAccountSettingsQueryKey(), (old: any) => ({ ...old, [key]: value }));
      toast({ title: "Settings updated" });
    } catch (e) {
      setSettings(settings); // Revert
      toast({ title: "Error updating settings", variant: "destructive" });
    }
  };

  const handleRequestVerification = async () => {
    if (!verificationScope.trim()) {
      toast({ title: "Scope required", description: "Please explain what you are verifying.", variant: "destructive" });
      return;
    }
    try {
      setIsVerifying(true);
      await submitVerification.mutateAsync({
        data: {
          scope: verificationScope,
          notes: verificationNotes,
          evidence: verificationEvidence
        }
      });
      queryClient.invalidateQueries({ queryKey: getGetOwnVerificationRequestsQueryKey() });
      setVerificationScope("");
      setVerificationNotes("");
      setVerificationEvidence("");
      toast({ title: "Verification request submitted" });
    } catch (e) {
      toast({ title: "Error submitting request", variant: "destructive" });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleExportData = async () => {
    try {
      const data = await exportOwnProfile();
      if ((data as any)) {
        // Create a blob and download it
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "me-profile-export.json";
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        toast({ title: "Export successful" });
      } else {
        toast({ title: "Export started", description: "Your data is being processed." });
      }
    } catch (e) {
      toast({ title: "Export failed", variant: "destructive" });
    }
  };

  const isLoading = isProfileLoading || isVerificationLoading || isConsentLoading || isAccountSettingsLoading;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-8 md:gap-10 animate-in fade-in duration-500 max-w-3xl mx-auto">
        <PageHeader title="Privacy & Data" />
        <div className="bg-card p-10 rounded-[2rem] text-center text-muted-foreground border border-border">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
        </div>
      </div>
    );
  }

  // Typecasting verification history if it returned data, assuming it's an array
  const requestsList = Array.isArray(verificationRequests) ? verificationRequests : [];
  const consentList = Array.isArray(consentHistory) ? consentHistory : [];

  const pendingVerification = requestsList.some((req: any) => req.status === "pending");

  return (
    <div className="flex flex-col gap-10 animate-in fade-in duration-500 max-w-3xl mx-auto">
      <div>
        <Link href="/me" className="inline-flex items-center text-primary font-semibold mb-6 hover:underline">
          <ArrowLeft className="rtl:-scale-x-100 w-5 h-5 me-2" /> Back to Me
        </Link>
        <PageHeader
          title="Privacy & Data"
          description="Control your visibility, verify your account, and manage your data exports."
        />
      </div>

      {/* Discoverability Section */}
      <section className="bg-card border border-border p-8 md:p-10 rounded-[2rem] shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="max-w-lg">
            <h3 className="text-2xl font-display font-semibold flex items-center gap-3">
              <Globe className="w-6 h-6 text-primary" /> Profile Discoverability
            </h3>
            <p className="text-muted-foreground mt-3 text-lg leading-relaxed">
              When enabled, your profile can be found by other members when searching or browsing the community.
              If disabled, your profile will not appear in future member discovery surfaces.
            </p>
          </div>
          <div className="flex shrink-0">
            <Switch
              checked={!!profile?.discoverable}
              onCheckedChange={handleDiscoverabilityChange}
              disabled={updatePrivacy.isPending}
            />
          </div>
        </div>
      </section>

      {/* Account Preferences Section */}
      <section className="bg-card border border-border p-8 md:p-10 rounded-[2rem] shadow-sm space-y-8">
        <h3 className="text-2xl font-display font-semibold flex items-center gap-3">
          <Lock className="w-6 h-6 text-primary" /> Connection Settings
        </h3>

        <div className="space-y-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="max-w-lg">
              <h4 className="text-xl font-semibold">Friend Requests</h4>
              <p className="text-muted-foreground mt-2 text-base leading-relaxed">
                Allow other members to send you friend requests.
              </p>
            </div>
            <div className="flex shrink-0">
              <Switch
                checked={settings.inboundFriendRequests}
                onCheckedChange={(checked) => handleSettingsChange("inboundFriendRequests", checked)}
                disabled={updateAccountSettings.isPending}
                aria-label="Allow friend requests"
              />
            </div>
          </div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-t border-border pt-8">
            <div className="max-w-lg">
              <h4 className="text-xl font-semibold">Followers</h4>
              <p className="text-muted-foreground mt-2 text-base leading-relaxed">
                Allow other members to follow you. Following never changes what content the person may see; it only helps them find your public activity more easily.
              </p>
            </div>
            <div className="flex shrink-0">
              <Switch
                checked={settings.inboundFollows}
                onCheckedChange={(checked) => handleSettingsChange("inboundFollows", checked)}
                disabled={updateAccountSettings.isPending}
                aria-label="Allow followers"
              />
            </div>
          </div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-t border-border pt-8">
            <div className="max-w-lg">
              <h4 className="text-xl font-semibold">Member Suggestions</h4>
              <p className="text-muted-foreground mt-2 text-base leading-relaxed">
                Receive suggestions for other members you might know or want to connect with.
              </p>
            </div>
            <div className="flex shrink-0">
              <Switch
                checked={settings.suggestionsEnabled}
                onCheckedChange={(checked) => handleSettingsChange("suggestionsEnabled", checked)}
                disabled={updateAccountSettings.isPending}
                aria-label="Enable member suggestions"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Field Visibility Section */}
      <section className="bg-card border border-border p-8 md:p-10 rounded-[2rem] shadow-sm">
        <h3 className="text-2xl font-display font-semibold flex items-center gap-3 mb-6">
          <Eye className="w-6 h-6 text-primary" /> Field Visibility
        </h3>
        <p className="text-muted-foreground text-lg mb-8 leading-relaxed">
          Choose who can see specific pieces of your profile.
        </p>

        <div className="space-y-6">
          {Object.entries({
            preferredName: "Preferred Name",
            photoPath: "Profile Photo",
            biography: "Biography",
            language: "Language",
            broadRegion: "Broad Region",
            interests: "Interests",
            dementiaConnection: "Connection to Dementia",
            roles: "Roles"
          }).map(([field, label]) => (
            <div key={field} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-border/50 bg-secondary/10">
              <span className="text-lg font-medium">{label}</span>
              <Select
                value={visibility[field]}
                onValueChange={(val) => setVisibility(prev => ({...prev, [field]: val}))}
              >
                <SelectTrigger className="w-full sm:w-48 bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">Only Me (Private)</SelectItem>
                  <SelectItem value="connections">My Connections</SelectItem>
                  <SelectItem value="members">All Members</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ))}

          <div className="pt-6 border-t border-border flex justify-end">
            <Button onClick={handleSaveVisibility} disabled={updatePrivacy.isPending} size="lg" className="rounded-xl px-8">
              {updatePrivacy.isPending ? "Saving..." : "Save Visibility"}
            </Button>
          </div>
        </div>
      </section>

      {/* Verification Section */}
      <section className="bg-card border border-border p-8 md:p-10 rounded-[2rem] shadow-sm">
        <h3 className="text-2xl font-display font-semibold flex items-center gap-3 mb-6">
          <Shield className="w-6 h-6 text-primary" /> Account Verification
        </h3>
        <p className="text-muted-foreground text-lg mb-6 leading-relaxed">
          Request verification for specific credentials or roles. Verification is staff-reviewed and does not grant special authority. Pending requests do not display badges.
        </p>

        {requestsList.length > 0 && (
          <div className="mb-8 space-y-4">
            <h4 className="font-semibold text-lg">Your Requests</h4>
            {requestsList.map((req: any, i: number) => (
              <div key={i} className="flex items-center justify-between p-4 rounded-xl border border-border bg-secondary/20">
                <div>
                  <div className="font-medium">{req.scope || "Verification Request"}</div>
                  <div className="text-sm text-muted-foreground mt-1">Status: {req.status}</div>
                </div>
                {req.status === "approved" && <CheckCircle className="w-6 h-6 text-green-600" />}
                {req.status === "pending" && <Loader2 className="w-6 h-6 text-primary animate-spin" />}
              </div>
            ))}
          </div>
        )}

        {!pendingVerification && (
          <div className="space-y-6 border border-border rounded-2xl p-6 bg-secondary/5">
            <h4 className="font-semibold text-lg">Submit New Request</h4>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Scope of Verification</label>
                <Input
                  value={verificationScope}
                  onChange={e => setVerificationScope(e.target.value)}
                  placeholder="e.g. Identity, Professional credential"
                  className="rounded-xl bg-card"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Evidence URL (Optional)</label>
                <Input
                  value={verificationEvidence}
                  onChange={e => setVerificationEvidence(e.target.value)}
                  placeholder="Link to credential or proof"
                  className="rounded-xl bg-card"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Additional Notes</label>
                <Textarea
                  value={verificationNotes}
                  onChange={e => setVerificationNotes(e.target.value)}
                  placeholder="Any context for staff..."
                  className="rounded-xl min-h-[100px] bg-card"
                />
              </div>
              <Button onClick={handleRequestVerification} disabled={isVerifying} className="w-full sm:w-auto rounded-xl">
                {isVerifying ? "Submitting..." : "Submit Request"}
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* Consent History Section */}
      <section className="bg-card border border-border p-8 md:p-10 rounded-[2rem] shadow-sm">
        <h3 className="text-2xl font-display font-semibold flex items-center gap-3 mb-6">
          <FileText className="w-6 h-6 text-primary" /> Consent History
        </h3>
        <p className="text-muted-foreground text-lg mb-6 leading-relaxed">
          Log of permissions you've acknowledged when sharing information about others.
        </p>

        {consentList.length > 0 ? (
          <div className="space-y-4">
            {consentList.map((consent: any, i: number) => (
              <div key={i} className="p-4 rounded-xl border border-border bg-secondary/20">
                <div className="font-medium">{consent.purpose?.replaceAll("_", " ") || "Consent record"}</div>
                <div className="text-sm text-muted-foreground mt-1">
                  {consent.granted ? "Granted" : "Revoked"} · Version {consent.version}
                  {consent.recordedAt ? ` · ${formatDate(consent.recordedAt)}` : ""}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 rounded-xl border border-border/50 bg-secondary/10 text-center text-muted-foreground">
            No consent history found.
          </div>
        )}
      </section>

      {/* Export Data Section */}
      <section className="bg-card border border-border p-8 md:p-10 rounded-[2rem] shadow-sm flex flex-col sm:flex-row items-center justify-between gap-6">
        <div>
          <h3 className="text-2xl font-display font-semibold flex items-center gap-3">
            <Download className="w-6 h-6 text-primary" /> Export Profile Data
          </h3>
          <p className="text-muted-foreground mt-3 text-lg leading-relaxed">
            Download a JSON copy of your personal profile data. This export only includes your own information.
          </p>
        </div>
        <Button
          onClick={handleExportData}
          size="lg"
          className="rounded-xl px-8 whitespace-nowrap h-12"
        >
          <Download className="w-4 h-4 me-2" /> Download JSON
        </Button>
      </section>

    </div>
  );
}
