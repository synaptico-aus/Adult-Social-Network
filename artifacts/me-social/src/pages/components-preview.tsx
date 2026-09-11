import { PageHeader } from "@/components/shared/page-header"
import { LoadingState } from "@/components/shared/loading-state"
import { ErrorState } from "@/components/shared/error-state"
import { MediaControl } from "@/components/shared/media-control"
import { LabelledFormField } from "@/components/shared/form-field"
import { Button } from "@/components/ui/button"

export default function ComponentsPreviewPage() {
  return (
    <div className="flex flex-col gap-8 md:gap-12 animate-in fade-in duration-500 pb-12">
      <PageHeader 
        title="Components Preview" 
        description="A development preview of the reusable UI components."
      />
      
      <section className="flex flex-col gap-6">
        <h2 className="font-display font-semibold text-3xl border-b border-border/50 pb-4">Forms & Inputs</h2>
        <div className="bg-card border border-border p-6 rounded-[2rem] shadow-sm flex flex-col gap-8">
           <LabelledFormField 
             label="Display Name"
             placeholder="How you appear to others"
             hint="This can be your first name or a nickname."
           />
           <LabelledFormField 
             label="Email Address"
             placeholder="name@example.com"
             error="Please enter a valid email address."
             defaultValue="invalid-email"
           />
           <div>
             <Button>Save Changes</Button>
             <p className="text-sm text-muted-foreground mt-3">Note: Form submission is not wired in this preview.</p>
           </div>
        </div>
      </section>
      
      <section className="flex flex-col gap-6">
        <h2 className="font-display font-semibold text-3xl border-b border-border/50 pb-4">Media Controls</h2>
        <div className="bg-card border border-border p-6 rounded-[2rem] shadow-sm flex flex-col gap-6">
           <p className="text-lg text-muted-foreground mb-2">Non-autoplay, accessible media players for audio guidance.</p>
           <MediaControl title="Morning Meditation" duration="5:00" />
           <MediaControl title="Caregiver Advice: Patience" duration="12:30" />
        </div>
      </section>
      
      <section className="flex flex-col gap-6">
        <h2 className="font-display font-semibold text-3xl border-b border-border/50 pb-4">Feedback States</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
           <div className="bg-card border border-border p-6 rounded-[2rem] shadow-sm flex flex-col justify-center min-h-[300px]">
             <LoadingState text="Fetching your groups..." />
           </div>
           
           <div className="bg-card border border-border p-6 rounded-[2rem] shadow-sm flex flex-col justify-center min-h-[300px]">
             <ErrorState 
               title="Connection lost" 
               message="We couldn't reach the server. Please check your internet connection."
               onRetry={() => {}}
             />
           </div>
        </div>
      </section>
    </div>
  )
}
