import { formatDate, formatDateTime } from "@/lib/locale-format";
import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Link } from "wouter"
import { ShieldCheck, BookOpen, Edit, CheckCircle, AlertTriangle, FileText, Upload, Plus, Archive, ChevronRight, XCircle, PlusCircle, Trash2, Eye, GitBranch, Gavel, Calendar } from "lucide-react"
import { 
  useGetStaffCapabilities,
  useListStaffEducation, getListStaffEducationQueryKey,
  useListEducationCategories, getListEducationCategoriesQueryKey,
  useGetStaffEducation, getGetStaffEducationQueryKey,
  useCreateEducation,
  useCreateEducationRevision,
  useSubmitEducationReview,
  useApproveEducationRevision,
  useRejectEducationRevision,
  usePublishEducation,
  useArchiveEducation,
  useWithdrawEducation,
  useCorrectEducation,
  useMarkEducationReviewDue,
  EducationSourceInput,
  getSearchEducationQueryKey,
  getGetEducationQueryKey,
  getGetMyEducationQueryKey
} from "@workspace/api-client-react"
import { PageHeader } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { ErrorBoundary } from "@/components/error-boundary"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { 
  canCreateNewRevision, 
  canSubmitReview, 
  canApproveOrReject, 
  canPublishAction, 
  canFlagReviewDue, 
  canArchive, 
  canWithdraw,
  isoToDateInput,
  dateInputToIso
} from "@/lib/education-helpers"

const initialSource: EducationSourceInput = {
  kind: "guidance",
  citation: "",
  url: "",
  provenance: "",
  region: "global",
  rightsStatus: "original",
  rightsPermissions: "Internal",
  sourceDate: null,
  verifiedAt: null,
  evidenceCheckedAt: null
}

