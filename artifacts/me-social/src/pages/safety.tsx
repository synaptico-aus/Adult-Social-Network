import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, ShieldAlert, HeartHandshake, Phone, AlertTriangle, Shield, EyeOff, Ban, Plus, X, Search, FileText } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  useListOwnSafetyRelationships, getListOwnSafetyRelationshipsQueryKey,
  useCreateSafetyRelationship,
  useDeleteSafetyRelationship,
  useGetSupportContact,
  useCreateReport,
  useListOwnReports, getListOwnReportsQueryKey,
  useCreateAppeal,
  useListOwnAppeals, getListOwnAppealsQueryKey,
  ReportInputCategory,
} from "@workspace/api-client-react";

export default function SafetyPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: relationships, isLoading: isLoadingRelationships } = useListOwnSafetyRelationships({
    query: { queryKey: getListOwnSafetyRelationshipsQueryKey() }
  });

  const { data: reports, isLoading: isLoadingReports } = useListOwnReports({
    query: { queryKey: getListOwnReportsQueryKey() }
  });

  const { data: appeals, isLoading: isLoadingAppeals } = useListOwnAppeals({
    query: { queryKey: getListOwnAppealsQueryKey() }
  });

  const { data: supportContact, isError: supportContactError } = useGetSupportContact();

  const createRel = useCreateSafetyRelationship();
  const deleteRel = useDeleteSafetyRelationship();
  const createReport = useCreateReport();
  const createAppeal = useCreateAppeal();

  const [relTarget, setRelTarget] = useState("");
  const [relKind, setRelKind] = useState<"block" | "mute" | "restrict">("mute");

  const [reportTarget, setReportTarget] = useState("");
  const [reportContent, setReportContent] = useState("");
  const [reportCategory, setReportCategory] = useState<ReportInputCategory | "">("");
  const [reportDetails, setReportDetails] = useState("");

  const [appealRecordId, setAppealRecordId] = useState("");
  const [appealStatement, setAppealStatement] = useState("");

  const handleAddRelationship = async () => {
    if (!relTarget.trim()) return;
    try {
      await createRel.mutateAsync({
        kind: relKind,
        data: { targetMemberId: relTarget.trim() }
      });
      setRelTarget("");
      queryClient.invalidateQueries({ queryKey: getListOwnSafetyRelationshipsQueryKey() });
      toast({ title: "Relationship added" });
    } catch (e: any) {
      toast({ title: "Failed to add relationship", description: e.message, variant: "destructive" });
    }
  };

  const handleRemoveRelationship = async (targetMemberId: string, kind: "block" | "mute" | "restrict") => {
    try {
      await deleteRel.mutateAsync({
        kind,
        targetMemberId
      });
      queryClient.invalidateQueries({ queryKey: getListOwnSafetyRelationshipsQueryKey() });
      toast({ title: "Relationship removed" });
    } catch (e: any) {
      toast({ title: "Failed to remove", variant: "destructive" });
    }
  };

  const handleSubmitReport = async () => {
    if (!reportCategory) return;
    try {
      await createReport.mutateAsync({
        data: {
          category: reportCategory as ReportInputCategory,
          targetMemberId: reportTarget.trim() || undefined,
          contentId: reportContent.trim() || undefined,
          details: reportDetails.trim() || undefined,
        }
      });
      setReportCategory("");
      setReportTarget("");
      setReportContent("");
      setReportDetails("");
      queryClient.invalidateQueries({ queryKey: getListOwnReportsQueryKey() });
      toast({ title: "Report submitted successfully" });
    } catch (e: any) {
      toast({ title: "Failed to submit report", variant: "destructive" });
    }
  };

  const handleSubmitAppeal = async () => {
    if (!appealRecordId || !appealStatement) return;
    try {
      await createAppeal.mutateAsync({
        data: {
          moderationRecordId: appealRecordId,
          statement: appealStatement
        }
      });
      setAppealRecordId("");
      setAppealStatement("");
      queryClient.invalidateQueries({ queryKey: getListOwnAppealsQueryKey() });
      toast({ title: "Appeal submitted successfully" });
    } catch (e: any) {
      toast({ title: "Failed to submit appeal", variant: "destructive" });
    }
  };

  return (
    <div className="flex flex-col gap-10 animate-in fade-in duration-500 max-w-3xl mx-auto">
      <div>
        <Link href="/me" className="inline-flex items-center text-primary font-semibold mb-6 hover:underline">
          <ArrowLeft className="rtl:-scale-x-100 w-5 h-5 me-2" /> Back to Me
        </Link>
        <PageHeader
          title="Safety & Support"
          description="Manage blocked accounts, submit reports, and review appeals."
        />
      </div>

      <section className="bg-card border border-border p-8 rounded-[2rem] shadow-sm">
        <h3 className="text-2xl font-display font-semibold flex items-center gap-3 mb-4">
          <HeartHandshake className="w-6 h-6 text-primary" /> Important Guidance
        </h3>
        <div className="space-y-4 text-muted-foreground text-lg leading-relaxed">
          <p>
            <strong>Distress Disclosure:</strong> Expressions of distress, confusion, or difficulty coping are natural aspects of living with dementia. While these are not automatically abuse or violations, situations involving urgent risk or immediate danger should still be reported here and escalated to local emergency services.
          </p>
          <p>
            <strong>Respectful Disagreement:</strong> Differing opinions or perspectives, expressed respectfully, are welcome. We distinguish between disagreement and harassment.
          </p>
          <div className="bg-destructive/10 text-destructive-foreground p-5 rounded-2xl border border-destructive/20 mt-4 font-medium">
            <p className="flex items-center gap-2 mb-1"><AlertTriangle className="w-5 h-5" /> Urgent Help</p>
            Situations involving urgent threats, self-harm, or severe exploitation are prioritized for immediate review. If you or someone else is in immediate danger, please contact local emergency services first.
          </div>
        </div>
      </section>

      <section className="bg-card border border-border p-8 rounded-[2rem] shadow-sm">
        <h3 className="text-2xl font-display font-semibold flex items-center gap-3 mb-4">
          <Phone className="w-6 h-6 text-primary" /> Support Contact
        </h3>
        {supportContactError ? (
          <p className="text-muted-foreground text-lg">Support contact information is currently unavailable (Service may be down).</p>
        ) : supportContact ? (
          <p className="text-lg text-foreground bg-secondary/20 border border-border rounded-xl p-4 inline-block">
            You can reach our support team directly at: <a href={`mailto:${supportContact.email}`} className="text-primary font-semibold hover:underline">{supportContact.email}</a>
          </p>
        ) : (
          <p className="text-muted-foreground">Loading contact info...</p>
        )}
      </section>

      <section className="bg-card border border-border p-8 rounded-[2rem] shadow-sm">
        <h3 className="text-2xl font-display font-semibold flex items-center gap-3 mb-6">
          <ShieldAlert className="w-6 h-6 text-primary" /> Safety Relationships
        </h3>
        <p className="text-muted-foreground text-lg mb-6 leading-relaxed">
          Manage accounts you wish to block, mute, or restrict to control your experience.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <Input
            aria-label="Target Member ID"
            placeholder="Target Member ID"
            value={relTarget}
            onChange={e => setRelTarget(e.target.value)}
            className="flex-1 bg-card rounded-xl"
            data-testid="input-relationship-target"
          />
          <Select value={relKind} onValueChange={(v) => setRelKind(v as "block" | "mute" | "restrict")}>
            <SelectTrigger aria-label="Relationship type" className="w-full sm:w-48 bg-card rounded-xl" data-testid="select-relationship-kind">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mute"><div className="flex items-center"><EyeOff className="w-4 h-4 me-2"/> Mute</div></SelectItem>
              <SelectItem value="block"><div className="flex items-center"><Ban className="w-4 h-4 me-2"/> Block</div></SelectItem>
              <SelectItem value="restrict"><div className="flex items-center"><Shield className="w-4 h-4 me-2"/> Restrict</div></SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={handleAddRelationship} disabled={createRel.isPending || !relTarget} className="rounded-xl px-6" data-testid="button-add-relationship">
            <Plus className="w-5 h-5 me-1" /> Add
          </Button>
        </div>

        <div className="space-y-3" aria-live="polite">
          {isLoadingRelationships ? (
            <p className="text-muted-foreground">Loading relationships...</p>
          ) : relationships && relationships.length > 0 ? (
            relationships.map(rel => (
              <div key={rel.id} className="flex items-center justify-between p-4 border border-border bg-secondary/10 rounded-xl" data-testid={`row-relationship-${rel.id}`}>
                <div>
                  <span className="font-medium me-3">{rel.targetMemberId}</span>
                  <span className="text-sm bg-secondary text-secondary-foreground px-2 py-1 rounded-md uppercase tracking-wider font-semibold">
                    {rel.kind}
                  </span>
                </div>
                <Button variant="ghost" size="icon" onClick={() => handleRemoveRelationship(rel.targetMemberId, rel.kind)} disabled={deleteRel.isPending} aria-label={`Remove ${rel.kind} relationship`} data-testid={`button-remove-relationship-${rel.id}`}>
                  <X className="w-5 h-5 text-muted-foreground hover:text-destructive transition-colors" />
                </Button>
              </div>
            ))
          ) : (
            <p className="text-muted-foreground italic">No safety relationships set.</p>
          )}
        </div>
      </section>

      <section className="bg-card border border-border p-8 rounded-[2rem] shadow-sm">
        <h3 className="text-2xl font-display font-semibold flex items-center gap-3 mb-6">
          <FileText className="w-6 h-6 text-primary" /> Submit a Report
        </h3>
        <p className="text-muted-foreground text-lg mb-6 leading-relaxed">
          Report concerning behavior or content for moderation review.
        </p>

        <div className="space-y-4 border border-border p-6 rounded-2xl bg-secondary/5">
          <div>
            <label htmlFor="report-category" className="block text-sm font-medium mb-2 text-foreground">Category *</label>
            <Select value={reportCategory} onValueChange={(val) => setReportCategory(val as ReportInputCategory)}>
              <SelectTrigger id="report-category" className="w-full bg-card rounded-xl" data-testid="select-report-category">
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {Object.values(ReportInputCategory).map(cat => (
                  <SelectItem key={cat} value={cat}>
                    {cat.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="report-target" className="block text-sm font-medium mb-2 text-foreground">Target Member ID (Optional)</label>
              <Input
                id="report-target"
                value={reportTarget}
                onChange={e => setReportTarget(e.target.value)}
                placeholder="ID of the member"
                className="bg-card rounded-xl"
                data-testid="input-report-target"
              />
            </div>
            <div>
              <label htmlFor="report-content" className="block text-sm font-medium mb-2 text-foreground">Content ID (Optional)</label>
              <Input
                id="report-content"
                value={reportContent}
                onChange={e => setReportContent(e.target.value)}
                placeholder="ID of the content"
                className="bg-card rounded-xl"
                data-testid="input-report-content"
              />
            </div>
          </div>

          <div>
            <label htmlFor="report-details" className="block text-sm font-medium mb-2 text-foreground">Details (Optional)</label>
            <Textarea
              id="report-details"
              value={reportDetails}
              onChange={e => setReportDetails(e.target.value)}
              placeholder="Provide context for our review team..."
              className="bg-card rounded-xl min-h-[120px]"
              data-testid="input-report-details"
            />
          </div>

          <Button onClick={handleSubmitReport} disabled={createReport.isPending || !reportCategory} className="w-full sm:w-auto rounded-xl px-8" data-testid="button-submit-report">
            {createReport.isPending ? "Submitting..." : "Submit Report"}
          </Button>
        </div>
      </section>

      <section className="bg-card border border-border p-8 rounded-[2rem] shadow-sm">
        <h3 className="text-2xl font-display font-semibold flex items-center gap-3 mb-6">
          <Search className="w-6 h-6 text-primary" /> Report History & Appeals
        </h3>

        <div className="space-y-8" aria-live="polite">
          <div>
            <h4 className="font-semibold text-xl mb-4">Your Reports</h4>
            {isLoadingReports ? (
              <p className="text-muted-foreground">Loading reports...</p>
            ) : reports && reports.length > 0 ? (
              <div className="space-y-4">
                {reports.map((item, i) => (
                  <div key={item.report.id} className="border border-border p-5 rounded-2xl bg-secondary/10" data-testid={`row-report-${item.report.id}`}>
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-medium capitalize text-lg">{item.report.category.replace('_', ' ')}</span>
                      <span className={`text-sm px-2 py-1 rounded-md font-semibold tracking-wider uppercase border ${
                        item.moderationRecord?.state === 'pending' ? 'bg-secondary border-secondary-border text-secondary-foreground' :
                        item.moderationRecord?.state === 'removed' ? 'bg-destructive/10 border-destructive/20 text-destructive' :
                        'bg-muted border-border text-muted-foreground'
                      }`}>
                        {item.moderationRecord?.state || item.report.status}
                      </span>
                    </div>
                    {item.report.details && <p className="text-muted-foreground mt-2 italic">"{item.report.details}"</p>}

                    {item.moderationRecord?.id && (
                      <div className="mt-4 pt-4 border-t border-border/50 text-sm">
                        <span className="text-muted-foreground">Record ID: {item.moderationRecord.id}</span>
                        {item.moderationRecord.decision && (
                          <div className="mt-2 text-foreground"><span className="font-semibold">Decision:</span> {item.moderationRecord.decision}</div>
                        )}
                        {item.moderationRecord.reason && (
                          <div className="mt-1 text-foreground"><span className="font-semibold">Reason:</span> {item.moderationRecord.reason}</div>
                        )}
                        {(item.moderationRecord.state === 'held' || item.moderationRecord.state === 'removed') && (
                          <div className="mt-3">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setAppealRecordId(item.moderationRecord.id);
                                document.getElementById("appeal-form")?.scrollIntoView({ behavior: "smooth" });
                                document.getElementById("appeal-statement")?.focus();
                              }}
                            >
                              Appeal this decision
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground italic">You haven't submitted any reports.</p>
            )}
          </div>

          <div className="border-t border-border/50 pt-8">
            <h4 className="font-semibold text-xl mb-4">Your Appeals</h4>
            {isLoadingAppeals ? (
              <p className="text-muted-foreground">Loading appeals...</p>
            ) : appeals && appeals.length > 0 ? (
              <div className="space-y-4 mb-8">
                {appeals.map(appeal => (
                  <div key={appeal.id} className="border border-border p-5 rounded-2xl bg-secondary/10" data-testid={`row-appeal-${appeal.id}`}>
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-sm font-mono text-muted-foreground break-all">Record: {appeal.moderationRecordId}</span>
                      <span className="text-sm px-2 py-1 rounded-md font-semibold tracking-wider uppercase bg-secondary text-secondary-foreground">
                        {appeal.status}
                      </span>
                    </div>
                    <p className="text-foreground mt-2">"{appeal.statement}"</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground italic mb-8">You haven't submitted any appeals.</p>
            )}

            <div id="appeal-form" className="border border-border p-6 rounded-2xl bg-secondary/5 mt-4">
              <h5 className="font-medium text-lg mb-4">Submit an Appeal</h5>
              <div className="space-y-4">
                <div>
                  <label htmlFor="appeal-record-id" className="block text-sm font-medium mb-2">Moderation Record ID</label>
                  <Input
                    id="appeal-record-id"
                    value={appealRecordId}
                    onChange={e => setAppealRecordId(e.target.value)}
                    placeholder="ID of the record to appeal"
                    className="bg-card rounded-xl"
                    data-testid="input-appeal-record-id"
                  />
                </div>
                <div>
                  <label htmlFor="appeal-statement" className="block text-sm font-medium mb-2">Appeal Statement</label>
                  <Textarea
                    id="appeal-statement"
                    value={appealStatement}
                    onChange={e => setAppealStatement(e.target.value)}
                    placeholder="Provide your reasoning for this appeal..."
                    className="bg-card rounded-xl min-h-[100px]"
                    data-testid="input-appeal-statement"
                  />
                </div>
                <Button onClick={handleSubmitAppeal} disabled={createAppeal.isPending || !appealRecordId || !appealStatement} className="rounded-xl px-8" data-testid="button-submit-appeal">
                  {createAppeal.isPending ? "Submitting..." : "Submit Appeal"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
