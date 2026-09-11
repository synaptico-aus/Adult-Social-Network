import { AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"

export function ErrorState({ title = "Something went wrong", message = "We encountered an issue loading this content.", onRetry }: { title?: string, message?: string, onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center p-8 md:p-12 text-center border border-destructive/20 bg-destructive/5 rounded-[2rem]">
      <AlertCircle className="w-12 h-12 text-destructive mb-6" aria-hidden="true" />
      <h3 className="font-display font-semibold text-2xl text-foreground mb-2">{title}</h3>
      <p className="text-lg text-muted-foreground max-w-md mb-6">{message}</p>
      {onRetry && (
        <Button variant="outline" onClick={onRetry}>Try again</Button>
      )}
    </div>
  )
}
