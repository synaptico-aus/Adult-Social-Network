import { useState, useMemo } from "react"
import { BookOpen, Search, Filter, AlertCircle, ChevronRight, X } from "lucide-react"
import { Link } from "wouter"
import { useListEducationCategories, useSearchEducation, getListEducationCategoriesQueryKey, getSearchEducationQueryKey } from "@workspace/api-client-react"
import { PageHeader } from "@/components/shared/page-header"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

export default function UnderstandingDementiaPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<string>("")
  const [debouncedQuery, setDebouncedQuery] = useState("")

  // Simple debounce for search
  useMemo(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const { data: categoriesData, isLoading: categoriesLoading } = useListEducationCategories({
    query: { queryKey: getListEducationCategoriesQueryKey() }
  })

  const { data: lessonsData, isLoading: lessonsLoading } = useSearchEducation(
    { q: debouncedQuery || undefined, category: selectedCategory || undefined },
    { query: { queryKey: getSearchEducationQueryKey({ q: debouncedQuery || undefined, category: selectedCategory || undefined }) } }
  )

  const hasSearch = debouncedQuery.length > 0 || selectedCategory.length > 0
  const categories = categoriesData?.items || []
  const lessons = lessonsData?.items || []

  return (
    <div className="flex flex-col gap-8 md:gap-10 animate-in fade-in duration-500">
      <PageHeader
        title="Understanding Dementia"
        description="Clear, vetted, and dignified information to help you and your family navigate the realities of dementia. These materials are for educational purposes and are not medical advice."
      />

      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <label htmlFor="search-education" className="sr-only">Search lessons</label>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" aria-hidden="true" />
          <Input
            id="search-education"
            type="search"
            placeholder="Search for topics, symptoms, or guidance..."
            className="pl-10 h-12 text-lg rounded-2xl bg-card border-border"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        {categories.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0 scrollbar-none shrink-0">
            <Button
              variant={selectedCategory === "" ? "default" : "secondary"}
              onClick={() => setSelectedCategory("")}
              className="rounded-xl whitespace-nowrap h-12 px-5 text-base"
            >
              All Topics
            </Button>
            {categories.map((cat) => (
              <Button
                key={cat.id}
                variant={selectedCategory === cat.slug ? "default" : "secondary"}
                onClick={() => setSelectedCategory(cat.slug)}
                className="rounded-xl whitespace-nowrap h-12 px-5 text-base"
              >
                {cat.name}
              </Button>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-6">
        {lessonsLoading ? (
          <div className="py-12 text-center text-muted-foreground flex flex-col items-center justify-center bg-card border border-border rounded-3xl">
            <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-4" />
            <p className="text-lg">Loading educational resources...</p>
          </div>
        ) : lessons.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {lessons.map((lesson) => {
              const cat = categories.find(c => c.id === lesson.categoryId)
              return (
                <Link key={lesson.id} href={`/understanding-dementia/${lesson.slug}`} className="group block h-full">
                  <article className="h-full bg-card border border-border p-6 rounded-3xl shadow-sm hover:shadow-md hover:border-primary/30 transition-all flex flex-col">
                    <div className="flex items-center gap-3 mb-4">
                      {cat && (
                        <span className="text-sm font-semibold tracking-wide uppercase px-3 py-1 bg-secondary text-secondary-foreground rounded-lg">
                          {cat.name}
                        </span>
                      )}
                    </div>
                    <h3 className="text-2xl font-display font-semibold text-foreground group-hover:text-primary transition-colors mb-3">
                      {lesson.title}
                    </h3>
                    <p className="text-muted-foreground text-lg leading-relaxed flex-1">
                      {lesson.summary}
                    </p>
                    <div className="mt-6 pt-4 border-t border-border/50 flex items-center justify-between text-primary font-medium">
                      Read lesson
                      <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </article>
                </Link>
              )
            })}
          </div>
        ) : hasSearch ? (
          <div className="bg-card border border-border p-12 rounded-3xl text-center shadow-sm flex flex-col items-center justify-center max-w-2xl mx-auto">
            <Search className="w-12 h-12 text-muted-foreground mb-4 opacity-50" />
            <h3 className="text-2xl font-display font-semibold mb-2">No results found</h3>
            <p className="text-muted-foreground text-lg mb-6">We could not find any lessons matching your search criteria.</p>
            <Button variant="secondary" onClick={() => { setSearchQuery(""); setSelectedCategory(""); }} className="rounded-xl px-6 h-12 text-base">
              Clear filters
            </Button>
          </div>
        ) : (
          <div className="bg-card border border-border p-12 rounded-3xl text-center shadow-sm flex flex-col items-center justify-center max-w-2xl mx-auto">
            <BookOpen className="w-12 h-12 text-primary mb-4 opacity-80" />
            <h3 className="text-2xl font-display font-semibold mb-3">Education modules are planned</h3>
            <p className="text-muted-foreground text-lg leading-relaxed mb-6">
              Zero lessons are currently available while we finalize the curriculum and complete the review process.
              Soon you will be able to access vetted, practical guides for what to expect, communication strategies, and planning.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
