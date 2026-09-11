import { PageHeader } from "@/components/shared/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import { useSimpleView } from "@/lib/simple-view"
import { MessageSquare } from "lucide-react"

export default function MessagesPage() {
  const { isSimpleView } = useSimpleView()
  return (
    <div className="flex flex-col gap-8 md:gap-10 animate-in fade-in duration-500 h-full">
      <PageHeader
        title="Messages"
        description="Private conversations with your connections."
      />

      <EmptyState
        icon={MessageSquare}
        title="Direct messaging is planned"
        description="We are building a calm, secure messaging experience that prioritizes clarity and avoids the pressure of read receipts and constant notifications."
      />
    </div>
  )
}
