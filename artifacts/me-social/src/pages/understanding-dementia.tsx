import { Heart } from "lucide-react"

export default function UnderstandingDementiaPage() {
  return (
    <div className="flex flex-col gap-8 md:gap-10 animate-in fade-in duration-500">
      <div className="bg-secondary p-8 md:p-12 rounded-[2rem] border border-secondary-border shadow-sm">
        <Heart className="w-14 h-14 text-primary mb-8" aria-hidden="true" />
        <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold text-foreground mb-6 leading-tight">
          Understanding <br/>Dementia
        </h1>
        <p className="text-xl md:text-2xl text-foreground/80 max-w-3xl leading-relaxed text-balance">
          Clear, vetted, and dignified information to help you and your family navigate the realities of dementia.
        </p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
        <Card 
          title="What to Expect" 
          description="A guide to the progression and practical adaptations for daily living."
        />
        <Card 
          title="Communication Strategies" 
          description="How to foster connection and minimize frustration in conversations."
        />
        <Card 
          title="Caregiver Wellness" 
          description="Protecting your own health and emotional bandwidth while caring for another."
        />
        <Card 
          title="Legal & Financial Planning" 
          description="Essential steps to ensure security and honor preferences early on."
        />
      </div>
    </div>
  )
}

function Card({ title, description }: { title: string, description: string }) {
  return (
    <button className="border border-border bg-card p-8 md:p-10 rounded-[2rem] shadow-sm hover:shadow-md transition-all group text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <h3 className="font-display text-3xl font-semibold mb-4 group-hover:text-primary transition-colors text-foreground">{title}</h3>
      <p className="text-xl text-muted-foreground leading-relaxed">{description}</p>
    </button>
  )
}
