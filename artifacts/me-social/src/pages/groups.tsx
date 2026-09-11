import { PageHeader } from "@/components/shared/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import { useSimpleView } from "@/lib/simple-view"
import { Users } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function GroupsPage() {
  const { isSimpleView } = useSimpleView()
  return (
    <div className="flex flex-col gap-8 md:gap-10 animate-in fade-in duration-500">
      <PageHeader 
        title={isSimpleView ? "Your People" : "Groups"} 
        description={isSimpleView ? "The people you care about." : "Private spaces for families and caregivers to coordinate and connect."}
      />
      
      {isSimpleView ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {['Close Family', 'Care Team'].map(group => (
            <div key={group} className="bg-card border border-border p-8 rounded-[2rem] flex flex-col items-center text-center gap-6 shadow-sm">
              <div className="w-24 h-24 rounded-full bg-secondary flex items-center justify-center text-primary shadow-sm">
                <Users className="w-12 h-12" aria-hidden="true" />
              </div>
              <h3 className="font-display font-semibold text-3xl">{group}</h3>
              <Button variant="secondary" size="lg" className="w-full mt-2 text-xl h-16 rounded-2xl">View Group</Button>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState 
          icon={Users}
          title="Groups are planned"
          description="Soon you will be able to create secure, invite-only groups to share updates with exactly who you choose, keeping everyone in the loop effortlessly."
        />
      )}
    </div>
  )
}
