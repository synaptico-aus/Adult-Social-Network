export function PageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex flex-col gap-3 pb-8 border-b border-border/60">
      <h1 className="font-display text-4xl md:text-5xl font-bold text-foreground tracking-tight">{title}</h1>
      {description && <p className="text-xl md:text-2xl text-muted-foreground leading-relaxed max-w-2xl text-balance">{description}</p>}
    </div>
  )
}
