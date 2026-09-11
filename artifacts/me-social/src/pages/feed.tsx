import { PageHeader } from "@/components/shared/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import { useSimpleView } from "@/lib/simple-view"
import { Info, Heart, ShieldCheck } from "lucide-react"
import { Link } from "wouter"

function StandardHomeView() {
  return (
    <div className="space-y-8">
      <EmptyState 
        icon={Info}
        title="Development Preview"
        description="This is the Phase 1 foundational design of Me. No posts or connections are active yet, as we focus entirely on establishing privacy and a calm architecture first."
      />
    </div>
  )
}

function SimpleHomeView() {
  return (
    <div className="space-y-6 md:space-y-8">
      <div className="bg-card border border-border rounded-[2rem] p-8 md:p-12 text-center shadow-sm">
         <div className="w-20 h-20 mx-auto rounded-full bg-secondary flex items-center justify-center text-primary mb-6 shadow-sm">
           <Info className="w-10 h-10" aria-hidden="true" />
         </div>
         <h3 className="font-display font-semibold text-2xl md:text-3xl text-foreground mb-4">Welcome to Me</h3>
         <p className="text-xl text-muted-foreground max-w-lg mx-auto leading-relaxed">
           This space is currently being built. While connections are not yet active, you can explore our resources and privacy commitments.
         </p>
      </div>
      
      <div className="grid grid-cols-1 gap-6">
        <Link href="/understanding-dementia" className="flex items-center w-full h-auto py-8 text-2xl md:text-3xl font-display justify-start px-8 rounded-[2rem] shadow-sm border border-secondary-border bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors">
          <Heart className="w-10 h-10 mr-6 text-primary shrink-0" aria-hidden="true" />
          <span>Understanding Dementia</span>
        </Link>
        <Link href="/about" className="flex items-center w-full h-auto py-8 text-2xl md:text-3xl font-display justify-start px-8 rounded-[2rem] shadow-sm border border-secondary-border bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors">
          <ShieldCheck className="w-10 h-10 mr-6 text-primary shrink-0" aria-hidden="true" />
          <span>Our Privacy Baseline</span>
        </Link>
      </div>
    </div>
  )
}

export default function HomeFeed() {
  const { isSimpleView } = useSimpleView()
  
  return (
    <div className="flex flex-col gap-8 md:gap-10 animate-in fade-in duration-500">
      <PageHeader 
        title={isSimpleView ? "Hello." : "Good morning."} 
        description={isSimpleView ? "Here is what is available." : "Welcome to the Phase 1 development preview."}
      />
      
      {isSimpleView ? <SimpleHomeView /> : <StandardHomeView />}
    </div>
  )
}