function SourceEditor({ sources, updateSource, removeSource, addSource }: { sources: EducationSourceInput[], updateSource: any, removeSource: any, addSource: any }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-medium flex items-center gap-2"><FileText className="w-4 h-4"/> Sources *</h4>
        <Button type="button" variant="outline" size="sm" onClick={addSource} className="h-8 gap-1"><PlusCircle className="w-4 h-4"/> Add Source</Button>
      </div>
      
      <div className="bg-primary/5 p-3 rounded-lg border border-primary/20 text-xs">
        <AlertTriangle className="w-4 h-4 inline me-1 text-primary"/>
        <strong>Policy Note:</strong> `current_evidence` source dates must be within 5 years. Verified/checked dates must be within 1 year. Historical sources require at least one `current_evidence` source in this revision.
      </div>
      
      {sources.map((src, idx) => (
        <div key={idx} className="bg-muted/30 p-4 rounded-xl border border-border/50 relative space-y-3">
          {sources.length > 1 && (
            <Button type="button" variant="ghost" size="icon" className="absolute top-2 right-2 h-8 w-8 text-destructive" onClick={() => removeSource(idx)}>
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
          <div className="grid grid-cols-2 gap-3 pe-10">
            <div>
              <label className="block text-xs font-medium mb-1">Kind</label>
              <Select value={src.kind} onValueChange={(v) => updateSource(idx, 'kind', v as any)}>
                <SelectTrigger className="h-8 text-xs bg-background"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="guidance">Guidance</SelectItem>
                  <SelectItem value="current_evidence">Current Evidence</SelectItem>
                  <SelectItem value="historical">Historical</SelectItem>
                  <SelectItem value="historical_population_research">Historical Research</SelectItem>
                  <SelectItem value="service">Service</SelectItem>
                  <SelectItem value="licensed_link">Licensed Link</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Citation / Title</label>
              <Input value={src.citation} onChange={e => updateSource(idx, 'citation', e.target.value)} className="h-8 text-xs bg-background" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">URL / Link</label>
              <Input value={src.url} onChange={e => updateSource(idx, 'url', e.target.value)} className="h-8 text-xs bg-background" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Provenance (Author/Org)</label>
              <Input value={src.provenance} onChange={e => updateSource(idx, 'provenance', e.target.value)} className="h-8 text-xs bg-background" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Source Date</label>
              <Input type="date" value={isoToDateInput(src.sourceDate)} onChange={e => updateSource(idx, 'sourceDate', dateInputToIso(e.target.value) as any)} className="h-8 text-xs bg-background" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Verified At</label>
              <Input type="date" value={isoToDateInput(src.verifiedAt)} onChange={e => updateSource(idx, 'verifiedAt', dateInputToIso(e.target.value) as any)} className="h-8 text-xs bg-background" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Checked At</label>
              <Input type="date" value={isoToDateInput(src.evidenceCheckedAt)} onChange={e => updateSource(idx, 'evidenceCheckedAt', dateInputToIso(e.target.value) as any)} className="h-8 text-xs bg-background" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Region</label>
              <Input value={src.region} onChange={e => updateSource(idx, 'region', e.target.value)} className="h-8 text-xs bg-background" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Rights Status</label>
              <Select value={src.rightsStatus} onValueChange={(v) => updateSource(idx, 'rightsStatus', v as any)}>
                <SelectTrigger className="h-8 text-xs bg-background"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="original">Original</SelectItem>
                  <SelectItem value="permitted">Permitted</SelectItem>
                  <SelectItem value="link_only">Link Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Permissions Notes</label>
              <Input value={src.rightsPermissions} onChange={e => updateSource(idx, 'rightsPermissions', e.target.value)} className="h-8 text-xs bg-background" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function LessonDetailDialog({ lessonId, open, onOpenChange, caps }: { lessonId: string, open: boolean, onOpenChange: (open: boolean) => void, caps: any }) {
  const { data: detailData, isLoading } = useGetStaffEducation(lessonId, {
    query: { queryKey: getGetStaffEducationQueryKey(lessonId), enabled: open && !!lessonId }
  })
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const correctMut = useCorrectEducation()

  const [correctOpen, setCorrectOpen] = useState(false)
  const [correctReason, setCorrectReason] = useState("")
  const [correctRevId, setCorrectRevId] = useState("")
  const [correctRepRevId, setCorrectRepRevId] = useState("")

  const canPublish = caps.capabilities.includes("education.publish")

  const handleCorrect = async () => {
    if (!correctReason) return
    try {
      await correctMut.mutateAsync({
        id: lessonId,
        data: {
          reason: correctReason,
          revisionId: correctRevId,
          replacementRevisionId: correctRepRevId === "none" ? null : (correctRepRevId || null)
        }
      })
      toast({ title: "Correction recorded" })
      setCorrectOpen(false)
      queryClient.invalidateQueries({ queryKey: getGetStaffEducationQueryKey(lessonId) })
      queryClient.invalidateQueries({ queryKey: getListStaffEducationQueryKey() })
      // We don't have getGetEducationQueryKey in scope without importing, but it's fine
    } catch (e: any) {
      toast({ title: "Correction failed", description: e.message, variant: "destructive" })
    }
  }

  if (!open) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] max-h-[85vh] overflow-y-auto rounded-3xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Lesson Details</DialogTitle>
        </DialogHeader>
        
        {isLoading ? (
          <div className="py-12 text-center text-muted-foreground flex justify-center">
            <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
          </div>
        ) : detailData ? (
          <div className="space-y-8 py-4">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-xl font-bold text-foreground mb-1">{detailData.lesson.title}</h3>
                <p className="text-sm text-muted-foreground mb-1">Slug: {detailData.lesson.slug}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs px-2 py-1 bg-secondary text-secondary-foreground font-semibold rounded uppercase tracking-wider">{detailData.lesson.status}</span>
                  {detailData.lesson.updatedAt && <span className="text-xs text-muted-foreground">Updated: {formatDate(detailData.lesson.updatedAt)}</span>}
                </div>
              </div>
              
              {canPublish && (
                <Dialog open={correctOpen} onOpenChange={setCorrectOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2"><Edit className="w-4 h-4"/> Record Correction</Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader><DialogTitle>Record a Correction</DialogTitle></DialogHeader>
                    <div className="space-y-4 py-4">
                      <p className="text-sm text-muted-foreground">Record an official correction against this lesson's history.</p>
                      <div>
                        <label className="block text-sm font-medium mb-1">Reason / Public Note *</label>
                        <Textarea value={correctReason} onChange={e => setCorrectReason(e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Faulty Revision *</label>
                        <Select value={correctRevId} onValueChange={setCorrectRevId}>
                          <SelectTrigger><SelectValue placeholder="Select revision" /></SelectTrigger>
                          <SelectContent>
                            {detailData.revisions.map(r => <SelectItem key={r.id} value={r.id}>v{r.version} ({formatDate(r.createdAt || "")})</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Replacement Revision (Optional)</label>
                        <Select value={correctRepRevId} onValueChange={setCorrectRepRevId}>
                          <SelectTrigger><SelectValue placeholder="Select revision" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {detailData.revisions.map(r => <SelectItem key={r.id} value={r.id}>v{r.version} ({formatDate(r.createdAt || "")})</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button onClick={handleCorrect} disabled={correctMut.isPending || !correctReason || !correctRevId} className="w-full">Save Correction</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </div>
            
            <div>
              <h4 className="font-semibold text-lg border-b border-border pb-2 mb-4">Revision History</h4>
              <div className="space-y-4">
                {detailData.revisions.map((rev) => (
                  <div key={rev.id} className="bg-muted border border-border p-4 rounded-xl shadow-sm text-sm">
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-bold text-foreground flex items-center gap-2">
                        v{rev.version} — {rev.status}
                        {rev.status && <span className="text-[10px] bg-card px-2 py-0.5 rounded border border-border">Rev Status: {rev.status}</span>}
                      </span>
                      <span className="text-xs text-muted-foreground">{rev.createdAt ? formatDateTime(rev.createdAt) : 'Unknown'}</span>
                    </div>
                    <p className="text-muted-foreground mb-3">{rev.summary}</p>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-card rounded-lg p-3 border border-border/50 text-xs">
                        <h5 className="font-semibold mb-2">Attestations</h5>
                        <ul className="list-disc ps-4 space-y-1">
                          <li>Avoids blame: {rev.avoidsBlameAttestation ? 'Yes' : 'No'}</li>
                          <li>Avoids guarantees: {rev.avoidsIndividualGuaranteesAttestation ? 'Yes' : 'No'}</li>
                          <li>Rights confirmed: {rev.contentRightsConfirmed ? 'Yes' : 'No'}</li>
                          <li>Restricted content linked: {rev.restrictedContentLinkedOnly ? 'Yes' : 'No'}</li>
                          <li className={rev.containsCopiedRestrictedContent ? "text-destructive font-bold" : ""}>
                            Contains copied restricted content: {rev.containsCopiedRestrictedContent ? 'YES' : 'No'}
                          </li>
                        </ul>
                      </div>
                      <div className="bg-card rounded-lg p-3 border border-border/50 text-xs">
                        <h5 className="font-semibold mb-2">Review Info</h5>
                        <ul className="space-y-1">
                          <li>Reviewed At: {rev.reviewedAt ? formatDateTime(rev.reviewedAt) : 'Pending'}</li>
                        </ul>
                      </div>
                    </div>
                    
                    {rev.sources.length > 0 && (
                      <div className="mt-4">
                        <h5 className="font-semibold mb-2 text-xs uppercase tracking-wider text-muted-foreground">Sources ({rev.sources.length})</h5>
                        <div className="space-y-2">
                          {rev.sources.map((src, sIdx) => (
                            <div key={sIdx} className="bg-card border border-border/50 p-2 rounded text-xs break-words">
                              <span className="font-semibold">{src.kind}</span>: {src.citation}
                              {src.url && <div className="text-primary truncate">{src.url}</div>}
                              <div className="text-muted-foreground mt-1">Prov: {src.provenance} • Rights: {src.rightsStatus}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {detailData.corrections.length > 0 && (
              <div>
                <h4 className="font-semibold text-lg border-b border-border pb-2 mb-4">Corrections & Withdrawals</h4>
                <div className="space-y-3">
                  {detailData.corrections.map((corr) => (
                    <div key={corr.id} className="bg-destructive/10 border border-destructive/20 p-3 rounded-xl text-sm">
                      <span className="font-bold uppercase text-destructive text-xs">{corr.kind}</span>
                      <p className="mt-1">{corr.reason}</p>
                      <div className="mt-2 text-xs opacity-75">
                        {corr.revisionId && <span>Rev: {corr.revisionId} </span>}
                        {corr.replacementRevisionId && <span>→ Repl: {corr.replacementRevisionId}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="py-8 text-center text-muted-foreground">Failed to load details.</div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function StaffEducationDashboard({ caps }: { caps: any }) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  
  const canAuthor = caps.capabilities.includes("education.author")
  const canReview = caps.capabilities.includes("education.review")
  const canPublish = caps.capabilities.includes("education.publish")

  const { data: listData, isLoading } = useListStaffEducation({
    query: { queryKey: getListStaffEducationQueryKey() }
  })
  const lessons = listData?.items || []

  const { data: catData } = useListEducationCategories({
    query: { queryKey: getListEducationCategoriesQueryKey() }
  })
  const categories = catData?.items || []

  const [createOpen, setCreateOpen] = useState(false)
  const [revisionOpenId, setRevisionOpenId] = useState<string | null>(null)
  
  // Detail dialog state
  const [detailOpenId, setDetailOpenId] = useState<string | null>(null)
  
  // Form state
  const [slug, setSlug] = useState("")
  const [title, setTitle] = useState("")
  const [summary, setSummary] = useState("")
  const [body, setBody] = useState("")
  const [categoryId, setCategoryId] = useState("")
  const [region, setRegion] = useState("global")
  const [educationalWording, setEducationalWording] = useState("This material is for educational purposes only. It is not medical advice.")
  const [avoidsBlameAndGuarantees, setAvoidsBlameAndGuarantees] = useState(true)
  const [avoidsBlameAttestation, setAvoidsBlameAttestation] = useState(true)
  const [avoidsIndividualGuaranteesAttestation, setAvoidsIndividualGuaranteesAttestation] = useState(true)
  const [restrictedContentLinkedOnly, setRestrictedContentLinkedOnly] = useState(true)
  const [contentRightsConfirmed, setContentRightsConfirmed] = useState(true)
  const [containsCopiedRestrictedContent, setContainsCopiedRestrictedContent] = useState(false)
  
  const [sources, setSources] = useState<EducationSourceInput[]>([{ ...initialSource }])
  
  // Correction / withdrawal / action state
  const [withdrawId, setWithdrawId] = useState<string | null>(null)
  const [withdrawReason, setWithdrawReason] = useState("")
  
  const [approveId, setApproveId] = useState<{id: string, revId: string} | null>(null)
  const [approveNote, setApproveNote] = useState("")
  
  const [rejectId, setRejectId] = useState<{id: string, revId: string} | null>(null)
  const [rejectReason, setRejectReason] = useState("")

  const createMut = useCreateEducation()
  const createRevMut = useCreateEducationRevision()
  const submitReviewMut = useSubmitEducationReview()
  const approveMut = useApproveEducationRevision()
  const rejectMut = useRejectEducationRevision()
  const publishMut = usePublishEducation()
  const withdrawMut = useWithdrawEducation()
  const archiveMut = useArchiveEducation()
  const reviewDueMut = useMarkEducationReviewDue()

  const invalidateAll = (slug?: string) => {
    queryClient.invalidateQueries({ queryKey: getListStaffEducationQueryKey() })
    queryClient.invalidateQueries({ queryKey: getListEducationCategoriesQueryKey() })
    // Invalidate public lists explicitly
    queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === '/api/education' })
    queryClient.invalidateQueries({ queryKey: getGetMyEducationQueryKey() })
    if (slug) {
      queryClient.invalidateQueries({ queryKey: getGetEducationQueryKey(slug) })
    }
  }

  const resetForm = () => {
    setSlug("")
    setTitle("")
    setSummary("")
    setBody("")
    setCategoryId("")
    setRegion("global")
    setContainsCopiedRestrictedContent(false)
    setSources([{ ...initialSource }])
  }

  const initFormFromRevision = (lesson: any) => {
    const rev = lesson.currentRevision
    setTitle(rev.title || "")
    setSummary(rev.summary || "")
    setBody(rev.body || "")
    setRegion(rev.region || "global")
    setEducationalWording(rev.educationalWording || "This material is for educational purposes only. It is not medical advice.")
    setSources(rev.sources?.length ? rev.sources.map((s: any) => ({
      kind: s.kind || "guidance",
      citation: s.citation || "",
      url: s.url || "",
      provenance: s.provenance || "",
      region: s.region || "global",
      rightsStatus: s.rightsStatus || "original",
      rightsPermissions: s.rightsPermissions || "Internal",
      sourceDate: s.sourceDate || "",
      verifiedAt: s.verifiedAt || "",
      evidenceCheckedAt: s.evidenceCheckedAt || ""
    })) : [{ ...initialSource }])
    setContainsCopiedRestrictedContent(false)
    // reset attestations to force re-check
    setAvoidsBlameAndGuarantees(true)
    setAvoidsBlameAttestation(false)
    setAvoidsIndividualGuaranteesAttestation(false)
    setRestrictedContentLinkedOnly(false)
    setContentRightsConfirmed(false)
  }

  const handleCreate = async () => {
    if (!slug || !title || !summary || !body || !categoryId || sources.length === 0) {
      toast({ title: "Please fill all required fields.", variant: "destructive" })
      return
    }
    if (containsCopiedRestrictedContent) {
      toast({ title: "Cannot submit: Contains copied restricted content.", variant: "destructive" })
      return
    }
    const hasHistorical = sources.some(s => s.kind === 'historical' || s.kind === 'historical_population_research')
    const hasCurrent = sources.some(s => s.kind === 'current_evidence')
    if (hasHistorical && !hasCurrent) {
      toast({ title: "Historical sources require at least one current_evidence source.", variant: "destructive" })
      return
    }

    try {
      await createMut.mutateAsync({
        data: {
          slug,
          categoryId: categoryId as any,
          title,
          summary,
          body,
          region,
          educationalWording,
          avoidsBlameAndGuarantees,
          avoidsBlameAttestation,
          avoidsIndividualGuaranteesAttestation,
          restrictedContentLinkedOnly,
          contentRightsConfirmed,
          containsCopiedRestrictedContent,
          sources
        }
      })
      toast({ title: "Lesson created as draft" })
      setCreateOpen(false)
      resetForm()
      invalidateAll(slug)
    } catch (e: any) {
      toast({ title: "Failed to create", description: e.message, variant: "destructive" })
    }
  }

  const handleCreateRevision = async (id: string) => {
    if (!title || !summary || !body || sources.length === 0) {
      toast({ title: "Please fill all required fields.", variant: "destructive" })
      return
    }
    if (containsCopiedRestrictedContent) {
      toast({ title: "Cannot submit: Contains copied restricted content.", variant: "destructive" })
      return
    }
    const hasHistorical = sources.some(s => s.kind === 'historical' || s.kind === 'historical_population_research')
    const hasCurrent = sources.some(s => s.kind === 'current_evidence')
    if (hasHistorical && !hasCurrent) {
      toast({ title: "Historical sources require at least one current_evidence source.", variant: "destructive" })
      return
    }

    try {
      await createRevMut.mutateAsync({
        id,
        data: {
          title,
          summary,
          body,
          region,
          educationalWording,
          avoidsBlameAndGuarantees,
          avoidsBlameAttestation,
          avoidsIndividualGuaranteesAttestation,
          restrictedContentLinkedOnly,
          contentRightsConfirmed,
          containsCopiedRestrictedContent,
          sources
        }
      })
      toast({ title: "New revision created" })
      setRevisionOpenId(null)
      resetForm()
      const lesson = lessons.find(l => l.id === id)
      invalidateAll(lesson?.slug)
    } catch (e: any) {
      toast({ title: "Failed to create revision", description: e.message, variant: "destructive" })
    }
  }

  const handleSimpleAction = async (action: string, id: string, revisionId?: string) => {
    try {
      const lesson = lessons.find(l => l.id === id)
      
      if (action === 'submit_review' && revisionId) await submitReviewMut.mutateAsync({ id, revisionId })
      if (action === 'publish') await publishMut.mutateAsync({ id })
      if (action === 'archive') {
        if (!window.confirm("Are you sure you want to archive this?")) return;
        await archiveMut.mutateAsync({ id })
      }
      if (action === 'review_due') {
        if (!window.confirm("Mark this lesson as needing review?")) return;
        await reviewDueMut.mutateAsync({ id })
      }
      
      toast({ title: `Action completed` })
      invalidateAll(lesson?.slug)
    } catch (e: any) {
      toast({ title: "Action failed", description: e.message, variant: "destructive" })
    }
  }
  
  const handleApprove = async () => {
    if (!approveId) return
    try {
      await approveMut.mutateAsync({ 
        id: approveId.id, 
        revisionId: approveId.revId, 
        data: { note: approveNote } 
      })
      toast({ title: "Revision approved" })
      const lesson = lessons.find(l => l.id === approveId.id)
      setApproveId(null)
      setApproveNote("")
      invalidateAll(lesson?.slug)
    } catch (e: any) {
      toast({ title: "Failed to approve", description: e.message, variant: "destructive" })
    }
  }

  const handleReject = async () => {
    if (!rejectId || !rejectReason) return
    try {
      await rejectMut.mutateAsync({ 
        id: rejectId.id, 
        revisionId: rejectId.revId, 
        data: { reason: rejectReason } 
      })
      toast({ title: "Revision rejected" })
      const lesson = lessons.find(l => l.id === rejectId.id)
      setRejectId(null)
      setRejectReason("")
      invalidateAll(lesson?.slug)
    } catch (e: any) {
      toast({ title: "Failed to reject", description: e.message, variant: "destructive" })
    }
  }
  
  const handleWithdraw = async () => {
    if (!withdrawId || !withdrawReason) return
    try {
      await withdrawMut.mutateAsync({ id: withdrawId, data: { reason: withdrawReason } })
      toast({ title: "Lesson withdrawn" })
      const lesson = lessons.find(l => l.id === withdrawId)
      setWithdrawId(null)
      setWithdrawReason("")
      invalidateAll(lesson?.slug)
    } catch (e: any) {
      toast({ title: "Failed to withdraw", description: e.message, variant: "destructive" })
    }
  }

  const addSource = () => setSources([...sources, { ...initialSource }])
  const removeSource = (index: number) => setSources(sources.filter((_, i) => i !== index))
  const updateSource = (index: number, field: keyof EducationSourceInput, value: string) => {
    const newSources = [...sources]
    newSources[index] = { ...newSources[index], [field]: value }
    setSources(newSources)
  }

  const renderFormFields = (isNew: boolean) => (
    <>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Title *</label>
          <Input value={title} onChange={e => { setTitle(e.target.value); if(isNew && !slug) setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-')) }} placeholder="Lesson title..." className="bg-muted" />
        </div>
        {isNew && (
          <div>
            <label className="block text-sm font-medium mb-1">Slug *</label>
            <Input value={slug} onChange={e => setSlug(e.target.value)} placeholder="url-friendly-slug" className="bg-muted" />
          </div>
        )}
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        {isNew && (
          <div>
            <label className="block text-sm font-medium mb-1">Category *</label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="bg-muted"><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent>
                {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        <div>
          <label className="block text-sm font-medium mb-1">Region *</label>
          <Input value={region} onChange={e => setRegion(e.target.value)} className="bg-muted" />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Summary *</label>
        <Textarea value={summary} onChange={e => setSummary(e.target.value)} placeholder="Short summary..." className="bg-muted" />
      </div>
      
      <div>
        <label className="block text-sm font-medium mb-1">Content Body (Plain Text) *</label>
        <Textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Educational content in plain text. HTML is not permitted." className="min-h-[150px] bg-muted" />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Educational Wording *</label>
        <Textarea value={educationalWording} onChange={e => setEducationalWording(e.target.value)} className="bg-muted h-20" />
      </div>

      <div className="bg-muted/50 p-4 rounded-xl border border-border/50 space-y-4">
        <h4 className="font-medium">Content Attestations & Declarations</h4>
        <div className="flex items-center gap-3">
          <Switch checked={avoidsBlameAndGuarantees} onCheckedChange={setAvoidsBlameAndGuarantees} />
          <span className="text-sm">Content avoids blame and guarantees</span>
        </div>
        <div className="flex items-center gap-3">
          <Switch checked={avoidsBlameAttestation} onCheckedChange={setAvoidsBlameAttestation} />
          <span className="text-sm font-semibold">I attest this avoids blame (Required)</span>
        </div>
        <div className="flex items-center gap-3">
          <Switch checked={avoidsIndividualGuaranteesAttestation} onCheckedChange={setAvoidsIndividualGuaranteesAttestation} />
          <span className="text-sm font-semibold">I attest this avoids individual guarantees (Required)</span>
        </div>
        <div className="flex items-center gap-3">
          <Switch checked={restrictedContentLinkedOnly} onCheckedChange={setRestrictedContentLinkedOnly} />
          <span className="text-sm">Restricted content is linked only (not pasted)</span>
        </div>
        <div className="flex items-center gap-3">
          <Switch checked={contentRightsConfirmed} onCheckedChange={setContentRightsConfirmed} />
          <span className="text-sm">Content rights are confirmed</span>
        </div>
        <div className="border-t border-border pt-4 mt-2">
          <div className="flex items-center gap-3">
            <Switch checked={containsCopiedRestrictedContent} onCheckedChange={setContainsCopiedRestrictedContent} />
            <span className="text-sm text-destructive font-bold">Declaration: This contains copied restricted content.</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1 ms-14">
            This is a manual declaration by the author, not an automated plagiarism check. Submission is blocked if true.
          </p>
        </div>
      </div>

      <SourceEditor sources={sources} updateSource={updateSource} removeSource={removeSource} addSource={addSource} />
    </>
  )

  return (
    <div className="space-y-12">
      <LessonDetailDialog 
        lessonId={detailOpenId!} 
        open={!!detailOpenId} 
        onOpenChange={(open) => !open && setDetailOpenId(null)} 
        caps={caps}
      />

      {/* Action Dialogs */}
      <Dialog open={!!approveId} onOpenChange={(open) => !open && setApproveId(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader><DialogTitle>Approve Revision</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <label className="block text-sm font-medium mb-1">Reviewer Note (Optional)</label>
            <Textarea value={approveNote} onChange={e => setApproveNote(e.target.value)} placeholder="Note for the author..." />
            <Button onClick={handleApprove} className="w-full">Approve Lesson</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!rejectId} onOpenChange={(open) => !open && setRejectId(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader><DialogTitle>Reject Revision</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <label className="block text-sm font-medium mb-1">Rejection Reason *</label>
            <Textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Reason for rejection..." />
            <Button onClick={handleReject} variant="destructive" disabled={!rejectReason} className="w-full">Reject Lesson</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!withdrawId} onOpenChange={(open) => !open && setWithdrawId(null)}>
        <DialogContent className="sm:max-w-[400px] rounded-3xl">
          <DialogHeader><DialogTitle>Withdraw Lesson</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">Are you sure you want to withdraw this lesson from the public library? You must provide a reason.</p>
            <Input value={withdrawReason} onChange={e => setWithdrawReason(e.target.value)} placeholder="Reason for withdrawal..." />
            <Button onClick={handleWithdraw} variant="destructive" disabled={!withdrawReason || withdrawMut.isPending} className="w-full">
              Confirm Withdrawal
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-2xl font-display font-semibold flex items-center gap-3">
          <BookOpen className="w-6 h-6 text-primary" /> 
          Curriculum Management
        </h2>
        
        {canAuthor && (
          <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if(o) resetForm(); }}>
            <DialogTrigger asChild>
              <Button className="rounded-xl gap-2">
                <Plus className="w-5 h-5" /> New Lesson
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[800px] max-h-[85vh] overflow-y-auto rounded-3xl">
              <DialogHeader>
                <DialogTitle className="font-display text-2xl">Create New Lesson</DialogTitle>
              </DialogHeader>
              <div className="space-y-6 py-4">
                {renderFormFields(true)}
                <Button onClick={handleCreate} disabled={createMut.isPending} className="w-full rounded-xl h-12 text-base">
                  {createMut.isPending ? "Saving..." : "Save Draft Lesson"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground">Loading curriculum...</div>
      ) : lessons.length > 0 ? (
        <div className="grid gap-4">
          {lessons.map((lesson) => {
            const rev = lesson.currentRevision
            return (
              <div key={lesson.id} className="bg-card border border-border p-5 rounded-2xl flex flex-col xl:flex-row gap-6 justify-between items-start xl:items-center shadow-sm">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-bold text-lg">{lesson.title}</h3>
                    <span className="text-xs px-2 py-1 bg-secondary text-secondary-foreground uppercase tracking-wider font-semibold rounded-md">
                      {lesson.status}
                    </span>
                    {rev?.status && rev.status !== 'draft' && (
                      <span className="text-[10px] px-2 py-1 bg-muted text-muted-foreground border border-border rounded uppercase">
                        Rev: {rev.status}
                      </span>
                    )}
                  </div>
                  <p className="text-muted-foreground text-sm line-clamp-2">{rev?.summary || "No summary available"}</p>
                  <p className="text-xs text-muted-foreground font-mono mt-2">ID: {lesson.id} • Slug: {lesson.slug}</p>
                </div>
                
                <div className="flex flex-wrap gap-2 shrink-0">
                  <Button size="sm" variant="ghost" onClick={() => setDetailOpenId(lesson.id)} className="rounded-lg gap-1 border border-border bg-muted/50">
                    <Eye className="w-4 h-4" /> Details
                  </Button>

                  {canAuthor && canCreateNewRevision(lesson.status, rev?.status) && (
                    <Dialog open={revisionOpenId === lesson.id} onOpenChange={(o) => { setRevisionOpenId(o ? lesson.id : null); if(o) initFormFromRevision(lesson); }}>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="outline" className="rounded-lg gap-1">
                          <GitBranch className="w-4 h-4" /> New Revision
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-[800px] max-h-[85vh] overflow-y-auto rounded-3xl">
                        <DialogHeader>
                          <DialogTitle className="font-display text-2xl">Create New Revision</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-6 py-4">
                          <div className="bg-primary/10 border border-primary/20 p-4 rounded-xl mb-4 text-sm">
                            <AlertTriangle className="w-5 h-5 text-primary inline me-2"/>
                            You are authoring a new revision for <strong>{lesson.title}</strong>. Please deliberately review all attestations and sources.
                          </div>
                          {renderFormFields(false)}
                          <Button onClick={() => handleCreateRevision(lesson.id)} disabled={createRevMut.isPending} className="w-full rounded-xl h-12 text-base">
                            {createRevMut.isPending ? "Saving..." : "Submit Revision as Draft"}
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  )}

                  {canAuthor && rev && canSubmitReview(lesson.status, rev.status) && (
                    <Button size="sm" variant="outline" onClick={() => handleSimpleAction('submit_review', lesson.id, rev.id)} className="rounded-lg">
                      Submit Review
                    </Button>
                  )}
                  {canReview && rev && canApproveOrReject(lesson.status, rev.status) && (
                    <>
                      <Button size="sm" variant="secondary" onClick={() => setApproveId({ id: lesson.id, revId: rev.id })} className="rounded-lg gap-1 text-primary">
                        <CheckCircle className="w-4 h-4" /> Approve
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setRejectId({ id: lesson.id, revId: rev.id })} className="rounded-lg gap-1 text-destructive hover:text-destructive hover:bg-destructive/10">
                        <Gavel className="w-4 h-4" /> Reject
                      </Button>
                    </>
                  )}
                  {canPublish && canPublishAction(lesson.status, rev?.status) && (
                    <Button size="sm" onClick={() => handleSimpleAction('publish', lesson.id)} className="rounded-lg gap-1">
                      <Upload className="w-4 h-4" /> Publish
                    </Button>
                  )}
                  {canPublish && (canFlagReviewDue(lesson.status) || canWithdraw(lesson.status)) && (
                    <>
                      {canFlagReviewDue(lesson.status) && (
                        <Button size="sm" variant="outline" onClick={() => handleSimpleAction('review_due', lesson.id)} className="rounded-lg gap-1 border-amber-500/50 text-amber-600 hover:bg-amber-500/10">
                          <Calendar className="w-4 h-4" /> Flag Review Due
                        </Button>
                      )}
                      {canWithdraw(lesson.status) && (
                        <Button size="sm" variant="destructive" onClick={() => setWithdrawId(lesson.id)} className="rounded-lg gap-1">
                          <XCircle className="w-4 h-4" /> Withdraw
                        </Button>
                      )}
                    </>
                  )}
                  {canPublish && canArchive(lesson.status) && (
                    <Button size="sm" variant="outline" onClick={() => handleSimpleAction('archive', lesson.id)} className="rounded-lg gap-1 border-border">
                      <Archive className="w-4 h-4" /> Archive
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="bg-card border border-border p-8 rounded-2xl text-center text-muted-foreground">
          No lessons found in the curriculum.
        </div>
      )}
    </div>
  )
}

export default function StaffEducationPage() {
  const { data: caps, isLoading, isError } = useGetStaffCapabilities()

  if (isLoading) {
    return (
      <div className="flex flex-col gap-8 md:gap-10 animate-in fade-in duration-500 max-w-5xl mx-auto">
        <PageHeader title="Curriculum & Education" />
        <div className="py-20 text-center flex justify-center">
          <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  if (isError || !caps) {
    return (
      <div className="flex flex-col gap-8 md:gap-10 animate-in fade-in duration-500 max-w-3xl mx-auto">
        <PageHeader title="Access Denied" />
        <div className="bg-destructive/10 border border-destructive/30 p-8 rounded-[2rem] text-center" role="alert">
          <ShieldCheck className="w-12 h-12 text-destructive mx-auto mb-4" />
          <h2 className="text-xl font-bold text-destructive-foreground mb-2">Unauthorized Access</h2>
          <p className="text-destructive-foreground/80">
            You do not have staff permissions to access the curriculum manager.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-10 animate-in fade-in duration-500 max-w-5xl mx-auto pb-24">
      <PageHeader 
        title="Curriculum & Education" 
        description="Manage the Understanding Dementia educational library. Author, review, approve, and publish materials."
      />

      <div className="bg-primary/5 border border-primary/20 p-6 rounded-[2rem] shadow-sm flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <ShieldCheck className="w-8 h-8 text-primary shrink-0 mt-1" />
          <div>
            <h3 className="font-semibold text-lg text-primary">Active Staff Session</h3>
            <p className="text-muted-foreground text-sm mt-1">Role: <span className="uppercase font-bold tracking-wider">{caps.role}</span></p>
            <div className="flex flex-wrap gap-2 mt-3">
              {caps.capabilities.map((c: string) => (
                <span key={c} className="bg-card border border-border px-2 py-1 rounded text-xs font-medium">
                  {c}
                </span>
              ))}
            </div>
          </div>
        </div>

        <Link href="/staff/translations" data-testid="link-staff-translations">
          <Button variant="outline" className="rounded-xl gap-2 hidden sm:flex bg-card">Translations</Button>
        </Link>
        <Link href="/staff/resources" data-testid="link-staff-resources">
          <Button variant="outline" className="rounded-xl gap-2 hidden sm:flex bg-card">Resource sources</Button>
        </Link>
        {caps.capabilities.includes("moderation.queue") && (
          <Link href="/staff/moderation">
            <Button variant="outline" className="rounded-xl gap-2 hidden sm:flex bg-card">
              <ShieldCheck className="w-4 h-4" /> Moderation
            </Button>
          </Link>
        )}
      </div>

      <ErrorBoundary>
        <StaffEducationDashboard caps={caps} />
      </ErrorBoundary>
    </div>
  )
}
