import { useState, useRef, useEffect } from "react"
import { useParams, Link } from "wouter"
import { useAuth } from "@clerk/react"
import { 
  ChevronLeft, Bookmark, BookmarkCheck, CheckCircle2, 
  RefreshCcw, Volume2, Video, FileText, AlertTriangle, Info 
} from "lucide-react"
import { 
  useGetEducation, getGetEducationQueryKey,
  useGetMyEducation, getGetMyEducationQueryKey,
  useSaveEducation, useRemoveEducationSave,
  useUpdateEducationProgress, useResetEducationProgress,
  useSetEducationCompletionOptIn
} from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { Switch } from "@/components/ui/switch"

export default function EducationDetailPage() {
  const params = useParams<{ slug: string }>()
  const slug = params.slug || ""
  const { isSignedIn } = useAuth()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const { data: lesson, isLoading, isError } = useGetEducation(slug, {
    query: { queryKey: getGetEducationQueryKey(slug), enabled: !!slug }
  })

  const { data: myEd } = useGetMyEducation({
    query: { queryKey: getGetMyEducationQueryKey(), enabled: !!isSignedIn }
  })

  const saveMut = useSaveEducation()
  const removeSaveMut = useRemoveEducationSave()
  const updateProgressMut = useUpdateEducationProgress()
  const resetProgressMut = useResetEducationProgress()
  const setOptInMut = useSetEducationCompletionOptIn()

  // Track progress on scroll (simplified mockup)
  const articleRef = useRef<HTMLElement>(null)
  
  const revision = lesson?.revision as any || {}
  const sources = revision.sources || []
  const accessibleMedia = revision.accessibleMedia

  const myProgress = myEd?.progress?.find(p => p.lessonId === lesson?.id)
  const isSaved = myEd?.saves?.some((s: any) => s.lessonId === lesson?.id)

  const handleToggleSave = async () => {
    if (!lesson) return
    try {
      if (isSaved) {
        await removeSaveMut.mutateAsync({ lessonId: lesson.id })
        toast({ title: "Removed from saved lessons" })
      } else {
        await saveMut.mutateAsync({ lessonId: lesson.id })
        toast({ title: "Lesson saved for later" })
      }
      queryClient.invalidateQueries({ queryKey: getGetMyEducationQueryKey() })
    } catch (e: any) {
      toast({ title: "Failed to update save status", variant: "destructive" })
    }
  }

  const handleMarkComplete = async () => {
    if (!lesson) return
    try {
      await updateProgressMut.mutateAsync({
        lessonId: lesson.id,
        data: { percent: 100, completed: true }
      })
      toast({ title: "Lesson marked as complete" })
      queryClient.invalidateQueries({ queryKey: getGetMyEducationQueryKey() })
    } catch (e: any) {
      toast({ title: "Failed to update progress", variant: "destructive" })
    }
  }

  const handleResetProgress = async () => {
    if (!lesson) return
    try {
      await resetProgressMut.mutateAsync({ lessonId: lesson.id })
      toast({ title: "Progress reset" })
      queryClient.invalidateQueries({ queryKey: getGetMyEducationQueryKey() })
    } catch (e: any) {
      toast({ title: "Failed to reset progress", variant: "destructive" })
    }
  }

  const handleToggleOptIn = async (checked: boolean) => {
    if (!lesson) return
    try {
      await setOptInMut.mutateAsync({
        lessonId: lesson.id,
        data: { optIn: checked }
      })
      toast({ title: checked ? "Completion made public" : "Completion made private" })
      queryClient.invalidateQueries({ queryKey: getGetMyEducationQueryKey() })
    } catch (e: any) {
      toast({ title: "Failed to update visibility", variant: "destructive" })
    }
  }

  if (isLoading) {
    return (
      <div className="animate-in fade-in duration-500 py-12 flex justify-center">
        <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    )
  }

  if (isError || !lesson) {
    return (
      <div className="animate-in fade-in duration-500 bg-card border border-border p-12 rounded-3xl text-center shadow-sm max-w-2xl mx-auto mt-8">
        <AlertTriangle className="w-12 h-12 text-destructive mx-auto mb-4" />
        <h2 className="text-2xl font-display font-semibold mb-2">Lesson not found</h2>
        <p className="text-muted-foreground mb-6">The requested educational material is unavailable or has been withdrawn.</p>
        <Link href="/understanding-dementia">
          <Button className="rounded-xl">Return to Library</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8 md:gap-10 animate-in fade-in duration-500 max-w-3xl mx-auto pb-24">
      <div>
        <Link href="/understanding-dementia" className="inline-flex items-center text-muted-foreground hover:text-foreground font-medium mb-6 transition-colors">
          <ChevronLeft className="w-5 h-5 mr-1" />
          Back to Library
        </Link>
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6">
          <h1 className="font-display text-4xl md:text-5xl font-bold text-foreground tracking-tight leading-tight">
            {lesson.title}
          </h1>
          {isSignedIn && (
            <Button
              variant="outline"
              size="icon"
              className="rounded-full w-12 h-12 shrink-0 border-border bg-card shadow-sm hover:bg-secondary hover:text-secondary-foreground"
              onClick={handleToggleSave}
              aria-label={isSaved ? "Remove save" : "Save lesson"}
              title={isSaved ? "Remove save" : "Save lesson"}
            >
              {isSaved ? <BookmarkCheck className="w-6 h-6 text-primary" /> : <Bookmark className="w-6 h-6" />}
            </Button>
          )}
        </div>
        
        <p className="text-xl md:text-2xl text-muted-foreground leading-relaxed">
          {lesson.summary}
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-3 text-sm">
          {revision.region && (
            <span className="px-3 py-1 bg-secondary text-secondary-foreground font-medium rounded-lg uppercase tracking-wide">
              Region: {revision.region}
            </span>
          )}
          {lesson.publishedAt && (
            <span className="text-muted-foreground font-medium">
              Published: {new Date(lesson.publishedAt).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>

      {lesson.status === "review_due" && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive-foreground p-5 rounded-2xl flex gap-4 shadow-sm items-start">
          <AlertTriangle className="w-6 h-6 shrink-0 mt-0.5 text-destructive" />
          <div>
            <h4 className="font-semibold text-lg">Review due</h4>
            <p className="text-base mt-1 opacity-90">This lesson is scheduled for routine review and may contain outdated information. Please consult current sources.</p>
          </div>
        </div>
      )}

      <div className="bg-muted/50 border border-border p-6 rounded-2xl text-muted-foreground text-sm flex gap-4">
        <Info className="w-6 h-6 shrink-0 text-primary mt-0.5" />
        <div className="space-y-2 text-base leading-relaxed">
          <p className="font-semibold text-foreground">Educational purposes only</p>
          <p>{revision.educationalWording || "This material is provided for educational and supportive purposes. It is not a substitute for professional medical advice, diagnosis, or treatment. Always seek the advice of your physician or other qualified health provider with any questions you may have regarding a medical condition."}</p>
        </div>
      </div>

      {(accessibleMedia?.url && (accessibleMedia.kind === 'audio' || accessibleMedia.kind === 'video')) && (
        <div className="bg-card border border-border p-6 rounded-3xl shadow-sm space-y-4">
          <div className="flex items-center gap-3 mb-2">
            {accessibleMedia.kind === 'audio' ? <Volume2 className="w-6 h-6 text-primary" /> : <Video className="w-6 h-6 text-primary" />}
            <h3 className="text-xl font-display font-semibold">Accessible Media ({accessibleMedia.kind})</h3>
          </div>
          
          {accessibleMedia.kind === 'audio' ? (
            <audio controls preload="metadata" className="w-full h-12 rounded-xl focus:outline-none">
              <source src={accessibleMedia.url} />
              Your browser does not support the audio element.
            </audio>
          ) : (
            <video controls preload="metadata" className="w-full rounded-2xl bg-black overflow-hidden focus:outline-none" width={accessibleMedia.width || 640} height={accessibleMedia.height || 360}>
              <source src={accessibleMedia.url} />
              Your browser does not support the video element.
            </video>
          )}

          {accessibleMedia.transcript && (
            <div className="mt-6 pt-4 border-t border-border">
              <h4 className="font-semibold mb-2">Transcript</h4>
              <p className="text-muted-foreground whitespace-pre-wrap text-sm leading-relaxed">{accessibleMedia.transcript}</p>
            </div>
          )}
        </div>
      )}

      <article 
        ref={articleRef}
        className="prose prose-lg dark:prose-invert prose-headings:font-display prose-headings:font-semibold prose-a:text-primary hover:prose-a:text-primary/80 max-w-none text-foreground/90 leading-relaxed whitespace-pre-wrap"
      >
        {revision.body || ""}
      </article>

      {sources.length > 0 && (
        <div className="mt-12 pt-8 border-t border-border">
          <h3 className="text-2xl font-display font-semibold mb-6 flex items-center gap-2">
            <FileText className="w-6 h-6 text-muted-foreground" />
            Sources & References
          </h3>
          <ul className="space-y-4">
            {sources.map((src: any, idx: number) => (
              <li key={idx} className="bg-card border border-border p-4 rounded-xl text-base text-muted-foreground shadow-sm">
                <p className="font-medium text-foreground mb-1">{src.citation}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  <span>Type: {src.kind.replace('_', ' ')}</span>
                  {src.sourceDate && <span>Date: {src.sourceDate}</span>}
                  <span>Provenance: {src.provenance}</span>
                </div>
                {src.url && (
                  <a href={src.url} target="_blank" rel="noopener noreferrer" className="inline-block mt-2 text-primary hover:underline font-medium">
                    View original source
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {isSignedIn && (
        <div className="mt-12 bg-card border border-border p-8 rounded-3xl shadow-sm">
          <h3 className="text-2xl font-display font-semibold mb-2 text-foreground">Your Learning Journey</h3>
          <p className="text-muted-foreground text-lg mb-6">Tracking your progress helps you pick up where you left off.</p>
          
          {myProgress?.completedAt ? (
            <div className="space-y-6">
              <div className="flex items-center gap-3 text-green-600 dark:text-green-500 bg-green-50 dark:bg-green-950/20 p-4 rounded-xl border border-green-200 dark:border-green-900">
                <CheckCircle2 className="w-6 h-6" />
                <span className="font-semibold text-lg">Completed on {new Date(myProgress.completedAt).toLocaleDateString()}</span>
              </div>
              
              <div className="flex items-center justify-between gap-4 p-4 bg-muted/50 rounded-xl border border-border">
                <div>
                  <h4 className="font-semibold text-foreground">Share completion</h4>
                  <p className="text-sm text-muted-foreground mt-1">
                    Allow eligible signed-in members to see a minimal completion record on your profile. This does not grant clinical qualifications.
                  </p>
                </div>
                <Switch 
                  checked={myProgress.completionOptIn} 
                  onCheckedChange={handleToggleOptIn} 
                />
              </div>

              <Button variant="outline" onClick={handleResetProgress} className="w-full sm:w-auto rounded-xl h-12 text-base gap-2">
                <RefreshCcw className="w-5 h-5" />
                Reset Progress
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              <Button onClick={handleMarkComplete} className="w-full sm:w-auto rounded-xl h-12 text-base px-8 gap-2">
                <CheckCircle2 className="w-5 h-5" />
                Mark as Complete
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
