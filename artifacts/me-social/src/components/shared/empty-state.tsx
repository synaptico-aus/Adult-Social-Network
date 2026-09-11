import { LucideIcon } from "lucide-react"

export function EmptyState({ icon: Icon, title, description }: { icon: LucideIcon, title: string, description: string }) {
  return (
    <div className="flex flex-col items-center justify-center p-12 md:p-16 text-center border-2 border-dashed border-border rounded-[2rem] bg-card/30">
      <div className="w-24 h-24 rounded-full bg-secondary flex items-center justify-center text-primary mb-8 shadow-sm">
        <Icon className="w-12 h-12" aria-hidden="true" />
      </div>
      <h2 className="font-display text-3xl md:text-4xl font-semibold text-foreground mb-4">{title}</h2>
      <p className="text-xl text-muted-foreground max-w-xl leading-relaxed text-balance">{description}</p>
    </div>
  )
}
