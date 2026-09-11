import { PageHeader } from "@/components/shared/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import { useSimpleView } from "@/lib/simple-view"
import { Users } from "lucide-react"

export default function GroupsPage() {
  const { isSimpleView } = useSimpleView()
  return (
    <div className="flex flex-col gap-8 md:gap-10 animate-in fade-in duration-500">
      <PageHeader
        title={isSimpleView ? "Your People" : "Groups"}
        description={isSimpleView ? "The people you care about." : "Private spaces for families and caregivers to coordinate and connect."}
      />

      <EmptyState
        icon={Users}
        title="Groups are planned"
        description="Soon you will be able to create secure, invite-only groups to share updates with exactly who you choose, keeping everyone in the loop effortlessly."
      />
    </div>
  )
}
