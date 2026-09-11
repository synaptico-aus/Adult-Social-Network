import { PageHeader } from "@/components/shared/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import { useSimpleView } from "@/lib/simple-view"
import { MessageSquare, UserCircle } from "lucide-react"

export default function MessagesPage() {
  const { isSimpleView } = useSimpleView()
  return (
    <div className="flex flex-col gap-8 md:gap-10 animate-in fade-in duration-500 h-full">
      <PageHeader 
        title="Messages" 
        description="Private conversations with your connections."
      />
      
      {isSimpleView ? (
        <div className="space-y-6">
          <h2 className="font-semibold text-2xl px-4 text-foreground/80">Familiar Contacts</h2>
          <div className="bg-card border border-border rounded-[2rem] overflow-hidden p-8 md:p-12 text-center shadow-sm">
             <div className="w-20 h-20 mx-auto rounded-full bg-secondary flex items-center justify-center text-primary mb-6 shadow-sm">
               <UserCircle className="w-10 h-10" aria-hidden="true" />
             </div>
             <h3 className="font-display font-semibold text-2xl md:text-3xl text-foreground mb-4">No familiar contacts yet</h3>
             <p className="text-xl text-muted-foreground max-w-lg mx-auto leading-relaxed">
               Once you connect with family or caregivers, they will appear here as large, easy-to-tap buttons so you can reach them instantly.
             </p>
          </div>
        </div>
      ) : (
        <EmptyState 
          icon={MessageSquare}
          title="Direct messaging is planned"
          description="We are building a calm, secure messaging experience that prioritizes clarity and avoids the pressure of read receipts and constant notifications."
        />
      )}
    </div>
  )
}
