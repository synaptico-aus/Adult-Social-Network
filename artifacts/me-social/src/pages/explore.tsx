import { PageHeader } from "@/components/shared/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import { Compass } from "lucide-react"

export default function ExplorePage() {
  return (
    <div className="flex flex-col gap-8 md:gap-10 animate-in fade-in duration-500">
      <PageHeader 
        title="Explore" 
        description="Discover resources, articles, and public communities."
      />
      
      <EmptyState 
        icon={Compass}
        title="Explore is planned"
        description="We are carefully curating verified resources and supportive communities. This space will allow you to find meaningful content at your own pace."
      />
    </div>
  )
}
