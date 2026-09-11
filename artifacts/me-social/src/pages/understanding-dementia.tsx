import { Heart, BookOpen } from "lucide-react"
import { EmptyState } from "@/components/shared/empty-state"
import { PageHeader } from "@/components/shared/page-header"

export default function UnderstandingDementiaPage() {
  return (
    <div className="flex flex-col gap-8 md:gap-10 animate-in fade-in duration-500">
      <PageHeader
        title="Understanding Dementia"
        description="Clear, vetted, and dignified information to help you and your family navigate the realities of dementia."
      />

      <EmptyState
        icon={BookOpen}
        title="Education modules are planned"
        description="Soon you will be able to access vetted, practical guides for what to expect, communication strategies, and planning."
      />
    </div>
  )
}
