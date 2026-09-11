import { Play, Pause } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"

export function MediaControl({ title = "Audio guide", duration = "3:45" }: { title?: string, duration?: string }) {
  const [isPlaying, setIsPlaying] = useState(false)
  
  return (
    <div className="flex items-center gap-4 bg-card border border-border p-4 rounded-2xl shadow-sm w-full max-w-md">
      <Button 
        variant="secondary" 
        size="icon" 
        className="rounded-full w-14 h-14 shrink-0"
        onClick={() => setIsPlaying(!isPlaying)}
        aria-label={isPlaying ? `Pause ${title}` : `Play ${title}`}
        aria-pressed={isPlaying}
      >
        {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
      </Button>
      <div className="flex-1 min-w-0">
        <h4 className="font-semibold text-foreground truncate text-lg">{title}</h4>
        <p className="text-base text-muted-foreground truncate">{duration} • Audio sample</p>
      </div>
    </div>
  )
}
