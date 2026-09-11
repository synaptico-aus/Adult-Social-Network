import { Loader2 } from "lucide-react"

export function LoadingState({ text = "Loading..." }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center" role="status" aria-live="polite">
      <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" aria-hidden="true" />
      <p className="text-lg font-medium text-muted-foreground">{text}</p>
    </div>
  )
}
