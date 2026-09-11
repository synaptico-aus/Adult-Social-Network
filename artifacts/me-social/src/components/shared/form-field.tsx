import { useId } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function LabelledFormField({ label, hint, error, placeholder, type = "text", ...props }: any) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  
  return (
    <div className="flex flex-col gap-3 w-full max-w-md">
      <Label htmlFor={id}>{label}</Label>
      <Input 
        id={id} 
        type={type}
        placeholder={placeholder} 
        className={error ? 'border-destructive focus-visible:ring-destructive' : ''}
        aria-describedby={`${hint ? hintId : ''} ${error ? errorId : ''}`}
        aria-invalid={!!error}
        {...props}
      />
      {error && <p id={errorId} className="text-sm font-medium text-destructive">{error}</p>}
      {hint && !error && <p id={hintId} className="text-base text-muted-foreground">{hint}</p>}
    </div>
  )
}
