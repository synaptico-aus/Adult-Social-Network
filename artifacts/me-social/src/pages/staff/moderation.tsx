import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { 
  ShieldCheck, AlertTriangle, Eye, Gavel, FileCheck, Search, Loader2 
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { 
  useGetStaffCapabilities,
  useGetModerationQueue, getGetModerationQueueQueryKey,
  useGetUrgentModerationQueue, getGetUrgentModerationQueueQueryKey,
  useListStaffAppeals, getListStaffAppealsQueryKey,
  useAccessReportedEvidence,
  useDecideModeration,
  useReviewStaffAppeal,
  ModerationDecisionInputState,
  ModerationDecisionInputSanction,
  QueueItem,
  Appeal,
  StaffCapabilities,
  Report,
  AppealReviewInputStatus
} from "@workspace/api-client-react";
import { ErrorBoundary } from "@/components/error-boundary";

function QueueItemCard({ item, caps }: { item: QueueItem; caps: StaffCapabilities }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [evidenceReport, setEvidenceReport] = useState<Report | null>(null);
  const [evidenceReason, setEvidenceReason] = useState("");
  const accessEvidence = useAccessReportedEvidence();

  const [decisionState, setDecisionState] = useState<ModerationDecisionInputState>("held");
  const [decisionText, setDecisionText] = useState("");
  const [decisionSanction, setDecisionSanction] = useState<ModerationDecisionInputSanction | "">("");
  const [decisionReason, setDecisionReason] = useState("");
  const decideModeration = useDecideModeration();

  const canReadEvidence = caps.capabilities.includes("evidence.read");
  const canDecide = caps.capabilities.includes("moderation.decide");

  const handleAccessEvidence = async () => {
    if (!evidenceReason) return;
    try {
      const response = await accessEvidence.mutateAsync({
        evidenceId: item.reportId,
        data: { reason: evidenceReason }
      });
      setEvidenceReport(response.report);
      toast({ title: "Evidence accessed", description: "This action has been logged." });
    } catch (e: any) {
      toast({ title: "Access denied", description: e.message, variant: "destructive" });
    }
  };

  const handleDecide = async () => {
    if (!decisionReason) return;
    try {
      await decideModeration.mutateAsync({
        id: item.moderationRecordId,
        data: {
          state: decisionState,
          reason: decisionReason,
          decision: decisionText || undefined,
          sanction: decisionSanction || undefined
        }
      });
      queryClient.invalidateQueries({ queryKey: getGetModerationQueueQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetUrgentModerationQueueQueryKey() });
      toast({ title: "Decision recorded" });
    } catch (e: any) {
      toast({ title: "Failed to record decision", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="border border-border p-5 rounded-2xl bg-card shadow-sm" data-testid={`row-queue-${item.reportId}`}>
      <div className="flex justify-between items-start mb-4">
        <div>
          <span className="font-semibold text-lg capitalize mr-3">{item.category.replace('_', ' ')}</span>
          <span className="text-xs px-2 py-1 rounded-md font-semibold tracking-wider uppercase bg-secondary text-secondary-foreground border border-secondary-border">
            {item.moderationState}
          </span>
        </div>
        <div className="text-right text-sm text-muted-foreground">
          <div className="font-mono">Report: {item.reportId}</div>
          <div className="font-mono">Record: {item.moderationRecordId}</div>
        </div>
      </div>
      
      {canReadEvidence && !evidenceReport ? (
        <div className="bg-secondary/10 p-4 rounded-xl border border-border/50">
          <label htmlFor={`evidence-reason-${item.reportId}`} className="block text-sm font-medium mb-3">Access Evidence</label>
          <div className="flex gap-2">
            <Input 
              id={`evidence-reason-${item.reportId}`}
              value={evidenceReason} 
              onChange={e => setEvidenceReason(e.target.value)} 
              placeholder="Reason for access (required for audit)" 
              className="bg-card"
              data-testid={`input-evidence-reason-${item.reportId}`}
            />
            <Button onClick={handleAccessEvidence} disabled={accessEvidence.isPending || !evidenceReason} data-testid={`button-access-evidence-${item.reportId}`}>
              {accessEvidence.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4 mr-2" />}
              Access
            </Button>
          </div>
        </div>
      ) : evidenceReport ? (
        <div className="space-y-4">
          <div className="bg-muted p-4 rounded-xl border border-border text-sm space-y-2">
            <div><span className="font-semibold">Reporter:</span> {evidenceReport.reporterMemberId}</div>
            {evidenceReport.targetMemberId && <div><span className="font-semibold">Target:</span> {evidenceReport.targetMemberId}</div>}
            {evidenceReport.contentId && <div><span className="font-semibold">Content ID:</span> {evidenceReport.contentId}</div>}
            {evidenceReport.details && <div><span className="font-semibold">Details:</span> {evidenceReport.details}</div>}
          </div>

          {canDecide && (
            <div className="bg-secondary/10 p-4 rounded-xl border border-border/50 space-y-4 mt-4">
              <h5 className="font-semibold flex items-center gap-2"><Gavel className="w-4 h-4" /> Make Decision</h5>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor={`decision-state-${item.reportId}`} className="block text-xs font-medium mb-1">State *</label>
                  <Select value={decisionState} onValueChange={(val) => setDecisionState(val as ModerationDecisionInputState)}>
                    <SelectTrigger id={`decision-state-${item.reportId}`} className="bg-card" data-testid={`select-decision-state-${item.reportId}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.values(ModerationDecisionInputState).map(state => (
                        <SelectItem key={state} value={state}>{state.toUpperCase()}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label htmlFor={`decision-sanction-${item.reportId}`} className="block text-xs font-medium mb-1">Sanction (Optional)</label>
                  <Select value={decisionSanction} onValueChange={(value) => setDecisionSanction(value as ModerationDecisionInputSanction)}>
                    <SelectTrigger id={`decision-sanction-${item.reportId}`} className="bg-card" data-testid={`select-decision-sanction-${item.reportId}`}>
                      <SelectValue placeholder="No sanction" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.values(ModerationDecisionInputSanction).map((sanction) => (
                        <SelectItem key={sanction} value={sanction}>
                          {sanction.replaceAll("_", " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <label htmlFor={`decision-text-${item.reportId}`} className="block text-xs font-medium mb-1">Decision Text (Optional)</label>
                <Input id={`decision-text-${item.reportId}`} value={decisionText} onChange={e => setDecisionText(e.target.value)} placeholder="Decision text for user" className="bg-card" data-testid={`input-decision-text-${item.reportId}`} />
              </div>
              <div>
                <label htmlFor={`decision-reason-${item.reportId}`} className="block text-xs font-medium mb-1">Internal Reason *</label>
                <Textarea id={`decision-reason-${item.reportId}`} value={decisionReason} onChange={e => setDecisionReason(e.target.value)} placeholder="Audit reason..." className="bg-card min-h-[80px]" data-testid={`input-decision-reason-${item.reportId}`} />
              </div>
              <Button onClick={handleDecide} disabled={decideModeration.isPending || !decisionReason} className="w-full" data-testid={`button-submit-decision-${item.reportId}`}>
                {decideModeration.isPending ? "Saving..." : "Record Decision"}
              </Button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function AppealCard({ appeal }: { appeal: Appeal }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [reviewStatus, setReviewStatus] = useState<AppealReviewInputStatus>("allowed");
  const [reviewReason, setReviewReason] = useState("");
  const reviewAppeal = useReviewStaffAppeal();

  const handleReview = async () => {
    if (!reviewReason) return;
    try {
      await reviewAppeal.mutateAsync({
        id: appeal.id,
        data: { status: reviewStatus, reason: reviewReason }
      });
      queryClient.invalidateQueries({ queryKey: getListStaffAppealsQueryKey() });
      toast({ title: "Appeal reviewed" });
    } catch (e: any) {
      toast({ title: "Failed to review appeal", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="border border-border p-5 rounded-2xl bg-card shadow-sm" data-testid={`row-staff-appeal-${appeal.id}`}>
      <div className="flex justify-between items-start mb-2">
        <div className="font-mono text-xs text-muted-foreground mb-2">
          Appeal ID: {appeal.id}<br/>
          Record ID: {appeal.moderationRecordId}<br/>
          Appellant: {appeal.appellantMemberId}
        </div>
        <span className="text-xs px-2 py-1 rounded-md font-semibold tracking-wider uppercase bg-secondary text-secondary-foreground">
          {appeal.status}
        </span>
      </div>
      
      <p className="text-foreground bg-muted p-4 rounded-xl border border-border mt-3 text-sm italic">
        "{appeal.statement}"
      </p>
      
      {appeal.status === 'pending' && (
        <div className="mt-4 space-y-4 border-t border-border/50 pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor={`appeal-status-${appeal.id}`} className="block text-xs font-medium mb-1">Status *</label>
              <Select value={reviewStatus} onValueChange={(val) => setReviewStatus(val as AppealReviewInputStatus)}>
                <SelectTrigger id={`appeal-status-${appeal.id}`} className="bg-card" data-testid={`select-appeal-status-${appeal.id}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="allowed">ALLOW</SelectItem>
                  <SelectItem value="removed">REMOVE</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label htmlFor={`appeal-reason-${appeal.id}`} className="block text-xs font-medium mb-1">Reason *</label>
              <Input 
                id={`appeal-reason-${appeal.id}`}
                value={reviewReason} 
                onChange={e => setReviewReason(e.target.value)} 
                placeholder="Required reasoning..." 
                className="bg-card" 
                data-testid={`input-appeal-reason-${appeal.id}`} 
              />
            </div>
          </div>
          <Button onClick={handleReview} disabled={reviewAppeal.isPending || !reviewReason} data-testid={`button-review-appeal-${appeal.id}`}>
            Submit Review
          </Button>
        </div>
      )}
    </div>
  );
}

function ModerationDashboard({ caps }: { caps: StaffCapabilities }) {
  const canViewMod = caps.capabilities.includes("moderation.queue");
  const canViewUrgent = caps.capabilities.includes("moderation.urgent");
  const canViewAppeals = caps.capabilities.includes("appeals.review");

  const { data: modQueue, isLoading: isModLoading } = useGetModerationQueue({
    query: { queryKey: getGetModerationQueueQueryKey(), enabled: canViewMod }
  });
  
  const { data: urgentQueue, isLoading: isUrgentLoading } = useGetUrgentModerationQueue({
    query: { queryKey: getGetUrgentModerationQueueQueryKey(), enabled: canViewUrgent }
  });

  const { data: appeals, isLoading: isAppealsLoading } = useListStaffAppeals({
    query: { queryKey: getListStaffAppealsQueryKey(), enabled: canViewAppeals }
  });

  return (
    <div className="space-y-12">
      {canViewUrgent && (
        <section>
          <h3 className="text-2xl font-display font-semibold flex items-center gap-3 mb-6 text-destructive">
            <AlertTriangle className="w-6 h-6" /> Urgent Queue
          </h3>
          {isUrgentLoading ? (
            <p className="text-muted-foreground" role="status">Loading urgent queue...</p>
          ) : urgentQueue && urgentQueue.length > 0 ? (
            <div className="space-y-4">
              {urgentQueue.map((item) => <QueueItemCard key={item.reportId} item={item} caps={caps} />)}
            </div>
          ) : (
            <p className="text-muted-foreground italic bg-card p-6 rounded-2xl border border-border">No urgent items in queue.</p>
          )}
        </section>
      )}

      {canViewMod && (
        <section>
          <h3 className="text-2xl font-display font-semibold flex items-center gap-3 mb-6">
            <Search className="w-6 h-6 text-primary" /> Moderation Queue
          </h3>
          {isModLoading ? (
            <p className="text-muted-foreground" role="status">Loading moderation queue...</p>
          ) : modQueue && modQueue.length > 0 ? (
            <div className="space-y-4">
              {modQueue.map((item) => <QueueItemCard key={item.reportId} item={item} caps={caps} />)}
            </div>
          ) : (
            <p className="text-muted-foreground italic bg-card p-6 rounded-2xl border border-border">No items in standard moderation queue.</p>
          )}
        </section>
      )}

      {canViewAppeals && (
        <section>
          <h3 className="text-2xl font-display font-semibold flex items-center gap-3 mb-6">
            <FileCheck className="w-6 h-6 text-primary" /> Appeals Review
          </h3>
          {isAppealsLoading ? (
            <p className="text-muted-foreground" role="status">Loading appeals...</p>
          ) : appeals && appeals.length > 0 ? (
            <div className="space-y-4">
              {appeals.map(appeal => <AppealCard key={appeal.id} appeal={appeal} />)}
            </div>
          ) : (
            <p className="text-muted-foreground italic bg-card p-6 rounded-2xl border border-border">No appeals to review.</p>
          )}
        </section>
      )}
      
      {!canViewUrgent && !canViewMod && !canViewAppeals && (
        <div className="bg-card border border-border p-8 rounded-2xl text-center">
          <p className="text-muted-foreground">You do not have any active moderation queues or appeal tools assigned to your role.</p>
        </div>
      )}
    </div>
  );
}

export default function StaffModerationPage() {
  const { data: caps, isLoading, isError, error } = useGetStaffCapabilities();

  if (isLoading) {
    return (
      <div className="flex flex-col gap-8 md:gap-10 animate-in fade-in duration-500 max-w-4xl mx-auto">
        <PageHeader title="Staff Moderation" />
        <div className="flex justify-center p-10 bg-card rounded-[2rem] border border-border" role="status">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      </div>
    );
  }

  if (isError || !caps) {
    const status = error?.status;
    const isMfaError = status === 403;
    
    return (
      <div className="flex flex-col gap-8 md:gap-10 animate-in fade-in duration-500 max-w-3xl mx-auto">
        <PageHeader title="Access Denied" />
        <div className="bg-destructive/10 border border-destructive/30 p-8 rounded-[2rem] text-center" role="alert">
          <ShieldCheck className="w-12 h-12 text-destructive mx-auto mb-4" />
          <h2 className="text-xl font-bold text-destructive-foreground mb-2">Unauthorized Access</h2>
          <p className="text-destructive-foreground/80">
            {isMfaError 
              ? "Staff permission and fresh MFA are required to access this area. Please re-authenticate." 
              : "You do not have staff permissions to access this area or the server is unavailable."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-10 animate-in fade-in duration-500 max-w-4xl mx-auto">
      <div>
        <PageHeader 
          title="Staff Moderation" 
          description="Process incoming reports, urgent escalations, and review appeals."
        />
      </div>

      <div className="bg-primary/5 border border-primary/20 p-6 rounded-[2rem] shadow-sm flex items-start gap-4">
        <ShieldCheck className="w-8 h-8 text-primary shrink-0 mt-1" />
        <div>
          <h3 className="font-semibold text-lg text-primary">Active Staff Session</h3>
          <p className="text-muted-foreground text-sm mt-1">Role: <span className="uppercase font-bold tracking-wider">{caps.role}</span></p>
          <div className="flex flex-wrap gap-2 mt-3">
            {caps.capabilities.map(c => (
              <span key={c} className="bg-card border border-border px-2 py-1 rounded text-xs font-medium">
                {c}
              </span>
            ))}
          </div>
        </div>
      </div>

      <ErrorBoundary>
        <ModerationDashboard caps={caps} />
      </ErrorBoundary>
    </div>
  );
}
