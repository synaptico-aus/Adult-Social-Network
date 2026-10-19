import { formatDate } from "@/lib/locale-format";
import { Link } from "wouter"
import { BookOpen, Bookmark, CheckCircle2, ChevronRight, Clock } from "lucide-react"
import { useGetMyEducation, getGetMyEducationQueryKey } from "@workspace/api-client-react"
import { PageHeader } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"

export default function MyLearningPage() {
  const { data: myEd, isLoading } = useGetMyEducation({
    query: { queryKey: getGetMyEducationQueryKey() }
  })

  if (isLoading) {
    return (
      <div className="flex flex-col gap-8 md:gap-10 animate-in fade-in duration-500 max-w-4xl mx-auto">
        <PageHeader title="My Learning" />
        <div className="py-20 text-center flex flex-col items-center justify-center">
          <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-4" />
          <p className="text-muted-foreground text-lg">Loading your learning dashboard...</p>
        </div>
      </div>
    )
  }

  const saves = myEd?.saves || []
  const progress = myEd?.progress || []
  const continueItem = myEd?.continue

  // continueItem lacks lesson metadata in schema, we try to match it against progress or saves to get lesson info.
  let continueLesson = null
  if (continueItem?.lessonId) {
    const matchedProgress = progress.find(p => p.lessonId === continueItem.lessonId)
    if (matchedProgress?.lesson) continueLesson = matchedProgress.lesson
    else {
      const matchedSave = saves.find(s => s.lessonId === continueItem.lessonId)
      if (matchedSave?.lesson) continueLesson = matchedSave.lesson
    }
  }

  const completed = progress.filter(p => p.completedAt)

  return (
    <div className="flex flex-col gap-8 md:gap-10 animate-in fade-in duration-500 max-w-4xl mx-auto pb-24">
      <PageHeader
        title="My Learning"
        description="Your saved modules, progress, and learning history."
      />

      {continueItem && continueLesson && continueLesson.slug && (
        <section>
          <h2 className="text-2xl font-display font-semibold flex items-center gap-3 mb-6 text-foreground">
            <Clock className="w-6 h-6 text-primary" /> Pick up where you left off
          </h2>
          <Link href={`/understanding-dementia/${continueLesson.slug}`} className="group block">
            <div className="bg-primary/5 border border-primary/20 p-8 rounded-3xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 hover:bg-primary/10 transition-colors">
              <div>
                <span className="text-sm font-semibold tracking-wide uppercase text-primary mb-2 block">
                  Continue Reading
                </span>
                <h3 className="text-2xl font-display font-bold text-foreground mb-2">
                  {continueLesson.title}
                </h3>
                <p className="text-muted-foreground text-lg">
                  You were {continueItem.percent || 0}% through this module.
                </p>
              </div>
              <Button className="shrink-0 rounded-xl h-12 px-6 gap-2">
                Resume
                <ChevronRight className="rtl:-scale-x-100 w-5 h-5" />
              </Button>
            </div>
          </Link>
        </section>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
        <section>
          <h2 className="text-2xl font-display font-semibold flex items-center gap-3 mb-6 text-foreground">
            <Bookmark className="w-6 h-6 text-primary" /> Saved Lessons
          </h2>
          {saves.length > 0 ? (
            <div className="space-y-4">
              {saves.map((save) => {
                const lesson = save.lesson
                if (!lesson || !lesson.slug) {
                  return (
                    <div key={save.id} className="bg-muted border border-border p-6 rounded-2xl flex items-center justify-between gap-4 opacity-75">
                      <div className="text-muted-foreground">This lesson is no longer available.</div>
                    </div>
                  )
                }
                return (
                  <Link key={save.id} href={`/understanding-dementia/${lesson.slug}`} className="group block">
                    <div className="bg-card border border-border p-6 rounded-2xl shadow-sm hover:shadow-md hover:border-primary/30 transition-all flex items-center justify-between gap-4">
                      <div>
                        <h4 className="font-semibold text-lg text-foreground group-hover:text-primary transition-colors">
                          {lesson.title || "Untitled Lesson"}
                        </h4>
                        {lesson.summary && (
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{lesson.summary}</p>
                        )}
                      </div>
                      <ChevronRight className="rtl:-scale-x-100 w-5 h-5 text-muted-foreground group-hover:translate-x-1 transition-transform shrink-0" />
                    </div>
                  </Link>
                )
              })}
            </div>
          ) : (
            <div className="bg-card border border-border p-8 rounded-2xl text-center text-muted-foreground shadow-sm h-full flex flex-col items-center justify-center">
              <Bookmark className="w-10 h-10 mb-3 opacity-50" />
              <p className="text-lg">No saved lessons.</p>
              <p className="text-sm mt-2">Lessons you save will appear here.</p>
            </div>
          )}
        </section>

        <section>
          <h2 className="text-2xl font-display font-semibold flex items-center gap-3 mb-6 text-foreground">
            <CheckCircle2 className="w-6 h-6 text-primary" /> Completed
          </h2>
          {completed.length > 0 ? (
            <div className="space-y-4">
              {completed.map((p) => {
                const lesson = p.lesson
                if (!lesson || !lesson.slug) {
                  return (
                    <div key={p.lessonId} className="bg-muted border border-border p-6 rounded-2xl flex items-start gap-4 opacity-75">
                      <CheckCircle2 className="w-6 h-6 text-green-600/50 shrink-0 mt-0.5" />
                      <div className="text-muted-foreground text-sm mt-1">Lesson no longer available.</div>
                    </div>
                  )
                }
                return (
                  <div key={p.lessonId} className="bg-card border border-border p-6 rounded-2xl shadow-sm flex items-start gap-4">
                    <CheckCircle2 className="w-6 h-6 text-green-600 dark:text-green-500 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-semibold text-lg text-foreground">
                        {lesson.title}
                      </h4>
                      <p className="text-sm text-muted-foreground mt-1 mb-2">
                        Finished on {formatDate(p.completedAt!)}
                      </p>
                      <Link href={`/understanding-dementia/${lesson.slug}`} className="text-sm font-medium text-primary hover:underline">
                        Review lesson
                      </Link>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="bg-card border border-border p-8 rounded-2xl text-center text-muted-foreground shadow-sm h-full flex flex-col items-center justify-center">
              <BookOpen className="w-10 h-10 mb-3 opacity-50" />
              <p className="text-lg">No completed lessons yet.</p>
              <Link href="/understanding-dementia" className="mt-4 text-primary font-medium hover:underline">
                Explore the library
              </Link>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}